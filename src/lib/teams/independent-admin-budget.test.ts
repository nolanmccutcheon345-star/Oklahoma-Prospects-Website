import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { defaultBudget, type FeeBudget } from "./fee-model";
import type { FeePlan } from "./fee-contracts";
import { feeWorkspace, mutateFeePlan } from "./fee.server";
import {
  independentWorkspace,
  independentExport,
  mutateIndependentTeam,
} from "./independent.server";
import {
  emptyIndependentAdminBudget,
  independentProfitWorksheet,
} from "./independent-admin-budget";
import { prepareTeamCheckout } from "./payment.server";
import { fulfillSquarePayment } from "../commerce/square-payments.server";
import {
  withFinancialContext,
  recordFinancialTeamPaymentInTransaction,
} from "../finance/context.server";

test("profit worksheet reserves unapplied funds and withholds incomplete or unreconciled results", () => {
  const input = {
    costs: { depositNote: "Internal", uniforms: 10000, coaching: 20000, coachTravel: 5000 },
    initialDeposits: 50000,
    monthlyDues: 100000,
    disclosedProcessing: 4500,
    credits: 10000,
    acceptedPlayers: 1,
    pendingPlayers: 1,
    recordedPayments: 40000,
    appliedPayments: 30000,
    squareGross: 50000,
    squareRefunds: 10000,
    knownProcessingFees: 1500,
    missingProcessingFees: 0,
  };
  const s = independentProfitWorksheet(input);
  assert.equal(s.projectedRevenue, 144500);
  assert.equal(s.totalCosts, 35000);
  assert.equal(s.projectedMarginBeforeProcessing, 109500);
  assert.equal(s.netCollected, 40000);
  assert.equal(s.reservedOrUnreconciled, 10000);
  assert.equal(s.collectedMargin, -6500, "unpaid dues and refundable overpayments are not profit");
  assert.equal(
    independentProfitWorksheet({ ...input, missingProcessingFees: 1 }).collectedMargin,
    null,
  );
  assert.equal(
    independentProfitWorksheet({ ...input, recordedPayments: 39000 }).collectedMargin,
    null,
  );
  const incomplete = independentProfitWorksheet({ ...input, costs: emptyIndependentAdminBudget() });
  assert.equal(incomplete.collectedMargin, null);
  assert.equal(incomplete.projectedMarginBeforeProcessing, null);
});

test("admin notes and season costs persist privately, preserve agreements, and reconcile profit from Square once", async () => {
  const f = await enrollmentFixture(),
    { sql } = f;
  try {
    const b: FeeBudget = {
      ...defaultBudget(),
      fundingModel: "independent",
      processingBps: 0,
      processingFixed: 0,
      policy:
        "Synthetic accepted policy: bought uniforms are nonrefundable within the agreed initial deposit.",
      independent: {
        seasonKey: randomUUID(),
        uniformDeposit: 25000,
        monthlyDues: 12500,
        uniformDue: "2098-01-01",
        firstDue: "2098-01-31",
        billingDay: 31,
        lastDue: "2098-04-30",
        seasonEnd: "2098-04-30",
        processingExplanation: "No processing fee.",
      },
    };
    const adminBudget = {
      depositNote: "PRIVATE-ADMIN-BASE: uniforms, coaching and travel",
      uniforms: 18000,
      coaching: 10000,
      coachTravel: 5000,
    };
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 0,
      budget: b,
      adminBudget,
      confirmed: true,
    });
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "soft",
      revision: 0,
      budget: { ...b, independent: { ...b.independent!, seasonKey: randomUUID() } },
      adminBudget: {
        ...adminBudget,
        depositNote: "PRIVATE-ADMIN-SOFT: uniforms only",
        coaching: 0,
        coachTravel: 0,
      },
      confirmed: true,
    });
    let owner = (await independentWorkspace(sql, "owner")).spaces.find((s) => s.teamId === "base")!;
    assert.equal(owner.plan!.independentAdmin!.depositNote, adminBudget.depositNote);
    assert.equal(owner.adminFinance!.projectedRevenue, 75000);
    assert.equal(owner.adminFinance!.projectedMarginBeforeProcessing, 42000);
    assert.equal(owner.adminFinance!.pendingPlayers, 1);
    const family = (await independentWorkspace(sql, "guardian")).spaces.find(
      (s) => s.teamId === "base",
    )!;
    assert.match(family.prospects[0].acceptancePreview!.policy, /Initial deposit: \$250.00/);
    assert.doesNotMatch(family.prospects[0].acceptancePreview!.policy, /uniform deposit/i);
    await mutateFeePlan(sql, "guardian", {
      action: "accept",
      teamId: "base",
      playerId: "base-player",
      revision: 1,
      consent: true,
      name: "Synthetic Guardian",
      independentOfferDigest: family.prospects[0].acceptancePreview!.digest,
    });
    const [before] = await sql<{
      payload: FeePlan;
    }>`select payload from team_fee_plans where team_id='base'`;
    for (const id of ["guardian", "coach", "coordinator"])
      await assert.rejects(() =>
        mutateFeePlan(sql, id, {
          action: "independentAdminBudget",
          teamId: "base",
          revision: 2,
          adminBudget,
        }),
      );
    await mutateFeePlan(sql, "owner", {
      action: "independentAdminBudget",
      teamId: "base",
      revision: 2,
      adminBudget: { ...adminBudget, depositNote: "PRIVATE-ADMIN-REVISED" },
    });
    const [after] = await sql<{
      payload: FeePlan;
    }>`select payload from team_fee_plans where team_id='base'`;
    assert.deepEqual(after.payload.published, before.payload.published);
    assert.deepEqual(
      after.payload.players,
      before.payload.players,
      "notes do not rewrite signed terms, payment schedules or obligations",
    );
    assert.deepEqual(after.payload.budget, before.payload.budget);
    assert.equal((await sql`select id from commerce_orders`).length, 0);
    assert.equal(
      (await sql`select id from finance_records`).length,
      0,
      "worksheet costs never create duplicate accounting expenses",
    );
    for (const id of ["guardian", "coach"]) {
      const view = await independentWorkspace(sql, id);
      assert.ok(view.spaces.every((s) => s.adminFinance === null && s.plan === null));
      assert.doesNotMatch(JSON.stringify(view), /PRIVATE-ADMIN|independentAdmin|collectedMargin/);
      assert.doesNotMatch(
        JSON.stringify(await feeWorkspace(sql, id)),
        /PRIVATE-ADMIN|independentAdmin/,
      );
      assert.doesNotMatch(
        (await independentExport(sql, id, b.independent!.seasonKey)).text,
        /PRIVATE-ADMIN|independentAdmin|collectedMargin/,
      );
    }
    await mutateIndependentTeam(sql, "coach", {
      action: "entry",
      seasonId: b.independent!.seasonKey,
      requestId: randomUUID(),
      entry: {
        kind: "income",
        date: "2026-01-01",
        amount: 9000000,
        category: "other",
        note: "Independent sponsor",
        method: "Team bank",
        reference: "EXTERNAL-SPONSOR",
      },
    });
    const checkout = await prepareTeamCheckout(
      sql,
      "guardian",
      {
        teamId: "base",
        playerId: "base-player",
        amount: 25000,
        requestId: randomUUID(),
        consent: true,
      },
      "production",
    );
    const [order] = await sql<{
      snapshot: { lines: { label: string }[] };
    }>`select snapshot from commerce_orders where id=${checkout.orderId}`;
    assert.match(order.snapshot.lines[0].label, /initial deposit/);
    await sql`update commerce_orders set square_customer_id='synthetic-customer' where id=${checkout.orderId}`;
    const payment = {
      id: "synthetic-admin-budget-payment",
      referenceId: checkout.orderId,
      customerId: "synthetic-customer",
      locationId: "synthetic-location",
      amountMoney: { amount: 25000n, currency: "USD" as const },
      totalMoney: { amount: 25000n, currency: "USD" as const },
      refundedMoney: { amount: 5000n, currency: "USD" as const },
      sourceType: "CARD" as const,
      status: "COMPLETED" as const,
    };
    const cfg = { environment: "production", locationId: "synthetic-location" };
    await sql.transaction((tx) => fulfillSquarePayment(tx, payment, cfg));
    await sql.transaction((tx) => fulfillSquarePayment(tx, payment, cfg));
    owner = (await independentWorkspace(sql, "owner")).spaces.find((s) => s.teamId === "base")!;
    assert.equal(owner.adminFinance!.grossCollected, 25000);
    assert.equal(owner.adminFinance!.refunded, 5000);
    assert.equal(owner.adminFinance!.netCollected, 20000);
    assert.equal(
      owner.adminFinance!.collectedMargin,
      null,
      "missing actual fees are not assumed zero",
    );
    await sql`insert into finance_records(id,kind,payload) values('synthetic-collection','collection',${JSON.stringify({ id: payment.id, environment: "production", processingFee: 850 })}::jsonb)`;
    owner = (await independentWorkspace(sql, "owner")).spaces.find((s) => s.teamId === "base")!;
    assert.equal(owner.adminFinance!.appliedRevenue, 20000);
    assert.equal(owner.adminFinance!.collectedMargin, -13850);
    assert.equal(
      owner.adminFinance!.projectedRevenue,
      75000,
      "team sponsor funds never become Prospects revenue",
    );
    assert.equal(owner.adminFinance!.acceptedPlayers, 1);
    assert.equal(owner.adminFinance!.pendingPlayers, 0);
    await withFinancialContext(sql, "owner", "owner", (tx, context) =>
      recordFinancialTeamPaymentInTransaction(tx, context, {
        teamId: "base",
        playerId: "base-player",
        amount: 50,
        method: "cash",
        label: "Synthetic verified external Prospects receipt",
        verifiedReceived: true,
        requestId: randomUUID(),
      }),
    );
    owner = (await independentWorkspace(sql, "owner")).spaces.find((s) => s.teamId === "base")!;
    assert.equal(owner.adminFinance!.verifiedOffline, 5000);
    assert.equal(owner.adminFinance!.netCollected, 25000);
    assert.equal(owner.adminFinance!.collectedMargin, -8850);
    await mutateFeePlan(sql, "owner", {
      action: "independentSeasonCancel",
      teamId: "base",
      revision: 3,
      reason: "Synthetic full season cancellation",
    });
    owner = (await independentWorkspace(sql, "owner")).spaces.find((s) => s.teamId === "base")!;
    assert.equal(owner.adminFinance!.projectedRevenue, 0);
    assert.equal(owner.adminFinance!.reservedOrUnreconciled, 25000);
    assert.equal(owner.adminFinance!.collectedMargin, -33850);
    await mutateFeePlan(sql, "owner", {
      action: "independentAdminBudget",
      teamId: "base",
      revision: 4,
      adminBudget: { ...adminBudget, depositNote: "" },
    });
    const final = (await independentWorkspace(sql, "owner")).spaces;
    assert.equal(final.find((s) => s.teamId === "base")!.plan!.independentAdmin!.depositNote, "");
    assert.equal(
      final.find((s) => s.teamId === "soft")!.plan!.independentAdmin!.depositNote,
      "PRIVATE-ADMIN-SOFT: uniforms only",
    );
  } finally {
    await f.db.close();
  }
});
