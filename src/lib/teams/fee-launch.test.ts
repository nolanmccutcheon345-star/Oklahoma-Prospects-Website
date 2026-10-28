import { publicationOffer } from "./fee-publication";
import test from "node:test";
import assert from "node:assert/strict";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { defaultBudget, calculateFees, pricingKeys } from "./fee-model";
import { feeWorkspace, mutateFeePlan } from "./fee.server";
import { publicationHealth, feeHealth } from "./fee-health";
import { seasonPaymentPolicy, seasonReinstatementPolicy } from "./payment-policy";
import { teamCollectionsEnabled } from "./collections.server";

test("atomic owner publication uses baseline, preserves accepted fees and spending budget, and does not enable collection", async () => {
  const { db, sql } = await enrollmentFixture();
  try {
    const budget = {
      ...defaultBudget(),
      parentExplanation: {
        initialDeposit: "Uniforms and upfront team commitments.",
        monthlyDues: "Included season facility and program access.",
        teamExpenses: "Personal equipment and gate admission are separate.",
        additionalNotes: "",
      },
      poEnabled: false,
      start: "2027-02-01",
      end: "2027-06-25",
      billableMonthsOverride: 6,
      billableMonthsReason: "Owner approved six billable months independently of season dates.",
      baseline: 10,
      membershipMonthly: 10000,
      fullOrg: 50000,
      tournamentEstimate: 650000,
      uniformEstimate: 25000,
      costs: [
        { id: "fixed", name: "Synthetic coaching, travel and other direct costs", cents: 893000 },
      ],
      contingencyBps: 1250,
      processingBps: 300,
      processingFixed: 0,
      roundTo: 2500,
      pricingInheritance: { version: 1 as const, overrides: [...pricingKeys] },
      eventPaymentSchedule: undefined,
      paymentSchedule: {
        mode: "percent" as const,
        rows: [
          { full: 7000, po: 7000, due: "" },
          { full: 1500, po: 1500, due: "2027-01-05" },
          { full: 1500, po: 1500, due: "" },
        ],
      },
      deadlineOverride: "2027-01-25",
      policy: seasonPaymentPolicy,
      reinstatement: seasonReinstatementPolicy,
      readiness: {
        schedule: true,
        gas: true,
        hotels: true,
        other: true,
        processing: true,
        noUniform: false,
      },
    };
    const reordered = {
      ...budget,
      parentExplanation: Object.fromEntries(
        Object.entries(budget.parentExplanation).reverse(),
      ) as typeof budget.parentExplanation,
    };
    assert.equal(
      JSON.stringify(publicationOffer(reordered, false, budget.deadlineOverride, "2026-10-28")),
      JSON.stringify(publicationOffer(budget, false, budget.deadlineOverride, "2026-10-28")),
    );
    assert.equal(calculateFees(budget).full, 330000);
    assert.equal(publicationHealth(budget).ready, true);
    assert.equal(feeHealth(budget, { full: 0 }).ready, false);
    assert.equal(
      teamCollectionsEnabled({ SQUARE_DEPLOY_CONTEXT: "production" }, "production"),
      false,
    );
    const request = {
      action: "publish" as const,
      teamId: "base",
      revision: 0,
      confirmed: true as const,
      reviewedOffer: JSON.stringify(
        publicationOffer(budget, false, budget.deadlineOverride, "2026-10-28"),
      ),
      draft: { budget, uniforms: [], expenses: [] },
    };
    for (const actor of ["coach", "guardian", "player", "fake", "coordinator"])
      await assert.rejects(mutateFeePlan(sql, actor, request));
    await assert.rejects(
      mutateFeePlan(sql, "owner", {
        ...request,
        draft: { ...request.draft, budget: { ...budget, deadlineOverride: "2020-01-01" } },
      }),
      /deadline/,
    );
    assert.equal(
      (await sql`select team_id from team_fee_plans where team_id='base'`).length,
      0,
      "Failed publication cannot save a partial draft",
    );
    await assert.rejects(
      mutateFeePlan(sql, "owner", { ...request, reviewedOffer: "{}" }),
      /obligations changed/,
    );
    await mutateFeePlan(sql, "owner", request);
    const first = (await feeWorkspace(sql, "owner")).teams.find((t) => t.id === "base")!;
    assert.equal(first.publication?.full, 330000);
    assert.deepEqual(
      first.publication?.schedules?.full.map((r) => r.amount),
      [231000, 49500, 49500],
    );
    assert.match(
      first.publication!.policy,
      /Until your account confirms that automatic payments are active/,
    );
    assert.match(first.publication!.policy, /50% of the player's allocated contingency/);
    assert.ok(first.private!.plan.spendingBudget);
    assert.equal((await sql`select id from team_collection_authorizations`).length, 0);
    await assert.rejects(mutateFeePlan(sql, "owner", request), /changed/);
    await mutateFeePlan(sql, "guardian", {
      action: "accept",
      teamId: "base",
      playerId: "base-player",
      revision: first.revision,
      consent: true,
      name: "Synthetic Guardian",
    });
    const accepted = (await feeWorkspace(sql, "guardian")).teams.find((t) => t.id === "base")!;
    assert.equal(accepted.players[0].total, 330000);
    const current = (await feeWorkspace(sql, "owner")).teams.find((t) => t.id === "base")!;
    await mutateFeePlan(sql, "owner", {
      ...request,
      revision: current.revision,
      reviewedOffer: JSON.stringify(
        publicationOffer(
          { ...budget, fullOrg: 60000 },
          false,
          budget.deadlineOverride,
          "2026-10-28",
        ),
      ),
      draft: { ...request.draft, budget: { ...budget, fullOrg: 60000 } },
    });
    const revised = (await feeWorkspace(sql, "owner")).teams.find((t) => t.id === "base")!;
    assert.notEqual(revised.publication?.full, 330000);
    assert.equal(revised.players[0].total, 330000);
    assert.deepEqual(revised.private!.plan.spendingBudget, first.private!.plan.spendingBudget);
    assert.equal((await feeWorkspace(sql, "coach")).teams[0].private, null);
    await assert.rejects(
      mutateFeePlan(sql, "owner", {
        action: "close",
        teamId: "base",
        revision: revised.revision,
        confirmed: true,
      }),
      /facility costs/,
    );
  } finally {
    await db.close();
  }
});
