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
  independentBudgetProjection,
  independentCostTotals,
  withIndependentPlanning,
} from "./independent-admin-budget";
import { prepareTeamCheckout } from "./payment.server";
import { fulfillSquarePayment } from "../commerce/square-payments.server";
import {
  withFinancialContext,
  recordFinancialTeamPaymentInTransaction,
} from "../finance/context.server";

const planningBudget = (): FeeBudget => ({
  ...defaultBudget(),
  parentExplanation: {
    initialDeposit: "Synthetic initial deposit coverage.",
    monthlyDues: "Synthetic scheduled facility and program access.",
    teamExpenses: "Team separately arranges tournament expenses.",
    additionalNotes: "",
  },
  fundingModel: "independent",
  processingBps: 0,
  processingFixed: 0,
  policy: "Synthetic terms: publication and acceptance are separate from authorization.",
  independent: {
    seasonKey: randomUUID(),
    uniformDeposit: 70000,
    monthlyDues: 14900,
    uniformDue: "2098-01-01",
    firstDue: "2098-02-01",
    billingDay: 1,
    lastDue: "2098-06-01",
    seasonEnd: "2098-06-26",
    processingExplanation: "No processing fee.",
  },
});
const planningCosts = {
  depositNote: "PRIVATE-PLAN: uniforms, coaching and travel",
  uniforms: null,
  coaching: null,
  coachTravel: null,
  planning: {
    basisPlayers: 10,
    expectedPlayers: 10,
    uniformPerPlayer: 20000,
    organizationPerPlayer: 10000,
    expenses: [
      { id: "coaching", name: "Coaching pay", total: 300000, included: true },
      { id: "coach-travel", name: "Coach travel", total: 100000, included: true },
      { id: "tournaments", name: "Tournament fees", total: 50000, included: false },
    ],
  },
};

test("fixed deposit pricing separates uniform unit cost, selected expenses and additional-player profit", () => {
  const b = planningBudget(),
    s = independentBudgetProjection(b, planningCosts);
  assert.equal(s.calculatedDeposit, 70000);
  assert.equal(s.costCoveredDeposit, 60000);
  assert.equal(s.fixedCosts, 400000);
  assert.equal(s.baseline.initialDeposits, 700000);
  assert.equal(s.baseline.uniforms, 200000);
  assert.equal(s.baseline.totalCosts, 600000);
  assert.equal(s.baseline.depositProfit, 100000);
  assert.equal(s.expected.monthlyRevenue, 149000);
  assert.equal(s.monthlyInstallments, 5);
  assert.equal(s.expected.seasonMonthlyRevenue, 745000);
  assert.equal(s.expected.seasonRevenue, 1445000);
  assert.equal(s.expected.seasonProfit, 845000);
  assert.equal(s.additionalPlayerContribution, 50000);
  assert.equal(s.breakEvenPlayers, 8);
  const actual = independentProfitWorksheet({
    costs: { ...planningCosts, planning: { ...planningCosts.planning, expectedPlayers: 13 } },
    initialDeposits: 700000,
    monthlyDues: 0,
    disclosedProcessing: 0,
    credits: 0,
    acceptedPlayers: 10,
    pendingPlayers: 0,
    recordedPayments: 700000,
    appliedPayments: 700000,
    squareGross: 700000,
    squareRefunds: 0,
    knownProcessingFees: 0,
    missingProcessingFees: 0,
  });
  assert.equal(
    actual.totalCosts,
    600000,
    "expected players never become actual uniform obligations",
  );
  assert.equal(actual.collectedMargin, 100000);
  for (const [expectedPlayers, profit] of [
    [10, 100000],
    [11, 150000],
    [12, 200000],
    [13, 250000],
  ]) {
    const more = independentBudgetProjection(b, {
      ...planningCosts,
      planning: { ...planningCosts.planning, expectedPlayers },
    });
    assert.equal(more.calculatedDeposit, 70000, "roster growth never reprices the deposit");
    assert.equal(more.uniformPerPlayer, 20000);
    assert.equal(more.fixedCosts, 400000);
    assert.equal(more.expected.depositProfit, profit);
    assert.equal(more.baseline.depositProfit, 100000);
    assert.equal(more.expected.monthlyRevenue, 14900 * expectedPlayers);
  }
  assert.equal(b.independent!.uniformDeposit, 70000, "calculator never mutates billing terms");
  const includesTournament = independentBudgetProjection(b, {
    ...planningCosts,
    planning: {
      ...planningCosts.planning,
      expenses: planningCosts.planning.expenses.map((e) => ({ ...e, included: true })),
    },
  });
  assert.equal(includesTournament.fixedCosts, 450000);
  assert.equal(includesTournament.calculatedDeposit, 75000);
  assert.equal(includesTournament.expected.depositProfit, 50000);
  const other = independentBudgetProjection(b, {
    ...planningCosts,
    planning: {
      ...planningCosts.planning,
      expenses: [
        ...planningCosts.planning.expenses,
        { id: "custom", name: "Other season expense", total: 25000, included: true },
      ],
    },
  });
  assert.equal(other.fixedCosts, 425000);
  assert.equal(other.calculatedDeposit, 72500);
  const fees = independentBudgetProjection({ ...b, processingBps: 300 }, planningCosts);
  assert.ok(fees.expected.processingAllowance! > 0);
  assert.equal(fees.expected.seasonProfit, 845000, "processing pass-through is not planned profit");
  const legacy = { depositNote: "Legacy", uniforms: 20000, coaching: 300000, coachTravel: 100000 };
  assert.equal(independentCostTotals(legacy).totalCosts, 420000);
  assert.equal(
    withIndependentPlanning(legacy).planning.uniformPerPlayer,
    null,
    "never reinterpret an old team total as a unit cost",
  );
  assert.equal(
    independentBudgetProjection(b, {
      ...planningCosts,
      planning: { ...planningCosts.planning, uniformPerPlayer: null },
    }).expected.depositProfit,
    null,
  );
  assert.equal(
    independentBudgetProjection(b, {
      ...planningCosts,
      planning: { ...planningCosts.planning, basisPlayers: 0 },
    }).calculatedDeposit,
    null,
  );
  assert.equal(
    independentBudgetProjection(b, {
      ...planningCosts,
      planning: { ...planningCosts.planning, expectedPlayers: 10.5 },
    }).expected.seasonProfit,
    null,
  );
  const noRoster = independentBudgetProjection(b, {
    ...planningCosts,
    planning: { ...planningCosts.planning, expectedPlayers: 0 },
  });
  assert.equal(noRoster.expected.initialDeposits, 0);
  assert.equal(noRoster.expected.depositProfit, -400000);
  const missingDates = independentBudgetProjection(
    { ...b, independent: { ...b.independent!, firstDue: "" } },
    planningCosts,
  );
  assert.equal(missingDates.expected.depositProfit, 100000);
  assert.equal(missingDates.expected.seasonRevenue, null);
  const rounded = independentBudgetProjection(b, {
    ...planningCosts,
    planning: { ...planningCosts.planning, basisPlayers: 3 },
  });
  assert.equal(rounded.calculatedDeposit, 163334, "round allocated fixed costs up to a cent");
});

test("saving draft fees keeps a changed deposit and headcount without republishing or rewriting accepted terms", async () => {
  const f = await enrollmentFixture(),
    { sql } = f;
  try {
    const b = planningBudget();
    const save = (revision: number, budget: FeeBudget, adminBudget = planningCosts) =>
      mutateFeePlan(sql, "owner", {
        action: "save",
        teamId: "base",
        revision,
        budget,
        adminBudget,
        uniforms: [],
        expenses: [],
      });
    await save(0, { ...b, independent: { ...b.independent!, uniformDeposit: 60000 } });
    await save(1, b);
    let owner = (await independentWorkspace(sql, "owner")).spaces.find((s) => s.teamId === "base")!;
    assert.equal(owner.plan!.budget.independent!.uniformDeposit, 70000);
    assert.equal(owner.plan!.independentAdmin!.planning!.basisPlayers, 10);
    assert.equal(owner.adminFinance!.planning.expected.depositProfit, 100000);
    assert.equal(owner.adminFinance!.planning.expected.seasonProfit, 845000);
    assert.equal(
      owner.adminFinance!.projectedRevenue,
      0,
      "planning never invents published receivables",
    );
    assert.equal(owner.plan!.published, undefined);
    await assert.rejects(() =>
      save(1, { ...b, independent: { ...b.independent!, uniformDeposit: 60000 } }),
    );
    for (const basisPlayers of [0, 10.5, 201])
      await assert.rejects(() =>
        save(2, b, { ...planningCosts, planning: { ...planningCosts.planning, basisPlayers } }),
      );
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 2,
      budget: b,
      adminBudget: planningCosts,
      confirmed: true,
    });
    const family = (await independentWorkspace(sql, "guardian")).spaces.find(
      (s) => s.teamId === "base",
    )!;
    await mutateFeePlan(sql, "guardian", {
      action: "accept",
      teamId: "base",
      playerId: "base-player",
      revision: 3,
      consent: true,
      name: "Synthetic Guardian",
      independentOfferDigest: family.prospects[0].acceptancePreview!.digest,
    });
    const [before] = await sql<{
      payload: FeePlan;
    }>`select payload from team_fee_plans where team_id='base'`;
    await save(
      4,
      { ...b, independent: { ...b.independent!, uniformDeposit: 80000, monthlyDues: 15900 } },
      { ...planningCosts, planning: { ...planningCosts.planning, expectedPlayers: 12 } },
    );
    const [after] = await sql<{
      payload: FeePlan;
    }>`select payload from team_fee_plans where team_id='base'`;
    assert.deepEqual(after.payload.published, before.payload.published);
    assert.deepEqual(after.payload.publishedBudget, before.payload.publishedBudget);
    assert.deepEqual(after.payload.players, before.payload.players);
    owner = (await independentWorkspace(sql, "owner")).spaces.find((s) => s.teamId === "base")!;
    assert.equal(owner.adminFinance!.planning.expected.initialDeposits, 960000);
    assert.equal(
      owner.adminFinance!.projectedRevenue,
      144500,
      "real agreement still has its accepted amounts",
    );
    const view = await independentWorkspace(sql, "guardian");
    assert.doesNotMatch(
      JSON.stringify(view),
      /PRIVATE-PLAN|basisPlayers|uniformPerPlayer|organizationPerPlayer|seasonProfit/,
    );
    for (const id of ["guardian", "coach", "coordinator"])
      await assert.rejects(() =>
        mutateFeePlan(sql, id, {
          action: "save",
          teamId: "base",
          revision: 5,
          budget: b,
          adminBudget: planningCosts,
          uniforms: [],
          expenses: [],
        }),
      );
    assert.equal((await sql`select id from commerce_orders`).length, 0);
    assert.equal((await sql`select id from team_collection_authorizations`).length, 0);
    assert.equal((await sql`select id from finance_records`).length, 0);
  } finally {
    await f.db.close();
  }
});

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
      parentExplanation: {
        initialDeposit: "Synthetic initial deposit coverage.",
        monthlyDues: "Synthetic scheduled facility and program access.",
        teamExpenses: "Team separately arranges tournament expenses.",
        additionalNotes: "",
      },
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
