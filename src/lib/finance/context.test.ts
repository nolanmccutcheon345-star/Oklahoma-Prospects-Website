import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import { defaultBudget } from "../teams/fee-model";
import { myFinance, myPreference } from "./self.server";
import { personId } from "./sources.server";
import type { FeePlan } from "../teams/fee-contracts";
import {
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
} from "./basis.server";
import { applyFutureActiveSchemaForTest } from "./context.test-fixture";
import {
  withFinancialContext,
  loadFinancialContextInTransaction,
  financialSourceModeInTransaction,
  commitFinancialFeePlanInTransaction,
  commitFinancialFeeBusinessInTransaction,
  recordFinancialTeamPaymentInTransaction,
  reviewFinancialOfflinePaymentInTransaction,
  commitFinancialClubTermsInTransaction,
  isFinancialGuardian,
  reconcileFinancialTeamPaymentInTransaction,
  loadFinancialProviderContextInTransaction,
  loadFinancialLessonsInTransaction,
  assertApprovedFinancialLessonInTransaction,
  lockFinancialExecution,
  previewFinancialAdmissionInTransaction,
  admitFinancialEntitiesForOwnerInTransaction,
  isFinancialCoach,
  commitFinancialLessonTermsInTransaction,
  commitFinancialCatalogPriceInTransaction,
} from "./context.server";
const db = new PGlite();
after(() => db.close());
function wrap(query: PGlite["query"], transactions = false): Sql {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await query(
        parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = (async (text: string, values: unknown[] = []) =>
    (await query(text, values)).rows) as Sql["query"];
  sql.transaction = transactions
    ? (fn) => db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])))
    : async () => {
        throw new Error("Nested transactions are not supported.");
      };
  return sql;
}
async function fixture(split = 41, capturedLesson = false) {
  await db.exec("drop schema public cascade; create schema public");
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  const sql = wrap(db.query.bind(db), true);
  for (const [id, role] of [
    ["owner", "admin"],
    ["parent", "parent"],
    ["other", "parent"],
    ["fake", "admin"],
    ["restricted", "admin"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified") values(${id},${id + "@example.invalid"},${id},true)`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${"Profile " + id},${role},${"fam-" + id})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner'),('restricted@example.invalid','restricted')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('restricted','suspended','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 3;
  club.teams = club.teams.slice(0, 1);
  club.teams[0].roster = club.teams[0].roster.slice(0, 1);
  const team = club.teams[0],
    player = team.roster[0];
  player.parents = [{ name: "Parent", rel: "parent", email: "parent@example.invalid", phone: "" }];
  player.familyId = "home";
  player.roleType = "full";
  player.withdrawn = false;
  player.feeLock = {
    amount: 100,
    lockedAt: "2026-09-01T00:00:00Z",
    policyVersion: "1",
    components: { season: 100 },
  };
  player.planLock = {
    dep: 25,
    deadline: "2027-01-01",
    planType: "one",
    rows: [{ date: "2027-01-01", amount: 100 }],
  };
  player.payments = [];
  player.credits = [];
  player.depositPaid = false;
  player.agreement = { version: "1", signedBy: "Parent", signedAt: "2026-09-01T00:00:00Z" };
  const plan: FeePlan = {
    budget: defaultBudget(),
    players: {},
    uniforms: [],
    status: "draft",
    revision: 2,
    expenses: [],
    history: [],
  };
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,3,false)`;
  await sql`insert into team_fee_plans(team_id,payload,revision) values(${team.id},${JSON.stringify(plan)}::jsonb,2)`;
  await sql`insert into club_households(id,primary_email) values('home','parent@example.invalid')`;
  await sql`insert into household_members(household_id,user_id) values('home','parent')`;
  await sql`insert into pd_working_file(id,payload) values('club',${JSON.stringify({ coaches: [{ id: "coach-approved", name: "Approved Coach", email: "coach@example.invalid", active: true }], coachPayouts: [{ coachId: "coach-approved", serviceId: "s3", splitPct: split }] })})`;
  if (capturedLesson) {
    await lessonOrder(sql, "captured-order");
    await sql`insert into booking_records(id,order_id,user_id,coach_id,product_id,starts_at,ends_at,resources,status) values('captured-lesson','captured-order','parent','coach-approved','s3','2026-11-01T12:00:00Z','2026-11-01T13:00:00Z','[]'::jsonb,'confirmed')`;
  }
  const preview = await previewFinancialBasisInitialization(sql, "owner");
  await initializeFinancialBasisForOwner(sql, "owner", {
    ...preview,
    reason: "Synthetic reviewed capture",
  });
  return { sql, club, team, player, plan };
}
async function order(
  sql: Sql,
  id: string,
  teamId: string,
  playerId: string,
  environment = "production",
) {
  const snapshot = {
    kind: "team-fee",
    teamFee: { teamId, playerId, lockedAt: "2026-09-01T00:00:00Z", role: "full" },
  };
  await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status,hold_until,payment_provider,payment_environment,square_payment_id,paid_at) values(${id},${id},'parent','parent@example.invalid',${teamId},'team-fee',${JSON.stringify(snapshot)}::jsonb,5000,'paid','2027-01-01','square',${environment},${"pay-" + id},now())`;
  await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values(${"pay-" + id},${id},${environment},5000,'COMPLETED')`;
}
async function lessonOrder(sql: Sql, id: string) {
  await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status,hold_until,payment_provider,payment_environment) values(${id},${id},'parent','parent@example.invalid','s3','lesson','{"kind":"lesson"}'::jsonb,10000,'paid','2027-01-01','square','production')`;
}

test("captured initialization stays inactive; selector never treats capture as activation", async () => {
  const f = await fixture();
  await assert.rejects(
    f.sql`update financial_basis_state set activation_state='active',active_version=2`,
    /check constraint/,
  );
  f.club.teams[0].name = "Current operational name";
  await f.sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb,rev=4`;
  await withFinancialContext(f.sql, "owner", "owner", async (_tx, c) => {
    assert.equal(c.mode, "legacy");
    assert.equal(c.version, null);
    assert.equal(c.club.teams[0].name, "Current operational name");
    assert.equal(c.principal.name, "Profile owner");
  });
  assert.equal((await f.sql`select * from financial_lesson_bindings`).length, 0);
});

test("active selection freezes attribution but current security and owner authority remain live", async () => {
  const f = await fixture();
  await applyFutureActiveSchemaForTest(f.sql);
  f.club.teams[0].roster[0].parents = [
    { name: "Other", rel: "parent", email: "other@example.invalid", phone: "" },
  ];
  await f.sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb`;
  await f.sql`update "user" set email='changed@example.invalid' where id='parent'`;
  await withFinancialContext(f.sql, "parent", "read", async (_tx, c) => {
    assert.equal(c.mode, "basis");
    assert.equal(c.principal.email, "parent@example.invalid");
    assert.equal(c.principal.currentEmail, "changed@example.invalid");
    assert.equal(isFinancialGuardian(c, f.team.id, f.player.id), true);
  });
  await withFinancialContext(f.sql, "other", "read", async (_tx, c) => {
    assert.equal(isFinancialGuardian(c, f.team.id, f.player.id), false);
  });
  for (const user of ["fake", "parent", "restricted"])
    await assert.rejects(
      withFinancialContext(f.sql, user, "owner", async () => {}),
      /access required|access is unavailable/,
    );
  await f.sql`update owner_grants set revoked_at=now() where user_id='owner'`;
  await assert.rejects(
    withFinancialContext(f.sql, "owner", "owner", async () => {}),
    /owner access/,
  );
  await f.sql`update "user" set "disabledAt"=now() where id='parent'`;
  await assert.rejects(
    withFinancialContext(f.sql, "parent", "read", async () => {}),
    /access is unavailable/,
  );
});

test("typed owner writes CAS the financial source and mirror without rewriting operational club", async () => {
  const f = await fixture();
  await applyFutureActiveSchemaForTest(f.sql);
  const before = (await f.sql`select payload,rev from club_state`)[0];
  await assert.rejects(
    withFinancialContext(f.sql, "owner", "owner", async (tx, c) =>
      commitFinancialFeeBusinessInTransaction(tx, c, {
        expectedRevision: 0,
        value: { overhead: 1, reserve: 0, nolanBps: 5000, period: "", teamIds: [] },
      }),
    ),
    /Financial basis changed/,
  );
  await withFinancialContext(f.sql, "owner", "owner", async (tx, c) => {
    const plan = structuredClone(c.feePlans[0].payload);
    plan.revision++;
    plan.status = "closed";
    const receipt = await commitFinancialFeePlanInTransaction(tx, c, {
      request: { action: "close", teamId: f.team.id, revision: 2, confirmed: true },
      team: c.club.teams[0],
      plan,
      expectedBasisVersion: c.version!,
    });
    assert.equal(receipt.version, 2);
  });
  assert.deepEqual((await f.sql`select payload,rev from club_state`)[0], before);
  assert.equal(
    (await f.sql<{ revision: number }>`select revision from team_fee_plans`)[0].revision,
    3,
  );
  await assert.rejects(
    withFinancialContext(f.sql, "parent", "read", async (tx, c) => {
      c.principal.owner = true;
      c.principal.role = "admin";
      await commitFinancialClubTermsInTransaction(tx, c, {
        expectedBasisVersion: c.version!,
        reason: "Forged owner",
        settings: { membershipMonthly: 999 },
      });
    }),
    /owner access/,
  );
  await withFinancialContext(f.sql, "owner", "owner", async (tx, c) => {
    const receipt = await recordFinancialTeamPaymentInTransaction(tx, c, {
      teamId: f.team.id,
      playerId: f.player.id,
      amount: 25,
      method: "cash",
      label: "Deposit",
      expectedBasisVersion: c.version!,
    });
    assert.match(receipt.receipt, /^R-/);
  });
  await withFinancialContext(f.sql, "parent", "read", async (_tx, c) => {
    assert.equal(c.club.teams[0].roster[0].payments[0].amount, 25);
  });
});

test("provider writes use verified live amounts, service provenance and idempotent refund reconciliation", async () => {
  const f = await fixture();
  await applyFutureActiveSchemaForTest(f.sql);
  await order(f.sql, "order", f.team.id, f.player.id);
  await f.sql`update "user" set "disabledAt"=now() where id='parent'`;
  const reconcile = () =>
    f.sql.transaction((tx) => reconcileFinancialTeamPaymentInTransaction(tx, "order"));
  assert.equal((await reconcile()).changed, true);
  assert.equal((await reconcile()).changed, false);
  const [version] = await f.sql<{
    changed_by: string | null;
    actor_kind: string;
    provider_payment_id: string;
  }>`select changed_by,actor_kind,provider_payment_id from financial_basis_versions where version=2`;
  assert.deepEqual(version, {
    changed_by: null,
    actor_kind: "provider",
    provider_payment_id: "pay-order",
  });
  await f.sql`update square_payments set refunded_cents=1200 where id='pay-order'`;
  assert.equal((await reconcile()).changed, true);
  await withFinancialContext(f.sql, "owner", "read", async (_tx, c) =>
    assert.equal(c.club.teams[0].roster[0].payments[0].amount, 38),
  );
  await f.sql`update square_payments set refunded_cents=0 where id='pay-order'`;
  await assert.rejects(reconcile(), /restore previously returned funds/);
  assert.equal((await f.sql`select * from financial_basis_versions`).length, 3);
  await order(f.sql, "sandbox", f.team.id, f.player.id, "sandbox");
  await f.sql.transaction(async (tx) => {
    assert.equal((await loadFinancialProviderContextInTransaction(tx, "sandbox"))?.mode, "basis");
    assert.equal((await reconcileFinancialTeamPaymentInTransaction(tx, "sandbox")).changed, false);
  });
});

test("new approved lessons bind original attribution at INSERT and survive later operational edits", async () => {
  const f = await fixture();
  await applyFutureActiveSchemaForTest(f.sql);
  await lessonOrder(f.sql, "lesson-order");
  await f.sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await assertApprovedFinancialLessonInTransaction(tx, {
      coachId: "coach-approved",
      productId: "s3",
      startsAt: "2026-11-01T12:00:00Z",
      endsAt: "2026-11-01T13:00:00Z",
    });
    await tx`insert into booking_records(id,order_id,user_id,coach_id,product_id,starts_at,ends_at,resources,status) values('new-lesson','lesson-order','parent','coach-approved','s3','2026-11-01T12:00:00Z','2026-11-01T13:00:00Z','[]'::jsonb,'confirmed')`;
  });
  await f.sql`update booking_records set coach_id='ops-reassigned',ends_at='2026-11-01T13:30:00Z' where id='new-lesson'`;
  await f.sql`update pd_working_file set payload='{"coaches":[],"coachPayouts":[]}' where id='club'`;
  await withFinancialContext(f.sql, "owner", "read", async (tx, c) => {
    const lessons = await loadFinancialLessonsInTransaction(tx, ["new-lesson", "unknown"], c);
    const lesson = lessons.get("new-lesson")!;
    assert.equal(lesson.mode, "basis");
    if (lesson.mode !== "basis") throw new Error("Expected basis");
    assert.equal(lesson.booking?.coach_id, "coach-approved");
    assert.equal(
      new Date(String(lesson.booking?.ends_at)).toISOString(),
      "2026-11-01T13:00:00.000Z",
    );
    assert.equal(lesson.compensation.development[0].coachPayouts instanceof Array, true);
    assert.equal(
      lessons.get("unknown")?.mode === "basis" && (lessons.get("unknown") as typeof lesson).booking,
      null,
    );
  });
  await assert.rejects(f.sql`update financial_lesson_bindings set basis_version=1`, /append-only/);
});

test("unknown new lesson terms fail before payment and booking INSERT rollback; explicit zero is approved", async () => {
  const f = await fixture(0);
  await applyFutureActiveSchemaForTest(f.sql);
  await f.sql.transaction(async (tx) => {
    await assertApprovedFinancialLessonInTransaction(tx, {
      coachId: "coach-approved",
      productId: "s3",
      startsAt: "2026-11-01T12:00:00Z",
      endsAt: "2026-11-01T13:00:00Z",
    });
  });
  await assert.rejects(
    f.sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      await lessonOrder(tx, "unknown-order");
      await tx`insert into booking_records(id,order_id,user_id,coach_id,product_id,starts_at,ends_at,resources,status) values('unknown-lesson','unknown-order','parent','ops-created','s3','2026-11-01T12:00:00Z','2026-11-01T13:00:00Z','[]'::jsonb,'confirmed')`;
    }),
    /Financial instructor admission/,
  );
  assert.equal((await f.sql`select * from commerce_orders where id='unknown-order'`).length, 0);
  assert.equal((await f.sql`select * from booking_records where id='unknown-lesson'`).length, 0);
  assert.equal((await f.sql`select * from financial_lesson_bindings`).length, 0);
  await assert.rejects(
    f.sql.transaction((tx) =>
      assertApprovedFinancialLessonInTransaction(tx, {
        coachId: "coach-approved",
        productId: "unapproved-service",
        startsAt: "2026-11-01T12:00:00Z",
        endsAt: "2026-11-01T13:00:00Z",
      }),
    ),
    /Approved financial (instructor|service)/,
  );
});

test("only a transaction-issued context can write; malformed active state fails closed", async () => {
  const f = await fixture();
  await applyFutureActiveSchemaForTest(f.sql);
  await assert.rejects(
    f.sql.transaction(async (tx) => {
      const c = await loadFinancialContextInTransaction(tx, "owner", "owner");
      await commitFinancialClubTermsInTransaction(
        tx,
        { ...c },
        {
          expectedBasisVersion: c.version!,
          reason: "Forged context",
          settings: { membershipMonthly: 2 },
        },
      );
    }),
    /context from this transaction/,
  );
  await f.sql.query(
    "alter table financial_basis_state drop constraint fixture_financial_activation_shape",
  );
  await f.sql`update financial_basis_state set active_version=null`;
  await assert.rejects(
    f.sql.transaction((tx) => financialSourceModeInTransaction(tx)),
    /activation state/,
  );
  await assert.rejects(
    withFinancialContext(f.sql, "owner", "read", async () => {}),
    /activation state/,
  );
});

test("reviewed owner admission binds new accounts only to the chosen new agreement and rejects hidden identity drift", async () => {
  const f = await fixture();
  await applyFutureActiveSchemaForTest(f.sql);
  // A newly created account matches a historical guardian email after that
  // original account changes its current email. It must not inherit old debts.
  await f.sql`update "user" set email='parent-renamed@example.invalid' where id='parent'`;
  await f.sql`insert into "user"(id,email,name,"emailVerified") values('new-parent','parent@example.invalid','New parent',true)`;
  await f.sql`insert into profiles(user_id,email,name,role) values('new-parent','parent@example.invalid','New parent','parent')`;
  const player = structuredClone(f.player);
  player.id = "new-player";
  player.feeLock = null;
  player.planLock = null;
  player.agreement = { version: "1", signedBy: "", signedAt: "" };
  player.familyId = "new-home";
  f.club.teams[0].roster.push(player);
  await f.sql`insert into club_households(id,primary_email) values('new-home','new-home@example.invalid')`;
  await f.sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb,rev=4`;
  const selection = { teamId: f.team.id, playerIds: [player.id], sourceClubRevision: 4 };
  const preview = () =>
    withFinancialContext(f.sql, "owner", "owner", (tx, c) =>
      previewFinancialAdmissionInTransaction(tx, c, selection),
    );
  const before = await preview();
  assert.deepEqual(
    before.players[0].guardians.map((p) => p.userId),
    ["new-parent"],
  );
  await f.sql`insert into household_members(household_id,user_id) values('new-home','other')`;
  const command = (review: Awaited<ReturnType<typeof preview>>) =>
    withFinancialContext(f.sql, "owner", "owner", (tx, c) =>
      admitFinancialEntitiesForOwnerInTransaction(tx, c, {
        ...selection,
        expectedBasisVersion: review.basisVersion,
        reviewDigest: review.reviewDigest,
        confirmed: true,
        reason: "Owner reviewed new agreement",
      }),
    );
  await assert.rejects(command(before), /identities changed/);
  assert.equal((await f.sql`select * from financial_player_agreements`).length, 1);
  const reviewed = await preview();
  assert.equal(reviewed.players[0].guardians.length, 2);
  const receipt = await command(reviewed);
  assert.equal(receipt.version, 2);
  await withFinancialContext(f.sql, "new-parent", "read", async (_tx, c) => {
    assert.equal(isFinancialGuardian(c, f.team.id, f.player.id), false);
    assert.equal(isFinancialGuardian(c, f.team.id, player.id), true);
    const fakeCoach = { ...c.club.teams[0], coachEmail: c.principal.email };
    assert.equal(isFinancialCoach(c, fakeCoach), false);
  });
  await f.sql`insert into finance_records(id,kind,payload) values('old-payable','payable',${JSON.stringify({ id: "old-payable", payeeId: personId("parent@example.invalid"), category: "coach", teamId: f.team.id, reason: "Historical old identity", amount: 100, earned: 100, approved: 0, paid: 0, due: "2026-11-01", state: "accrued", source: "manual" })}::jsonb)`;
  const self = await myFinance(f.sql, "new-parent");
  assert.deepEqual(self.rows, []);
  assert.deepEqual(self.payments, []);
  assert.equal(self.profile, null);
  await assert.rejects(
    myPreference(f.sql, "new-parent", { method: "ACH", reference: "ending 1000" }),
    /profile|admitted|scoped|Front Office/i,
  );
  await withFinancialContext(f.sql, "parent", "read", async (_tx, c) =>
    assert.equal(isFinancialGuardian(c, f.team.id, f.player.id), true),
  );
  await assert.rejects(
    withFinancialContext(f.sql, "owner", "owner", (tx, c) =>
      previewFinancialAdmissionInTransaction(tx, c, { ...selection, playerIds: [f.player.id] }),
    ),
    /already has a financial agreement/,
  );
  // Admission did not write or restore the operational club.
  assert.equal((await f.sql<{ rev: number }>`select rev from club_state`)[0].rev, 4);
});

test("approved precharge version is immutable and operational observations cannot alter booking financial status", async () => {
  const f = await fixture();
  await applyFutureActiveSchemaForTest(f.sql);
  await lessonOrder(f.sql, "pinned-order");
  const admission = await f.sql.transaction((tx) =>
    assertApprovedFinancialLessonInTransaction(tx, {
      coachId: "coach-approved",
      productId: "s3",
      startsAt: "2026-11-01T12:00:00Z",
      endsAt: "2026-11-01T13:00:00Z",
    }),
  );
  await f.sql`update commerce_orders set snapshot=${JSON.stringify({ kind: "lesson", financialLessonAdmission: admission })}::jsonb where id='pinned-order'`;
  await withFinancialContext(f.sql, "owner", "owner", (tx, c) =>
    commitFinancialClubTermsInTransaction(tx, c, {
      expectedBasisVersion: c.version!,
      reason: "Unrelated approved financial update",
      settings: { membershipMonthly: 2 },
    }),
  );
  await f.sql`insert into booking_records(id,order_id,user_id,coach_id,product_id,starts_at,ends_at,resources,status) values('pinned-lesson','pinned-order','parent','coach-approved','s3','2026-11-01T12:00:00Z','2026-11-01T13:00:00Z','[]'::jsonb,'confirmed')`;
  assert.equal(
    (
      await f.sql<{
        basis_version: number;
      }>`select basis_version from financial_lesson_bindings where booking_id='pinned-lesson'`
    )[0].basis_version,
    1,
  );
  await assert.rejects(
    f.sql`update commerce_orders set snapshot='{}'::jsonb where id='pinned-order'`,
    /admission is immutable/,
  );
  await f.sql`insert into operational_lesson_completions(booking_id,attendance,recap,completed_by) values('pinned-lesson','present','Operational recap recorded separately.','restricted')`;
  assert.equal(
    (
      await f.sql<{ status: string }>`select status from booking_records where id='pinned-lesson'`
    )[0].status,
    "confirmed",
  );
  assert.equal((await f.sql`select * from financial_lesson_recognitions`).length, 0);
  await assert.rejects(
    f.sql`update operational_lesson_completions set recap='Changed recorded recap'`,
    /append-only/,
  );
  await lessonOrder(f.sql, "already-paid");
  await f.sql`insert into square_payments(id,order_id,environment,amount_cents,status) values('late-payment','already-paid','production',10000,'COMPLETED')`;
  await assert.rejects(
    f.sql`update commerce_orders set snapshot=${JSON.stringify({ kind: "lesson", financialLessonAdmission: admission })}::jsonb where id='already-paid'`,
    /must precede completed payment/,
  );
});

test("future instructor/service amendments preserve captured unfinished lessons and prior precharge versions", async () => {
  const f = await fixture(41, true);
  await applyFutureActiveSchemaForTest(f.sql);
  await withFinancialContext(f.sql, "owner", "owner", async (tx, c) => {
    await tx`insert into club_staff(id,name,email,role,active) values('approved-staff','Updated Coach','coach@example.invalid','coach',true)`;
    await tx`insert into club_staff_services(staff_id,service_id,profit_split) values('approved-staff','s3',22)`;
    const saved = await commitFinancialLessonTermsInTransaction(tx, c, {
      expectedBasisVersion: c.version!,
      command: { type: "staff", staffId: "approved-staff", coachId: "coach-approved" },
      reason: "Owner revised future compensation",
    });
    assert.equal(saved.version, 2);
  });
  await withFinancialContext(f.sql, "owner", "read", async (tx, c) => {
    const original = (await loadFinancialLessonsInTransaction(tx, ["captured-lesson"], c)).get(
      "captured-lesson",
    )!;
    assert.equal(original.mode, "basis");
    if (original.mode !== "basis") return;
    assert.equal(original.version, 1);
    assert.equal(
      (original.compensation.development[0].coachPayouts as { splitPct: number }[])[0].splitPct,
      41,
    );
    assert.equal(original.compensation.staff.length, 0);
    const fresh = await assertApprovedFinancialLessonInTransaction(tx, {
      coachId: "coach-approved",
      productId: "s3",
      startsAt: "2026-11-02T12:00:00Z",
      endsAt: "2026-11-02T13:00:00Z",
    });
    assert.equal(fresh?.basisVersion, 2);
  });
  await withFinancialContext(f.sql, "owner", "owner", async (tx, c) => {
    await tx`delete from club_staff_services where service_id='s3'`;
    await tx`delete from club_services where id='s3'`;
    await commitFinancialLessonTermsInTransaction(tx, c, {
      expectedBasisVersion: c.version!,
      command: { type: "service", serviceId: "s3" },
      reason: "Owner retired future service",
    });
  });
  const input = {
    coachId: "coach-approved",
    productId: "s3",
    startsAt: "2026-11-02T12:00:00Z",
    endsAt: "2026-11-02T13:00:00Z",
  };
  await assert.rejects(
    f.sql.transaction((tx) => assertApprovedFinancialLessonInTransaction(tx, input)),
    /service is unavailable/,
  );
  assert.equal(
    (
      await f.sql.transaction((tx) =>
        assertApprovedFinancialLessonInTransaction(tx, { ...input, basisVersion: 1 }),
      )
    )?.basisVersion,
    1,
  );
});

test("owner catalog price mirror changes one public field and preserves frozen metadata and source CAS", async () => {
  const f = await fixture();
  await applyFutureActiveSchemaForTest(f.sql);
  const original = f.club.catalog[0];
  assert.ok(original);
  const savedName = original.name;
  original.name = "Operational renamed catalog";
  await f.sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb,rev=4`;
  await assert.rejects(
    withFinancialContext(f.sql, "owner", "owner", (tx, c) =>
      commitFinancialCatalogPriceInTransaction(tx, c, {
        expectedBasisVersion: c.version!,
        sourceClubRevision: 3,
        catalogId: original.id,
        fee: 333,
        confirmed: true,
        reason: "Owner reviewed price",
      }),
    ),
    /catalog changed/,
  );
  await withFinancialContext(f.sql, "owner", "owner", (tx, c) =>
    commitFinancialCatalogPriceInTransaction(tx, c, {
      expectedBasisVersion: c.version!,
      sourceClubRevision: 4,
      catalogId: original.id,
      fee: 333,
      confirmed: true,
      reason: "Owner reviewed price",
    }),
  );
  await withFinancialContext(f.sql, "owner", "read", async (_tx, c) => {
    assert.equal(c.club.catalog[0].name, savedName);
    assert.equal(c.club.catalog[0].fee, 333);
  });
  const [live] = await f.sql<{
    payload: typeof f.club;
    rev: number;
  }>`select payload,rev from club_state`;
  assert.equal(live.payload.catalog[0].name, "Operational renamed catalog");
  assert.equal(live.payload.catalog[0].fee, 333);
  assert.equal(live.rev, 5);
  assert.deepEqual(live.payload.teams, f.club.teams);
  const extra = { ...original, id: "selected-new-catalog", name: "Selected new event", fee: 0 };
  const unselected = { ...original, id: "unselected-new-catalog", name: "Not chosen", fee: 999 };
  live.payload.catalog.push(extra, unselected);
  await f.sql`update club_state set payload=${JSON.stringify(live.payload)}::jsonb,rev=6`;
  await assert.rejects(
    withFinancialContext(f.sql, "owner", "owner", (tx, c) =>
      commitFinancialCatalogPriceInTransaction(tx, c, {
        expectedBasisVersion: 1,
        sourceClubRevision: 6,
        catalogId: extra.id,
        fee: 123,
        confirmed: true,
        reason: "Explicit selected event",
      }),
    ),
    /basis changed/,
  );
  await withFinancialContext(f.sql, "owner", "owner", (tx, c) =>
    commitFinancialCatalogPriceInTransaction(tx, c, {
      expectedBasisVersion: c.version!,
      sourceClubRevision: 6,
      catalogId: extra.id,
      fee: 123,
      confirmed: true,
      reason: "Explicit selected event",
    }),
  );
  await withFinancialContext(f.sql, "owner", "read", async (_tx, c) => {
    assert.equal(c.club.catalog.find((e) => e.id === extra.id)?.fee, 123);
    assert.equal(
      c.club.catalog.some((e) => e.id === unselected.id),
      false,
    );
    assert.equal(c.club.catalog[0].name, savedName);
  });
});

test("explicit new-team admission scopes new coach identity and does not auto-admit operational event commitments", async () => {
  const f = await fixture();
  await applyFutureActiveSchemaForTest(f.sql);
  await f.sql`insert into "user"(id,email,name,"emailVerified") values('new-coach','new-coach@example.invalid','New Coach',true)`;
  await f.sql`insert into profiles(user_id,email,name,role) values('new-coach','new-coach@example.invalid','New Coach','coach')`;
  const newTeam = {
    ...structuredClone(f.team),
    id: "new-team",
    name: "Explicit new season",
    headCoach: "New Coach",
    coachEmail: "new-coach@example.invalid",
    staff: [],
    roster: [],
    tournamentIds: ["operational-only-event"],
  };
  f.club.teams.push(newTeam);
  await f.sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb,rev=4`;
  const selection = { teamId: newTeam.id, playerIds: [], sourceClubRevision: 4 };
  const preview = await withFinancialContext(f.sql, "owner", "owner", (tx, c) =>
    previewFinancialAdmissionInTransaction(tx, c, selection),
  );
  assert.deepEqual(
    preview.team.compensationAccounts.map((a) => a.userId),
    ["new-coach"],
  );
  await withFinancialContext(f.sql, "owner", "owner", (tx, c) =>
    admitFinancialEntitiesForOwnerInTransaction(tx, c, {
      ...selection,
      reviewDigest: preview.reviewDigest,
      expectedBasisVersion: preview.basisVersion,
      confirmed: true,
      reason: "Owner reviewed new coach and season terms",
    }),
  );
  await withFinancialContext(f.sql, "new-coach", "read", async (_tx, c) => {
    const team = c.club.teams.find((t) => t.id === newTeam.id)!;
    assert.equal(isFinancialCoach(c, team), true);
    assert.equal(isFinancialCoach(c, { ...c.club.teams[0], coachEmail: c.principal.email }), false);
    assert.deepEqual(team.tournamentIds, []);
    assert.deepEqual(team.practices, []);
    assert.deepEqual(c.principal.admittedTeamIds, [newTeam.id]);
    assert.deepEqual(c.principal.admittedAgreementIds, []);
    assert.equal(
      c.feePlans.some((p) => p.team_id === newTeam.id),
      false,
    );
  });
  assert.equal((await f.sql`select * from financial_team_seasons`).length, 2);
  assert.equal((await f.sql`select * from financial_player_agreements`).length, 1);
});

test("verified external receipts and returns preserve an active financial basis and frozen agreement", async () => {
  const f = await fixture();
  await applyFutureActiveSchemaForTest(f.sql);
  const before = (await f.sql`select payload,rev from club_state`)[0];
  const requestId = "a1a7f332-244b-4771-8842-2015b7f553de";
  const change = {
    teamId: f.team.id,
    playerId: f.player.id,
    amount: 25,
    method: "Check",
    label: "Synthetic settled check",
    verifiedReceived: true as const,
    requestId,
    expectedBasisVersion: 1,
  };
  const record = () =>
    withFinancialContext(f.sql, "owner", "owner", (tx, c) =>
      recordFinancialTeamPaymentInTransaction(tx, c, change),
    );
  const first = await record();
  assert.equal((await record()).receipt, first.receipt);
  const { offlinePaymentEvidence } = await import("../teams/offline-payments.server");
  await withFinancialContext(f.sql, "owner", "owner", async (tx, c) => {
    assert.equal(
      (await offlinePaymentEvidence(tx, c, f.team.id, c.club.teams[0].roster[0])).cents,
      2500,
    );
    await reviewFinancialOfflinePaymentInTransaction(tx, c, {
      teamId: f.team.id,
      playerId: f.player.id,
      receipt: first.receipt,
      action: "reverse",
      remainingAmount: 10,
      reason: "Synthetic bank return reviewed",
      expectedBasisVersion: c.version!,
    });
  });
  await withFinancialContext(f.sql, "parent", "read", async (tx, c) => {
    const p = c.club.teams[0].roster[0];
    assert.equal((await offlinePaymentEvidence(tx, c, f.team.id, p)).cents, 1000);
    assert.equal(p.payments[0].amount, 10);
    assert.equal(p.payments[0].charged, 25);
    assert.deepEqual(p.feeLock, f.player.feeLock);
    assert.deepEqual(p.planLock, f.player.planLock);
  });
  assert.deepEqual((await f.sql`select payload,rev from club_state`)[0], before);
  assert.equal((await f.sql`select * from financial_basis_versions`).length, 3);
});
