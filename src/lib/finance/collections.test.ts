import test from "node:test";
import assert from "node:assert/strict";
import { collectionTotals, type Collection } from "./collections";
import { financeSummary } from "./model";
test("rental, merchandise and team collections separate refunds, missing fees and test transactions", () => {
  const completed = { status: "COMPLETED", environment: "production" };
  const payments: Collection[] = [
    {
      ...completed,
      category: "cage-rental",
      amount_cents: 5000,
      refunded_cents: 1000,
      processingFee: 175,
    },
    {
      ...completed,
      category: "merchandise",
      amount_cents: 10000,
      refunded_cents: 10000,
      processingFee: 320,
    },
    { ...completed, category: "team-fee", amount_cents: 30000, processingFee: null },
    { ...completed, environment: "sandbox", amount_cents: 999999 },
    { ...completed, status: "PENDING", amount_cents: 888888 },
  ];
  const s = collectionTotals(payments);
  assert.equal(s.gross, 45000);
  assert.equal(s.refunds, 11000);
  assert.equal(s.afterRefunds, 34000);
  assert.equal(s.knownFees, 495);
  assert.equal(s.missingFees, 1);
  assert.equal(s.afterFees, null);
  assert.equal(s.rows.find((r) => r.category === "merchandise")?.afterFees, -320);
  payments[2].processingFee = 900;
  assert.equal(collectionTotals(payments).afterFees, 32605);
});
test("bank balances and invoice receipts respect the reporting date and never inflate provider revenue", () => {
  const records = [
    {
      id: "account",
      kind: "account",
      payload: { id: "account", active: true, opening: 10000, openingDate: "2027-01-01" },
    },
    {
      id: "past",
      kind: "bank",
      payload: {
        id: "past",
        accountId: "account",
        amount: 2000,
        verified: true,
        date: "2027-01-02",
        match: "invoice:customer",
      },
    },
    {
      id: "future",
      kind: "bank",
      payload: {
        id: "future",
        accountId: "account",
        amount: 3000,
        verified: true,
        date: "2027-02-01",
        match: "invoice:customer",
      },
    },
    {
      id: "customer",
      kind: "invoice",
      payload: { id: "customer", amount: 10000, due: "2027-02-01" },
    },
  ];
  const settings = {
    profit: 0,
    reserve: 0,
    tax: 0,
    restricted: 0,
    nolanBps: 5000,
    reviewedThrough: "",
    reviewNote: "",
    cadence: "manual" as const,
  };
  const sources = {
    teams: [],
    warnings: [],
    refunds: [],
    payments: [],
    receivables: [],
    candidates: [],
  };
  const s = financeSummary(records, settings, sources, "2027-01-15");
  assert.equal(s.cash, 12000);
  assert.equal(s.receivables[0].paid, 2000);
  assert.equal(s.outstanding, 8000);
  assert.equal(s.squareReceived, 0);
  assert.equal(financeSummary(records, settings, sources, "2026-12-31").cash, 0);
});
