import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import sharp from "sharp";
import type { Sql } from "../db";
import { emptySharedProfile } from "../person-contracts";
import { publicPeopleFor } from "../person-public.server";
import {
  blankArticle,
  articleDocument,
  safeLink,
  journalPermissions,
  type ArticleDocument,
} from "./contracts";
import {
  saveArticleFor,
  actionFor,
  editorFor,
  detailFor,
  grantFor,
  categoryFor,
  consentFor,
  withdrawConsentFor,
  familyConsentsFor,
  publishScheduledFor,
  can,
  type Principal,
} from "./editorial.server";
import { publicFeedFor, publicArticleFor, recordMetricFor } from "./public.server";
import { uploadFor, mediaResponse } from "./media.server";
import { importAssignmentsFor } from "./launch.server";

const adapter = (db: PGlite, query: PGlite["query"]): Sql => {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await query(
        parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
  sql.transaction = (work) =>
    db.transaction((tx) => work(adapter(db, tx.query.bind(tx) as PGlite["query"])));
  return sql;
};
test("Journal documents constrain rich content and current coordinator scope", () => {
  for (const link of [
    "javascript:alert(1)",
    "//evil.invalid",
    "data:text/html,test",
    "https://user:password@example.invalid",
    "/\\evil.invalid",
  ])
    assert.equal(safeLink.safeParse(link).success, false);
  assert.equal(safeLink.safeParse("/book?resource=individual").success, true);
  assert.equal(
    articleDocument.safeParse({
      ...blankArticle(),
      body: [{ type: "html", html: "<script>alert(1)</script>" }],
    }).success,
    false,
  );
  const p: Principal = {
    id: "editor",
    owner: false,
    permissions: [...journalPermissions],
    sports: ["softball", "baseball", "academy"],
    teamIds: [],
    coordinators: [
      {
        user_id: "editor",
        sport: "softball",
        role: "Softball Coordinator",
        status: "active",
        coverage: "teams",
        team_ids: ["sb-1"],
        permissions: [],
        revision: 1,
        independent_roles: [],
      },
    ],
  };
  const d = { ...blankArticle(), sport: "softball" as const, teamIds: ["sb-1"] };
  assert.equal(can(p, "publish", d), true);
  assert.equal(can(p, "publish", { ...d, teamIds: [] }), false);
  assert.equal(can(p, "view", { ...d, sport: "baseball" }), false);
  assert.equal(
    can(
      { ...p, coordinators: p.coordinators.map((g) => ({ ...g, status: "suspended" })) },
      "view",
      d,
    ),
    false,
  );
});
test("Journal editorial lifecycle, grants, privacy, publication and revisions use isolated storage", async (t) => {
  const db = new PGlite(),
    sql = adapter(db, db.query.bind(db));
  try {
    for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile(`migrations/${f}`, "utf8"));
    for (const [id, role] of [
      ["journal-owner", "admin"],
      ["journal-editor", "coach"],
      ["journal-publisher", "coach"],
      ["journal-parent", "parent"],
      ["journal-other", "parent"],
      ["journal-admin", "admin"],
    ]) {
      await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
      await sql`insert into profiles(user_id,name,email,role,family_id) values(${id},${id},${id + "@example.invalid"},${role},${id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('journal-owner@example.invalid','journal-owner')`;
    await sql`insert into person_profiles(user_id,profile,publish_coach) values('journal-owner',${JSON.stringify({ ...emptySharedProfile("Synthetic Journal Coach"), sports: ["softball"] })}::jsonb,true)`;
    const authorId = (await publicPeopleFor(sql)).find(
      (p) => p.name === "Synthetic Journal Coach",
    )!.id;
    const financialBefore = JSON.stringify(await sql`select * from team_budget_master`),
      ordersBefore = JSON.stringify(await sql`select * from commerce_orders`);
    await t.test(
      "seed creates twenty private assignments, six manuscripts and zero grants",
      async () => {
        const [count] = await sql<{ n: string }>`select count(*)::text n from journal_articles`;
        assert.equal(count.n, "20");
        const [drafts] = await sql<{
          n: string;
        }>`select count(*)::text n from journal_articles where jsonb_array_length(document->'body')>0`;
        assert.equal(drafts.n, "6");
        assert.equal((await publicFeedFor(sql)).total, 0);
        assert.deepEqual(await sql`select * from journal_grants`, []);
        assert.equal((await importAssignmentsFor(sql, "journal-owner")).created, 0);
        for (const u of ["journal-parent", "journal-admin", "journal-editor"]) {
          await assert.rejects(editorFor(sql, u));
          await assert.rejects(saveArticleFor(sql, u, { revision: 0, document: blankArticle() }));
        }
      },
    );
    await grantFor(sql, "journal-owner", {
      userId: "journal-editor",
      revision: 0,
      permissions: ["view", "create", "edit.own", "submit"],
      sports: ["softball"],
      teamIds: [],
    });
    await grantFor(sql, "journal-owner", {
      userId: "journal-publisher",
      revision: 0,
      permissions: ["view", "review", "approve", "publish"],
      sports: ["softball"],
      teamIds: [],
    });
    let d: ArticleDocument = {
      ...blankArticle("Synthetic softball practice"),
      sport: "softball",
      excerpt: "A synthetic lifecycle fixture.",
      body: [{ type: "paragraph", text: "Safe synthetic practice content." }],
      categoryIds: ["softball"],
      authorId,
      rightsConfirmed: true,
      factsVerified: true,
    };
    let r = await saveArticleFor(sql, "journal-editor", { revision: 0, document: d });
    await t.test("explicit scope, own edits and conflict checks", async () => {
      await assert.rejects(
        saveArticleFor(sql, "journal-editor", {
          revision: 0,
          document: { ...d, sport: "baseball" },
        }),
      );
      await assert.rejects(saveArticleFor(sql, "journal-publisher", { ...r, document: d }));
      await assert.rejects(
        saveArticleFor(sql, "journal-editor", { ...r, revision: 0, document: d }),
        /changed/,
      );
      await assert.rejects(
        grantFor(sql, "journal-admin", {
          userId: "journal-admin",
          revision: 0,
          permissions: [...journalPermissions],
          sports: ["academy"],
          teamIds: [],
        }),
      );
      await assert.rejects(actionFor(sql, "journal-editor", { ...r, action: "publish" }));
      assert.equal(
        (await editorFor(sql, "journal-editor")).articles.filter(
          (a) => a.created_by === "journal-editor",
        ).length,
        1,
      );
      assert.equal((await editorFor(sql, "journal-editor")).accounts.length, 0);
    });
    const png = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#A9D8F3" },
    })
      .png()
      .toBuffer();
    const media = await uploadFor(sql, "journal-editor", {
      articleId: r.id,
      revision: r.revision,
      dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      credit: "Synthetic test image",
      rightsNote: "Generated fixture; no customer image.",
    });
    await t.test("image validation, private preview and wrong-article protection", async () => {
      assert.equal((await mediaResponse(sql, media.id, null)).status, 404);
      assert.equal((await mediaResponse(sql, media.id, "journal-other")).status, 404);
      const response = await mediaResponse(sql, media.id, "journal-editor");
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      assert.equal(meta.format, "webp");
      assert.equal(meta.exif, undefined);
      await assert.rejects(
        uploadFor(sql, "journal-editor", {
          articleId: r.id,
          revision: r.revision,
          dataUrl: `data:image/png;base64,${Buffer.from('<svg onload="alert(1)"></svg>').toString("base64")}`,
          credit: "test",
          rightsNote: "synthetic",
        }),
      );
      await assert.rejects(
        uploadFor(sql, "journal-other", {
          articleId: r.id,
          revision: r.revision,
          dataUrl: `data:image/png;base64,${png.toString("base64")}`,
          credit: "test",
          rightsNote: "synthetic",
        }),
      );
    });
    d = { ...d, heroId: media.id, heroAlt: "Synthetic blue test rectangle" };
    r = await saveArticleFor(sql, "journal-editor", { ...r, document: d });
    await t.test("exact approval and public allowlist", async () => {
      await assert.rejects(
        actionFor(sql, "journal-publisher", { ...r, action: "approve" }),
        /Submit/,
      );
      await actionFor(sql, "journal-editor", { ...r, action: "submit" });
      await actionFor(sql, "journal-publisher", { ...r, action: "approve" });
      await actionFor(sql, "journal-publisher", { ...r, action: "publish" });
      const a = await publicArticleFor(sql, d.slug);
      assert.ok(a && "article" in a);
      if (a?.article) {
        assert.equal(a.article.author?.name, "Synthetic Journal Coach");
        for (const key of [
          "athleteIds",
          "planningNotes",
          "rightsConfirmed",
          "factsVerified",
          "authorId",
        ])
          assert.equal(key in a.article.document, false);
      }
      assert.equal((await mediaResponse(sql, media.id, null)).status, 200);
      assert.equal((await publicFeedFor(sql, { q: "synthetic", sport: "softball" })).total, 1);
      assert.equal((await publicFeedFor(sql, { sport: "baseball" })).total, 0);
    });
    await t.test(
      "editing invalidates approval but preserves the prior public snapshot",
      async () => {
        d = { ...d, title: "Updated synthetic title" };
        r = await saveArticleFor(sql, "journal-editor", { ...r, document: d });
        await assert.rejects(
          actionFor(sql, "journal-publisher", { ...r, action: "publish" }),
          /approved/,
        );
        const a = await publicArticleFor(sql, d.slug);
        assert.ok(a && "article" in a);
        if (a?.article) assert.equal(a.article.document.title, "Synthetic softball practice");
        await actionFor(sql, "journal-editor", { ...r, action: "submit" });
        await actionFor(sql, "journal-publisher", { ...r, action: "approve" });
        await actionFor(sql, "journal-publisher", { ...r, action: "publish" });
      },
    );
    await t.test("slug history redirects directly and cannot be stolen", async () => {
      const old = d.slug;
      d = { ...d, slug: "synthetic-new-url" };
      r = await saveArticleFor(sql, "journal-owner", { ...r, document: d });
      await actionFor(sql, "journal-owner", { ...r, action: "submit" });
      await actionFor(sql, "journal-owner", { ...r, action: "approve" });
      await actionFor(sql, "journal-owner", { ...r, action: "publish" });
      assert.deepEqual(await publicArticleFor(sql, old), { redirect: d.slug });
      const other = await saveArticleFor(sql, "journal-owner", {
        revision: 0,
        document: { ...d, heroId: null, heroAlt: "", slug: old },
      });
      await actionFor(sql, "journal-owner", { ...other, action: "submit" });
      await actionFor(sql, "journal-owner", { ...other, action: "approve" });
      await assert.rejects(
        actionFor(sql, "journal-owner", { ...other, action: "publish" }),
        /reserved/,
      );
    });
    await t.test(
      "immutable revisions and restore create new approval-required drafts",
      async () => {
        await assert.rejects(
          sql`update journal_revisions set document='{}'::jsonb where article_id=${r.id}`,
        );
        const restored = await actionFor(sql, "journal-owner", {
          ...r,
          action: "restore",
          restoreRevision: 1,
        });
        assert.equal(restored.revision, r.revision + 1);
        r = restored;
        d = (await detailFor(sql, "journal-owner", r.id)).row.document;
        assert.equal((await detailFor(sql, "journal-owner", r.id)).row.status, "draft");
      },
    );
    await t.test("scheduling checks time and rechecks publisher grants", async () => {
      await actionFor(sql, "journal-owner", { ...r, action: "submit" });
      await actionFor(sql, "journal-owner", { ...r, action: "approve" });
      await assert.rejects(
        actionFor(sql, "journal-publisher", {
          ...r,
          action: "schedule",
          scheduledAt: "2020-01-01T00:00:00.000Z",
        }),
        /future/,
      );
      await actionFor(sql, "journal-publisher", {
        ...r,
        action: "schedule",
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });
      await sql`update journal_articles set scheduled_at=now()-interval '1 minute' where id=${r.id}`;
      await grantFor(sql, "journal-owner", {
        userId: "journal-publisher",
        revision: 1,
        permissions: [],
        sports: [],
        teamIds: [],
      });
      assert.equal((await publishScheduledFor(sql)).published, 0);
      await grantFor(sql, "journal-owner", {
        userId: "journal-publisher",
        revision: 2,
        permissions: ["view", "review", "approve", "publish"],
        sports: ["softball"],
        teamIds: [],
      });
      assert.equal((await publishScheduledFor(sql)).published, 1);
    });
    await t.test(
      "minor-specific consent is version-bound, guardian-bound and immediately withdrawable",
      async () => {
        await sql`insert into club_households(id,primary_email) values('journal-household','journal-parent@example.invalid')`;
        await sql`insert into household_members(household_id,user_id) values('journal-household','journal-parent')`;
        await sql`insert into club_athletes(id,name,household_email,household_id) values('journal-athlete','Synthetic Player','journal-parent@example.invalid','journal-household')`;
        d = {
          ...d,
          heroId: media.id,
          heroAlt: "Synthetic image",
          containsMinorIdentity: true,
          athleteIds: ["journal-athlete"],
        };
        r = await saveArticleFor(sql, "journal-owner", { ...r, document: d });
        await actionFor(sql, "journal-owner", { ...r, action: "submit" });
        await assert.rejects(
          actionFor(sql, "journal-owner", { ...r, action: "approve" }),
          /guardian/,
        );
        await assert.rejects(
          consentFor(sql, "journal-owner", {
            articleId: r.id,
            revision: r.revision,
            athleteId: "journal-athlete",
            guardianId: "journal-other",
            scope: "Name and synthetic image only.",
            evidenceReference: "synthetic permission",
          }),
          /guardian/,
        );
        await consentFor(sql, "journal-owner", {
          articleId: r.id,
          revision: r.revision,
          athleteId: "journal-athlete",
          guardianId: "journal-parent",
          scope: "Name and synthetic image only.",
          evidenceReference: "synthetic written permission fixture",
        });
        await actionFor(sql, "journal-owner", { ...r, action: "approve" });
        await actionFor(sql, "journal-owner", { ...r, action: "publish" });
        assert.equal((await publicFeedFor(sql)).total, 1);
        await sql`update "user" set "disabledAt"=now() where id='journal-parent'`;
        assert.equal((await publicFeedFor(sql)).total, 0);
        assert.equal((await mediaResponse(sql, media.id, null)).status, 404);
        await sql`update "user" set "disabledAt"=null where id='journal-parent'`;
        const consents = await familyConsentsFor(sql, "journal-parent");
        assert.equal(consents.length, 1);
        assert.equal((await familyConsentsFor(sql, "journal-other")).length, 0);
        await assert.rejects(withdrawConsentFor(sql, "journal-other", consents[0].id));
        await withdrawConsentFor(sql, "journal-parent", consents[0].id);
        assert.equal(await publicArticleFor(sql, d.slug), null);
        assert.equal((await mediaResponse(sql, media.id, null)).status, 404);
      },
    );
    await t.test(
      "unpublish/archive removes public snapshots; consent and metrics cannot silently reenable them",
      async () => {
        await actionFor(sql, "journal-owner", { ...r, action: "archive" });
        assert.equal((await detailFor(sql, "journal-owner", r.id)).row.status, "archived");
        assert.equal((await publicFeedFor(sql)).total, 0);
        assert.equal(await recordMetricFor(sql, r.id, "view"), false);
        assert.deepEqual(await sql`select * from journal_metrics`, []);
        await categoryFor(sql, "journal-owner", {
          id: "test",
          revision: 0,
          name: "Synthetic category",
          slug: "synthetic-category",
          description: "Test only",
          displayOrder: 50,
          active: true,
        });
        await assert.rejects(
          categoryFor(sql, "journal-editor", {
            id: "test",
            revision: 1,
            name: "Unauthorized",
            slug: "synthetic-category",
            description: "",
            displayOrder: 50,
            active: true,
          }),
        );
        assert.equal(JSON.stringify(await sql`select * from team_budget_master`), financialBefore);
        assert.equal(JSON.stringify(await sql`select * from commerce_orders`), ordersBefore);
      },
    );
  } finally {
    await db.close();
  }
});
