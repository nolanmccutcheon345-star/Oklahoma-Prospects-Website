import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAcceptAmendment,
  applyCloseSeason,
  applyEnrollDraft,
  applyIssueAmendments,
  applyPay,
  cashFlowForTeam,
  chargeOf,
  moneyCopyLeak,
  recruitingOnePager,
} from "./money.ts";
import { feeDrift, playerFee, priceTeam } from "./engine/02-pricing.js";

function sheetClub() {
  const player = {
    id: "p1",
    name: "Sheet Player",
    roleType: "full",
    withdrawn: null,
    uniformWaived: false,
    coachChild: null,
    depositPaid: true,
    joinedOn: "2026-09-01",
    planType: "full",
    feeLock: { amount: 1000, lockedAt: "2026-09-01", policyVersion: 1, components: {} },
    credits: [],
    payments: [{ amount: 250, date: "2026-09-01", label: "Roster deposit" }],
    agreement: { version: 1, signedBy: "Parent", signedAt: "2026-09-01" },
    cards: [
      { id: "c1", brand: "Visa", last4: "4242", exp: "09/29", primary: true },
      { id: "c2", brand: "Visa", last4: "1111", exp: "09/28", primary: false },
    ],
    amendments: [],
    docs: {},
    order: { number: 2, sizes: {}, submitted: true },
    parents: [],
    publicProfile: { enabled: false, bio: "", video: [], slug: "" },
  };
  const team = {
    id: "t-sheet",
    name: "Sheet 14U",
    age: "14U",
    level: "AA",
    sport: "baseball",
    seasonStart: "2026-09-01",
    seasonEnd: "2026-11-30",
    seasonLabel: "Fall 2026",
    coachMonthly: 1500,
    orgFee: 600,
    eventBudget: 2000,
    uniformPackageId: "u",
    uniformDeadline: "2026-09-15",
    tournamentIds: ["ev1"],
    otherCosts: {},
    roster: [player],
    sponsors: [],
    staff: [],
    closed: null,
    actuals: null,
    coachEmail: "coach@example.com",
  };
  const club = {
    settings: {
      contingencyPct: 15,
      membershipMonthly: 200,
      facilityPerTeamMonth: 500,
      fundingPlayers: 10,
      cardFeePct: 3,
      cardSurchargeEnabled: true,
      paidInFullWeeks: 6,
      roundStep: 25,
      poTeamCostPct: 70,
      orgFeeMin: 300,
      orgFeeMax: 750,
      policy: { version: 1 },
      messaging: { email: false, sms: false },
    },
    catalog: [
      { id: "ev1", fee: 2000, start: "2026-12-15", end: "2026-12-16", name: "Open" },
    ],
    uniforms: [{ id: "u", price: 325 }],
    teams: [team],
    notifications: [],
    audit: [],
    archive: [],
    games: [],
    bookings: [],
    fieldCalls: [],
    reimbursements: [],
  };
  return { club, team, player };
}

describe("Family money", () => {
  it("uses the same posted amount for card and bank payments", () => {
    const { club } = sheetClub();
    const card = chargeOf(club, 1000, "card");
    assert.equal(card.amount, 1000);
    assert.equal(card.fee, 0);
    assert.equal(card.totalCharged, 1000);
    const ach = chargeOf(club, 1000, "ach");
    assert.equal(ach.fee, 0);
    assert.equal(ach.totalCharged, 1000);
  });

  it("does not move a signed fee until the family accepts the amendment", () => {
    const { club, team, player } = sheetClub();
    team.otherCosts = { fields: 400 };
    const drift = Number(feeDrift(club, team, player)) || 0;
    assert.ok(drift !== 0);
    const signed = playerFee(club, team, player);
    assert.equal(signed, 1000);
    applyIssueAmendments(club, team.id, "all", "admin");
    assert.equal(playerFee(club, team, player), 1000);
    assert.equal(player.amendments[0].status, "pending");
    applyAcceptAmendment(club, team.id, player.id, "parent");
    assert.equal(player.amendments[0].status, "accepted");
    assert.equal(playerFee(club, team, player), player.feeLock.amount);
    assert.ok(player.feeLock.amount !== signed);
  });

  it("blocks monthly auto-draft without a backup card", () => {
    const { club, team, player } = sheetClub();
    player.cards = [player.cards[0]];
    const blocked = applyEnrollDraft(club, team.id, player.id, "parent");
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "backup");
    player.cards.push({ id: "c2", brand: "Visa", last4: "1111", exp: "09/28", primary: false });
    const ok = applyEnrollDraft(club, team.id, player.id, "parent");
    assert.equal(ok.ok, true);
    assert.equal(player.draftEnrolled, true);
  });

  it("keeps family contact off the recruiting one-pager", () => {
    const { team, player } = sheetClub();
    player.parents = [{ name: "Dana", rel: "Mother", phone: "918-555-0100", email: "dana@example.com" }];
    player.email = "kid@example.com";
    const page = recruitingOnePager(player, team);
    assert.equal(/918-555|dana@|kid@|Mother/.test(page), false);
    assert.match(page, /Sheet Player/);
  });
});

describe("Admin money", () => {
  it("matches the hand-built cash-flow spreadsheet and names the short month", () => {
    // Hand-built spreadsheet for Sheet 14U, starting September 2026:
    //   Inflow: $250 deposit in Sep, $750 remaining (pay-in-full) in Oct.
    //   Outflow:
    //     Staff $1,500 and facility $500 in Sep, Oct, Nov (season months).
    //     Uniform $325 in September.
    //     Entry $2,000 in December (event 2026-12-15).
    //   Sep  in 250  out 1500+500+325=2325  run -2075
    //   Oct  in 750  out 1500+500=2000      run -3325
    //   Nov  in 0    out 1500+500=2000      run -5325
    //   Dec  in 0    out 2000               run -7325
    const { club, team } = sheetClub();
    const flow = cashFlowForTeam(club, team, "2026-09");
    const by = Object.fromEntries(flow.months.map((m) => [m.month, m]));
    assert.equal(by["2026-09"].inflow, 250);
    assert.equal(by["2026-09"].outflow, 2325);
    assert.equal(by["2026-09"].running, -2075);
    assert.equal(by["2026-10"].inflow, 750);
    assert.equal(by["2026-10"].outflow, 2000);
    assert.equal(by["2026-10"].running, -3325);
    assert.equal(by["2026-11"].running, -5325);
    assert.equal(by["2026-12"].entry, 2000);
    assert.equal(by["2026-12"].running, -7325);
    assert.equal(flow.low.month, "2026-12");
    assert.equal(flow.low.balance, -7325);
    assert.match(flow.low.label, /December/);
  });

  it("moves margin from forecast to realized when the season closes", () => {
    const { club, team } = sheetClub();
    const before = priceTeam(club, team);
    assert.equal(before.realizedMargin, null);
    assert.equal(team.closed, null);
    const actuals = { entries: 2000, coach: 4500, facility: 1500, uniforms: 325 };
    const spend = 2000 + 4500 + 1500 + 325;
    const result = applyCloseSeason(club, team.id, actuals, "admin");
    assert.equal(result.ok, true);
    const after = priceTeam(club, team);
    assert.ok(team.closed);
    assert.equal(after.realizedMargin, result.realized);
    assert.equal(result.realized, before.revenue + before.sponsorIncome - before.creditsGiven - spend);
    assert.notEqual(after.realizedMargin, after.forecastMargin);
  });

  it("applies a card payment to the balance by amount, not by total charged", () => {
    const { club, team, player } = sheetClub();
    const due = 750;
    const made = applyPay(club, {
      teamId: team.id,
      playerId: player.id,
      amount: due,
      method: "card",
      actor: "parent",
    });
    assert.equal(made.ok, true);
    assert.equal(made.charge.fee, 0);
    assert.equal(made.charge.totalCharged, due + made.charge.fee);
    const last = player.payments.at(-1);
    assert.equal(last.amount, due);
    assert.equal(last.fee, made.charge.fee);
    assert.equal(last.totalCharged, made.charge.totalCharged);
  });
});

describe("Player money leak", () => {
  it("does not treat schedule copy with a budget percent as player-safe", () => {
    assert.equal(moneyCopyLeak("42% of budget"), true);
    assert.equal(moneyCopyLeak("$1,200"), true);
    assert.equal(moneyCopyLeak("Field 1 at 5:00 PM"), false);
    assert.equal(moneyCopyLeak("AVG .312"), false);
  });
});
