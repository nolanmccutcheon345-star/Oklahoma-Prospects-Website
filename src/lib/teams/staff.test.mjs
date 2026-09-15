// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedState } from "./engine/04-seed.js";
import { COACH_CREDIT, playerBalance, staffSeasonPay } from "./engine/02-pricing.js";
import {
  applyElectPay,
  applyRecordPayout,
  divertCap,
  electionOf,
  flags1099,
  isReportable,
  payrollRows,
} from "./staff.ts";

function club() {
  const state = seedState();
  const team = state.teams.find((t) => t.id === "t14f") || state.teams[0];
  const head = team.staff.find((m) => m.role === "Head coach");
  const kid = team.roster.find((p) => p.coachChild === "head") || team.roster[0];
  head.childId = kid.id;
  head.applyAmount = 0;
  return { state, team, head, kid };
}

describe("Staff pay election", () => {
  it("shows the same gross whether pay is applied to fees or taken as cash", () => {
    const { state, team, head } = club();
    const cashFirst = payrollRows(state, team).find((r) => r.member.id === head.id);
    assert.ok(cashFirst.gross > 0);
    assert.equal(cashFirst.gross, staffSeasonPay(team, head));
    assert.equal(cashFirst.applied, 0);
    assert.equal(cashFirst.cash, cashFirst.gross);

    const cap = divertCap(state, team, head);
    assert.ok(cap > 0);
    applyElectPay(state, team.id, head.id, cap, "admin");
    const applied = payrollRows(state, team).find((r) => r.member.id === head.id);
    assert.equal(applied.gross, cashFirst.gross);
    assert.equal(applied.applied, cap);
    assert.equal(applied.cash, cashFirst.gross - cap);

    applyElectPay(state, team.id, head.id, 0, "admin");
    const back = payrollRows(state, team).find((r) => r.member.id === head.id);
    assert.equal(back.gross, cashFirst.gross);
    assert.equal(back.cash, cashFirst.gross);
  });

  it("never credits more than the child owes and always attaches a reason", () => {
    const { state, team, head, kid } = club();
    const owed = divertCap(state, team, head);
    applyElectPay(state, team.id, head.id, 9_999_999, "admin");
    assert.equal(head.applyAmount, owed);
    const credit = (kid.credits || []).find((c) => c.note === COACH_CREDIT);
    assert.ok(credit);
    assert.equal(credit.amount, owed);
    assert.equal(credit.note, COACH_CREDIT);
    assert.equal(credit.type, "coach pay");
    assert.equal(playerBalance(state, team, kid), 0);
    const again = electionOf(state, team, head, 50);
    assert.ok(again.applied <= again.cap);
  });

  it("blocks a cash payout when the W-9 is missing", () => {
    const { state, team, head } = club();
    head.w9 = false;
    const blocked = applyRecordPayout(state, team.id, head.id, 100, "admin");
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "w9");
    head.w9 = true;
    const paid = applyRecordPayout(state, team.id, head.id, 100, "admin");
    assert.equal(paid.ok, true);
  });

  it("flags reimbursements without a receipt as reportable pay", () => {
    assert.equal(isReportable({ receipt: true, purpose: "Hotel for Route 66" }), false);
    assert.equal(isReportable({ receipt: false, purpose: "Hotel for Route 66" }), true);
    assert.equal(isReportable({ receipt: true, purpose: "" }), true);
    assert.equal(isReportable({ receipt: false, purpose: "" }), true);
  });

  it("flags anyone over the 1099-NEC threshold", () => {
    const { state } = club();
    assert.equal(flags1099(600, state), true);
    assert.equal(flags1099(599, state), false);
    assert.equal(flags1099(3300, state), true);
  });
});
