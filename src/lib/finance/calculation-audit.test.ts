import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import { defaultBudget } from "../teams/fee-model";
import { sourceData } from "./sources.server";
import { withFinancialContext } from "./context.server";
import type { RecordRow } from "./contracts";

test("organization source calculations use cash, credits, actual roster costs and live invoices correctly", async (t) => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? "$" + i : "") + p, ""),
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
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + file, "utf8"));
    const sql = wrap(db.query.bind(db));
    await sql`insert into "user"(id,email,name,"emailVerified") values('audit-owner','audit-owner@example.invalid','Synthetic owner',true)`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values('audit-owner','audit-owner@example.invalid','Synthetic owner','admin','audit-family')`;
    await sql`insert into owner_grants(email,user_id) values('audit-owner@example.invalid','audit-owner')`;
    const club = sampleClub();
    club._demo = false;
    club.teams = club.teams.slice(0, 1);
    const team = club.teams[0];
    team.id = "audit-team";
    team.coachEmail = "coach@example.invalid";
    team.headCoach = "Synthetic coach";
    team.staff = [];
    const template = structuredClone(team.roster[0]);
    team.roster = Array.from({ length: 12 }, (_, n) => ({
      ...structuredClone(template),
      id: "athlete-" + n,
      name: "Synthetic athlete " + n,
      roleType: n === 11 ? ("po" as const) : ("full" as const),
      withdrawn: false,
      feeLock: null,
      planLock: null,
      payments: [],
      credits: [],
    }));
    Object.assign(team.roster[0], {
      feeLock: {
        amount: 100,
        lockedAt: "2027-01-01",
        policyVersion: "test",
        components: { season: 100 },
      },
      planLock: {
        rows: [
          { amount: 40, date: "2027-01-01" },
          { amount: 60, date: "2027-02-01" },
        ],
      },
      payments: [{ amount: 25 }],
      credits: [{ amount: 30 }],
    });
    const budget = {
      ...defaultBudget(),
      start: "2027-01-01",
      end: "2027-01-31",
      baseline: 10,
      costs: [{ id: "matrix-head", name: "Head coach", cents: 10001 }],
      headPremiumBps: 1,
      tournament: 0,
      uniformCost: 1000,
      fullIncremental: 200,
      contingencyBps: 1000,
      hotelNightly: 0,
      hotelNights: 0,
      membershipMonthly: 0,
      fullOrg: 0,
      poOrg: 0,
      roundTo: 0,
      processingBps: 0,
      processingFixed: 0,
    };
    const plan = {
      budget,
      publishedBudget: budget,
      players: {},
      status: "published",
      expenses: [
        {
          id: "unexpected",
          name: "Synthetic repair",
          cents: 500,
          paid: false,
          contingency: true,
          date: "2027-01-10",
        },
      ],
    };
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
    await sql`insert into team_fee_plans(team_id,payload,revision) values(${team.id},${JSON.stringify(plan)}::jsonb,1)`;
    const records: RecordRow[] = [
      {
        id: `expense:${team.id}:unexpected`,
        kind: "payable",
        payload: { teamId: team.id, category: "vendor", paid: 500 },
      },
    ];
    const view = () =>
      withFinancialContext(sql, "audit-owner", "owner", (tx, context) =>
        sourceData(tx, "2027-02-01", records, context),
      );
    await t.test("installments separate credits from actual cash receipts", async () => {
      const { receivables, teams } = await view();
      assert.equal(teams[0].collected, 2500);
      assert.deepEqual(
        receivables.map((r) => [r.paid, r.credits, r.remaining]),
        [
          [2500, 1500, 0],
          [0, 1500, 4500],
        ],
      );
    });
    await t.test(
      "reserve includes extra full and PO uniforms; reconciled contingency reduces only contingency",
      async () => {
        const { teams } = await view();
        assert.equal(teams[0].protectedDirect, 10003 + 12 * 1200);
        assert.equal(teams[0].contingency, 2201 - 500);
      },
    );
    await t.test(
      "coach accrual uses the exact premium rounding included in player fees",
      async () => {
        const { candidates } = await view();
        assert.equal(candidates.find((p) => p.category === "coach")?.amount, 10003);
      },
    );
    for (const [id, environment, status] of [
      ["live", "production", "unpaid"],
      ["test", "sandbox", "unpaid"],
      ["draft", "production", "draft"],
      ["scheduled", "production", "scheduled"],
      ["partial", "production", "partially_paid"],
      ["paid", "production", "paid"],
      ["refund", "production", "partially_refunded"],
    ]) {
      await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment) values(${id},${id},'audit-owner','audit-owner@example.invalid','plan','cage-plan','{}'::jsonb,7900,'paid','square',${environment})`;
      await sql`insert into club_subscriptions(id,order_id,user_id,product_id,customer_id,status,amount_cents,payment_provider) values(${id},${id},'audit-owner','plan','customer','active',7900,'square')`;
      await sql`insert into billing_invoices(id,user_id,subscription_id,amount_cents,status,period_start) values(${id},'audit-owner',${id},7900,${status},'2027-01-01')`;
    }
    await t.test("sandbox and unissued invoices never become production receivables", async () => {
      const { receivables } = await view();
      assert.deepEqual(
        receivables
          .filter((r) => r.source === "subscription")
          .map((r) => r.id)
          .sort(),
        ["invoice:live", "invoice:partial"],
      );
    });
    await t.test(
      "unverified partial balances require review rather than claim the entire invoice is unpaid",
      async () => {
        const { receivables, warnings } = await view();
        assert.equal(receivables.find((r) => r.id === "invoice:partial")?.remaining, null);
        assert.match(warnings.join(" "), /partial.*balance.*review/i);
      },
    );
    await t.test(
      "verified partial receipt reduces the balance exactly, and late unpaid status cannot lose it",
      async () => {
        await sql`insert into square_payments(id,order_id,invoice_id,environment,amount_cents,status) values('partial-payment','partial','partial','production',2000,'COMPLETED')`;
        for (const status of ["partially_paid", "unpaid"]) {
          await sql`update billing_invoices set status=${status} where id='partial'`;
          const { receivables } = await view();
          const invoice = receivables.find((r) => r.id === "invoice:partial");
          assert.equal(invoice?.remaining, 5900);
          assert.equal(invoice?.paid, 2000);
          assert.equal(invoice?.needsReview, false);
        }
      },
    );
  } finally {
    await db.close();
  }
});
