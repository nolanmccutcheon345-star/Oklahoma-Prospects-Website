import assert from "node:assert/strict";
import test from "node:test";
import { assertRecordableTeamPayment, remainingTeamPaymentCents } from "./recorded-payment-policy";

const player = (fee: number | null, payments: number[] = [], credits: number[] = []) => ({
  feeLock: fee === null ? null : { amount: fee, lockedAt: "2026-10-08", policyVersion: "1", components: {} },
  payments: payments.map((amount) => ({
    amount, date: "2026-10-08", fee: 0, charged: amount,
    method: "ach", label: "Recorded payment", receipt: "R-test",
  })),
  credits: credits.map((amount) => ({ label: "Applied credit", amount })),
});

test("manual team payments account for both prior payments and fee credits", () => {
  const p = player(2400, [1000, 200], [250]);
  assert.equal(remainingTeamPaymentCents(p), 95000);
  assert.equal(assertRecordableTeamPayment(p, 950), 95000);
  assert.throws(() => assertRecordableTeamPayment(p, 950.01), /exceeds the outstanding balance/);
});

test("a fully paid or fully credited athlete cannot accumulate another payment", () => {
  assert.equal(remainingTeamPaymentCents(player(100, [100])), 0);
  assert.throws(() => assertRecordableTeamPayment(player(100, [100]), 1), /No balance remains/);
  assert.equal(remainingTeamPaymentCents(player(200, [100], [100])), 0);
  assert.throws(() => assertRecordableTeamPayment(player(200, [], [300]), 1), /No balance remains/);
});

test("an absent signed fee and sub-cent or invalid inputs fail closed", () => {
  assert.throws(() => assertRecordableTeamPayment(player(null), 1), /signed, positive/);
  assert.throws(() => assertRecordableTeamPayment(player(0), 1), /signed, positive/);
  assert.throws(() => assertRecordableTeamPayment(player(100), 0.001), /dollars and cents/);
  assert.throws(() => assertRecordableTeamPayment(player(100), 0.0000000001), /at least one cent/);
  assert.equal(assertRecordableTeamPayment(player(0.01), 0.01), 1);
  assert.throws(() => assertRecordableTeamPayment(player(100), Infinity), /greater than zero/);
  assert.throws(() => remainingTeamPaymentCents(player(100, [-1])), /Invalid past payment/);
  assert.throws(() => remainingTeamPaymentCents(player(100, [], [-1])), /Invalid credit/);
});
