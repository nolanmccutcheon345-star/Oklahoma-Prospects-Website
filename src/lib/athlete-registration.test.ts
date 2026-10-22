import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { athleteRegistrationInput } from "./athlete-registration-contracts";
import { calculateEligibility, type EligibilityRule } from "./athlete-eligibility";
import { recordInquiryFor } from "./tryout-enrollment.server";
import {
  familyAthletesFor,
  prepareAthleteRegistration,
  claimRegistrationFor,
  reviewEligibilityFor,
  syncAthleteEducation,
} from "./athlete-registration.server";
import { registrationRowsFor } from "./registrations.server";
import { emptyRegistrationFilters } from "./registration-filters";

test("date validation, explicit unknown education and calendar eligibility boundaries", () => {
  const profile = {
    birthDate: "2014-08-31",
    graduationYear: "unknown",
    schoolStatus: "homeschool",
    school: "",
  };
  assert.equal(athleteRegistrationInput.parse(profile).graduationYear, "unknown");
  for (const birthDate of ["2025-02-29", "2099-01-01", "not-a-date"])
    assert.equal(athleteRegistrationInput.safeParse({ ...profile, birthDate }).success, false);
  assert.equal(
    athleteRegistrationInput.safeParse({ ...profile, schoolStatus: "school" }).success,
    false,
  );
  assert.equal(
    calculateEligibility("2014-08-31", "Softball", "Spring 2027", "12U").suggestedDivision,
    "12U",
  );
  assert.equal(
    calculateEligibility("2014-09-01", "Softball", "Spring 2027", "12U").suggestedDivision,
    "11U",
  );
  assert.equal(
    calculateEligibility("2014-09-01", "Softball", "Spring 2027", "12U").eligibilityStatus,
    "Needs review",
  );
  assert.equal(
    calculateEligibility("2014-09-01", "Softball", "Spring 2028", "12U").suggestedDivision,
    "",
  );
  for (const [dob, expected] of [
    ["2014-04-29", "13U"],
    ["2014-04-30", "13U"],
    ["2014-05-01", "12U"],
    ["2012-02-29", "15U"],
  ]) {
    assert.equal(
      calculateEligibility(dob, "Baseball", "Spring 2027", expected).suggestedDivision,
      expected,
    );
  }
  assert.equal(
    calculateEligibility("2014-05-01", "Baseball", "Spring 2027", "11U").eligibilityStatus,
    "Needs review",
  );
  assert.equal(
    calculateEligibility("2014-05-01", "Baseball", "Spring 2028", "12U").suggestedDivision,
    "",
  );
  assert.equal(
    calculateEligibility("2014-05-01", "Baseball", "Spring 2027", "12U", undefined, "unknown")
      .suggestedDivision,
    "",
  );
  const rule: EligibilityRule = {
    id: "synthetic",
    organization: "Test",
    sport: "baseball",
    seasons: ["Test"],
    cutoff: "2027-04-30",
    divisions: [10, 11, 12, 13, 14, 15],
    source: "https://example.invalid",
    verifiedOn: "2026-10-22",
  };
  assert.equal(
    calculateEligibility("2014-05-01", "Baseball", "Test", "12U", [rule], "Test").suggestedDivision,
    "12U",
  );
  assert.equal(
    calculateEligibility("2014-04-30", "Baseball", "Test", "13U", [rule], "Test").suggestedDivision,
    "13U",
  );
  assert.equal(
    calculateEligibility("2012-02-29", "Baseball", "Test", "15U", [rule], "Test").suggestedDivision,
    "15U",
  );
});

test("private registration profiles: household scope, retry, snapshots, claim and safe staff projection", async () => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (text: string, values: unknown[] = []) =>
      (await query(text, values)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  try {
    for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + name, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const id of ["parent", "other", "reader"]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@example.invalid"},'parent')`;
    }
    await sql`insert into registration_readers(user_id,email,active,granted_by) values('reader','reader@example.invalid',true,'parent')`;
    const profile = athleteRegistrationInput.parse({
      birthDate: "2014-09-01",
      graduationYear: "2033",
      schoolStatus: "homeschool",
      school: "",
    });
    const prepared = await prepareAthleteRegistration(sql, "parent", profile);
    const request = {
      requestId: randomUUID(),
      kind: "tryout",
      player: "Synthetic Player",
      parent: "Parent",
      email: "parent@example.invalid",
      phone: "555",
      age: "12U",
      sport: "Softball",
      season: "Spring 2027",
      session: "Individual evaluation",
      profileFingerprint: "synthetic1",
    };
    const first = await recordInquiryFor(sql, request, {
      userId: "parent",
      data: profile,
      householdEmail: prepared.me!.email,
    });
    const athletes = await familyAthletesFor(sql, "parent");
    assert.equal(athletes.length, 1);
    assert.equal((await familyAthletesFor(sql, "other")).length, 0);
    await assert.rejects(
      prepareAthleteRegistration(sql, "other", { ...profile, athleteId: athletes[0].id }),
      /authorized/,
    );
    await assert.rejects(
      prepareAthleteRegistration(sql, null, { ...profile, athleteId: athletes[0].id }),
      /authorized/,
    );
    assert.equal(
      (
        await recordInquiryFor(sql, request, {
          userId: "parent",
          data: profile,
          householdEmail: prepared.me!.email,
        })
      ).reference,
      first.reference,
    );
    assert.equal((await familyAthletesFor(sql, "parent")).length, 1);
    const staff = await registrationRowsFor(sql, "reader");
    assert.equal(staff[0].payload.birthMonthYear, "2014-09");
    assert.equal(JSON.stringify(staff).includes("2014-09-01"), false);
    assert.equal(JSON.stringify(staff).includes("profileFingerprint"), false);
    const raw = (
      await sql<{
        payload: Record<string, unknown>;
      }>`select payload from club_requests where id=${request.requestId}`
    )[0].payload;
    assert.equal("birthDate" in raw, false);
    assert.equal("athleteProfile" in raw, false);
    assert.equal(
      (await registrationRowsFor(sql, "reader", { ...emptyRegistrationFilters, birthYear: "2013" }))
        .length,
      0,
    );
    assert.equal(
      (await registrationRowsFor(sql, "reader", { ...emptyRegistrationFilters, birthYear: "2014" }))
        .length,
      1,
    );
    await assert.rejects(
      recordInquiryFor(
        sql,
        { ...request, requestId: randomUUID(), profileFingerprint: "changed" },
        {
          userId: "parent",
          data: { ...profile, athleteId: athletes[0].id, birthDate: "2014-08-31" },
          householdEmail: prepared.me!.email,
        },
      ),
      /correction/,
    );
    await recordInquiryFor(
      sql,
      { ...request, requestId: randomUUID(), profileFingerprint: "changed" },
      {
        userId: "parent",
        data: {
          ...profile,
          athleteId: athletes[0].id,
          birthDate: "2014-08-31",
          correctionReason: "Corrected typo",
        },
        householdEmail: prepared.me!.email,
      },
    );
    const snapshot = (
      await sql<{
        birth_date: string;
      }>`select birth_date::text from athlete_registration_profiles where request_id=${request.requestId}`
    )[0];
    assert.equal(snapshot.birth_date, "2014-09-01");
    const [corrected] = await sql<{
      payload: Record<string, string>;
    }>`select payload from club_requests where id=${request.requestId}`;
    assert.equal(corrected.payload.suggestedDivision, "12U");
    assert.equal(corrected.payload.eligibilityStatus, "Needs review");
    assert.match(corrected.payload.eligibilityExplanation, /Recalculated/);
    assert.equal(JSON.stringify(corrected).includes("2014-08-31"), false);
    const [original] = await sql<{
      snapshot: Record<string, unknown>;
    }>`select snapshot from athlete_registration_profiles where request_id=${request.requestId}`;
    assert.equal(original.snapshot.suggestedDivision, "11U");
    assert.ok(original.snapshot.ruleset);
    await sql`update club_requests set status='accepted' where id=${request.requestId}`;
    await sql`update club_athletes set birth_date='2013-08-31' where id=${athletes[0].id}`;
    const [settled] = await sql<{
      payload: Record<string, string>;
    }>`select payload from club_requests where id=${request.requestId}`;
    assert.equal(settled.payload.suggestedDivision, "12U");
    await sql`insert into club_state(id,rev,demo,payload) values('oklahoma-prospects',1,false,'{"teams":[{"id":"test-team","roster":[{"id":"test-roster","school":"Old school","gradYear":"2030"}]}]}'::jsonb)`;
    await sql`insert into recruiting_roster_links(athlete_id,team_id,roster_id,linked_by) values(${athletes[0].id},'test-team','test-roster','parent')`;
    await sql.transaction(tx=>syncAthleteEducation(tx,athletes[0].id));
    const [roster]=await sql<{school:string;year:string}>`select payload#>>'{teams,0,roster,0,school}' school,payload#>>'{teams,0,roster,0,gradYear}' as "year" from club_state where id='oklahoma-prospects'`;
    assert.equal(roster.school,"");assert.equal(roster.year,"2033");
    const guest = {
      ...request,
      requestId: randomUUID(),
      player: "Guest Player",
      profileFingerprint: "guest",
    };
    const receipt = await recordInquiryFor(sql, guest, {
      userId: null,
      data: profile,
      householdEmail: null,
    });
    assert.ok(receipt.claimToken);
    await assert.rejects(
      claimRegistrationFor(sql, "other", guest.requestId, receipt.claimToken!, ""),
      /unavailable/,
    );
    await assert.rejects(
      claimRegistrationFor(sql, "parent", guest.requestId, "a".repeat(64), ""),
      /unavailable/,
    );
    const review={requestId:guest.requestId,revision:0,decision:'approved' as const,reason:'Reviewed synthetic age evidence and requested division',ruleReference:'usssa-fastpitch-2027-age-v1'};
    await assert.rejects(reviewEligibilityFor(sql,'reader',review));
    await sql`insert into owner_grants(email,user_id) values('parent@example.invalid','parent')`;
    await sql`insert into staff_authorities(email,capability) values('parent@example.invalid','staff_approvals.review')`;
    await reviewEligibilityFor(sql,'parent',review);
    await assert.rejects(reviewEligibilityFor(sql,'parent',review),/changed/);
    const [receiptCount]=await sql<{count:number}>`select count(*)::int count from athlete_eligibility_reviews where request_id=${guest.requestId}`;
    assert.equal(receiptCount.count,1);
    await claimRegistrationFor(sql, "parent", guest.requestId, receipt.claimToken!, "");
    assert.equal((await familyAthletesFor(sql, "parent")).length, 2);
    await assert.rejects(
      claimRegistrationFor(sql, "parent", guest.requestId, receipt.claimToken!, ""),
      /unavailable/,
    );
  } finally {
    await db.close();
  }
});
