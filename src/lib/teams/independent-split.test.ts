import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { defaultBudget, type FeeBudget } from "./fee-model";
import { independentSchedule, independentInstallmentLabel } from "./independent-model";
import { mutateFeePlan, playerView } from "./fee.server";
import { independentWorkspace } from "./independent.server";
import { revisedIndependentSchedule } from "./independent-prospects.server";
import { collectionAgreement } from "./collection-authorization.server";
import { installmentRemaining } from "./collection-policy";
import { prepareTeamCheckout } from "./payment.server";
import { fulfillSquarePayment } from "../commerce/square-payments.server";
import { withFinancialContext } from "../finance/context.server";
import { sourceData } from "../finance/sources.server";
import { feeReadyCandidateIds } from "./fee-notifications.server";
import type { ClubRecord } from "./types";
import type { FeePlan } from "./fee-contracts";

function terms(): FeeBudget {
  return {
    ...defaultBudget(),
    fundingModel: "independent",
    parentExplanation: {
      initialDeposit: "Synthetic uniform and coaching coverage.",
      monthlyDues: "Synthetic scheduled facility access.",
      teamExpenses: "Team separately arranges tournament expenses.",
      additionalNotes: "",
    },
    independent: {
      seasonKey: randomUUID(),
      uniformDeposit: 70000,
      uniformDue: "2098-01-01",
      monthlyDues: 14900,
      firstDue: "2098-01-31",
      billingDay: 31,
      lastDue: "2098-06-30",
      seasonEnd: "2098-06-30",
      processingExplanation: "A 3% gross-up is included in each listed installment.",
    },
    processingBps: 300,
    processingFixed: 0,
    policy:
      "Synthetic independent terms. Committed uniform costs remain due; future uncommitted installments stop on withdrawal.",
  };
}
function split(b: FeeBudget): FeeBudget {
  return {
    ...b,
    independent: {
      ...b.independent!,
      depositInstallments: [
        { amount: 35000, due: "2098-01-01" },
        { amount: 35000, due: "2098-01-15" },
      ],
    },
  };
}
async function setup() {
  const f = await enrollmentFixture();
  const b = terms();
  for (const team of f.club.teams) for (const player of team.roster) player.teamId = team.id;
  const sibling = structuredClone(f.club.teams[0].roster[0]);
  sibling.id = "split-sibling";
  sibling.name = "Synthetic sibling";
  f.club.teams[0].roster.push(sibling);
  await f.sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb where id='oklahoma-prospects'`;
  await mutateFeePlan(f.sql, "owner", {
    action: "publishIndependent",
    teamId: "base",
    revision: 0,
    budget: b,
    confirmed: true,
  });
  const workspace = async (actor = "owner") =>
    (await independentWorkspace(f.sql, actor)).spaces.find((s) => s.teamId === "base")!;
  const offer = async (budget = split(b), actor = "owner") => {
    const s = await workspace();
    return mutateFeePlan(f.sql, actor, {
      action: "independentOffer",
      teamId: "base",
      playerId: "base-player",
      revision: s.planRevision,
      basisVersion: s.basisVersion,
      budget,
      payerUserId: "guardian",
      reason: "Synthetic owner-approved two-part deposit accommodation",
    });
  };
  const accept = async (playerId = "base-player", digest?: string) => {
    const s = await workspace("guardian");
    return mutateFeePlan(f.sql, "guardian", {
      action: "accept",
      teamId: "base",
      playerId,
      revision: s.planRevision,
      basisVersion: s.basisVersion,
      consent: true,
      name: "Synthetic Guardian",
      independentOfferDigest:
        digest || s.prospects.find((p) => p.id === playerId)!.acceptancePreview!.digest,
    });
  };
  return { ...f, b, workspace, offer, accept };
}

test("split deposit validates exact sums/dates and preserves the unsplit schedule", () => {
  const b = terms(),
    legacy = independentSchedule(b),
    rows = independentSchedule(split(b));
  assert.equal(legacy[0].id, "uniform");
  assert.equal(independentInstallmentLabel(legacy[0]), "Initial deposit");
  assert.equal(independentInstallmentLabel(rows[0]), "Initial deposit — payment 1 of 2");
  assert.equal(independentInstallmentLabel(rows[1]), "Initial deposit — payment 2 of 2");
  assert.equal(
    independentInstallmentLabel({ kind: "uniform", label: "Uniform deposit" }),
    "Initial deposit",
  );
  assert.equal(legacy[0].amount, 72165);
  assert.equal(rows.length, 8);
  assert.deepEqual(
    rows.slice(0, 2).map((r) => [r.id, r.amount, r.due]),
    [
      ["uniform:split:1", 36083, "2098-01-01"],
      ["uniform:split:2", 36083, "2098-01-15"],
    ],
  );
  assert.equal(
    rows.reduce((n, r) => n + r.amount, 0),
    164332,
  );
  assert.deepEqual(rows.slice(2), legacy.slice(1));
  for (const parts of [
    [
      { amount: 35000, due: "2098-01-01" },
      { amount: 34000, due: "2098-01-15" },
    ],
    [
      { amount: 35000, due: "2098-01-01" },
      { amount: 35000, due: "2098-01-01" },
    ],
    [
      { amount: 35000, due: "2098-01-01" },
      { amount: 35000, due: "2098-02-01" },
    ],
  ])
    assert.throws(() =>
      independentSchedule({ ...b, independent: { ...b.independent!, depositInstallments: parts } }),
    );
  assert.throws(() => revisedIndependentSchedule(legacy, rows, 1, "2097-12-01"), /paid or accrued/);
  assert.throws(() => revisedIndependentSchedule(legacy, rows, 0, "2098-01-01"), /paid or accrued/);
  assert.deepEqual(revisedIndependentSchedule(legacy, rows, 0, "2097-12-01"), rows);
  const redistributed = independentSchedule({
    ...split(b),
    independent: {
      ...split(b).independent!,
      depositInstallments: [
        { amount: 25000, due: "2098-01-01" },
        { amount: 45000, due: "2098-01-15" },
      ],
    },
  });
  assert.throws(
    () => revisedIndependentSchedule(rows, redistributed, 36083, "2097-12-01"),
    /paid or accrued/,
  );
});

test("individual split offer is owner-only, leaves sibling/defaults untouched and creates no automatic charges", async () => {
  const f = await setup();
  try {
    await assert.rejects(() => f.offer(split(f.b), "guardian"));
    await assert.rejects(() => f.offer(split(f.b), "coach"));
    const before = await f.workspace("guardian");
    const stale = before.prospects.find((p) => p.id === "base-player")!.acceptancePreview!.digest;
    await assert.rejects(
      () =>
        mutateFeePlan(f.sql, "owner", {
          action: "publishIndependent",
          teamId: "base",
          revision: before.planRevision,
          budget: split(f.b),
          confirmed: true,
        }),
      /individual/i,
    );
    await f.offer();
    await assert.rejects(() => f.accept("base-player", stale), /changed|Reload/);
    const preview = await f.workspace("guardian");
    assert.equal(
      preview.prospects.find((p) => p.id === "base-player")!.acceptancePreview!.rows.length,
      8,
    );
    assert.equal(
      preview.prospects.find((p) => p.id === "split-sibling")!.acceptancePreview!.rows.length,
      7,
    );
    assert.equal(
      (await f.workspace()).plan!.publishedBudget!.independent!.depositInstallments,
      undefined,
    );
    await f.accept();
    await assert.rejects(() => f.accept("base-player", stale), /already accepted/);
    const s = await f.workspace();
    assert.equal(s.plan!.players["base-player"].independent!.agreements.length, 1);
    assert.equal(s.plan!.players["split-sibling"]?.independent?.agreements.length || 0, 0);
    const [saved] = await f.sql<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    const p = saved.payload.teams[0].roster[0];
    assert.equal(p.planLock!.dep, 721.66);
    assert.equal(p.planLock!.rows.length, 8);
    assert.equal(p.feeLock!.amount, 1643.32);
    assert.equal((await f.sql`select id from team_collection_authorizations`).length, 0);
    assert.equal((await f.sql`select id from commerce_orders`).length, 0);
    const collection = await f.sql.transaction((tx) =>
      collectionAgreement(tx, "guardian", { teamId: "base", playerId: "base-player" }),
    );
    assert.deepEqual(collection.terms.rows.slice(0, 2), [
      { date: "2098-01-01", amountCents: 36083 },
      { date: "2098-01-15", amountCents: 36083 },
    ]);
    assert.deepEqual(
      installmentRemaining(collection.terms, 36083)
        .slice(0, 2)
        .map((r) => r.remainingCents),
      [0, 36083],
    );
    const finance = await withFinancialContext(f.sql, "owner", "read", (tx, c) =>
      sourceData(tx, "2097-12-01", [], c),
    );
    const receivables = finance.receivables.filter(
      (r) => r.source === "team" && r.teamId === "base",
    );
    assert.equal(receivables.length, 8);
    assert.equal(new Set(receivables.map((r) => r.id)).size, 8);
    assert.ok(receivables.some((r) => r.id.endsWith(":uniform:split:1")));
    assert.ok(receivables.some((r) => r.id.endsWith(":uniform:split:2")));
  } finally {
    await f.db.close();
  }
});

test("split payment/refund reconciliation preserves each due row and full-deposit readiness", async () => {
  const f = await setup();
  try {
    await f.offer();
    await f.accept();
    const checkout = await prepareTeamCheckout(
      f.sql,
      "guardian",
      {
        teamId: "base",
        playerId: "base-player",
        amount: 36083,
        requestId: randomUUID(),
        consent: true,
      },
      "production",
    );
    await f.sql`update commerce_orders set square_customer_id='synthetic-split-customer' where id=${checkout.orderId}`;
    const payment = {
      id: "synthetic-split-payment",
      referenceId: checkout.orderId,
      customerId: "synthetic-split-customer",
      locationId: "synthetic-location",
      amountMoney: { amount: 36083n, currency: "USD" as const },
      totalMoney: { amount: 36083n, currency: "USD" as const },
      refundedMoney: { amount: 0n, currency: "USD" as const },
      sourceType: "CARD" as const,
      status: "COMPLETED" as const,
      createdAt: new Date().toISOString(),
    };
    const config = { environment: "production", locationId: "synthetic-location" };
    await f.sql.transaction((tx) => fulfillSquarePayment(tx, payment, config));
    await f.sql.transaction((tx) => fulfillSquarePayment(tx, payment, config));
    let s = await f.workspace("guardian"),
      p = s.prospects.find((p) => p.id === "base-player")!;
    assert.equal(p.rows[0].outstanding, 0);
    assert.equal(p.rows[1].outstanding, 36083);
    assert.equal(p.outstanding, 128249);
    const [saved] = await f.sql<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    assert.equal(saved.payload.teams[0].roster[0].payments.length, 1);
    assert.equal(saved.payload.teams[0].roster[0].depositPaid, false);
    const plan = (await f.workspace()).plan! as FeePlan;
    const readiness = playerView(saved.payload.teams[0], saved.payload.teams[0].roster[0], plan);
    assert.equal(readiness.depositPaid, false);
    assert.equal(readiness.uniformReady, false);
    await assert.rejects(
      () => f.offer({ ...f.b, independent: { ...f.b.independent!, uniformDue: "2098-01-02" } }),
      /paid or accrued/,
    );
    const secondCheckout = await prepareTeamCheckout(
      f.sql,
      "guardian",
      {
        teamId: "base",
        playerId: "base-player",
        amount: 36083,
        requestId: randomUUID(),
        consent: true,
      },
      "production",
    );
    await f.sql`update commerce_orders set square_customer_id='synthetic-split-customer' where id=${secondCheckout.orderId}`;
    const secondPayment = {
      ...payment,
      id: "synthetic-split-second-payment",
      referenceId: secondCheckout.orderId,
    };
    await f.sql.transaction((tx) => fulfillSquarePayment(tx, secondPayment, config));
    await f.sql.transaction((tx) => fulfillSquarePayment(tx, secondPayment, config));
    const [bothPaid] = await f.sql<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    const bothPlayer = bothPaid.payload.teams[0].roster[0];
    assert.equal(bothPlayer.payments.length, 2);
    assert.equal(bothPlayer.depositPaid, true);
    assert.equal(playerView(bothPaid.payload.teams[0], bothPlayer, plan).depositPaid, true);
    p = (await f.workspace("guardian")).prospects.find((p) => p.id === "base-player")!;
    assert.deepEqual(
      p.rows.slice(0, 2).map((row) => row.outstanding),
      [0, 0],
    );
    assert.equal(p.outstanding, 92166);
    await f.sql.transaction((tx) =>
      fulfillSquarePayment(
        tx,
        { ...payment, refundedMoney: { amount: 10000n, currency: "USD" } },
        config,
      ),
    );
    s = await f.workspace("guardian");
    p = s.prospects.find((p) => p.id === "base-player")!;
    // Existing ledger semantics allocate net receipts chronologically, not to an earmarked invoice.
    assert.equal(p.rows[0].outstanding, 0);
    assert.equal(p.rows[1].outstanding, 10000);
    assert.equal(p.outstanding, 102166);
    const [refunded] = await f.sql<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    const refundedPlayer = refunded.payload.teams[0].roster[0];
    assert.equal(refundedPlayer.depositPaid, false);
    const afterRefund = playerView(refunded.payload.teams[0], refundedPlayer, plan);
    assert.equal(afterRefund.depositPaid, false);
    assert.equal(afterRefund.uniformReady, false);
    assert.equal((await f.sql`select id from commerce_refunds`).length, 0);
  } finally {
    await f.db.close();
  }
});

test("withdrawal preserves both committed deposit parts and cancels uncommitted future rows", async () => {
  const f = await setup();
  try {
    await f.offer();
    await f.accept();
    let s = await f.workspace();
    await mutateFeePlan(f.sql, "owner", {
      action: "independentOffer",
      teamId: "base",
      playerId: "split-sibling",
      revision: s.planRevision,
      basisVersion: s.basisVersion,
      budget: split(f.b),
      payerUserId: "guardian",
      reason: "Synthetic second individual split for withdrawal comparison",
    });
    await f.accept("split-sibling");
    s = await f.workspace();
    await mutateFeePlan(f.sql, "owner", {
      action: "independentUniform",
      teamId: "base",
      playerId: "base-player",
      revision: s.planRevision,
      reference: "SYNTHETIC-COMMITTED-UNIFORMS",
    });
    s = await f.workspace();
    await mutateFeePlan(f.sql, "owner", {
      action: "independentWithdraw",
      teamId: "base",
      playerId: "base-player",
      revision: s.planRevision,
      reason: "Synthetic withdrawal with documented uniform commitment",
    });
    s = await f.workspace();
    const p = s.prospects.find((p) => p.id === "base-player")!;
    assert.deepEqual(
      p.rows.slice(0, 2).map((r) => r.amount),
      [36083, 36083],
    );
    assert.equal(p.outstanding, 72166);
    assert.ok(p.rows.slice(2).every((r) => r.amount === 0));
    const [saved] = await f.sql<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    assert.equal(saved.payload.teams[0].roster[0].planLock!.dep, 721.66);
    await mutateFeePlan(f.sql, "owner", {
      action: "independentWithdraw",
      teamId: "base",
      playerId: "split-sibling",
      revision: s.planRevision,
      reason: "Synthetic withdrawal without incurred uniform commitments",
    });
    const sibling = (await f.workspace()).prospects.find((p) => p.id === "split-sibling")!;
    assert.equal(sibling.rows.length, 8);
    assert.equal(sibling.outstanding, 0);
    assert.ok(sibling.rows.every((r) => r.amount === 0));
  } finally {
    await f.db.close();
  }
});

test("acceptance rechecks a split amendment when the original deposit becomes paid after publication", async () => {
  const f = await setup();
  try {
    await f.accept();
    await f.offer();
    const before = (await f.workspace("guardian")).prospects.find((p) => p.id === "base-player")!
      .acceptancePreview!.digest;
    const checkout = await prepareTeamCheckout(
      f.sql,
      "guardian",
      {
        teamId: "base",
        playerId: "base-player",
        amount: 100,
        requestId: randomUUID(),
        consent: true,
      },
      "production",
    );
    await f.sql`update commerce_orders set square_customer_id='synthetic-race-customer' where id=${checkout.orderId}`;
    await f.sql.transaction((tx) =>
      fulfillSquarePayment(
        tx,
        {
          id: "synthetic-race-payment",
          referenceId: checkout.orderId,
          customerId: "synthetic-race-customer",
          locationId: "synthetic-location",
          amountMoney: { amount: 100n, currency: "USD" },
          totalMoney: { amount: 100n, currency: "USD" },
          refundedMoney: { amount: 0n, currency: "USD" },
          sourceType: "CARD",
          status: "COMPLETED",
          createdAt: new Date().toISOString(),
        },
        { environment: "production", locationId: "synthetic-location" },
      ),
    );
    // An invalidated pending amendment must not hide accepted obligations or
    // break notification discovery for other families. Acceptance still rejects.
    const readable = (await f.workspace("guardian")).prospects.find((p) => p.id === "base-player")!;
    assert.equal(readable.acceptancePreview, null);
    assert.equal(readable.rows.length, 7);
    assert.equal(readable.rows[0].id, "uniform");
    assert.equal(readable.rows[0].outstanding, 72065);
    assert.equal(readable.outstanding, 164231);
    assert.deepEqual(
      await f.sql.transaction((tx) =>
        feeReadyCandidateIds(tx, "owner", { teamId: "base", playerId: "base-player" }),
      ),
      [],
    );
    const [row] = await f.sql<{
      payload: FeePlan;
      revision: number;
    }>`select payload,revision from team_fee_plans where team_id='base'`;
    await assert.rejects(
      () =>
        mutateFeePlan(f.sql, "guardian", {
          action: "accept",
          teamId: "base",
          playerId: "base-player",
          revision: row.revision,
          consent: true,
          name: "Synthetic Guardian",
          independentOfferDigest: before,
        }),
      /paid or accrued/,
    );
    const [after] = await f.sql<{
      payload: FeePlan;
    }>`select payload from team_fee_plans where team_id='base'`;
    assert.equal(after.payload.players["base-player"].independent!.agreements.length, 1);
    assert.equal(after.payload.players["base-player"].independent!.installments[0].id, "uniform");
    assert.equal((await f.sql`select id from team_collection_authorizations`).length, 0);
  } finally {
    await f.db.close();
  }
});
