import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { mutateFinance, financeWorkspace } from "./store.server";
import { financeSummary } from "./model";
import { accrual, compensation, safeText, today, type Settings, type RecordRow } from "./contracts";
import { syncSettlements } from "./square.server";
import { myFinance } from "./self.server";
const settings: Settings = {
  profit: 1000000,
  reserve: 240000,
  tax: 10000,
  restricted: 5000,
  nolanBps: 5000,
  reviewedThrough: today(),
  reviewNote: "All actual bank and liability records reviewed",
  cadence: "manual",
};
const empty = {
  teams: [],
  warnings: [],
  refunds: [],
  payments: [],
  receivables: [],
  candidates: [],
};
test("accrual, compensation and masked instructions are exact", () => {
  assert.equal(accrual(31000, "2027-01-01", "2027-01-31", "2027-01-15"), 15000);
  assert.equal(accrual(31000, "2027-01-01", "2027-01-31", "2026-12-31"), 0);
  assert.equal(compensation("percent", 6000, 14900, 75), 8940);
  assert.equal(compensation("hourly", 6000, 14900, 75), 7500);
  assert.equal(compensation("fixed", 4500, 14900, 75), 4500);
  assert.equal(safeText.safeParse("1234 5678 9012 3456").success, false);
  assert.equal(safeText.safeParse("Check; bank ending 1234").success, true);
});
test("settlements are not revenue; protected cash and profit ceilings gate distributions", () => {
  const rs: RecordRow[] = [
    {
      id: "bank",
      kind: "account",
      payload: { id: "bank", active: true, opening: 1000000, openingDate: "2026-01-01" },
    },
    { id: "sync", kind: "sync", payload: { through: today(), environment: "production" } },
  ];
  const source = {
    ...empty,
    teams: [{ id: "t", protectedDirect: 100000, contingency: 15000, deferred: 20000 }],
    payments: [{ status: "COMPLETED", amount_cents: 50000, environment: "production" }],
  };
  const first = financeSummary(rs, settings, source, today());
  assert.equal(first.distributable, 610000);
  assert.equal(first.squareReceived, 50000);
  rs.push({
    id: "deposit",
    kind: "bank",
    payload: {
      id: "deposit",
      accountId: "bank",
      date: today(),
      amount: 48500,
      verified: true,
      match: "settlement:one",
    },
  });
  const next = financeSummary(rs, settings, source, today());
  assert.equal(next.cash, 1048500);
  assert.equal(next.squareReceived, 50000);
  assert.equal(next.squareBankDeposits, 48500);
  assert.equal(
    financeSummary(rs, { ...settings, profit: 100 }, source, today()).distributable,
    100,
  );
  rs.push({ id: "unmatched", kind: "bank", payload: { verified: false } });
  assert.equal(financeSummary(rs, settings, source, today()).distributable, 0);
});
test("finance permissions, duplicate protection, staged payment reconciliation and append-only audit", async () => {
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
    for (const n of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + n, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const [id, role] of [
      ["owner", "admin"],
      ["coach", "coach"],
      ["parent", "parent"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"family-" + id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
    await assert.rejects(() => financeWorkspace(sql, "parent"), /administrator/);
    await assert.rejects(() => financeWorkspace(sql, "coach"), /administrator/);
    let rev = 0;
    const action = async (a: any) => {
      await mutateFinance(sql, "owner", {
        ...a,
        revision: rev,
        reason: "Documented admin verification",
      });
      rev++;
    };
    await action({
      action: "account",
      value: {
        id: "bank",
        bank: "Example bank",
        nickname: "Operating",
        type: "checking",
        last4: "1234",
        active: true,
        opening: 100000,
        openingDate: "2026-01-01",
      },
    });
    await action({
      action: "payee",
      value: {
        id: "person",
        name: "Coach Example",
        email: "coach@example.invalid",
        role: "Instructor",
        method: "check",
        reference: "Mail check",
        active: true,
      },
    });
    await action({
      action: "payable",
      value: {
        id: "bill",
        payeeId: "person",
        category: "instructor",
        teamId: "",
        reason: "Completed lesson",
        amount: 10000,
        earned: 10000,
        due: today(),
        source: "manual",
      },
    });
    const payment = {
      action: "payment",
      id: "sent",
      payableId: "bill",
      accountId: "bank",
      cardId: "",
      amount: 10000,
      date: today(),
      reference: "CHECK-123",
      method: "check",
    };
    await assert.rejects(
      () =>
        mutateFinance(sql, "owner", {
          ...payment,
          revision: rev,
          reason: "Attempt before approval",
        } as any),
      /exceeds approved/,
    );
    await action({ action: "approve", ids: ["bill"], total: 10000 });
    await action(payment);
    let view = await financeWorkspace(sql, "owner");
    assert.equal(view.summary.payables[0].paid, 0);
    assert.equal(view.summary.payables[0].status, "PAYMENT IN PROGRESS");
    await assert.rejects(
      () =>
        mutateFinance(sql, "owner", {
          ...payment,
          revision: rev,
          reason: "Duplicate payment attempt",
        } as any),
      /exceeds|already/,
    );
    await action({
      action: "bank",
      value: {
        id: "debit",
        accountId: "bank",
        date: today(),
        amount: -10000,
        reference: "BANK-CHECK-123",
        category: "instructor",
        reason: "Cleared instructor check",
        payeeId: "person",
        teamId: "",
      },
    });
    await action({ action: "match", bankId: "debit", targetId: "sent", targetKind: "payment" });
    view = await financeWorkspace(sql, "owner");
    assert.equal(view.summary.payables[0].paid, 10000);
    assert.equal(view.summary.payables[0].status, "PAID");
    assert.equal(view.summary.cash, 90000);
    await assert.rejects(
      () =>
        mutateFinance(sql, "owner", {
          action: "match",
          bankId: "debit",
          targetId: "sent",
          targetKind: "payment",
          revision: rev,
          reason: "Duplicate reconciliation",
        }),
      /already reconciled/,
    );
    assert.equal((await myFinance(sql, "parent")).rows.length, 0);
    assert.equal((await myFinance(sql, "coach")).rows.length, 1);
    await assert.rejects(() => db.exec("delete from finance_audit"), /append-only/);
    await assert.rejects(() => db.exec("delete from finance_records"), /never deleted/);
    assert.ok(view.audit.length >= 8);
    await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment) values('sale','sale','parent@example.invalid','cage','cage','{}',10000,'paid','square','production')`;
    await sql`insert into square_payments(id,order_id,environment,amount_cents,refunded_cents,status) values('sq-payment','sale','production',10000,2000,'COMPLETED')`;
    await sql`insert into commerce_refunds(id,order_id,user_id,amount_cents,status,reason,square_payment_id,square_refund_id) values('failed-refund','sale','owner',5000,'failed','Provider failure','sq-payment','sq-refund'),('pending-refund','sale','owner',3000,'pending','Other pending amount','sq-payment','sq-pending')`;
    const fallback = {
      action: "externalRefund",
      refundId: "failed-refund",
      payeeId: "person",
      due: today(),
      providerFailureConfirmed: true,
      revision: rev,
      reason: "Confirmed provider failure requires reimbursement",
    } as const;
    const provider = {
      refund: async () => ({
        refund: {
          id: "sq-refund",
          paymentId: "sq-payment",
          amountMoney: { currency: "USD", amount: 5000n },
          status: "FAILED",
        },
      }),
      payment: async () => ({
        payment: {
          id: "sq-payment",
          amountMoney: { currency: "USD", amount: 10000n },
          refundedMoney: { currency: "USD", amount: 4000n },
        },
      }),
    };
    await assert.rejects(
      () => mutateFinance(sql, "owner", fallback, provider),
      /reserved or returned/,
    );
    await sql`update commerce_refunds set status='rejected' where id='pending-refund'`;
    await mutateFinance(sql, "owner", fallback, provider);
    rev++;
    await assert.rejects(
      () => mutateFinance(sql, "owner", { ...fallback, revision: rev }, provider),
      /definitively failed/,
    );
    const {
      rows: [fallbackRow],
    } = await db.query<any>(
      "select status,external_status from commerce_refunds where id='failed-refund'",
    );
    assert.equal(fallbackRow.status, "external_approved");
    assert.equal(fallbackRow.external_status, "approved");
    const fake: any = {
      payments: { list: async () => [] },
      payouts: {
        list: async () => [
          {
            id: "payout-1",
            status: "PAID",
            amountMoney: { currency: "USD", amount: 500n },
            arrivalDate: today(),
          },
        ],
        listEntries: async () => [
          {
            id: "entry-1",
            type: "CHARGE",
            grossAmountMoney: { currency: "USD", amount: 520n },
            feeAmountMoney: { currency: "USD", amount: 20n },
            netAmountMoney: { currency: "USD", amount: 500n },
            typeChargeDetails: { paymentId: "sq-payment" },
          },
        ],
      },
    };
    const deps: any = {
      client: fake,
      config: { environment: "production", locationId: "location" },
    };
    await syncSettlements(sql, "owner", today(), today(), deps);
    rev++;
    await syncSettlements(sql, "owner", today(), today(), deps);
    rev++;
    view = await financeWorkspace(sql, "owner");
    assert.equal(view.records.filter((r) => r.kind === "settlement").length, 1);
    assert.equal(view.summary.squareReceived, 10000);
    assert.equal(view.summary.distributable, 0);
    fake.payouts.listEntries = async () => [];
    await assert.rejects(
      () => syncSettlements(sql, "owner", today(), today(), deps),
      /do not reconcile/,
    );
    await action({
      action: "invoice",
      value: {
        id: "invoice-manual",
        customer: "Customer",
        userId: "",
        category: "Merchandise",
        teamId: "",
        amount: 5000,
        due: today(),
        reason: "Merchandise invoice",
      },
    });
    await action({
      action: "invoiceAdjustment",
      invoiceId: "invoice-manual",
      amount: 2000,
      kind: "credit",
    });
    view = await financeWorkspace(sql, "owner");
    assert.equal(view.summary.receivables.find((r) => r.id === "invoice-manual")?.remaining, 3000);
    await assert.rejects(
      () =>
        mutateFinance(sql, "owner", {
          action: "invoiceAdjustment",
          invoiceId: "invoice-manual",
          amount: 4000,
          kind: "write-off",
          revision: rev,
          reason: "Excessive adjustment attempt",
        }),
      /exceeds/,
    );
    await sql`update team_budget_master set payload=jsonb_set(jsonb_set(jsonb_set(payload,'{overheadReviewed}','true'::jsonb),'{facilityCosts}','[]'::jsonb),'{payroll}','[]'::jsonb) where id='master'`;
    await sql`insert into owner_grants(email) values('owner-two@example.invalid')`;
    for (const [id, email, role] of [
      ["owner-one", "owner@example.invalid", "Nolan"],
      ["owner-two", "owner-two@example.invalid", "Steve"],
    ])
      await action({
        action: "payee",
        value: {
          id,
          email,
          name: role,
          role,
          method: "check",
          reference: "Verified owner check",
          active: true,
        },
      });
    await action({
      action: "bank",
      value: {
        id: "deposit",
        accountId: "bank",
        date: today(),
        amount: 500,
        reference: "Square deposit proof",
        category: "Square settlement",
        reason: "Statement deposit",
        payeeId: "",
        teamId: "",
      },
    });
    await action({
      action: "match",
      bankId: "deposit",
      targetId: "settlement:production:payout-1",
      targetKind: "settlement",
    });
    await action({
      action: "settings",
      value: { ...settings, profit: 30000, reserve: 10000, tax: 0, restricted: 0 },
    });
    view = await financeWorkspace(sql, "owner");
    assert.deepEqual(view.summary.warnings, []);
    assert.equal(view.summary.distributable, 30000);
    await action({ action: "distribution", amount: 20001, due: today() });
    view = await financeWorkspace(sql, "owner");
    assert.deepEqual(
      view.summary.payables
        .filter((p) => p.category === "owner")
        .map((p) => p.amount)
        .sort((a, b) => a - b),
      [10000, 10001],
    );
    assert.equal(view.summary.profitAvailable, 9999);
    await assert.rejects(
      () =>
        mutateFinance(sql, "owner", {
          action: "distribution",
          amount: 10000,
          due: today(),
          revision: rev,
          reason: "Excess distribution test",
        }),
      /blocked/,
    );
  } finally {
    await db.close();
  }
});
