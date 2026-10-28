import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import type { Sql } from "./db";
import { calculateMembershipValue, cageIncludedMinutes } from "./membership-value";
import { defaultServicePresentation } from "./service-presentation";
import { buildPublicCatalog, loadServices } from "./ops";
import { serviceInput } from "./ops-contracts";
import { saveServiceFor } from "./ops-owner.server";
import {
  availableOperationalServices,
  assertOperationalServiceForNewPurchase,
} from "./coordinator/organization-services.server";
import {
  saveHomepageFor,
  saveTestimonialFor,
  publicHomepageFor,
  websiteEditorFor,
  aboutEditorFor,
  publicAboutFor,
  saveAboutFor,
} from "./website-content.server";
import { emptySharedProfile } from "./person-contracts";
import { publicPeopleFor } from "./person-public.server";

test("membership comparisons use exact cents, actual usage and matching resource periods", () => {
  assert.deepEqual(
    calculateMembershipValue({
      monthlyPriceCents: 18500,
      monthlyMinutes: 360,
      dropInRateCents: 4000,
    }),
    {
      effectiveHourlyRateCents: 3083,
      dropInEquivalentCents: 24000,
      savingsCents: 5500,
      savingsPercent: 23,
    },
  );
  assert.equal(
    calculateMembershipValue({
      monthlyPriceCents: 14400,
      monthlyMinutes: 240,
      dropInRateCents: 2000,
      rateMinutes: 30,
      resourcesPerSession: 2,
    })?.dropInEquivalentCents,
    32000,
  );
  assert.equal(
    calculateMembershipValue({ monthlyPriceCents: 6500, monthlyMinutes: 30, dropInRateCents: 4000 })
      ?.savingsCents,
    -4500,
  );
  for (const monthlyMinutes of [0, -1, Infinity, NaN, 1.5])
    assert.equal(
      calculateMembershipValue({ monthlyPriceCents: 100, monthlyMinutes, dropInRateCents: 200 }),
      null,
    );
  assert.equal(
    calculateMembershipValue({
      monthlyPriceCents: 100,
      monthlyMinutes: 60,
      dropInRateCents: Number.MAX_SAFE_INTEGER,
    }),
    null,
  );
  assert.equal(
    calculateMembershipValue({ monthlyPriceCents: 0, monthlyMinutes: 60, dropInRateCents: 0 })
      ?.savingsPercent,
    null,
  );
  assert.equal(cageIncludedMinutes(2), 120);
  assert.equal(cageIncludedMinutes(Infinity), 0);
});

test("editable membership and homepage publication preserve financial records and enforce current owner access", async () => {
  const db = new PGlite();
  const adapter = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(adapter(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  const sql = adapter(db.query.bind(db));
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile(`migrations/${file}`, "utf8"));
    for (const [id, role] of [
      ["owner", "admin"],
      ["ordinary-admin", "admin"],
      ["coach-a", "coach"],
      ["coach-b", "coach"],
      ["parent", "parent"],
    ]) {
      await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
      await sql`insert into profiles(user_id,name,email,role,family_id) values(${id},${id},${id + "@example.invalid"},${role},${id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
    await sql`update club_services set price=65,credits=2,hours=99,minutes=120 where id='prospect'`;
    await sql`update club_services set price=40,minutes=60 where id='individual'`;
    const original = await loadServices(sql);
    const plan = () => buildPublicCatalog(original).cagePlans.find((p) => p.id === "prospect")!;
    assert.equal(plan().hours, 2, "display uses fulfillment credits rather than stale hours");
    assert.equal(plan().savings, "Save $15.00 / month");
    assert.equal(plan().hourly, "$32.50 / included hour");
    const service = original.find((p) => p.id === "prospect")!;
    const input = serviceInput.parse({
      ...service,
      hours: 2,
      presentation: {
        ...defaultServicePresentation,
        badge: "Member choice",
        benefits: [{ text: "Household practice", icon: "cage" }],
      },
      presentationRevision: 0,
    });
    for (const id of ["parent", "coach-a", "ordinary-admin"]) {
      await assert.rejects(saveServiceFor(sql, id, input));
      await assert.rejects(websiteEditorFor(sql, id));
      await assert.rejects(saveHomepageFor(sql, id, { revision: 0, featuredCoachIds: [] }));
    }
    const paymentBefore = await sql`select * from commerce_orders`;
    const teamsBefore = await sql`select * from team_budget_master`;
    await saveServiceFor(sql, "owner", input);
    await assert.rejects(saveServiceFor(sql, "owner", input), /changed/);
    let updated = (await loadServices(sql)).find((p) => p.id === "prospect")!;
    assert.equal(updated.price, 65);
    assert.equal(updated.credits, 2);
    assert.deepEqual(await sql`select * from commerce_orders`, paymentBefore);
    assert.deepEqual(await sql`select * from team_budget_master`, teamsBefore);
    await sql`update club_services set price=45 where id='individual'`;
    assert.equal(
      buildPublicCatalog(await loadServices(sql)).cagePlans.find((p) => p.id === "prospect")
        ?.savings,
      "Save $25.00 / month",
    );
    await assert.rejects(
      saveServiceFor(sql, "owner", { ...input, presentationRevision: 1, minutes: 600 }),
      /credits/,
    );
    await assert.rejects(
      saveServiceFor(sql, "owner", {
        ...input,
        presentationRevision: 1,
        presentation: { ...input.presentation!, comparisonResourceId: "field" },
      }),
      /individual/,
    );
    await saveServiceFor(sql, "owner", {
      ...input,
      presentationRevision: 1,
      presentation: { ...input.presentation!, status: "draft" },
    });
    assert.equal(
      buildPublicCatalog(await loadServices(sql)).cagePlans.some((p) => p.id === "prospect"),
      false,
    );
    assert.equal((await availableOperationalServices(sql, [{ id: "prospect" }])).length, 0);
    await sql.transaction((tx) =>
      assert.rejects(assertOperationalServiceForNewPurchase(tx, "prospect"), /unavailable/),
    );
    await sql`update club_services set presentation='{"unexpected":true}'::jsonb where id='prospect'`;
    assert.equal(
      (await availableOperationalServices(sql, [{ id: "prospect" }])).length,
      0,
      "malformed presentation fails closed at checkout too",
    );
    updated = (await loadServices(sql)).find((p) => p.id === "prospect")!;
    assert.equal(updated.presentation?.status, "draft");
    const catalog = buildPublicCatalog(
      original.map((p) =>
        p.id === "prospect"
          ? {
              ...p,
              presentation: {
                ...defaultServicePresentation,
                showSavings: false,
                showEffectiveRate: false,
              },
            }
          : p,
      ),
    );
    assert.equal(catalog.cagePlans.find((p) => p.id === "prospect")?.savings, "");
    assert.equal(catalog.cagePlans.find((p) => p.id === "prospect")?.hourly, "");

    assert.deepEqual(await publicHomepageFor(sql), { coaches: [], testimonials: [] });
    for (const id of ["coach-a", "coach-b"])
      await sql`insert into person_profiles(user_id,profile,publish_coach) values(${id},${JSON.stringify({ ...emptySharedProfile(id), sports: ["softball"] })}::jsonb,true)`;
    const coaches = (await publicPeopleFor(sql)).filter((p) => p.coach);
    assert.equal(coaches.length, 2);
    await assert.rejects(
      saveHomepageFor(sql, "owner", {
        revision: 0,
        featuredCoachIds: [coaches[0].id, coaches[0].id],
      }),
    );
    await assert.rejects(
      saveHomepageFor(sql, "owner", { revision: 0, featuredCoachIds: ["missing"] }),
      /published coaches/,
    );
    await saveHomepageFor(sql, "owner", {
      revision: 0,
      featuredCoachIds: coaches.map((p) => p.id).reverse(),
    });
    assert.deepEqual(
      (await publicHomepageFor(sql)).coaches.map((p) => p.id),
      coaches.map((p) => p.id).reverse(),
    );
    await assert.rejects(
      saveHomepageFor(sql, "owner", { revision: 0, featuredCoachIds: [] }),
      /changed/,
    );
    await sql`update person_profiles set publish_coach=false where user_id='coach-a'`;
    assert.equal(
      (await publicHomepageFor(sql)).coaches.length,
      1,
      "withdrawn profile disappears without stale duplicated content",
    );
    const quote = {
      revision: 0,
      quote: "Synthetic test quote; not customer content.",
      attribution: "Synthetic Guardian",
      teamAffiliation: "",
      status: "published",
      consentConfirmed: true,
      consentNote: "Isolated fixture consent",
      sortOrder: 1,
    };
    await assert.rejects(saveTestimonialFor(sql, "owner", { ...quote, consentConfirmed: false }));
    await assert.rejects(saveTestimonialFor(sql, "owner", { ...quote, consentNote: "" }));
    await assert.rejects(saveTestimonialFor(sql, "parent", quote));
    const created = await saveTestimonialFor(sql, "owner", quote);
    assert.equal((await publicHomepageFor(sql)).testimonials.length, 1);
    assert.doesNotMatch(
      JSON.stringify(await publicHomepageFor(sql)),
      /consentNote|Isolated fixture consent|consent_by/,
    );
    await saveTestimonialFor(sql, "owner", {
      ...quote,
      id: created.id,
      revision: 1,
      status: "archived",
      consentConfirmed: false,
    });
    assert.equal((await publicHomepageFor(sql)).testimonials.length, 0);
    await assert.rejects(
      saveTestimonialFor(sql, "owner", { ...quote, id: created.id, revision: 1 }),
      /changed/,
    );
    for (let i = 0; i < 4; i++) await saveTestimonialFor(sql, "owner", { ...quote, sortOrder: i });
    assert.equal((await publicHomepageFor(sql)).testimonials.length, 3);
    assert.ok((await websiteEditorFor(sql, "owner")).audit.length >= 8);
    const initialAbout = await aboutEditorFor(sql, "owner");
    assert.deepEqual(await publicAboutFor(sql), initialAbout.published);
    const aboutInput = {
      revision: initialAbout.revision,
      action: "draft",
      content: {
        ...initialAbout.draft,
        title: "Unpublished synthetic draft",
        story: "Synthetic draft only.",
      },
    };
    for (const actor of ["parent", "coach-a", "ordinary-admin"]) {
      await assert.rejects(aboutEditorFor(sql, actor), /authorized owner/);
      await assert.rejects(saveAboutFor(sql, actor, aboutInput), /authorized owner/);
    }
    const draft = await saveAboutFor(sql, "owner", aboutInput);
    assert.equal(draft.draft.title, "Unpublished synthetic draft");
    assert.deepEqual(
      await publicAboutFor(sql),
      initialAbout.published,
      "Saving drafts never changes public content",
    );
    await assert.rejects(
      saveAboutFor(sql, "owner", { ...aboutInput, action: "publish" }),
      /changed/,
    );
    await assert.rejects(
      saveAboutFor(sql, "owner", {
        ...aboutInput,
        revision: draft.revision,
        content: { ...draft.draft, title: "" },
      }),
    );
    const published = await saveAboutFor(sql, "owner", {
      revision: draft.revision,
      action: "publish",
      content: draft.draft,
    });
    assert.equal(published.revision, draft.revision + 1);
    assert.deepEqual(await publicAboutFor(sql), draft.draft);
    assert.ok(published.publishedAt);
    assert.doesNotMatch(
      JSON.stringify(await publicAboutFor(sql)),
      /publishedAt|updated_by|revision|draft_content/,
    );
    const audit = (await websiteEditorFor(sql, "owner")).audit;
    assert.ok(audit.some((a) => a.entity === "about-draft"));
    assert.ok(audit.some((a) => a.entity === "about-published"));
    // Reapplying the additive migration must never replace an owner's published edits.
    await db.exec(await readFile("migrations/0104_website_about.sql", "utf8"));
    assert.deepEqual(await publicAboutFor(sql), published.published);
    await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
    await assert.rejects(saveHomepageFor(sql, "owner", { revision: 1, featuredCoachIds: [] }));
    await assert.rejects(
      saveAboutFor(sql, "owner", { ...aboutInput, revision: published.revision }),
      /authorized owner/,
    );
  } finally {
    await db.close();
  }
});
