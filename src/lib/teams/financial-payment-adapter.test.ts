import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import type { FinancialBasis } from "../finance/basis.server";
import {
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
  readFinancialBasisForOwner,
  resolveFinancialAgreement,
  updateFinancialBasisForOwner,
} from "../finance/basis.server";
import { sampleClub } from "./seed";
import {
  assertFinancialTeamPayer,
  blockingFinancialTeamPayment,
  financialTeamFulfillmentDecision,
  planFinancialTeamCheckout,
  resolveFinancialTeamPayment,
  transformFinancialTeamPaymentLedger,
  validateFinancialTeamPayment,
  type CurrentFinancialPayerEligibility,
  type FinancialPaymentLedgerTransform,
  type FinancialTeamOrder,
  type LiveSquareTeamPayment,
  type StableTeamFeeSnapshot,
} from "./financial-payment-adapter.server";

const now = new Date("2026-10-20T12:00:00.000Z");
const requestId = "00000000-0000-4000-8000-000000000001";
const otherRequestId = "00000000-0000-4000-8000-000000000002";
const payer: CurrentFinancialPayerEligibility = {
  userId: "parent",
  emailVerified: true,
  disabledAt: null,
  financialRestricted: false,
};

function fixture() {
  const club = sampleClub();
  club._demo = false;
  club.teams = club.teams.slice(0, 2);
  for (const team of club.teams) {
    team.closed = false;
    team.roster = team.roster.slice(0, 1);
    const player = team.roster[0];
    player.withdrawn = false;
    player.familyId = "financial-home";
    player.parents = [
      { name: "Original Parent", email: "parent@example.invalid", phone: "", rel: "parent" },
    ];
    player.roleType = "po";
    player.payments = [];
    player.credits = [];
    player.depositPaid = false;
    player.agreement = { version: "v1", signedBy: "Original Parent", signedAt: "2026-09-01" };
    player.feeLock = { amount: 1000, lockedAt: "2026-09-01", policyVersion: "v1", components: {} };
    player.planLock = {
      dep: 400,
      deadline: "2027-01-01",
      planType: "split",
      rows: [
        { date: "2026-10-01", amount: 400 },
        { date: "2027-01-01", amount: 600 },
      ],
    };
  }
  const basis: FinancialBasis = {
    version: 4,
    activationState: "captured",
    activeVersion: null,
    sourceClubRevision: 12,
    sourceDigest: "synthetic-source-digest",
    inputs: {
      schemaVersion: 1,
      club,
      feePlans: [],
      feeBusiness: [],
      budgetMaster: [],
      activities: [],
      billing: {
        accounts: [
          {
            id: "parent",
            email: "parent@example.invalid",
            name: "Original Parent",
            role: "parent",
          },
          { id: "linked", email: "linked@example.invalid", name: "Linked Parent", role: "parent" },
          {
            id: "guardian-player",
            email: "guardian@example.invalid",
            name: "Guardian",
            role: "player",
          },
          { id: "player-only", email: "parent@example.invalid", name: "Player", role: "player" },
          { id: "outsider", email: "outsider@example.invalid", name: "Other", role: "admin" },
        ],
        households: [{ id: "financial-home", primary_email: "parent@example.invalid" }],
        members: [
          { household_id: "financial-home", user_id: "linked" },
          { household_id: "financial-home", user_id: "player-only" },
        ],
        guardians: [{ household_id: "financial-home", user_id: "guardian-player" }],
        playerLinks: [{ player_id: club.teams[0].roster[0].id, user_id: "player-only" }],
      },
      compensation: {
        development: [],
        staff: [],
        staffServices: [],
        bookings: [],
        earnings: [],
        payeesAndRules: [],
        ownerAssignments: [],
      },
    },
    teams: club.teams.map((t, i) => ({ id: "season-" + i, originalTeamId: t.id })),
    agreements: club.teams.map((t, i) => ({
      id: "agreement-" + i,
      teamSeasonId: "season-" + i,
      originalPlayerId: t.roster[0].id,
    })),
    teamAliases: club.teams.map((t, i) => ({ teamId: t.id, teamSeasonId: "season-" + i })),
    playerAliases: club.teams.map((t, i) => ({
      teamId: t.id,
      playerId: t.roster[0].id,
      agreementId: "agreement-" + i,
    })),
  };
  const team = club.teams[0];
  const player = team.roster[0];
  const request = {
    teamId: team.id,
    playerId: player.id,
    amount: 40000,
    requestId,
    consent: true as const,
  };
  const checkout = (overrides: Partial<Parameters<typeof planFinancialTeamCheckout>[1]> = {}) =>
    planFinancialTeamCheckout(basis, {
      request,
      payer,
      environment: "production",
      orders: [],
      attempts: [],
      now,
      ...overrides,
    });
  const plan = checkout();
  assert.equal(plan.action, "create");
  if (plan.action !== "create") throw new Error("Synthetic quote missing.");
  const order: FinancialTeamOrder = {
    id: "order-1",
    request_key: requestId,
    kind: "team-fee",
    product_id: team.id,
    user_id: "parent",
    email: "parent@example.invalid",
    athlete_id: null,
    snapshot: structuredClone(plan.quote),
    status: "pending",
    total_cents: 40000,
    hold_until: new Date(plan.holdUntil),
    paid_at: null,
    payment_environment: "production",
    square_customer_id: "customer-1",
    square_payment_id: null,
    square_fee_payment_id: null,
    subscription_id: null,
    square_card_id: null,
  };
  const payment: LiveSquareTeamPayment = {
    id: "square-1",
    order_id: order.id,
    environment: "production",
    status: "COMPLETED",
    amount_cents: 40000,
    refunded_cents: 0,
    receipt_url: "https://example.invalid/receipt",
  };
  const paidOrder = { ...order, status: "paid", square_payment_id: payment.id, paid_at: now };
  return { basis, team, player, request, checkout, order, payment, paidOrder };
}

function apply(basis: FinancialBasis, transform: FinancialPaymentLedgerTransform) {
  assert.equal(transform.changed, true);
  if (!transform.changed) throw new Error("Synthetic update missing.");
  assert.equal(transform.expectedVersion, basis.version);
  return { ...basis, inputs: transform.nextInputs, version: basis.version + 1 };
}

function reconcile(
  f: ReturnType<typeof fixture>,
  basis = f.basis,
  overrides: Partial<Parameters<typeof transformFinancialTeamPaymentLedger>[1]> = {},
) {
  return transformFinancialTeamPaymentLedger(basis, {
    expectedVersion: basis.version,
    order: f.paidOrder,
    payment: f.payment,
    externalReconciledCents: 0,
    now,
    ...overrides,
  });
}

test("old and transferred aliases resolve the same financial agreement without live roster metadata", () => {
  const f = fixture();
  const operational = structuredClone(f.basis.inputs.club);
  const moved = operational.teams[0].roster.shift()!;
  moved.teamId = operational.teams[1].id;
  moved.id = "renamed-operational-player";
  moved.familyId = "replacement-household";
  moved.parents[0].email = "outsider@example.invalid";
  moved.roleType = "full";
  moved.withdrawn = true;
  operational.teams[1].roster.push(moved);
  operational.teams[0].name = "Renamed team";
  operational.teams[0].closed = true;
  f.basis.playerAliases.push({
    teamId: moved.teamId,
    playerId: moved.id,
    agreementId: "agreement-0",
  });
  const legacyOrder = structuredClone(f.order);
  delete (legacyOrder.snapshot.teamFee as Partial<StableTeamFeeSnapshot>).financialAgreementId;
  delete (legacyOrder.snapshot.teamFee as Partial<StableTeamFeeSnapshot>).financialTeamSeasonId;
  assert.equal(resolveFinancialTeamPayment(f.basis, legacyOrder).identity.id, "agreement-0");
  assert.equal(
    validateFinancialTeamPayment(f.basis, legacyOrder, payer).agreementId,
    "agreement-0",
  );
  const movedOrder = structuredClone(f.order);
  movedOrder.snapshot.teamFee!.teamId = moved.teamId;
  movedOrder.snapshot.teamFee!.playerId = moved.id;
  assert.equal(resolveFinancialTeamPayment(f.basis, movedOrder).identity.id, "agreement-0");
  const plan = f.checkout({ request: { ...f.request, teamId: moved.teamId, playerId: moved.id } });
  assert.equal(plan.action, "create");
  if (plan.action === "create") {
    assert.equal(plan.quote.productId, f.team.id);
    assert.match(plan.quote.title, new RegExp(f.player.name));
    assert.equal(plan.quote.teamFee.role, "po");
    assert.equal(plan.quote.teamFee.financialAgreementId, "agreement-0");
  }
  assert.equal(f.player.familyId, "financial-home");
  assert.equal(f.player.feeLock!.amount, 1000);
});

test("stable IDs cannot contradict complete historical aliases or silently resolve ambiguous input", () => {
  const f = fixture();
  const m = f.order.snapshot.teamFee as StableTeamFeeSnapshot;
  m.financialAgreementId = "agreement-1";
  assert.throws(() => resolveFinancialTeamPayment(f.basis, f.order), /identity changed/);
  m.financialAgreementId = "agreement-0";
  delete (m as Partial<StableTeamFeeSnapshot>).financialTeamSeasonId;
  assert.throws(() => resolveFinancialTeamPayment(f.basis, f.order), /identity changed/);
  m.financialTeamSeasonId = "season-0";
  m.teamId = "unknown-team";
  assert.throws(() => resolveFinancialTeamPayment(f.basis, f.order), /alias is unavailable/);
  m.teamId = f.team.id;
  f.basis.playerAliases.push({ ...f.basis.playerAliases[0], agreementId: "agreement-1" });
  assert.throws(() => resolveFinancialTeamPayment(f.basis, f.order), /ambiguous/);
});

test("checkout reuse binds request owner, exact alias, amount, environment and lifetime", () => {
  const f = fixture();
  assert.equal(f.checkout({ orders: [f.order] }).action, "reuse");
  for (const change of [
    { user_id: "outsider" },
    { total_cents: 39999 },
    { payment_environment: "sandbox" },
    {
      snapshot: {
        ...f.order.snapshot,
        teamFee: { ...f.order.snapshot.teamFee!, playerId: "different" },
      },
    },
  ])
    assert.throws(() => f.checkout({ orders: [{ ...f.order, ...change }] }), /request changed/);
  for (const change of [{ status: "paid" }, { hold_until: now }])
    assert.throws(() => f.checkout({ orders: [{ ...f.order, ...change }] }), /Checkout ended/);
  assert.throws(() => f.checkout({ orders: [f.order, f.order] }), /ambiguous/);
  assert.throws(() => f.checkout({ request: { ...f.request, amount: 100001 } }), /exceeds/);
  assert.throws(() => f.checkout({ request: { ...f.request, consent: false as true } }));
});

test("pending, review and unknown-attempt orders deduplicate across transferred aliases", () => {
  const f = fixture();
  f.basis.playerAliases.push({
    teamId: "moved-team",
    playerId: "moved-player",
    agreementId: "agreement-0",
  });
  const request = {
    ...f.request,
    teamId: "moved-team",
    playerId: "moved-player",
    requestId: otherRequestId,
  };
  assert.throws(() => f.checkout({ request, orders: [f.order] }), /already awaiting/);
  const expired = { ...f.order, status: "expired", hold_until: new Date("2026-10-19") };
  for (const status of ["pending", "unknown"])
    assert.throws(
      () =>
        f.checkout({ request, orders: [expired], attempts: [{ order_id: expired.id, status }] }),
      /already awaiting/,
    );
  assert.equal(
    f.checkout({
      request,
      orders: [expired],
      attempts: [{ order_id: expired.id, status: "declined" }],
    }).action,
    "create",
  );
  assert.throws(
    () => f.checkout({ request, orders: [{ ...expired, status: "payment_review" }] }),
    /already awaiting/,
  );
  assert.equal(
    f.checkout({ request, orders: [{ ...f.order, payment_environment: "sandbox" }] }).action,
    "create",
  );
  const other = structuredClone(f.order);
  other.snapshot.teamFee = {
    teamId: f.basis.playerAliases[1].teamId,
    playerId: f.basis.playerAliases[1].playerId,
    lockedAt: "2026-09-01",
    role: "po",
  };
  assert.equal(
    blockingFinancialTeamPayment(f.basis, "agreement-0", "production", [other], [], now),
    undefined,
  );
});

test("financial guardians stay bound to captured account IDs, memberships and player-role rules", () => {
  const f = fixture();
  for (const userId of ["parent", "linked", "guardian-player"])
    assert.doesNotThrow(() =>
      assertFinancialTeamPayer(f.basis, "agreement-0", { ...payer, userId }),
    );
  for (const userId of ["outsider", "player-only", "new-account-with-old-email"])
    assert.throws(
      () => assertFinancialTeamPayer(f.basis, "agreement-0", { ...payer, userId }),
      /authorized parent or guardian/,
    );
  // Browser/live operational profile claims are deliberately not inputs to the
  // authority decision. Extra fields cannot promote an unrelated captured user.
  const browserClaim = {
    ...payer,
    userId: "outsider",
    role: "admin",
    email: "parent@example.invalid",
    familyIds: ["financial-home"],
  };
  assert.throws(
    () => assertFinancialTeamPayer(f.basis, "agreement-0", browserClaim),
    /authorized parent or guardian/,
  );
  assert.throws(
    () => validateFinancialTeamPayment(f.basis, f.order, { ...payer, userId: "linked" }),
    /account changed/,
  );
});

test("fresh disabled, unverified and sticky financial-restricted accounts fail prepare and pre-charge checks", () => {
  const f = fixture();
  for (const change of [
    { disabledAt: now },
    { emailVerified: false },
    { financialRestricted: true },
    { financialRestricted: undefined as unknown as boolean },
  ]) {
    const ineligible = { ...payer, ...change };
    assert.throws(() => f.checkout({ payer: ineligible }), /Current financial account/);
    assert.throws(
      () => validateFinancialTeamPayment(f.basis, f.order, ineligible),
      /Current financial account/,
    );
  }
  assert.equal(
    financialTeamFulfillmentDecision(f.basis, f.order).status,
    "paid",
    "already charged money must remain reconcilable without reauthorizing the payer",
  );
});

test("only saved financial amendments change pre-charge and post-charge fee decisions", () => {
  const f = fixture();
  assert.equal(validateFinancialTeamPayment(f.basis, f.order, payer).expectedVersion, 4);
  assert.deepEqual(financialTeamFulfillmentDecision(f.basis, f.order), {
    agreementId: "agreement-0",
    expectedVersion: 4,
    status: "paid",
    queueRefund: false,
  });
  f.player.credits = [{ label: "Financial credit", amount: 700 }];
  assert.throws(
    () => validateFinancialTeamPayment(f.basis, f.order, payer),
    /remaining balance changed/,
  );
  assert.equal(financialTeamFulfillmentDecision(f.basis, f.order).queueRefund, true);
  f.player.credits = [];
  f.player.feeLock!.lockedAt = "2026-10-20";
  assert.throws(() => validateFinancialTeamPayment(f.basis, f.order, payer), /accepted fee/);
  assert.equal(financialTeamFulfillmentDecision(f.basis, f.order).status, "payment_review");
  f.player.feeLock!.lockedAt = "2026-09-01";
  f.player.withdrawn = true;
  assert.throws(() => f.checkout(), /Accept the published/);
  assert.throws(() => validateFinancialTeamPayment(f.basis, f.order, payer), /accepted fee/);
});

test("completed payment adds one legacy-compatible row; duplicates are no-ops and the source remains untouched", () => {
  const f = fixture();
  const before = structuredClone(f.basis);
  const transform = reconcile(f);
  const after = apply(f.basis, transform);
  const player = resolveFinancialAgreement(after, { agreementId: "agreement-0" }).player;
  assert.deepEqual(player.payments, [
    {
      date: "2026-10-20",
      amount: 400,
      fee: 0,
      charged: 400,
      method: "Square website",
      label: "Square: square-1",
      receipt: "https://example.invalid/receipt",
    },
  ]);
  assert.equal(player.depositPaid, true);
  assert.deepEqual(reconcile(f, after), { changed: false, expectedVersion: 5 });
  assert.deepEqual(f.basis, before);
  assert.deepEqual(after.inputs.billing, before.inputs.billing);
  assert.deepEqual(after.inputs.compensation, before.inputs.compensation);
  assert.deepEqual(after.inputs.club.teams[1], before.inputs.club.teams[1]);
  assert.equal(
    after.inputs.club._rev,
    before.inputs.club._rev,
    "the financial update is not an operational club revision",
  );
  if (transform.changed)
    assert.deepEqual(transform.audit, {
      agreementId: "agreement-0",
      teamSeasonId: "season-0",
      teamId: f.team.id,
      playerId: f.player.id,
      paymentId: "square-1",
      gross: 40000,
      refunded: 0,
      external: 0,
      net: 40000,
    });
});

test("live partial/full provider and reconciled external refunds update net only and never duplicate gross receipts", () => {
  const f = fixture();
  let basis = apply(f.basis, reconcile(f));
  const partial = { ...f.payment, refunded_cents: 10000 };
  basis = apply(basis, reconcile(f, basis, { payment: partial }));
  let player = resolveFinancialAgreement(basis, { agreementId: "agreement-0" }).player;
  assert.equal(player.payments.length, 1);
  assert.equal(player.payments[0].amount, 300);
  assert.equal(player.payments[0].charged, 400);
  assert.equal(player.depositPaid, false);
  assert.deepEqual(reconcile(f, basis, { payment: partial }), {
    changed: false,
    expectedVersion: 6,
  });
  assert.throws(
    () => reconcile(f, basis),
    /restore previously returned funds/,
    "stale ledger input cannot reverse a refund",
  );
  basis = apply(basis, reconcile(f, basis, { payment: partial, externalReconciledCents: 5000 }));
  player = resolveFinancialAgreement(basis, { agreementId: "agreement-0" }).player;
  assert.equal(player.payments[0].amount, 250);
  basis = apply(
    basis,
    reconcile(f, basis, {
      order: { ...f.paidOrder, status: "refunded" },
      payment: { ...f.payment, refunded_cents: 40000 },
      externalReconciledCents: 5000,
    }),
  );
  player = resolveFinancialAgreement(basis, { agreementId: "agreement-0" }).player;
  assert.equal(player.payments[0].amount, 0);
  assert.equal(player.payments[0].charged, 400);
  assert.equal(player.payments.length, 1);
  assert.equal(player.depositPaid, false);
});

test("historical Square row labels reconcile after transfer and fee amendments without new authorization", () => {
  const f = fixture();
  f.player.payments = [
    {
      date: "2026-09-15",
      amount: 400,
      charged: 400,
      fee: 1,
      method: "Square website",
      label: "Square: square-1",
      receipt: "legacy-receipt",
    },
  ];
  f.player.depositPaid = true;
  f.player.feeLock!.lockedAt = "changed-financial-terms";
  f.player.roleType = "full";
  f.player.withdrawn = true;
  const after = apply(
    f.basis,
    reconcile(f, f.basis, { payment: { ...f.payment, refunded_cents: 15000 } }),
  );
  const row = resolveFinancialAgreement(after, { agreementId: "agreement-0" }).player.payments[0];
  assert.deepEqual(row, { ...f.player.payments[0], amount: 250 });
  assert.equal(f.player.payments[0].amount, 400);
});

test("pending/review/refunded orders do not invent a payment row, and sandbox/missing ledger stays untouched", () => {
  const f = fixture();
  for (const status of ["pending", "payment_review", "refunded", "expired"])
    assert.deepEqual(reconcile(f, f.basis, { order: { ...f.paidOrder, status } }), {
      changed: false,
      expectedVersion: 4,
    });
  for (const override of [
    { payment: null },
    { order: { ...f.paidOrder, square_payment_id: null } },
    { order: { ...f.paidOrder, payment_environment: "sandbox" } },
  ])
    assert.deepEqual(reconcile(f, f.basis, override), { changed: false, expectedVersion: 4 });
  assert.equal(f.player.payments.length, 0);
});

test("ledger transform demands financial CAS and matched current provider identity/valid integer amounts", () => {
  const f = fixture();
  assert.throws(() => reconcile(f, f.basis, { expectedVersion: 3 }), /Financial basis changed/);
  for (const change of [
    { id: "other" },
    { order_id: "other" },
    { environment: "sandbox" },
    { status: "PENDING" },
    { amount_cents: 30000 },
  ])
    assert.throws(
      () => reconcile(f, f.basis, { payment: { ...f.payment, ...change } }),
      /ledger identity mismatch/,
    );
  for (const refunded_cents of [-1, 0.5, Number.NaN, 40001])
    assert.throws(
      () => reconcile(f, f.basis, { payment: { ...f.payment, refunded_cents } }),
      /Invalid/,
    );
  for (const externalReconciledCents of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => reconcile(f, f.basis, { externalReconciledCents }), /Invalid/);
  assert.equal(f.player.payments.length, 0);
});

test("duplicate or cross-agreement legacy labels require review rather than double-crediting", () => {
  const f = fixture();
  const after = apply(f.basis, reconcile(f));
  const row = after.inputs.club.teams[0].roster[0].payments[0];
  after.inputs.club.teams[1].roster[0].payments.push({ ...row });
  assert.throws(() => reconcile(f, after), /ambiguous financial ledger/);
  after.inputs.club.teams[0].roster[0].payments = [];
  assert.throws(() => reconcile(f, after), /ambiguous financial ledger/);
  after.inputs.club.teams[0].roster[0].payments = [{ ...row }, { ...row }];
  after.inputs.club.teams[1].roster[0].payments = [];
  assert.throws(() => reconcile(f, after), /ambiguous financial ledger/);
});

test("detached ledger transform composes with financial CAS without touching the operational roster", async () => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, part, i) => s + (i ? `$${i}` : "") + part, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (text: string, values: unknown[] = []) =>
      (await query(text, values)).rows) as Sql["query"];
    sql.transaction = (fn) =>
      db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  try {
    for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + name, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const [id, role] of [
      ["owner", "admin"],
      ["parent", "parent"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified") values(${id},${id + "@example.invalid"},${id},true)`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"fam-" + id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
    const f = fixture();
    const sourceClub = structuredClone(f.basis.inputs.club);
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(sourceClub)}::jsonb,12,false)`;
    const preview = await previewFinancialBasisInitialization(sql, "owner");
    await initializeFinancialBasisForOwner(sql, "owner", {
      ...preview,
      reason: "Synthetic captured basis for CAS integration",
    });
    const original = (await readFinancialBasisForOwner(sql, "owner"))!;
    const order = structuredClone(f.paidOrder);
    delete (order.snapshot.teamFee as Partial<StableTeamFeeSnapshot>).financialAgreementId;
    delete (order.snapshot.teamFee as Partial<StableTeamFeeSnapshot>).financialTeamSeasonId;
    const write = () =>
      updateFinancialBasisForOwner(
        sql,
        "owner",
        { expectedVersion: 1, reason: "Synthetic verified ledger amendment" },
        (draft) => {
          const transform = transformFinancialTeamPaymentLedger(draft, {
            expectedVersion: 1,
            order,
            payment: f.payment,
            externalReconciledCents: 0,
            now,
          });
          assert.equal(transform.changed, true);
          if (transform.changed) draft.inputs = transform.nextInputs;
        },
      );
    const results = await Promise.allSettled([write(), write()]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    const saved = (await readFinancialBasisForOwner(sql, "owner"))!;
    assert.equal(saved.version, 2);
    const player = resolveFinancialAgreement(saved, f.request).player;
    assert.equal(player.payments.length, 1);
    assert.equal(player.payments[0].amount, 400);
    assert.deepEqual(
      transformFinancialTeamPaymentLedger(saved, {
        expectedVersion: 2,
        order,
        payment: f.payment,
        externalReconciledCents: 0,
        now,
      }),
      { changed: false, expectedVersion: 2 },
    );
    assert.deepEqual(original.inputs.club, sourceClub);
    assert.deepEqual(
      (await sql<{ payload: typeof sourceClub }>`select payload from club_state`)[0].payload,
      sourceClub,
    );
    assert.equal((await sql`select version from financial_basis_versions`).length, 2);
    assert.equal(
      (await sql`select * from commerce_orders`).length,
      0,
      "the dormant transform does not submit or persist provider orders",
    );
    assert.equal(saved.activationState, "captured");
    assert.equal(saved.activeVersion, null);
  } finally {
    await db.close();
  }
});
