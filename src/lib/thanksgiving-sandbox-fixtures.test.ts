import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { prepareThanksgivingSandboxFixtures } from "./thanksgiving-sandbox-fixtures.server";
import { createThanksgivingDraftsFor } from "./thanksgiving-camp.server";
import { THANKSGIVING_CAMP } from "./thanksgiving-camp";

test("temporary camp fixture harness fails closed and preserves isolated data", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T12:00:00Z") });
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      (
        await query(
          p.reduce((a, x, i) => a + (i ? "$" + i : "") + x, ""),
          v,
        )
      ).rows) as Sql;
    sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
    sql.transaction = (fn) =>
      db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  const config = {
    environment: "sandbox",
    origin: "https://square-release-check--oklahoma-prospects.netlify.app",
    context: "branch-deploy",
  };
  const existing = {
    id: "existing-qa",
    name: "QA Sandbox Coach",
    email: "qa@example.invalid",
    specialties: [],
    active: true,
  };
  const initial = { coaches: [existing], privateMarker: "preserve-me", revision: 7 };
  async function saved() {
    const [r] = await sql<{
      payload: string;
      revision: number;
    }>`select payload,revision from pd_working_file where id='club'`;
    return {
      payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
      revision: r.revision,
    };
  }
  try {
    for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    for (const [id, role] of [
      ["owner", "admin"],
      ["parent", "parent"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.test"},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.test"},${id},${role},${"family-" + id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.test','owner')`;
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(initial)},7)`;
    const before = await saved();
    await t.test(
      "production, absent/unknown context, wrong hostname and unauthorized actors are rejected",
      async () => {
        for (const unsafe of [
          { ...config, environment: "production" },
          { ...config, context: undefined },
          { ...config, context: "unknown" },
          { ...config, context: "deploy-preview" },
          { ...config, runtimeContext: "production" },
          { ...config, origin: "https://prospectssports.club" },
          { ...config, origin: config.origin + ".evil.example" },
        ])
          await assert.rejects(prepareThanksgivingSandboxFixtures(sql, "owner", unsafe));
        await assert.rejects(prepareThanksgivingSandboxFixtures(sql, "parent", config));
        await assert.rejects(prepareThanksgivingSandboxFixtures(sql, "missing", config));
        for (const [deny, restore] of [
          ["update owner_grants set revoked_at=now()", "update owner_grants set revoked_at=null"],
          [
            'update "user" set "disabledAt"=now() where id=\'owner\'',
            'update "user" set "disabledAt"=null where id=\'owner\'',
          ],
          [
            'update "user" set "emailVerified"=false where id=\'owner\'',
            'update "user" set "emailVerified"=true where id=\'owner\'',
          ],
        ]) {
          await sql.query(deny);
          await assert.rejects(prepareThanksgivingSandboxFixtures(sql, "owner", config));
          await sql.query(restore);
        }
        assert.deepEqual(await saved(), before);
      },
    );
    await t.test("account and coach-name collisions fail atomically", async () => {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values('collision','thanksgiving-sandbox-fixture-1@example.invalid','Synthetic collision',true,now(),now())`;
      await assert.rejects(prepareThanksgivingSandboxFixtures(sql, "owner", config), /account/);
      assert.deepEqual(await saved(), before);
      await sql`delete from "user" where id='collision'`;
      // Last requested coach collides: earlier potential additions must not be committed.
      const collision = {
        ...initial,
        coaches: [
          existing,
          {
            ...existing,
            id: "collision",
            name: THANKSGIVING_CAMP.coaches[2],
            email: "different@example.invalid",
          },
        ],
      };
      await sql`update pd_working_file set payload=${JSON.stringify(collision)} where id='club'`;
      const collided = await saved();
      await assert.rejects(prepareThanksgivingSandboxFixtures(sql, "owner", config), /identity/);
      assert.deepEqual(await saved(), collided);
      await sql`update pd_working_file set payload=${JSON.stringify(initial)} where id='club'`;
    });
    await t.test(
      "preparation preserves records, adds no users/grants/mail, is idempotent and enables actual drafts",
      async () => {
        const counts = async () => ({
          users: (await sql`select id from "user"`).length,
          grants: (await sql`select email from owner_grants`).length,
          mail: (await sql`select id from payment_notifications`).length,
        });
        const prior = await counts();
        assert.deepEqual(await prepareThanksgivingSandboxFixtures(sql, "owner", config), {
          prepared: true,
          added: 3,
        });
        const after = await saved();
        assert.deepEqual(after.payload.coaches[0], existing);
        assert.equal(after.payload.privateMarker, "preserve-me");
        assert.equal(after.revision, 8);
        assert.equal(after.payload.coaches.length, 4);
        assert.ok(
          after.payload.coaches
            .slice(1)
            .every((c: { email: string }) => c.email.endsWith("@example.invalid")),
        );
        assert.deepEqual(await counts(), prior);
        assert.deepEqual(await prepareThanksgivingSandboxFixtures(sql, "owner", config), {
          prepared: true,
          added: 0,
        });
        assert.deepEqual(await saved(), after);
        await createThanksgivingDraftsFor(sql, "owner");
        const drafts = await sql<{
          id: string;
          payload: { status: string; coachIds: string[]; description: string };
        }>`select id,payload from training_events order by id`;
        assert.equal(drafts.length, 2);
        for (const draft of drafts) {
          assert.equal(draft.payload.status, "draft");
          assert.equal(draft.payload.coachIds.length, 3);
          assert.match(draft.payload.description, /Softball: hitting and defense only/);
        }
        await createThanksgivingDraftsFor(sql, "owner");
        assert.equal((await sql`select id from training_events`).length, 2);
        assert.deepEqual(await counts(), prior);
      },
    );
  } finally {
    await db.close();
  }
});
