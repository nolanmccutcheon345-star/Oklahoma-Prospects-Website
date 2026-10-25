import { reconcileFundraisingDispute } from "../fundraising/disputes.server";
import test from "node:test";
import assert from "node:assert/strict";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { defaultBudget } from "../teams/fee-model";
import { mutateFinance, financeWorkspace } from "./store.server";
import { today } from "./contracts";
import { withFinancialContext, applyFundraisingCreditInTransaction } from "./context.server";
import {
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
} from "./basis.server";
import { applyFutureActiveSchemaForTest } from "./context.test-fixture";

test("team approval requires owner-reviewed formation, locked category budgets and its own remaining settled funding", async () => {
  const f = await enrollmentFixture();
  try {
    const team = f.club.teams[0],
      original = team.roster[0];
    team.roster = Array.from({ length: 9 }, (_, i) => ({
      ...structuredClone(original),
      id: "funded-" + i,
      feeLock: {
        amount: 1000,
        lockedAt: "2026-10-24",
        policyVersion: "test",
        components: { season: 1000 },
      },
      planLock: {
        dep: 700,
        deadline: "2027-06-01",
        planType: "custom",
        rows: [
          { date: "2026-10-24", amount: 700 },
          { date: "2027-06-01", amount: 300 },
        ],
      },
      agreement: { version: "test", signedBy: "Synthetic guardian", signedAt: "2026-10-24" },
      payments: [
        {
          date: today(),
          amount: 700,
          fee: 0,
          charged: 700,
          method: "cash",
          label: "Fixture receipt",
          receipt: "receipt-" + i,
        },
      ],
    }));
    await f.sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb`;
    const b = {
      ...defaultBudget(),
      start: "2026-10-01",
      end: "2027-06-30",
      tournament: 60000,
      costs: [],
    };
    await f.sql`insert into team_fee_plans(team_id,revision,payload) values('base',1,${JSON.stringify({ budget: b, publishedBudget: b, published: { at: today(), revision: 1 }, players: {}, expenses: [], uniforms: [], status: "published", revision: 1, history: [] })}::jsonb)`;
    await f.sql`update finance_state set payload=jsonb_set(jsonb_set(jsonb_set(payload,'{reserve}','0'),'{tax}','0'),'{restricted}','0')`;
    let rev = 0;
    const act = async (a: any, who = "owner") => {
      await mutateFinance(f.sql, who, {
        ...a,
        revision: rev,
        reason: "Synthetic owner reviewed statement and team allocation",
      });
      rev++;
    };
    await act({
      action: "account",
      value: {
        id: "bank",
        bank: "Fixture",
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
        name: "Vendor",
        email: "vendor@example.invalid",
        role: "Vendor",
        method: "check",
        reference: "",
        active: true,
      },
    });
    for (const id of ["one", "two"])
      await act({
        action: "payable",
        value: {
          id,
          payeeId: "vendor",
          category: "tournament",
          budgetLineId: "base:tournament",
          teamId: "base",
          reason: "Approved season event",
          amount: 30000,
          earned: 30000,
          due: today(),
          source: "manual",
        },
      });
    await assert.rejects(
      () => act({ action: "approve", ids: ["one"], total: 30000 }),
      /funding review/,
    );
    const value = {
      teamId: "base",
      availableCents: 50000,
      limits: (await financeWorkspace(f.sql, "owner")).teamSpending.find(
        (t) => t.teamId === "base",
      )!.ledger!.limits,
      evidence:
        "Synthetic statement reconciliation; all final-roster deposits checked; no borrowed funds",
      formationVerified: true,
      protectedFundsVerified: true,
    };
    await assert.rejects(
      () => act({ action: "teamFundingReview", value }, "coordinator"),
      /owner|administrator/,
    );
    await act({ action: "teamFundingReview", value });
    await assert.rejects(
      () => act({ action: "approve", ids: ["one", "two"], total: 60000 }),
      /settled cash/,
    );
    assert.equal(
      (await financeWorkspace(f.sql, "owner")).records.find((r) => r.id === "one")?.payload
        .approved,
      0,
      "bulk approval is atomic",
    );
    await act({ action: "approve", ids: ["one"], total: 30000 });
    await assert.rejects(
      () => act({ action: "approve", ids: ["two"], total: 30000 }),
      /settled cash/,
    );
    await assert.rejects(
      () =>
        act({
          action: "teamFundingReview",
          value: { ...value, limits: { ...value.limits, tournament: 70000 } },
        }),
      /Category limits/,
    );
    await assert.rejects(
      () => act({ action: "teamFundingReview", value: { ...value, availableCents: 300000 } }),
      /reconciled bank cash/,
    );
    await act({
      action: "payable",
      value: {
        id: "three",
        payeeId: "vendor",
        category: "hotel",
        budgetLineId: "base:hotel",
        teamId: "base",
        reason: "Unbudgeted hotel request",
        amount: 100,
        earned: 100,
        due: today(),
        source: "manual",
      },
    });
    await assert.rejects(
      () => act({ action: "approve", ids: ["three"], total: 100 }),
      /hotel.*exceeds/i,
    );
    await f.sql`update club_state set payload=jsonb_set(payload,'{teams,0,roster,0,withdrawn}','true')`;
    await assert.rejects(() => act({ action: "approve", ids: ["two"], total: 30000 }), /formation/);
  } finally {
    await f.db.close();
  }
});

for (const basis of [false, true])
  test(`fundraising is applied once from reconciled production net funds and refunds revoke credit (${basis ? "basis" : "legacy"})`, async () => {
    const f = await enrollmentFixture();
    try {
      for (const team of f.club.teams) for (const player of team.roster) player.teamId = team.id;
      const p = f.club.teams[0].roster[0];
      p.feeLock = {
        amount: 1000,
        lockedAt: "2026-10-24",
        policyVersion: "test",
        components: { season: 1000 },
      };
      p.planLock = {
        dep: 700,
        deadline: "2027-06-01",
        planType: "custom",
        rows: [{ date: "2026-10-24", amount: 1000 }],
      };
      p.agreement = { version: "test", signedBy: "Guardian", signedAt: "2026-10-24" };
      await f.sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb`;
      if (basis) {
        const preview = await previewFinancialBasisInitialization(f.sql, "owner");
        await initializeFinancialBasisForOwner(f.sql, "owner", {
          ...preview,
          reason: "Synthetic reviewed financial capture",
        });
        await applyFutureActiveSchemaForTest(f.sql);
      }
      await f.sql`insert into fundraising_players(id,owner_id,parent_email,name,team,goal,story,created,team_id,roster_player_id) values('fundraiser','guardian','guardian@example.invalid','Synthetic athlete','Baseball',100000,'Fixture',${today()},'base','base-player')`;
      await f.sql`insert into fundraising_contributions(id,player_id,donor,email,amount,status,refunded,order_id,payment_id,created,checked) values('donation','fundraiser','Donor','donor@example.invalid',10000,'completed',0,'square-order','square-payment',${today()},${today()})`;
      const apply = (who = "owner") =>
        withFinancialContext(f.sql, who, "owner", (tx, c) =>
          applyFundraisingCreditInTransaction(tx, "donation", c, c.version || undefined),
        );
      await assert.rejects(() => apply("guardian"), /owner|administrator/);
      await assert.rejects(() => apply(), /production Square payout/);
      const settlement = {
        id: "settlement",
        environment: "sandbox",
        status: "PAID",
        bankId: "deposit",
        entries: [{ id: "entry", type: "CHARGE", paymentId: "square-payment", net: 9700 }],
      };
      await f.sql`insert into finance_records(id,kind,payload) values('settlement','settlement',${JSON.stringify(settlement)}::jsonb),('deposit','bank','{"verified":true,"match":"settlement:settlement"}'::jsonb)`;
      await assert.rejects(() => apply(), /production Square payout/);
      await f.sql`update finance_records set payload=jsonb_set(payload,'{environment}','"production"') where id='settlement'`;
      await apply();
      await apply();
      const read = () =>
        withFinancialContext(f.sql, "owner", "read", async (_tx, c) => c.club.teams[0].roster[0]);
      assert.deepEqual((await read()).credits, [
        { label: "Verified fundraising: donation", amount: 97 },
      ]);
      assert.equal((await read()).payments.length, 0, "credit is not another cash receipt");
      const dispute = {
        id: "dispute",
        disputed_payment: { payment_id: "square-payment" },
        location_id: "location",
        version: 2,
        state: "EVIDENCE_REQUIRED",
        amount_money: { amount: 10000, currency: "USD" },
      };
      await reconcileFundraisingDispute(f.sql, dispute, "location", "production");
      assert.deepEqual((await read()).credits, []);
      await reconcileFundraisingDispute(
        f.sql,
        { ...dispute, version: 1, state: "WON" },
        "location",
        "production",
      );
      await apply();
      assert.deepEqual((await read()).credits, [], "stale dispute events cannot restore credit");
      await reconcileFundraisingDispute(
        f.sql,
        { ...dispute, version: 3, state: "WON" },
        "location",
        "production",
      );
      await apply();
      assert.equal((await read()).credits[0].amount, 97, "owner may reapply after confirmed win");
      await f.sql`update fundraising_contributions set refunded=5000 where id='donation'`;
      await f.sql.transaction((tx) => applyFundraisingCreditInTransaction(tx, "donation"));
      assert.equal((await read()).credits[0].amount, 47);
      await f.sql`update fundraising_contributions set refunded=10000 where id='donation'`;
      await f.sql.transaction((tx) => applyFundraisingCreditInTransaction(tx, "donation"));
      assert.deepEqual((await read()).credits, []);
      assert.equal((await read()).feeLock?.amount, 1000, "original fee remains unchanged");
      assert.equal(
        (await f.sql`select * from finance_audit where action='Fundraising fee credit'`).length,
        5,
      );
    } finally {
      await f.db.close();
    }
  });
