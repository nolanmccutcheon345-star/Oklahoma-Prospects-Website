import test, { after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import { defaultBudget } from "../teams/fee-model";
import { feeWorkspace } from "../teams/fee.server";
import { financeWorkspace, records } from "./store.server";
import { sourceData } from "./sources.server";
import { facilityPayables } from "./facility.server";
import { myFinance } from "./self.server";
import { lessonRefundValue } from "../commerce/lesson-refund-value.server";
import { withFinancialContext, loadFinancialLessonInTransaction } from "./context.server";
import {
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
  previewFinancialBasisRefresh,
  refreshFinancialBasisForOwner,
  previewFinancialBasisActivationForOwner,
  activateFinancialBasisForOwner,
} from "./basis.server";
import { financialBasisActivationInput } from "./activation-contracts";
const db = new PGlite();
after(() => db.close());
const asOf = "2026-10-15";
async function fixture() {
  await db.exec("drop schema public cascade; create schema public");
  let transactionDepth = 0;
  const wrap = (query: PGlite["query"], outer = false): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (text: string, values: unknown[] = []) =>
      (await query(text, values)).rows) as Sql["query"];
    sql.transaction = outer
      ? (fn) =>
          db.transaction(async (tx) => {
            transactionDepth++;
            try {
              return await fn(wrap(tx.query.bind(tx) as PGlite["query"]));
            } finally {
              transactionDepth--;
            }
          })
      : async () => {
          throw Error("Nested transaction forbidden");
        };
    return sql;
  };
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  const sql = wrap(db.query.bind(db), true);
  for (const [id, role] of [
    ["owner", "admin"],
    ["coach", "coach"],
    ["replacement", "coach"],
    ["operations", "admin"],
    ["parent", "parent"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified") values(${id},${id + "@example.invalid"},${id},true)`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"fam-" + id})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('operations','active','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  club.teams = club.teams.slice(0, 2);
  for (const team of club.teams) {
    team.roster = team.roster.slice(0, 1);
    team.coachEmail = "coach@example.invalid";
    team.headCoach = "coach";
    team.staff = [
      {
        ...team.staff[0],
        id: "assistant",
        name: "replacement",
        email: "replacement@example.invalid",
        role: "Assistant Coach",
      },
    ];
    const player = team.roster[0];
    player.familyId = "fam-parent";
    player.parents = [
      { name: "Parent", rel: "parent", phone: "", email: "parent@example.invalid" },
    ];
    player.payments = [
      {
        date: "2026-10-01",
        amount: 100,
        fee: 0,
        charged: 100,
        method: "cash",
        label: "paid",
        receipt: "fixture",
      },
    ];
    player.credits = [];
    player.withdrawn = false;
    player.feeLock = {
      amount: 1000,
      lockedAt: "2026-09-01T00:00:00Z",
      policyVersion: "fixture",
      components: {},
    };
    player.planLock = {
      dep: 0,
      deadline: "2026-10-30",
      planType: "fixture",
      rows: [{ amount: 1000, date: "2026-10-30" }],
    };
  }
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  const budget = {
    ...defaultBudget(),
    start: "2026-10-01",
    end: "2026-10-31",
    months: 1,
    costs: [
      { id: "cost-0", name: "Head coach", cents: 31001 },
      { id: "cost-1", name: "Assistant coach", cents: 101 },
    ],
  };
  for (const [index, team] of club.teams.entries()) {
    const plan = {
      budget,
      ...(index === 0 ? { publishedBudget: budget } : {}),
      status: "published",
      revision: 1,
      expenses: [],
      uniforms: [],
      players: {},
      history: [],
    };
    await sql`insert into team_fee_plans(team_id,payload,revision) values(${team.id},${JSON.stringify(plan)}::jsonb,1)`;
  }
  const [master] = await sql<any>`select payload from team_budget_master where id='master'`;
  master.payload.overheadReviewed = true;
  master.payload.payroll = [{ userId: "coach", name: "coach", monthly: 31000, active: true }];
  await sql`update team_budget_master set payload=${JSON.stringify(master.payload)}::jsonb where id='master'`;
  const file = {
    coaches: [
      { id: "coach-id", name: "coach", email: "coach@example.invalid", active: true },
      {
        id: "replacement-id",
        name: "replacement",
        email: "replacement@example.invalid",
        active: true,
      },
    ],
    coachPayouts: [{ coachId: "coach-id", serviceId: "lesson-service", splitPct: 41 }],
  };
  await sql`insert into pd_working_file(id,payload) values('club',${JSON.stringify(file)})`;
  await sql`insert into club_services(id,kind,name) values('lesson-service','lesson','Lesson')`;
  await sql`insert into club_staff(id,user_id,name,email,active) values('staff','coach','coach','coach@example.invalid',true)`;
  await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('staff','lesson-service',41)`;
  await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment) values('order','order','customer@example.invalid','lesson-service','lesson','{}',10001,'paid','square','production')`;
  await sql`insert into square_payments(id,order_id,environment,amount_cents,refunded_cents,status) values('payment','order','production',10001,0,'COMPLETED')`;
  await sql`insert into booking_records(id,order_id,coach_id,product_id,starts_at,ends_at,resources,status) values('lesson','order','coach-id','lesson-service','2026-10-01 12:00Z','2026-10-01 13:15Z','[]'::jsonb,'completed')`;
  await sql`insert into contractor_earnings(booking_id,coach_id,gross_cents,split_pct,amount_cents,status) values('lesson','coach-id',10001,41,4100,'payable')`;
  const payee = {
    id: "coach-payee",
    email: "coach@example.invalid",
    name: "coach",
    role: "Instructor",
    method: "check",
    reference: "Check",
    active: true,
  } as const;
  await sql`insert into finance_records(id,kind,payload) values('coach-payee','payee',${JSON.stringify(payee)}::jsonb)`;
  return { sql, club, file, payee, transactionDepth: () => transactionDepth };
}
const release = "a".repeat(40);
let oldRelease: string | undefined, oldDirty: string | undefined;
beforeEach(() => {
  oldRelease = process.env.APP_BUILD_SOURCE_COMMIT;
  oldDirty = process.env.APP_BUILD_SOURCE_DIRTY;
  process.env.APP_BUILD_SOURCE_COMMIT = release;
  process.env.APP_BUILD_SOURCE_DIRTY = "false";
});
afterEach(() => {
  if (oldRelease === undefined) delete process.env.APP_BUILD_SOURCE_COMMIT;
  else process.env.APP_BUILD_SOURCE_COMMIT = oldRelease;
  if (oldDirty === undefined) delete process.env.APP_BUILD_SOURCE_DIRTY;
  else process.env.APP_BUILD_SOURCE_DIRTY = oldDirty;
});
const originalWindow = {
  start: "2026-10-01T12:00:00.000Z",
  end: "2026-10-01T13:15:00.000Z",
  coachId: "coach-id",
  participantCount: 1,
};
const futureWindow = {
  ...originalWindow,
  start: "2026-10-25T12:00:00.000Z",
  end: "2026-10-25T13:15:00.000Z",
};
const validPin = {
  basisVersion: 1,
  coachId: "coach-id",
  productId: "lesson-service",
  startsAt: futureWindow.start,
  endsAt: futureWindow.end,
};
async function setup(initialize = true) {
  const f = await fixture();
  await f.sql`update commerce_orders set snapshot=${JSON.stringify({ kind: "lesson", productId: "lesson-service", credits: 0, setupCents: 0, regularCents: 10001, bookingWindow: originalWindow })}::jsonb,square_payment_id='payment',paid_at='2026-10-01 12:00Z' where id='order'`;
  if (initialize) {
    const p = await previewFinancialBasisInitialization(f.sql, "owner");
    await initializeFinancialBasisForOwner(f.sql, "owner", {
      ...p,
      reason: "Synthetic reviewed capture",
    });
  }
  return f;
}
async function quote(sql: Sql, id = "quote", pin?: unknown) {
  await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment)
    values(${id},${id},'customer@example.invalid','lesson-service','lesson',${JSON.stringify({ kind: "lesson", productId: "lesson-service", setupCents: 0, credits: 0, bookingWindow: futureWindow, ...(pin === undefined ? {} : { financialLessonAdmission: pin }) })}::jsonb,10001,'pending','square','production')`;
}
function command(p: Awaited<ReturnType<typeof previewFinancialBasisActivationForOwner>>) {
  return financialBasisActivationInput.parse(
    Object.fromEntries([
      ...[
        "expectedVersion",
        "expectedRelease",
        "asOf",
        "outputDigest",
        "sourceClubRevision",
        "sourceDigest",
        "readinessDigest",
        "reviewDigest",
      ].map((k) => [k, p[k as keyof typeof p]]),
      ["confirmed", true],
      ["reason", "Reviewed exact synthetic activation"],
    ]),
  );
}
async function unchanged(sql: Sql) {
  const out: Record<string, unknown> = {};
  for (const table of [
    "financial_basis_versions",
    "financial_team_seasons",
    "financial_player_agreements",
    "financial_team_aliases",
    "financial_player_aliases",
    "commerce_orders",
    "square_payment_attempts",
    "square_payments",
    "commerce_refunds",
    "booking_records",
    "credit_grants",
    "credit_uses",
    "contractor_earnings",
    "finance_records",
    "financial_lesson_recognitions",
    "organization_operational_access",
    "owner_grants",
    "profiles",
    "club_state",
    "team_fee_plans",
    "club_staff_services",
  ])
    out[table] = await sql.query(
      `select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`,
    );
  return out;
}
async function activationRows(sql: Sql) {
  return {
    state: await sql`select * from financial_basis_state`,
    bindings: await sql`select * from financial_lesson_bindings order by booking_id`,
    audit: await sql`select * from finance_audit order by id`,
  };
}
function withoutBasisVersion(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutBasisVersion);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== "basisVersion")
        .map(([k, v]) => [k, withoutBasisVersion(v)]),
    );
  return value;
}
async function projections(sql: Sql) {
  const {
    audit: _audit,
    basisVersion: _version,
    ...financialOutputs
  } = await financeWorkspace(sql, "owner");
  return {
    fees: withoutBasisVersion(await feeWorkspace(sql, "owner")),
    familyFees: withoutBasisVersion(await feeWorkspace(sql, "parent")),
    coachFees: withoutBasisVersion(await feeWorkspace(sql, "coach")),
    coachFinance: await myFinance(sql, "coach"),
    finance: financialOutputs,
    compensation: await withFinancialContext(sql, "owner", "owner", async (tx, c) => ({
      sources: await sourceData(tx, asOf, await records(tx), c),
      facility: await facilityPayables(tx, asOf, await records(tx), c),
    })),
  };
}
async function insertBinding(
  sql: Sql,
  p: Awaited<ReturnType<typeof previewFinancialBasisActivationForOwner>>,
  split?: number,
) {
  const b = p.bindingPlan[0];
  await sql`insert into financial_lesson_bindings(booking_id,basis_id,basis_version,order_id,original_booking,approved_terms) values(${b.bookingId},${b.basisId},${b.basisVersion},${b.orderId},${JSON.stringify(b.originalBooking)}::jsonb,${JSON.stringify({ ...b.approvedTerms, ...(split === undefined ? {} : { splitPct: split }) })}::jsonb)`;
}
test("activation migration is additive and inert; partial activation markers fail", async () => {
  const { sql } = await setup(false);
  assert.deepEqual(await sql`select * from financial_basis_state`, []);
  assert.doesNotMatch(
    await readFile("migrations/0077_financial_basis_activation.sql", "utf8"),
    /\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?\w+/i,
  );
  const p = await previewFinancialBasisInitialization(sql, "owner");
  await initializeFinancialBasisForOwner(sql, "owner", {
    ...p,
    reason: "Synthetic reviewed capture",
  });
  await assert.rejects(
    sql`update financial_basis_state set activation_state='active'`,
    /check constraint/,
  );
  await assert.rejects(sql`update financial_basis_state set active_version=1`, /check constraint/);
  await assert.rejects(
    sql`update financial_basis_state set activation_state='active',active_version=2`,
    /check constraint/,
  );
});
test("explicit activation preserves fixed-as-of full fee/finance/compensation outputs, ledgers and identities", async (t) => {
  const { sql } = await setup();
  await quote(sql);
  t.mock.timers.enable({ apis: ["Date"], now: new Date(asOf + "T12:00:00.000Z") });
  const before = await unchanged(sql),
    outputs = await projections(sql),
    prior = await activationRows(sql),
    p = await previewFinancialBasisActivationForOwner(sql, "owner");
  assert.equal(p.readyForActivation, true, JSON.stringify(p.blockers));
  assert.deepEqual(p.untouchedQuoteIds, ["quote"]);
  assert.equal(p.bindingPlan[0].approvedTerms.splitPct, 41);
  assert.deepEqual(await activationRows(sql), prior);
  const result = await activateFinancialBasisForOwner(sql, "owner", command(p));
  assert.equal(result.activeVersion, 1);
  assert.equal(result.outputDigest, p.outputDigest);
  assert.deepEqual(await unchanged(sql), before);
  assert.deepEqual(await projections(sql), outputs);
  const after = await activationRows(sql);
  assert.equal(after.bindings.length, 1);
  assert.equal(after.audit.length, prior.audit.length + 1);
  await assert.rejects(
    activateFinancialBasisForOwner(sql, "owner", command(p)),
    /captured, inactive/,
  );
  assert.deepEqual(await activationRows(sql), after);
});
test("activation preserves original funded package refund valuation and actual provider ledgers", async (t) => {
  const { sql } = await setup(false);
  t.mock.timers.enable({ apis: ["Date"], now: new Date(asOf + "T12:00:00.000Z") });
  await sql`update commerce_orders set kind='package',snapshot=${JSON.stringify({ kind: "package", productId: "lesson-service", credits: 4, setupCents: 0, regularCents: 10001 })}::jsonb where id='order'`;
  const [{ household_id: h }] = await sql<{
    household_id: string;
  }>`select household_id from commerce_orders where id='order'`;
  await sql`insert into credit_grants(id,user_id,order_id,source_key,kind,minutes,quantity,remaining,starts_at,expires_at,payment_id,household_id) values('funded','owner','order','funded','lesson',75,4,3,'2026-10-01 00:00Z','2026-11-01 00:00Z','payment',${h})`;
  await sql`insert into credit_uses(id,grant_id,booking_id,quantity) values('funded-use','funded','lesson',1)`;
  const initial = await previewFinancialBasisInitialization(sql, "owner");
  await initializeFinancialBasisForOwner(sql, "owner", {
    ...initial,
    reason: "Reviewed funded package capture",
  });
  const refund = await lessonRefundValue(sql, "lesson", "order", h),
    before = await unchanged(sql),
    outputs = await projections(sql);
  assert.deepEqual(refund, {
    paymentId: "payment",
    paidCents: 2500,
    halfRefundCents: 1250,
    availableCents: 10001,
  });
  const p = await previewFinancialBasisActivationForOwner(sql, "owner");
  assert.equal(p.readyForActivation, true, JSON.stringify(p.blockers));
  await activateFinancialBasisForOwner(sql, "owner", command(p));
  assert.deepEqual(await lessonRefundValue(sql, "lesson", "order", h), refund);
  assert.deepEqual(await unchanged(sql), before);
  assert.deepEqual(await projections(sql), outputs);
});
test("refreshed historical lessons bind reviewed current version, not version-1 fallback", async () => {
  const { sql } = await setup();
  await sql`update club_state set rev=2,payload=jsonb_set(payload,'{_rev}','2')`;
  const p = await previewFinancialBasisRefresh(sql, "owner");
  await refreshFinancialBasisForOwner(sql, "owner", {
    expectedVersion: p.expectedVersion,
    sourceClubRevision: p.sourceClubRevision,
    sourceDigest: p.sourceDigest,
    readinessDigest: p.readinessDigest,
    reviewDigest: p.reviewDigest,
    reason: "Reviewed source version two",
  });
  const a = await previewFinancialBasisActivationForOwner(sql, "owner");
  assert.equal(a.readyForActivation, true, JSON.stringify(a.blockers));
  assert.equal(a.bindingPlan[0].basisVersion, 2);
  await activateFinancialBasisForOwner(sql, "owner", command(a));
  await withFinancialContext(sql, "owner", "owner", async (tx) => {
    const lesson = await loadFinancialLessonInTransaction(tx, "lesson");
    assert.equal(lesson.mode, "basis");
    if (lesson.mode === "basis") assert.equal(lesson.version, 2);
  });
});
test("activation accepts only exact confirmed review with reason, no caller financial payload", async () => {
  const { sql } = await setup(),
    p = await previewFinancialBasisActivationForOwner(sql, "owner"),
    before = await activationRows(sql),
    c = command(p);
  for (const change of [
    { confirmed: false },
    { reason: "short" },
    { payload: {} },
    { expectedVersion: 2 },
    { expectedRelease: "b".repeat(40) },
    { asOf: "2000-01-01" },
    { sourceClubRevision: 99 },
    { sourceDigest: "b".repeat(64) },
    { readinessDigest: "b".repeat(64) },
    { outputDigest: "b".repeat(64) },
    { reviewDigest: "b".repeat(64) },
  ])
    await assert.rejects(activateFinancialBasisForOwner(sql, "owner", { ...c, ...change }));
  assert.deepEqual(await activationRows(sql), before);
});
test("current genuine owner security is checked on preview and apply without grants", async () => {
  const { sql } = await setup(),
    p = await previewFinancialBasisActivationForOwner(sql, "owner");
  for (const user of ["missing", "coach", "operations"]) {
    await assert.rejects(previewFinancialBasisActivationForOwner(sql, user), /owner access/);
    await assert.rejects(activateFinancialBasisForOwner(sql, user, command(p)), /owner access/);
  }
  await sql`update profiles set role='admin' where user_id='replacement'`;
  await assert.rejects(
    activateFinancialBasisForOwner(sql, "replacement", command(p)),
    /owner access/,
  );
  await sql`insert into owner_grants(email,user_id) values('operations@example.invalid','operations')`;
  await assert.rejects(
    activateFinancialBasisForOwner(sql, "operations", command(p)),
    /owner access/,
  );
  await sql`update "user" set "disabledAt"=now() where id='owner'`;
  await assert.rejects(activateFinancialBasisForOwner(sql, "owner", command(p)), /owner access/);
  await sql`update "user" set "disabledAt"=null where id='owner'`;
  await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
  await assert.rejects(activateFinancialBasisForOwner(sql, "owner", command(p)), /owner access/);
  await sql`update owner_grants set revoked_at=null where user_id='owner'`;
  await sql`update "user" set "emailVerified"=false where id='owner'`;
  await assert.rejects(activateFinancialBasisForOwner(sql, "owner", command(p)), /owner access/);
});
test("release, source, identity and independent provider drift invalidate activation", async () => {
  const { sql } = await setup(),
    p = await previewFinancialBasisActivationForOwner(sql, "owner");
  process.env.APP_BUILD_SOURCE_DIRTY = "true";
  assert.ok(
    (await previewFinancialBasisActivationForOwner(sql, "owner")).blockers.some(
      (b) => b.code === "unidentified_release",
    ),
  );
  await assert.rejects(activateFinancialBasisForOwner(sql, "owner", command(p)), /changed/);
  process.env.APP_BUILD_SOURCE_DIRTY = "false";
  await sql`update square_payments set refunded_cents=1 where id='payment'`;
  await assert.rejects(activateFinancialBasisForOwner(sql, "owner", command(p)), /changed/);
  await sql`update club_state set rev=2,payload=jsonb_set(payload,'{_rev}','2')`;
  assert.ok(
    (await previewFinancialBasisActivationForOwner(sql, "owner")).blockers.some(
      (b) => b.code === "source_changed_since_capture",
    ),
  );
  await sql`update club_state set payload=jsonb_set(payload,'{teams,0,roster,0,id}','"changed"')`;
  await assert.rejects(previewFinancialBasisActivationForOwner(sql, "owner"), /identity map/);
});
for (const status of ["pending", "unknown", "declined"])
  test(`pending unpinned orders with ${status} attempts cannot acquire new activation attribution`, async () => {
    const { sql } = await setup();
    await quote(sql);
    await sql`insert into square_payment_attempts(id,order_id,token_hash,status) values('attempt','quote','synthetic-secret-do-not-return',${status})`;
    const p = await previewFinancialBasisActivationForOwner(sql, "owner");
    assert.equal(p.readyForActivation, false);
    assert.ok(p.blockers.some((b) => b.code === "unpinned_attempted_order"));
    assert.doesNotMatch(JSON.stringify(p), /synthetic-secret-do-not-return/);
    await assert.rejects(activateFinancialBasisForOwner(sql, "owner", command(p)), /blocked/);
  });
test("unreconciled, partial, review and paid-unfulfilled provider cases remain blocked", async () => {
  const { sql } = await setup();
  await sql`update commerce_orders set status='payment_review' where id='order'`;
  assert.ok(
    (await previewFinancialBasisActivationForOwner(sql, "owner")).blockers.some(
      (b) => b.code === "payment_review",
    ),
  );
  await sql`update commerce_orders set status='pending_fee' where id='order'`;
  assert.ok(
    (await previewFinancialBasisActivationForOwner(sql, "owner")).blockers.some(
      (b) => b.code === "incomplete_payment_setup",
    ),
  );
  await sql`update commerce_orders set status='paid',square_payment_id='missing' where id='order'`;
  assert.ok(
    (await previewFinancialBasisActivationForOwner(sql, "owner")).blockers.some(
      (b) => b.code === "unreconciled_paid_order",
    ),
  );
  await sql`insert into commerce_refunds(id,order_id,user_id,amount_cents,status,square_payment_id,reason) values('refund','order','owner',10,'pending','payment','Synthetic refund')`;
  assert.ok(
    (await previewFinancialBasisActivationForOwner(sql, "owner")).blockers.some(
      (b) => b.code === "pending_refund",
    ),
  );
});
for (const invalid of [false, true])
  test(`existing ${invalid ? "mismatched" : "coherent"} binding is validated and never overwritten`, async () => {
    const { sql } = await setup(),
      p = await previewFinancialBasisActivationForOwner(sql, "owner");
    await insertBinding(sql, p, invalid ? 99 : undefined);
    const before = await sql`select * from financial_lesson_bindings`,
      next = await previewFinancialBasisActivationForOwner(sql, "owner");
    assert.equal(next.readyForActivation, !invalid, JSON.stringify(next.blockers));
    if (invalid) {
      assert.ok(next.blockers.some((b) => b.code === "inconsistent_existing_binding"));
      await assert.rejects(activateFinancialBasisForOwner(sql, "owner", command(next)), /blocked/);
    } else await activateFinancialBasisForOwner(sql, "owner", command(next));
    assert.deepEqual(await sql`select * from financial_lesson_bindings`, before);
  });
test("original pending pins remain unchanged; malformed and retroactive paid-order pins fail", async () => {
  const { sql } = await setup();
  await quote(sql, "pinned", validPin);
  const p = await previewFinancialBasisActivationForOwner(sql, "owner");
  assert.equal(p.readyForActivation, true, JSON.stringify(p.blockers));
  await quote(sql, "malformed", { ...validPin, coachId: "other" });
  assert.ok(
    (await previewFinancialBasisActivationForOwner(sql, "owner")).blockers.some(
      (b) => b.code === "inconsistent_existing_order_pin",
    ),
  );
  await assert.rejects(
    sql`update commerce_orders set snapshot=snapshot||${JSON.stringify({ financialLessonAdmission: validPin })}::jsonb where id='order'`,
  );
});
test("binding or audit failure rolls back bindings, active pointer and receipt together", async () => {
  const { sql } = await setup(),
    p = await previewFinancialBasisActivationForOwner(sql, "owner"),
    before = await activationRows(sql);
  for (const table of ["financial_lesson_bindings", "finance_audit"]) {
    await db.exec(
      `create function injected_activation_failure() returns trigger language plpgsql as $$ begin raise exception 'injected activation failure'; end $$; create trigger injected_failure before insert on ${table} for each row execute function injected_activation_failure();`,
    );
    await assert.rejects(
      activateFinancialBasisForOwner(sql, "owner", command(p)),
      /injected activation failure/,
    );
    assert.deepEqual(await activationRows(sql), before);
    await db.exec(
      `drop trigger injected_failure on ${table}; drop function injected_activation_failure();`,
    );
  }
});
test("missing activation migration blocks without fallback or hidden initialization", async () => {
  const { sql } = await setup();
  await sql.query(
    "alter table financial_basis_state drop constraint financial_basis_active_version",
  );
  const p = await previewFinancialBasisActivationForOwner(sql, "owner");
  assert.ok(p.blockers.some((b) => b.code === "activation_schema_unavailable"));
  await assert.rejects(activateFinancialBasisForOwner(sql, "owner", command(p)), /blocked/);
});
test("runtime full-output parity failure rolls back pointer, bindings and financial state", async () => {
  const { sql } = await setup(),
    p = await previewFinancialBasisActivationForOwner(sql, "owner"),
    before = await activationRows(sql),
    state = await sql`select * from finance_state`;
  const ledgers = await unchanged(sql);
  for (const mutation of [
    "update finance_state set revision=revision+1 where id='organization'",
    "update finance_records set payload=jsonb_set(payload,'{basisVersion}','999'::jsonb) where id='coach-payee'",
  ]) {
    await db.exec(
      `create function injected_output_change() returns trigger language plpgsql as $$ begin ${mutation}; return new; end $$; create trigger output_change after insert on financial_lesson_bindings for each row execute function injected_output_change();`,
    );
    await assert.rejects(
      activateFinancialBasisForOwner(sql, "owner", command(p)),
      /Financial outputs differ/,
    );
    assert.deepEqual(await activationRows(sql), before);
    assert.deepEqual(await sql`select * from finance_state`, state);
    assert.deepEqual(await unchanged(sql), ledgers);
    await db.exec(
      "drop trigger output_change on financial_lesson_bindings; drop function injected_output_change();",
    );
  }
});
