import test from "node:test";
import assert from "node:assert/strict";
import { defaultBudget, calculateFees } from "../teams/fee-model";
import type { FeePlan } from "../teams/fee-contracts";
import {
  pinSpendingBudget,
  publishedSpendingLines,
  teamBudgetLedger,
  teamExpenseTotals,
} from "./team-budget";
import { feeWorkspace } from "../teams/fee.server";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { financeWorkspace, mutateFinance } from "./store.server";
import { today } from "./contracts";

test("published line budgets retain every cost and remain fixed through later fee and roster changes", () => {
  const budget = {
    ...defaultBudget(),
    baseline: 10,
    programCostModel: 1 as const,
    months: 6,
    membershipMonthly: 10000,
    fullOrg: 50000,
    tournament: 650000,
    uniformCost: 25000,
    hotelNightly: 20000,
    hotelNights: 10,
    fullIncremental: 0,
    contingencyBps: 1250,
    costs: [
      { id: "head", name: "Head coach", cents: 275000 },
      { id: "assistant", name: "Assistant coach", cents: 125000 },
      { id: "gas", name: "Coach gas", cents: 30000 },
      { id: "equipment", name: "Team equipment", cents: 35000 },
    ],
  };
  const plan = {
    budget,
    publishedBudget: structuredClone(budget),
    published: { at: "2026-10-25T00:00:00Z", revision: 7 },
    expenses: [],
    players: {},
  } as unknown as FeePlan;
  const lines = publishedSpendingLines(budget);
  assert.equal(
    lines.reduce((n, l) => n + l.budget, 0),
    calculateFees(budget).externalDirect + calculateFees(budget).contingency,
  );
  assert.equal(lines.find((l) => l.id === "cost:head")!.budget, 275000);
  assert.equal(lines.find((l) => l.id === "cost:assistant")!.budget, 125000);
  pinSpendingBudget(plan);
  plan.budget.costs[0].cents = 999999;
  plan.publishedBudget!.tournament = 900000;
  plan.published!.revision = 8;
  pinSpendingBudget(plan);
  const ledger = teamBudgetLedger(plan, [], "base")!;
  assert.equal(ledger.rows.find((l) => l.id === "base:tournament")!.budget, 650000);
  assert.equal(ledger.publicationRevision, 7);
  assert.equal(ledger.internalProgram, 600000);
  assert.equal(
    ledger.rows.some((l) => /program/i.test(l.name)),
    false,
    "internal program allocation must not become duplicate external spending",
  );
});

test("owners track exact budget lines, audited contingency and shared-invoice bank reconciliation per team", async () => {
  const f = await enrollmentFixture();
  try {
    const b = {
      ...defaultBudget(),
      start: "2026-10-01",
      end: "2027-06-30",
      tournament: 60000,
      hotelNightly: 20000,
      hotelNights: 3,
      uniformCost: 0,
      fullIncremental: 0,
      costs: [
        { id: "gas", name: "Coach gas", cents: 10000 },
        { id: "equipment", name: "Team equipment", cents: 20000 },
      ],
      contingencyBps: 1250,
    };
    const template = f.club.teams[0];
    f.club.teams = ["base", "soft"].map((id, index) => ({
      ...structuredClone(template),
      id,
      name: index ? "Synthetic softball" : "Synthetic baseball",
      sport: index ? "softball" : "baseball",
      closed: false,
      roster: Array.from({ length: 9 }, (_, i) => ({
        ...structuredClone(template.roster[0]),
        id: id + "-" + i,
        teamId: id,
        withdrawn: false,
        feeLock: {
          amount: 1000,
          lockedAt: today(),
          policyVersion: "test",
          components: { season: 1000 },
        },
        planLock: {
          dep: 700,
          deadline: "2027-06-01",
          planType: "custom",
          rows: [
            { date: today(), amount: 700 },
            { date: "2027-06-01", amount: 300 },
          ],
        },
        agreement: { version: "test", signedBy: "Synthetic guardian", signedAt: today() },
        payments: [
          {
            date: today(),
            amount: 700,
            fee: 0,
            charged: 700,
            method: "cash",
            label: "Synthetic deposit",
            receipt: id + "-" + i,
          },
        ],
        credits: [],
      })),
    }));
    await f.sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb`;
    for (const id of ["base", "soft"]) {
      const plan = {
        budget: b,
        publishedBudget: b,
        published: { at: today(), revision: 1, policy: "Synthetic accepted terms" },
        players: {},
        expenses: [],
        uniforms: [],
        status: "published",
        revision: 1,
        history: [],
      } as unknown as FeePlan;
      pinSpendingBudget(plan);
      await f.sql`insert into team_fee_plans(team_id,revision,payload) values(${id},1,${JSON.stringify(plan)}::jsonb)`;
    }
    await f.sql`update finance_state set payload=jsonb_set(jsonb_set(jsonb_set(payload,'{reserve}','0'),'{tax}','0'),'{restricted}','0')`;
    let revision = 0;
    const act = async (a: any, who = "owner") => {
      await mutateFinance(f.sql, who, {
        ...a,
        revision,
        reason: "Synthetic invoice and statement evidence reviewed",
      });
      revision++;
    };
    const view = async (id: string) =>
      (await financeWorkspace(f.sql, "owner")).teamSpending.find((t) => t.teamId === id)!;
    await act({
      action: "account",
      value: {
        id: "bank",
        bank: "Fixture bank",
        nickname: "Operating",
        type: "checking",
        last4: "1234",
        active: true,
        opening: 200000,
        openingDate: today(),
      },
    });
    await act({
      action: "payee",
      value: {
        id: "vendor",
        name: "Synthetic hotel",
        email: "vendor@example.invalid",
        role: "Vendor",
        method: "check",
        reference: "",
        active: true,
      },
    });
    for (const [teamId, amount] of [
      ["base", 30000],
      ["soft", 20000],
    ] as const) {
      await act({
        action: "payable",
        value: {
          id: "invoice-" + teamId,
          payeeId: "vendor",
          category: "hotel",
          teamId,
          budgetLineId: "base:hotel",
          invoiceReference: "SHARED-FIXTURE",
          reason: "Shared hotel invoice allocation",
          amount,
          earned: amount,
          due: today(),
          source: "manual",
        },
      });
      await act({
        action: "teamFundingReview",
        value: {
          teamId,
          availableCents: 50000,
          limits: (await view(teamId)).ledger!.limits,
          evidence: "Synthetic bank statement and team funding allocation reviewed",
          formationVerified: true,
          protectedFundsVerified: true,
        },
      });
      await act({ action: "approve", ids: ["invoice-" + teamId], total: amount });
    }
    for (const [teamId, amount] of [
      ["base", 30000],
      ["soft", 20000],
    ] as const)
      await act({
        action: "payment",
        id: "sent-" + teamId,
        payableId: "invoice-" + teamId,
        accountId: "bank",
        cardId: "",
        amount,
        date: today(),
        reference: "Shared vendor invoice / " + teamId,
        method: "check",
      });
    assert.equal((await view("base")).ledger!.rows.find((l) => l.id === "base:hotel")!.paid, 0);
    assert.equal((await view("base")).ledger!.rows.find((l) => l.id === "base:hotel")!.sent, 30000);
    await act({
      action: "bank",
      value: {
        id: "debit",
        accountId: "bank",
        date: today(),
        amount: -50000,
        reference: "Fixture shared debit",
        category: "hotel",
        reason: "Shared vendor invoice",
        payeeId: "vendor",
        teamId: "",
      },
    });
    await assert.rejects(
      () =>
        act({ action: "matchPayments", bankId: "debit", paymentIds: ["sent-base", "sent-base"] }),
      /distinct/,
    );
    await act({
      action: "bank",
      value: {
        id: "wrong-debit",
        accountId: "bank",
        date: today(),
        amount: -49999,
        reference: "Different synthetic debit",
        category: "hotel",
        reason: "Amount does not match the invoice allocations",
        payeeId: "vendor",
        teamId: "",
      },
    });
    await assert.rejects(
      () =>
        act({
          action: "matchPayments",
          bankId: "wrong-debit",
          paymentIds: ["sent-base", "sent-soft"],
        }),
      /exact debit total/,
    );
    assert.equal((await view("base")).ledger!.verifiedPaid, 0, "failed group match is atomic");
    assert.equal((await view("soft")).ledger!.verifiedPaid, 0);
    await assert.rejects(
      () =>
        act(
          { action: "matchPayments", bankId: "debit", paymentIds: ["sent-base", "sent-soft"] },
          "coordinator",
        ),
      /owner|administrator/,
    );
    await act({ action: "matchPayments", bankId: "debit", paymentIds: ["sent-base", "sent-soft"] });
    assert.equal((await view("base")).ledger!.rows.find((l) => l.id === "base:hotel")!.paid, 30000);
    assert.equal((await view("soft")).ledger!.rows.find((l) => l.id === "base:hotel")!.paid, 20000);
    assert.equal((await view("base")).ledger!.rows.find((l) => l.id === "base:hotel")!.sent, 0);
    const fees = await feeWorkspace(f.sql, "owner");
    assert.equal(fees.teams.find((t) => t.id === "base")!.private!.actual.expensesPaid, 30000);
    assert.equal(fees.teams.find((t) => t.id === "soft")!.private!.actual.expensesPaid, 20000);
    await assert.rejects(
      () =>
        act({ action: "matchPayments", bankId: "debit", paymentIds: ["sent-base", "sent-soft"] }),
      /unmatched/,
    );
    const before = (await view("base")).ledger!;
    await act({
      action: "teamBudgetTransfer",
      id: "allocation",
      teamId: "base",
      lineId: "cost:gas",
      cents: 5000,
    });
    const changed = (await view("base")).ledger!;
    assert.equal(changed.rows.find((l) => l.id === "cost:gas")!.budget, 10000);
    assert.equal(changed.rows.find((l) => l.id === "cost:gas")!.currentBudget, 15000);
    assert.equal(
      changed.rows.reduce((n, l) => n + l.currentBudget, 0),
      before.externalBudget,
    );
    await assert.rejects(
      () =>
        act({
          action: "teamBudgetTransfer",
          id: "too-large",
          teamId: "base",
          lineId: "cost:gas",
          cents: before.externalBudget,
        }),
      /uncommitted/,
    );
    await assert.rejects(
      () =>
        act({
          action: "teamBudgetTransfer",
          id: "wrong-line",
          teamId: "soft",
          lineId: "unknown",
          cents: 1,
        }),
      /published expense line/,
    );
    await act({
      action: "teamBudgetTransfer",
      id: "return-unused",
      teamId: "base",
      lineId: "cost:gas",
      cents: -5000,
    });
    await assert.rejects(
      () =>
        act({
          action: "teamBudgetTransfer",
          id: "return-base",
          teamId: "base",
          lineId: "cost:gas",
          cents: -1,
        }),
      /prior contingency/,
    );
    await act({
      action: "payable",
      value: {
        id: "unassigned",
        payeeId: "vendor",
        category: "other",
        teamId: "base",
        reason: "Equipment receipt",
        amount: 1000,
        earned: 1000,
        due: today(),
        source: "manual",
      },
    });
    assert.equal((await view("base")).ledger!.unallocated.length, 1);
    await assert.rejects(
      () => act({ action: "approve", ids: ["unassigned"], total: 1000 }),
      /Assign this payable/,
    );
    await act({ action: "budgetAssignment", payableId: "unassigned", lineId: "cost:equipment" });
    assert.equal((await view("base")).ledger!.unallocated.length, 0);
    await act({
      action: "payable",
      value: {
        id: "over-budget",
        payeeId: "vendor",
        category: "hotel",
        teamId: "base",
        budgetLineId: "base:hotel",
        reason: "Oversize new hotel invoice",
        amount: 80000,
        earned: 80000,
        due: today(),
        source: "manual",
      },
    });
    await assert.rejects(
      () => act({ action: "approve", ids: ["over-budget"], total: 80000 }),
      /hotel.*exceeds/i,
    );
    const [club] = await f.sql<{ payload: typeof f.club }>`select payload from club_state`;
    assert.equal(
      club.payload.teams[0].roster[0].feeLock!.amount,
      1000,
      "expense tracking cannot alter an accepted fee",
    );
  } finally {
    await f.db.close();
  }
});

test("team expense summaries deduplicate fee-plan mirrors and preserve pending and historical evidence", () => {
  const plan = {
    expenses: [
      { id: "mirror", name: "Mirrored hotel", cents: 50000, paid: false, contingency: false },
      { id: "history", name: "Old receipt", cents: 2000, paid: true, contingency: false },
    ],
  } as unknown as FeePlan;
  const rs = [
    {
      id: "expense:base:mirror",
      kind: "payable",
      payload: {
        id: "expense:base:mirror",
        teamId: "base",
        category: "hotel",
        amount: 50000,
        paid: 30000,
        approved: 50000,
        state: "approved",
      },
    },
    {
      id: "gas",
      kind: "payable",
      payload: {
        id: "gas",
        teamId: "base",
        category: "gas",
        amount: 10000,
        paid: 10000,
        approved: 10000,
        state: "approved",
        budgetLineId: "reserve:contingency",
      },
    },
    {
      id: "other-team",
      kind: "payable",
      payload: { id: "other-team", teamId: "soft", category: "gas", amount: 5000, paid: 5000 },
    },
    {
      id: "pending",
      kind: "payment",
      payload: { payableId: "expense:base:mirror", state: "in progress", amount: 20000 },
    },
  ];
  assert.deepEqual(teamExpenseTotals(plan, rs, "base"), {
    paid: 42000,
    unpaid: 20000,
    unverifiedPaid: 2000,
    verifiedPaid: 40000,
    sent: 20000,
    contingencyCommitted: 10000,
    contingencyPaid: 10000,
    directPaid: 32000,
  });
  const reclassified = teamExpenseTotals(
    plan,
    [
      ...rs,
      {
        id: "assignment",
        kind: "budgetAssignment",
        payload: { payableId: "gas", teamId: "base", lineId: "cost:gas" },
      },
    ],
    "base",
  );
  assert.equal(reclassified.contingencyPaid, 0);
  assert.equal(reclassified.directPaid, 42000);
  assert.equal(reclassified.paid, 42000, "classification cannot change total recorded spending");
});
