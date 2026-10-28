import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { enrollmentFixture, prepareOrganization } from "../enrollment/test-fixture";
import { enrollmentFinance } from "../enrollment/financial.server";
import { enrollmentCase } from "../enrollment/enrollment.server";
import {
  withFinancialContext,
  recordFinancialTeamPaymentInTransaction,
  reviewFinancialOfflinePaymentInTransaction,
} from "../finance/context.server";

test("offline receipts require owner evidence, deduplicate submissions and revoke clearance after recorded returns", async () => {
  const { db, sql, club } = await enrollmentFixture();
  try {
    await prepareOrganization(sql);
    const ids = { teamId: "base", playerId: "base-player" };
    const p = club.teams[0].roster[0];
    p.feeLock = {
      amount: 1000,
      lockedAt: "2026-10-24T10:00:00.000Z",
      policyVersion: "signed-original",
      components: {},
    };
    p.planLock = {
      dep: 700,
      deadline: "2027-01-01",
      planType: "split",
      rows: [
        { date: "2027-01-01", amount: 700 },
        { date: "2027-02-01", amount: 300 },
      ],
    };
    p.agreement = {
      signedBy: "Synthetic guardian",
      signedAt: p.feeLock.lockedAt,
      version: "signed-original",
    };
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb`;
    const c = await enrollmentCase(sql, "guardian", ids);
    const data = {
      ...ids,
      amount: 700,
      method: "Cash",
      label: "Synthetic settled receipt",
      requestId: randomUUID(),
      verifiedReceived: true as const,
    };
    const record = (actor: string, change = data) =>
      withFinancialContext(sql, actor, "owner", (tx, context) =>
        recordFinancialTeamPaymentInTransaction(tx, context, change),
      );
    for (const actor of ["guardian", "coach", "coordinator", "fake", "stranger"])
      await assert.rejects(record(actor));
    const first = await record("owner");
    assert.equal((await record("owner")).receipt, first.receipt);
    await assert.rejects(record("owner", { ...data, amount: 701 }), /request changed/);
    let finance = await enrollmentFinance(sql, "guardian", ids);
    assert.equal(finance.verifiedCents, 0);
    assert.equal(finance.offlineVerifiedCents, 70000);
    assert.equal(finance.depositSatisfied, true);
    const review = (action: "verify" | "revoke" | "reverse", remainingAmount?: number) =>
      withFinancialContext(sql, "owner", "owner", (tx, context) =>
        reviewFinancialOfflinePaymentInTransaction(tx, context, {
          ...ids,
          receipt: first.receipt,
          action,
          reason: "Synthetic documented receipt review",
          remainingAmount,
        }),
      );
    await sql`update enrollment_cases set cleared_at=now(),cleared_by='owner' where id=${c.summary.id}`;
    await review("revoke");
    assert.equal((await enrollmentFinance(sql, "guardian", ids)).depositSatisfied, false);
    assert.equal(
      (
        await sql<{
          cleared_at: Date | null;
        }>`select cleared_at from enrollment_cases where id=${c.summary.id}`
      )[0].cleared_at,
      null,
    );
    await review("verify");
    assert.equal((await enrollmentFinance(sql, "guardian", ids)).depositSatisfied, true);
    await review("reverse", 500);
    finance = await enrollmentFinance(sql, "guardian", ids);
    assert.equal(finance.offlineVerifiedCents, 50000);
    assert.equal(finance.depositSatisfied, false);
    await assert.rejects(review("reverse", 501), /smaller net/);
    await assert.rejects(review("reverse", 0.001), /dollars and cents/);
    await review("reverse", 0);
    assert.equal((await enrollmentFinance(sql, "guardian", ids)).offlineVerifiedCents, 0);
    const saved = (await sql<{ payload: typeof club }>`select payload from club_state`)[0].payload
      .teams[0].roster[0];
    assert.equal(saved.payments.length, 1);
    assert.equal(saved.payments[0].amount, 0);
    assert.equal(saved.payments[0].charged, 700);
    assert.deepEqual(saved.feeLock, p.feeLock);
    assert.deepEqual(saved.planLock, p.planLock);
    assert.equal(
      (await sql`select id from finance_audit where action='Manual team payment'`).length,
      1,
    );
    await assert.rejects(sql`delete from finance_audit`, /append|immutable/i);
  } finally {
    await db.close();
  }
});

test("a historical manual ledger entry is not silently promoted to verified funds", async () => {
  const { db, sql, club } = await enrollmentFixture();
  try {
    const ids = { teamId: "base", playerId: "base-player" };
    const p = club.teams[0].roster[0];
    p.feeLock = {
      amount: 1000,
      lockedAt: "2026-10-24",
      policyVersion: "historical",
      components: {},
    };
    p.planLock = { dep: 700, deadline: "2027-01-01", planType: "split", rows: [] };
    p.agreement = { version: "historical", signedBy: "Guardian", signedAt: "2026-10-24" };
    p.payments = [
      {
        date: "2026-10-24",
        amount: 700,
        charged: 700,
        fee: 0,
        method: "Check",
        receipt: "old-receipt",
        label: "Old check",
      },
    ];
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb`;
    assert.equal((await enrollmentFinance(sql, "guardian", ids)).offlineVerifiedCents, 0);
    await withFinancialContext(sql, "owner", "owner", (tx, context) =>
      reviewFinancialOfflinePaymentInTransaction(tx, context, {
        ...ids,
        receipt: "old-receipt",
        action: "verify",
        reason: "Cleared bank deposit reviewed",
      }),
    );
    assert.equal((await enrollmentFinance(sql, "guardian", ids)).offlineVerifiedCents, 70000);
    p.feeLock.lockedAt = "2026-10-25";
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb`;
    assert.equal((await enrollmentFinance(sql, "guardian", ids)).offlineVerifiedCents, 0);
  } finally {
    await db.close();
  }
});
