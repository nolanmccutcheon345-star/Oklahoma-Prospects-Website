import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { emptyClub } from "../teams/seed";
import {
  assertNamedHuman,
  evaluateTeamDevCount,
  readOwnerCountPin,
  storedRecordFailureMessage,
  TEAM_DEV_PARTIAL_SAVE_MESSAGE,
  TEAM_DEV_WHOLE_SAVE_REFUSED_MESSAGE,
} from "./gates";
import { resolveSeedTarget } from "./seed-target";
import { resolveEffectiveAssignments, withoutUnassignedTypes } from "./resolution";
import type { TeamDevAgeBand, TeamDevSeedRecord } from "./contracts";

const BANDS: TeamDevAgeBand[] = ["agp_6u-8u", "agp_9u-10u", "agp_11u-12u", "agp_13u-14u", "agp_15u-17u"];

async function withDb(run: (sql: Sql) => Promise<void>) {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      (await query(p.reduce((s, x, i) => s + (i ? `$${i}` : "") + x, ""), v)).rows) as Sql;
    sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => {
        const s = wrap(tx.query.bind(tx) as PGlite["query"]);
        s.transaction = async () => { throw new Error("Nested transaction"); };
        return work(s);
      });
    return sql;
  };
  const state = globalThis as typeof globalThis & { __pgSqlPromise__?: Promise<Sql> };
  const oldSql = state.__pgSqlPromise__, oldUrl = process.env.DATABASE_URL, oldContext = process.env.CONTEXT;
  try {
    for (const f of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    const sql = wrap(db.query.bind(db));
    process.env.DATABASE_URL = "postgresql://unused.invalid/disposable";
    process.env.CONTEXT = "dev";
    state.__pgSqlPromise__ = Promise.resolve(sql);
    for (const [id, role] of [["owner", "admin"], ["coach", "coach"], ["parent", "parent"]]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.test"},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role) values(${id},${id + "@example.test"},${id},${role})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.test','owner')`;
    await run(sql);
  } finally {
    state.__pgSqlPromise__ = oldSql;
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
    if (oldContext === undefined) delete process.env.CONTEXT; else process.env.CONTEXT = oldContext;
    await db.close();
  }
}

async function seedRecords() {
  return JSON.parse(await readFile("src/lib/team-development/seed/appendix-8617b2b.json", "utf8")) as TeamDevSeedRecord[];
}

test("GATE seed: imports as DRAFT + ESTIMATE, idempotent, nothing assignable, blocked fields preserved", async () => {
  await withDb(async (sql) => {
    const store = await import("./store.server");
    const records = await seedRecords();
    assert.equal(records.length, 184);
    await assert.rejects(store.importTeamDevelopmentSeed("coach", records), /Front office only/);
    const first = await store.importTeamDevelopmentSeed("owner", records);
    assert.deepEqual([first.inserted, first.updated, first.rejected.length], [184, 0, 0]);
    const events = (await sql`select count(*)::int as n from team_dev_events`)[0] as { n: number };
    const again = await store.importTeamDevelopmentSeed("owner", records);
    assert.deepEqual([again.inserted, again.updated, again.unchanged, again.rejected.length], [0, 0, 184, 0]);
    assert.equal(((await sql`select count(*)::int as n from team_dev_events`)[0] as { n: number }).n, events.n, "re-run writes nothing");

    const statuses = await sql<{ status: string; data_label: string }>`
      select status,data_label from team_dev_program_versions
      union all select status,data_label from team_dev_exercises
      union all select status,data_label from team_dev_drills`;
    assert.ok(statuses.length > 0 && statuses.every((r) => r.status === "DRAFT" && r.data_label === "ESTIMATE"));
    assert.ok((await sql<{ data_label: string }>`select data_label from team_dev_config_items`).every((r) => r.data_label === "ESTIMATE"));

    // Blocked token is never stored as a value; the field stays listed as blocked.
    assert.equal((await sql`select 1 from team_dev_program_versions where payload::text like '%REQUIRES APPROVED AGE-BAND CEILING%'`).length, 0);
    const blocked = await sql<{ program_id: string; blocked_fields: string[]; payload: Record<string, unknown> }>`
      select program_id,blocked_fields,payload from team_dev_program_versions where jsonb_array_length(blocked_fields)>0`;
    assert.ok(blocked.length > 0);
    for (const row of blocked) for (const field of row.blocked_fields) if (!field.includes(".") && !field.includes("[")) assert.equal(row.payload[field], null);

    // SCHEMA-00 defaults are inherited (record fields win).
    const [str] = await sql<{ payload: Record<string, unknown> }>`select payload from team_dev_program_versions where program_id='STR-FND-01'`;
    assert.deepEqual(str.payload.approval_requirements && Array.isArray(str.payload.approval_requirements), true);
    assert.equal(str.payload.origin, "PROSPECTS_SEED_DRAFT");

    // Nothing is assignable for any band.
    const programs = await sql<{ program_id: string; version: number }>`select program_id,version from team_dev_program_versions`;
    for (const p of programs) for (const band of BANDS)
      await assert.rejects(store.assertProgramAssignable(sql, p.program_id, p.version, band));

    // A changed record for a version past DRAFT is never overwritten.
    await sql`update team_dev_program_versions set status='SPORTS_SCIENCE_REVIEW' where program_id='STR-FND-01'`;
    const edited = records.map((r) => (r.id === "STR-FND-01" ? { ...r, description: "changed" } : r));
    const locked = await store.importTeamDevelopmentSeed("owner", edited);
    assert.deepEqual(locked.rejected.map((r) => r.id), ["STR-FND-01"]);
    const [still] = await sql<{ status: string; payload: Record<string, unknown> }>`select status,payload from team_dev_program_versions where program_id='STR-FND-01'`;
    assert.equal(still.status, "SPORTS_SCIENCE_REVIEW");
    assert.notEqual(still.payload.description, "changed");
  });
});

test("GATE windmill: THR-SB-WM-00 is never assignable, reviewable or approvable, for admin too", async () => {
  await withDb(async (sql) => {
    const store = await import("./store.server");
    await store.importTeamDevelopmentSeed("owner", await seedRecords());
    const [wm] = await sql<{ non_assignable_reason: string | null; status: string }>`
      select non_assignable_reason,status from team_dev_program_versions where program_id='THR-SB-WM-00'`;
    assert.equal(wm.non_assignable_reason, "softball_windmill_blocked");
    assert.equal(wm.status, "DRAFT");
    for (const band of BANDS) await assert.rejects(store.assertProgramAssignable(sql, "THR-SB-WM-00", 1, band), /windmill/i);
    await assert.rejects(store.advanceProgramVersionReview("owner", { programId: "THR-SB-WM-00", version: 1 }), /windmill/i);
    await assert.rejects(store.activateProgramVersion("owner", { programId: "THR-SB-WM-00", version: 1, humanSigner: "Jane Expert" }), /windmill/i);
    // Database trigger refuses even a direct write with every reviewer filled in.
    await assert.rejects(
      sql`update team_dev_program_versions set status='ACTIVE',blocked_fields='[]'::jsonb,non_assignable_reason=null,
        sports_science_reviewed_by='Jane Expert',safety_reviewed_by='John Safety',approved_by='Jane Expert',approved_at=now()
        where program_id='THR-SB-WM-00'`,
      /windmill/i,
    );
  });
});

test("GATE blocked fields and review approvals: named reviewers, sign-off and APPROVED ceilings required", async () => {
  await withDb(async (sql) => {
    const store = await import("./store.server");
    await store.importTeamDevelopmentSeed("owner", await seedRecords());
    // Blocked fields: cannot enter review and the database refuses approval.
    const [withBlocked] = await sql<{ program_id: string }>`select program_id from team_dev_program_versions where jsonb_array_length(blocked_fields)>0 and non_assignable_reason is null limit 1`;
    await assert.rejects(store.advanceProgramVersionReview("owner", { programId: withBlocked.program_id, version: 1 }), /Blocked fields/);
    await assert.rejects(
      sql`update team_dev_program_versions set status='APPROVED',sports_science_reviewed_by='Jane Expert',safety_reviewed_by='John Safety' where program_id=${withBlocked.program_id}`,
      /blocked fields/i,
    );

    // A synthetic clean template walks the full review path.
    const synthetic = { id: "SYN-THR-01", table: "program", name: "Synthetic throwing", sport: "baseball", category: "throwing", age_band: ["agp_11u-12u"], ceiling_ref: ["cap_synthetic-<band>"], items: [] } as TeamDevSeedRecord;
    const noCeiling = { ...synthetic, id: "SYN-THR-02", ceiling_ref: undefined } as TeamDevSeedRecord;
    await store.importTeamDevelopmentSeed("owner", [synthetic, noCeiling]);
    const id = { programId: "SYN-THR-01", version: 1 };
    await assert.rejects(store.activateProgramVersion("owner", { ...id, humanSigner: "Jane Expert" }), /Sports-science and safety reviews/);
    await assert.rejects(store.advanceProgramVersionReview("coach", id), /Front office only/);
    await store.advanceProgramVersionReview("owner", id); // DRAFT -> SPORTS_SCIENCE_REVIEW
    for (const bad of [undefined, "", "PSA-P04", "A1 Bot", "Grok", "admin", "S01 Review"])
      await assert.rejects(store.advanceProgramVersionReview("owner", { ...id, reviewerName: bad }), /named human/);
    await store.advanceProgramVersionReview("owner", { ...id, reviewerName: "Jane Expert" });
    await assert.rejects(sql`update team_dev_program_versions set status='APPROVED' where program_id='SYN-THR-01'`, /reviews are required/);
    await store.advanceProgramVersionReview("owner", { ...id, reviewerName: "John Safety" });
    const [approved] = await sql<{ status: string; sports_science_reviewed_by: string; safety_reviewed_by: string }>`
      select status,sports_science_reviewed_by,safety_reviewed_by from team_dev_program_versions where program_id='SYN-THR-01'`;
    assert.deepEqual(approved, { status: "APPROVED", sports_science_reviewed_by: "Jane Expert", safety_reviewed_by: "John Safety" });
    await assert.rejects(store.assertProgramAssignable(sql, "SYN-THR-01", 1, "agp_11u-12u"), /Only ACTIVE/);
    await assert.rejects(store.activateProgramVersion("owner", { ...id, humanSigner: "PSA-00" }), /named human/);
    await assert.rejects(store.activateProgramVersion("owner", { ...id, humanSigner: "Jane Expert" }), /ceilings must be APPROVED/);
    await sql`insert into team_dev_age_band_ceilings(id,sport,age_band,kind,value_status) values('cap_synthetic-11u-12u','baseball','agp_11u-12u','synthetic','PROPOSED')`;
    await assert.rejects(store.activateProgramVersion("owner", { ...id, humanSigner: "Jane Expert" }), /ceilings must be APPROVED/);
    // Test-only synthetic approval; no real value is introduced.
    await sql`update team_dev_age_band_ceilings set value_status='APPROVED',approved_by='Synthetic Approver',approved_at=now() where id='cap_synthetic-11u-12u'`;
    await store.activateProgramVersion("owner", { ...id, humanSigner: "Jane Expert" });
    await store.assertProgramAssignable(sql, "SYN-THR-01", 1, "agp_11u-12u");
    await assert.rejects(store.assertProgramAssignable(sql, "SYN-THR-01", 1, "agp_13u-14u"), /APPROVED age-band ceiling/);
    // Approved/active versions are immutable.
    await assert.rejects(sql`update team_dev_program_versions set payload='{}'::jsonb where program_id='SYN-THR-01'`, /immutable/);
    // A template with no ceiling reference never becomes assignable.
    await sql`update team_dev_program_versions set status='SPORTS_SCIENCE_REVIEW' where program_id='SYN-THR-02'`;
    await store.advanceProgramVersionReview("owner", { programId: "SYN-THR-02", version: 1, reviewerName: "Jane Expert" });
    await store.advanceProgramVersionReview("owner", { programId: "SYN-THR-02", version: 1, reviewerName: "John Safety" });
    await assert.rejects(store.activateProgramVersion("owner", { programId: "SYN-THR-02", version: 1, humanSigner: "Jane Expert" }), /ceilings must be APPROVED/);
    const logged = await sql<{ action: string }>`select action from team_dev_events where entity_id='SYN-THR-01@1' order by id`;
    assert.deepEqual(logged.map((e) => e.action), ["seed_import", "review_advance", "review_advance", "review_advance", "activate"]);
  });
});

async function assignableFixture(sql: Sql) {
  const store = await import("./store.server");
  await store.importTeamDevelopmentSeed("owner", [
    { id: "SYN-THR-01", table: "program", name: "Synthetic throwing A", sport: "baseball", category: "throwing", age_band: ["agp_11u-12u"], ceiling_ref: ["cap_synthetic-<band>"], items: [] },
    { id: "SYN-THR-03", table: "program", name: "Synthetic throwing B", sport: "baseball", category: "throwing", age_band: ["agp_11u-12u"], ceiling_ref: ["cap_synthetic-<band>"], items: [] },
  ] as TeamDevSeedRecord[]);
  await sql`insert into team_dev_age_band_ceilings(id,sport,age_band,kind,value_status,approved_by,approved_at) values('cap_synthetic-11u-12u','baseball','agp_11u-12u','synthetic','APPROVED','Synthetic Approver',now())`;
  for (const programId of ["SYN-THR-01", "SYN-THR-03"]) {
    await store.advanceProgramVersionReview("owner", { programId, version: 1 });
    await store.advanceProgramVersionReview("owner", { programId, version: 1, reviewerName: "Jane Expert" });
    await store.advanceProgramVersionReview("owner", { programId, version: 1, reviewerName: "John Safety" });
    await store.activateProgramVersion("owner", { programId, version: 1, humanSigner: "Jane Expert" });
  }
  const club = emptyClub();
  club.teams = [{ id: "team-a", name: "Synthetic 12U", closed: false, staff: [], roster: [
    { id: "r1", name: "Player One", positions: ["P"], familyId: "fam1" },
    { id: "r2", name: "Player Two", positions: ["C"], familyId: "fam2" },
  ] } as unknown as (typeof club.teams)[number]];
  await sql`insert into club_state(id,payload,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,false) on conflict(id) do update set payload=excluded.payload,demo=false`;
  for (const [athlete, roster] of [["ath1", "r1"], ["ath2", "r2"]]) {
    await sql`insert into club_athletes(id,user_id,household_email,name) values(${athlete},'parent','parent@example.test',${"Synthetic " + athlete})`;
    await sql`update club_athletes set birth_date='2015-01-15' where id=${athlete}`;
    await sql`insert into team_dev_roster_links(id,team_id,roster_player_id,athlete_id,linked_by) values(${"link-" + athlete},'team-a',${roster},${athlete},'owner')`;
  }
  const runtime = await import("./runtime.server");
  const base = { teamId: "team-a", programType: "throwing", programVersion: 1, startDate: "2027-03-01", endDate: "2027-03-31", daysOfWeek: [1, 3] };
  return { runtime, base };
}
async function hold(sql: Sql, athlete: string, on: boolean) {
  if (on) await sql`insert into training_assignments(id,athlete_id,created_by,status,document) values(${"hold-" + athlete},${athlete},'owner','paused','{}'::jsonb)`;
  else await sql`update training_assignments set status='active' where id=${"hold-" + athlete}`;
}

test("GATE hold: held athletes cannot receive throwing on any assignment path", async () => {
  await withDb(async (sql) => {
    const { runtime, base } = await assignableFixture(sql);
    await hold(sql, "ath2", true);
    for (const extra of [{ scope: "team" as const }, { scope: "team" as const, inheritNewPlayers: true }, { scope: "position" as const, position: "C" }, { scope: "selected" as const, athleteIds: ["ath2"] }, { scope: "override" as const, athleteIds: ["ath2"] }])
      await assert.rejects(runtime.createTeamDevelopmentAssignment("owner", { ...base, programId: "SYN-THR-01", ...extra }), /training hold/);
    assert.equal((await sql`select 1 from team_dev_items where athlete_id='ath2'`).length, 0);
    // Not held: assignable.
    await runtime.createTeamDevelopmentAssignment("owner", { ...base, programId: "SYN-THR-01", scope: "selected", athleteIds: ["ath1"] });
    await assert.rejects(runtime.createTeamDevelopmentAssignment("coach", { ...base, programId: "SYN-THR-01", scope: "selected", athleteIds: ["ath1"] }), /Forbidden/);
  });
});

test("GATE D-1 (S01 Ruling 6): cancel while held leaves the athlete unassigned; no prior version shows live throwing", async () => {
  await withDb(async (sql) => {
    const { runtime, base } = await assignableFixture(sql);
    const team = await runtime.createTeamDevelopmentAssignment("owner", { ...base, programId: "SYN-THR-01", scope: "team", inheritNewPlayers: true });
    const o1 = await runtime.createTeamDevelopmentAssignment("owner", { ...base, programId: "SYN-THR-03", scope: "override", athleteIds: ["ath1"] });
    const o2 = await runtime.createTeamDevelopmentAssignment("owner", { ...base, programId: "SYN-THR-03", scope: "override", athleteIds: ["ath2"] });
    const effective = async (a: string) => (await runtime.effectiveTeamDevelopmentForAthlete("owner", "team-a", a)).map((x) => x.id);
    assert.deepEqual(await effective("ath2"), [o2.id]);

    // Not held: ending the override restores the team program (D7).
    await runtime.endTeamDevelopmentAssignment("owner", o1.id, "2027-02-01");
    assert.deepEqual(await effective("ath1"), [team.id]);

    // Held: cancelling is allowed, but nothing is restored.
    await hold(sql, "ath2", true);
    const ended = await runtime.endTeamDevelopmentAssignment("owner", o2.id, "2027-02-01");
    assert.deepEqual(ended.unassigned, ["ath2"]);
    assert.deepEqual(await effective("ath2"), [], "superseded/lower-tier program is not restored");
    const live = await sql`select i.id from team_dev_items i join team_dev_assignments a on a.id=i.assignment_id
      where i.athlete_id='ath2' and a.program_type='throwing' and i.state in ('assigned','started','modified')`;
    assert.equal(live.length, 0, "no live throwing days for the held athlete");
    assert.ok((await sql`select 1 from team_dev_events where action='cancelled_while_held' and athlete_id='ath2'`).length);
    // ath1 keeps the team program.
    assert.deepEqual(await effective("ath1"), [team.id]);

    // Reassignment while still held is refused (hold checks still apply).
    await assert.rejects(runtime.createTeamDevelopmentAssignment("owner", { ...base, programId: "SYN-THR-01", scope: "override", athleteIds: ["ath2"] }), /training hold/);
    // After the hold is resolved, a logged reassignment clears the unassigned state.
    await hold(sql, "ath2", false);
    assert.deepEqual(await effective("ath2"), [], "resolving the hold alone restores nothing");
    const re = await runtime.createTeamDevelopmentAssignment("owner", { ...base, programId: "SYN-THR-01", scope: "override", athleteIds: ["ath2"] });
    assert.deepEqual(await effective("ath2"), [re.id]);
    assert.ok((await sql`select 1 from team_dev_events where action='reassigned' and athlete_id='ath2'`).length);
    // Cancelled days stay cancelled.
    const [cancelled] = await sql<{ id: string }>`select id from team_dev_items where assignment_id=${o2.id} limit 1`;
    const { updateTeamDevelopmentItem } = await import("./api");
    assert.ok(cancelled && typeof updateTeamDevelopmentItem === "function");
    const states = await sql<{ state: string }>`select distinct state from team_dev_items where assignment_id=${o2.id}`;
    assert.deepEqual(states.map((s) => s.state), ["skipped_by_coach"]);
  });
});

test("D-1 resolution helper drops unassigned program types", () => {
  const all = resolveEffectiveAssignments(
    [{ id: "t", program_type: "throwing", scope: "team", created_at: "2027-01-01", targets: [{ target_key: "team:x" }] },
     { id: "s", program_type: "strength", scope: "team", created_at: "2027-01-01", targets: [{ target_key: "team:x" }] }],
    "a", [], "x");
  assert.deepEqual(withoutUnassignedTypes(all, ["throwing"]).map((a) => a.id), ["s"]);
});

test("GATE count max: owner pin only, fails closed, frozen; over-cap accepted + flagged + counted, never clamped", () => {
  const unpinned = readOwnerCountPin({});
  assert.equal(unpinned.status, "unpinned");
  assert.ok(Object.isFrozen(unpinned));
  const noPin = evaluateTeamDevCount(1500, "throws", unpinned);
  assert.deepEqual({ ...noPin }, { accepted: true, countedValue: 1500, enteredValue: 1500, flagged: true, flag: "owner_pin_unavailable", max: null });

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const token = (payload: unknown, key = privateKey) => {
    const body = Buffer.from(JSON.stringify(payload));
    return body.toString("base64url") + "." + sign(null, body, key).toString("base64url");
  };
  // Synthetic test maxima only; the real values come from the owner's off-box pin.
  const good = { scope: "team-development-count-max", maxima: { throws: 7 }, approvedBy: "Pat Owner", approvedAt: "2026-11-02T12:00:00Z" };
  const pin = readOwnerCountPin({ TEAM_DEV_OWNER_COUNT_PIN: token(good), TEAM_DEV_OWNER_PIN_PUBLIC_KEY: pem });
  assert.equal(pin.status, "pinned");
  assert.ok(Object.isFrozen(pin) && pin.status === "pinned" && Object.isFrozen(pin.maxima));
  assert.throws(() => { (pin as { maxima: Record<string, number> }).maxima.throws = 9999; });
  const over = evaluateTeamDevCount(12, "throws", pin);
  assert.deepEqual({ ...over }, { accepted: true, countedValue: 12, enteredValue: 12, flagged: true, flag: "over_owner_pin", max: 7 });
  assert.equal((evaluateTeamDevCount(7, "throws", pin) as { flagged: boolean }).flagged, false);
  assert.equal((evaluateTeamDevCount(3, "pitches", pin) as { flag: string }).flag, "owner_pin_unavailable", "unpinned kind fails closed");
  assert.deepEqual({ ...evaluateTeamDevCount(-1, "throws", pin) }, { accepted: false, reason: "invalid_entry" });

  const other = generateKeyPairSync("ed25519");
  const mismatches = [
    { TEAM_DEV_OWNER_COUNT_PIN: token(good, other.privateKey), TEAM_DEV_OWNER_PIN_PUBLIC_KEY: pem },
    { TEAM_DEV_OWNER_COUNT_PIN: token({ ...good, scope: "other" }), TEAM_DEV_OWNER_PIN_PUBLIC_KEY: pem },
    { TEAM_DEV_OWNER_COUNT_PIN: token({ ...good, maxima: { throws: 0 } }), TEAM_DEV_OWNER_PIN_PUBLIC_KEY: pem },
    { TEAM_DEV_OWNER_COUNT_PIN: token({ ...good, approvedBy: "PSA-00" }), TEAM_DEV_OWNER_PIN_PUBLIC_KEY: pem },
    { TEAM_DEV_OWNER_COUNT_PIN: "not-a-token", TEAM_DEV_OWNER_PIN_PUBLIC_KEY: pem },
    { TEAM_DEV_OWNER_COUNT_PIN: token(good) },
  ];
  for (const env of mismatches) assert.equal(readOwnerCountPin(env).status, "unpinned");
});

test("S01 Ruling 7 messages are verbatim", () => {
  assert.equal(TEAM_DEV_WHOLE_SAVE_REFUSED_MESSAGE, "This didn't save because of a problem with a stored training-plan record, not your entry. Keep your entry, write the counts and any soreness in the team log, and tell the admin.");
  assert.equal(TEAM_DEV_PARTIAL_SAVE_MESSAGE, "Your other entries saved. One stored training-plan record couldn't be processed, and the admin has been told.");
  assert.equal(storedRecordFailureMessage(false), TEAM_DEV_WHOLE_SAVE_REFUSED_MESSAGE);
  assert.equal(storedRecordFailureMessage(true), TEAM_DEV_PARTIAL_SAVE_MESSAGE);
});

test("named human sign-off validation", () => {
  assert.equal(assertNamedHuman("  Dr. Jane   Expert ", "x"), "Dr. Jane Expert");
  for (const bad of ["", "Jane", "PSA-S01", "A1 Worker", "Grok Bot", "System Admin", "TBD Person"]) assert.throws(() => assertNamedHuman(bad, "x"));
});

test("GATE seed target: never production", () => {
  assert.throws(() => resolveSeedTarget({ CONTEXT: "production", TEAM_DEV_SEED_TARGET: "local" }), /production/);
  assert.throws(() => resolveSeedTarget({ NODE_ENV: "production", TEAM_DEV_SEED_TARGET: "preview" }), /production/);
  assert.throws(() => resolveSeedTarget({}), /TEAM_DEV_SEED_TARGET/);
  const preview = { CONTEXT: "deploy-preview", TEAM_DEV_SEED_TARGET: "preview", TEAM_DEV_SEED_CONFIRM: "preview-only", PREVIEW_DATABASE_URL: "postgresql://u@preview.example.test/db" };
  assert.deepEqual(resolveSeedTarget(preview), { kind: "preview", databaseUrl: preview.PREVIEW_DATABASE_URL });
  assert.throws(() => resolveSeedTarget({ ...preview, CONTEXT: "dev" }), /deploy-preview/);
  assert.throws(() => resolveSeedTarget({ ...preview, TEAM_DEV_SEED_CONFIRM: "" }), /preview-only/);
  assert.throws(() => resolveSeedTarget({ ...preview, DATABASE_URL: preview.PREVIEW_DATABASE_URL }), /matches DATABASE_URL/);
  assert.throws(() => resolveSeedTarget({ ...preview, NETLIFY_DATABASE_URL: "postgresql://other@preview.example.test/x" }), /matches NETLIFY_DATABASE_URL/);
  assert.deepEqual(resolveSeedTarget({ TEAM_DEV_SEED_TARGET: "local" }), { kind: "local" });
});
