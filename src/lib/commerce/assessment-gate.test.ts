import test from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { ASSESSMENT_LOCK_MESSAGE, eligibility } from "../pricing";
import { checkoutInput, type CheckoutInput } from "./contracts";
import { emptyDevelopment } from "../pd/empty";
import {
  assertAthleteMayPurchase,
  assertStoredOrderAllowed,
  householdAssessmentIds,
  loadVerifiedAssessmentIds,
  verifiedAssessmentOnFile,
} from "./assessment-gate.server";

test("unassessed athletes can quote only assessment lessons", () => {
  for (const id of ["s1", "s4", "s9"] as const) {
    const rule = eligibility("lesson", id, false);
    assert.equal(rule.locked, false, id);
    assert.equal(rule.assessment, true);
    assert.equal(rule.setupCents, 0);
  }
  for (const [kind, id] of [
    ["lesson", "s2"],
    ["lesson", "s3"],
    ["lesson", "s5"],
    ["lesson", "s6"],
    ["package", "p1"],
    ["membership", "m4"],
    ["membership", "m5"],
  ] as const) {
    const rule = eligibility(kind, id, false);
    assert.equal(rule.locked, true, id);
    assert.equal(rule.setupCents, 0, id);
  }
  assert.equal(eligibility("cage", "individual", false).locked, false);
  assert.equal(eligibility("cage-plan", "prospect", false).locked, false);
  for (const id of ["m1","m2","m3"]) {
    assert.equal(eligibility("membership", id, false).locked, false);
    assert.equal(eligibility("membership", id, false, 5000).setupCents, 5000);
  }
  assert.equal(eligibility("membership", "m1", true).locked, false);
  assert.equal(eligibility("membership", "m1", true).setupCents, 0);
  assert.equal(eligibility("lesson", "s3", true).locked, false);
  // A client-supplied assessment flag is not part of the checkout contract.
  assert.throws(() => checkoutInput.parse({ assessed: true, hasAssessment: true }));
});

function wrap(query: PGlite["query"], transaction?: Sql["transaction"]): Sql {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await query(
        parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = (async (text: string, values: unknown[] = []) =>
    (await query(text, values)).rows) as Sql["query"];
  sql.transaction =
    transaction ??
    (async () => {
      throw new Error("Nested transactions are not supported.");
    });
  return sql;
}

function failingAssessments(inner: Sql): Sql {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
    if (parts.join("").includes("athlete_assessments")) throw new Error("assessment lookup failed");
    return inner(parts, ...values);
  }) as Sql;
  sql.query = inner.query.bind(inner);
  sql.transaction = inner.transaction.bind(inner);
  return sql;
}

function request(extra: Partial<CheckoutInput>): CheckoutInput {
  return {
    requestId: randomUUID(),
    productId: "p1",
    kind: "package",
    email: "parent@example.invalid",
    name: "Parent Example",
    household: true,
    consent: true,
    athleteCount: 1,
    laneIds: [],
    ...extra,
  };
}

test("server checkout denies bypass, siblings, forged ids, and failed assessment lookups", async () => {
  const db = new PGlite();
  const previousSql = (globalThis as { __pgSqlPromise__?: Promise<Sql> }).__pgSqlPromise__;
  try {
    for (const name of (await readdir("migrations")).filter((file) => file.endsWith(".sql")).sort())
      await db.exec(await readFile(`migrations/${name}`, "utf8"));
    const sql = wrap(db.query.bind(db), (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"]))),
    );
    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values
      ('parent','parent@example.invalid','Parent',true,now(),now()),
      ('other','other@example.invalid','Other',true,now(),now())`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values
      ('parent','parent@example.invalid','Parent','parent','family-parent'),
      ('other','other@example.invalid','Other','parent','family-other')`;
    await sql`insert into club_athletes(id,user_id,household_email,name) values
      ('kid-a','parent','parent@example.invalid','Assessed Sibling'),
      ('kid-b','parent','parent@example.invalid','Waiting Sibling'),
      ('kid-c','other','other@example.invalid','Other Household')`;
    await sql`insert into athlete_assessments(id,athlete_id,discipline,coach_user_id,completed_at,notes)
      values('assess-a','kid-a','Pitching','coach-user',now(),'Verified new player assessment')`;
    await sql`insert into club_staff(id,name,email,role,active) values('staff','Gate Coach','coach@example.invalid','coach',true)`;
    await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('staff','s1',60),('staff','s2',60),('staff','s3',60)`;
    await sql`insert into service_resources(service_id,lane_ids) values('s1','["1"]'::jsonb),('s2','["1"]'::jsonb),('s3','["1"]'::jsonb)`;
    const file = emptyDevelopment();
    file.families = [{
      id: "family-parent",
      email: "parent@example.invalid",
      name: "Household",
      parentName: "Parent",
      phone: "",
      athleteIds: ["kid-a", "kid-b"],
    }];
    file.athletes = [{
      id: "kid-b",
      firstName: "Waiting",
      lastName: "Sibling",
      sport: "baseball",
      position: "",
      throws: "R",
      bats: "R",
      birthDate: "2014-01-01",
      graduationYear: 2032,
      familyId: "family-parent",
      coachIds: [],
      opLevel: 0,
      assessmentComplete: true,
      school: "",
      city: "",
      notes: "",
      tags: [],
    }];
    file.coaches = [{
      id: "gate-coach",
      name: "Gate Coach",
      email: "coach@example.invalid",
      specialties: ["Pitching"],
      active: true,
    }];
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)},0)`;

    const parent = { billingHouseholdIds: [] as string[], role: "parent" };
    const { resolveIdentity } = await import("../identity.server");
    const me = await resolveIdentity(sql, "parent");
    const other = await resolveIdentity(sql, "other");
    parent.billingHouseholdIds = me.billingHouseholdIds;
    assert.ok(parent.billingHouseholdIds.length > 0);

    assert.equal(await verifiedAssessmentOnFile(sql, "kid-a"), true);
    assert.equal(await verifiedAssessmentOnFile(sql, "kid-b"), false);
    const ids = await householdAssessmentIds(sql, me.billingHouseholdIds);
    assert.equal(ids.has("kid-a"), true);
    assert.equal(ids.has("kid-b"), false);
    assert.equal(ids.has("kid-c"), false);

    const broken = failingAssessments(sql);
    assert.equal(await verifiedAssessmentOnFile(broken, "kid-a"), false);
    assert.equal((await householdAssessmentIds(broken, me.billingHouseholdIds)).size, 0);
    assert.equal((await loadVerifiedAssessmentIds(broken)).size, 0);
    await assertAthleteMayPurchase(broken, {
      athleteId: "kid-a",
      kind: "lesson",
      productId: "s1",
      billingHouseholdIds: me.billingHouseholdIds,
      role: "parent",
    });
    const unassessedMember = await assertAthleteMayPurchase(broken, {
      athleteId: "kid-a", kind: "membership", productId: "m1",
      billingHouseholdIds: me.billingHouseholdIds, role: "parent",
    });
    assert.equal(unassessedMember.assessed, false);

    await assert.rejects(
      assertAthleteMayPurchase(sql, {
        athleteId: "kid-c",
        kind: "lesson",
        productId: "s1",
        billingHouseholdIds: me.billingHouseholdIds,
        role: "parent",
      }),
      /not in your household/,
    );
    await assert.rejects(
      assertAthleteMayPurchase(sql, {
        athleteId: "forged-athlete",
        kind: "lesson",
        productId: "s1",
        billingHouseholdIds: me.billingHouseholdIds,
        role: "parent",
      }),
      /not in your household/,
    );
    await assert.rejects(
      assertAthleteMayPurchase(sql, {
        athleteId: "kid-b",
        kind: "package",
        productId: "p1",
        billingHouseholdIds: me.billingHouseholdIds,
        role: "parent",
      }),
      /Complete your assessment/,
    );
    const assessedLesson = await assertAthleteMayPurchase(sql, {
      athleteId: "kid-a",
      kind: "lesson",
      productId: "s3",
      billingHouseholdIds: me.billingHouseholdIds,
      role: "parent",
    });
    assert.equal(assessedLesson.assessed, true);
    const siblingAssessment = await assertAthleteMayPurchase(sql, {
      athleteId: "kid-b",
      kind: "lesson",
      productId: "s9",
      billingHouseholdIds: me.billingHouseholdIds,
      role: "parent",
    });
    assert.equal(siblingAssessment.assessed, false);

    const stored = {
      athlete_id: "kid-b",
      kind: "membership",
      product_id: "m1",
      snapshot: { kind: "membership", productId: "m1", assessment: true },
    };
    await assertStoredOrderAllowed(sql, stored, me);
    await assertStoredOrderAllowed(
      sql,
      { ...stored, athlete_id: "kid-a" },
      me,
    );
    const tamperedAssessmentFlag = {
      athlete_id: "kid-b",
      kind: "lesson",
      product_id: "s1",
      snapshot: { kind: "lesson", productId: "s3", assessment: true },
    };
    await assert.rejects(
      assertStoredOrderAllowed(sql, tamperedAssessmentFlag, me),
      /Complete your assessment/,
    );
    await assert.rejects(
      assertStoredOrderAllowed(
        sql,
        { ...stored, athlete_id: "kid-c" },
        me,
      ),
      /not in your household/,
    );
    await assert.rejects(
      assertStoredOrderAllowed(
        sql,
        { ...stored, athlete_id: "kid-a" },
        other,
      ),
      /not in your household/,
    );

    (globalThis as { __pgSqlPromise__?: Promise<Sql> }).__pgSqlPromise__ = Promise.resolve(sql);
    const { quoteForRequest, checkoutContext } = await import("./checkout.server");
    const { H3Event } = await import("h3-v2");
    const requestStorage = (
      globalThis as Record<symbol, AsyncLocalStorage<{ h3Event: InstanceType<typeof H3Event> }>>
    )[Symbol.for("tanstack-start:event-storage")];
    const inRequest = <T>(fn: () => Promise<T>) =>
      requestStorage.run(
        {
          h3Event: new H3Event(
            new Request("https://club.example.invalid/pay", {
              method: "POST",
              headers: { "sec-fetch-site": "same-origin" },
            }),
          ),
        },
        fn,
      );
    const context = await checkoutContext("parent");
    const byId = Object.fromEntries(context.athletes.map((athlete) => [athlete.id, athlete.assessmentComplete]));
    assert.equal(byId["kid-a"], true);
    assert.equal(byId["kid-b"], false);
    assert.equal("kid-c" in byId, false);
    const otherContext = await checkoutContext("other");
    assert.deepEqual(otherContext.athletes.map((athlete) => athlete.id), ["kid-c"]);
    assert.equal(otherContext.athletes[0]?.assessmentComplete, false);

    await inRequest(async () => {
      await assert.rejects(quoteForRequest(request({ productId: "p1", kind: "package" }), true, "parent"), /Add your athlete/);
      await assert.rejects(quoteForRequest(request({ athleteId: "kid-b", productId: "s3", kind: "lesson", coachId: "gate-coach" }), true, "parent"), /Complete your assessment/);
      await assert.rejects(quoteForRequest(request({ athleteId: "kid-b", productId: "p1", kind: "package" }), true, "parent"), /Complete your assessment/);
      const firstMember = await quoteForRequest(request({ athleteId: "kid-b", productId: "m1", kind: "membership", coachId: "gate-coach" }), true, "parent");
      assert.equal(firstMember.quote.setupCents, 5000);
      assert.equal(firstMember.quote.duration, 75);
      assert.equal(firstMember.quote.totalCents, firstMember.quote.regularCents + 5000);
      await assert.rejects(quoteForRequest(request({ athleteId: "kid-b", productId: "m5", kind: "membership" }), true, "parent"), /Complete your assessment/);
      const openAssessment = await quoteForRequest(request({ athleteId: "kid-b", productId: "s1", kind: "lesson", coachId: "gate-coach" }), true, "parent");
      assert.equal(openAssessment.quote.assessment, true);
      assert.equal(openAssessment.quote.totalCents > 0, true);
      assert.equal(openAssessment.athleteId, "kid-b");
      const siblingLesson = await quoteForRequest(request({ athleteId: "kid-a", productId: "s3", kind: "lesson", coachId: "gate-coach" }), true, "parent");
      assert.equal(siblingLesson.quote.assessment, false);
      assert.equal(siblingLesson.athleteId, "kid-a");
      const siblingMembership = await quoteForRequest(request({ athleteId: "kid-a", productId: "m1", kind: "membership", coachId: "gate-coach" }), true, "parent");
      assert.equal(siblingMembership.quote.setupCents, 0);
      assert.equal(siblingMembership.quote.productId, "m1");
      await assert.rejects(quoteForRequest(request({ athleteId: "kid-c", productId: "s1", kind: "lesson", coachId: "gate-coach" }), true, "parent"), /not in your household/);
      await assert.rejects(quoteForRequest(request({ athleteId: "forged-athlete", productId: "s1", kind: "lesson", coachId: "gate-coach" }), true, "parent"), /not in your household/);
      await assert.rejects(quoteForRequest(request({ athleteId: "kid-a", productId: "not-a-service", kind: "lesson", coachId: "gate-coach" }), true, "parent"), /unavailable/);
      await assert.rejects(quoteForRequest(request({ athleteId: "kid-a", productId: "s3", kind: "lesson", coachId: "forged-coach" }), true, "parent"), /not assigned/);
      await assert.rejects(quoteForRequest(request({ athleteId: "kid-b", productId: "p1", kind: "package" }), true, "other"), /not in your household/);
    });
  } finally {
    (globalThis as { __pgSqlPromise__?: Promise<Sql> }).__pgSqlPromise__ = previousSql;
    await db.close();
  }
});
