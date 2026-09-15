import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyState, seedState } from "./04-seed.js";
import { roundTo } from "./00-helpers.js";
import {
  creditTotal,
  lockFee,
  lockPlan,
  playerBalance,
  playerFee,
  priceTeam,
} from "./02-pricing.js";
import { attention, missingDocs, perms } from "./03-domain.js";

describe("Team OS seed", () => {
  const state = seedState();

  it("loads six uneven teams", () => {
    assert.equal(state.teams.length, 6);
    assert.ok(state.teams.some((t) => t.seasonLabel.includes("Fall")));
    assert.ok(state.teams.some((t) => t.record.w === 0));
    assert.ok(state.teams.some((t) => t.roster.length < 12));
  });

  it("has a sibling pair, unsigned player, pitcher-only, and coach child", () => {
    const a = state.teams[0].roster[3];
    const b = state.teams[1].roster[3];
    assert.equal(a.familyId, b.familyId);
    assert.ok(state.teams[0].roster.some((p) => !p.agreement));
    assert.ok(state.teams.some((t) => t.roster.some((p) => p.roleType === "po")));
    assert.ok(state.teams[0].roster.some((p) => p.coachChild === "head"));
  });

  it("prices a team without throwing", () => {
    const team = state.teams[0];
    const priced = priceTeam(state, team);
    assert.ok(priced.published > 0);
    assert.equal(priced.evs.length, 4);
    const player = team.roster[0];
    const fee = playerFee(state, team, player);
    assert.equal(fee, player.feeLock.amount);
    assert.ok(playerBalance(state, team, player) >= 0);
  });

  it("hides team money from parents and players", () => {
    assert.equal(perms("player").seeTeamMoney, false);
    assert.equal(perms("parent").seeTeamMoney, false);
    assert.equal(perms("coach").seeTeamMoney, false);
    assert.equal(perms("admin").seeTeamMoney, true);
    assert.equal(perms("player").seeOwnMoney, false);
  });

  it("flags missing documents and attention items", () => {
    const missing = state.teams[0].roster.filter((p) => missingDocs(p).length > 0);
    assert.ok(missing.length > 0);
    assert.ok(attention(state).length > 0);
  });

  it("empty club has no teams", () => {
    assert.equal(emptyState().teams.length, 0);
    assert.equal(emptyState()._demo, false);
  });
});

function mkPlayer(i, extra = {}) {
  return {
    id: `p-${i}`,
    roleType: "full",
    uniformWaived: false,
    joinedOn: null,
    withdrawn: null,
    feeLock: null,
    credits: [],
    payments: [],
    amendments: [],
    coachChild: null,
    planType: "monthly",
    depositPaid: false,
    agreement: null,
    ...extra,
  };
}

function handCheckedClub(roster = []) {
  const team = {
    id: "t-hand",
    seasonStart: "2026-09-01",
    seasonEnd: "2026-11-30",
    coachMonthly: 1500,
    orgFee: 600,
    uniformPackageId: "u-her-bb",
    tournamentIds: ["ev-entry"],
    otherCosts: { insurance: 300, balls: 250, fields: 500, admin: 250 },
    roster,
    sponsors: [],
    closed: null,
    actuals: null,
    staff: [],
  };
  const state = {
    settings: {
      contingencyPct: 15,
      membershipMonthly: 200,
      facilityPerTeamMonth: 500,
      fundingPlayers: 10,
      orgFeeMin: 300,
      orgFeeMax: 750,
      roundStep: 25,
      paidInFullWeeks: 6,
      poTeamCostPct: 70,
    },
    catalog: [
      {
        id: "ev-entry",
        fee: 2000,
        start: "2026-09-26",
        end: "2026-09-27",
        name: "Hand-check Open",
      },
    ],
    uniforms: [
      {
        id: "u-her-bb",
        name: "Heritage Classic — Baseball",
        sport: "baseball",
        price: 325,
      },
    ],
    teams: [team],
  };
  return { state, team };
}

describe("Pricing engine", () => {
  it("publishes the hand-checked 3-month fee, rounded up to $25", () => {
    // Hand check (rounded UP to nearest $25):
    //   entry 2000 + insurance 300 + balls 250 + fields 500 + admin 250 = 3300
    //   protected = 3300 × 1.15 = 3795
    //   team / 10 funding players = 379.50
    //   coach $1,500 × 3 months / 10 = 450
    //   membership $200 × 3 = 600
    //   org fee 600
    //   uniform 325
    //   raw = 379.50 + 450 + 600 + 600 + 325 = 2354.50
    //   ceil to $25 → 2375
    assert.equal(roundTo(2354.5, 25), 2375);
    assert.equal(roundTo(2350, 25), 2350);

    const { state, team } = handCheckedClub(Array.from({ length: 10 }, (_, i) => mkPlayer(i)));
    const priced = priceTeam(state, team);
    assert.equal(priced.months, 3);
    assert.equal(priced.entryFees, 2000);
    assert.equal(priced.other, 1300);
    assert.equal(priced.direct, 3300);
    assert.equal(priced.protectedBudget, 3795);
    assert.equal(priced.perPlayerTeam, 379.5);
    assert.equal(priced.coachPerPlayer, 450);
    assert.equal(priced.membershipPerPlayer, 600);
    assert.equal(priced.orgFee, 600);
    assert.equal(priced.uniformCost, 325);
    assert.equal(priced.raw, 2354.5);
    assert.equal(priced.published, 2375);
  });

  it("adds two extra players at twice published-minus-uniform margin", () => {
    const ten = Array.from({ length: 10 }, (_, i) => mkPlayer(i));
    const twelve = Array.from({ length: 12 }, (_, i) => mkPlayer(i));
    const a = handCheckedClub(ten);
    const b = handCheckedClub(twelve);
    const p10 = priceTeam(a.state, a.team);
    const p12 = priceTeam(b.state, b.team);
    assert.equal(p10.published, p12.published);
    assert.equal(p12.roster, 12);
    assert.equal(
      p12.margin - p10.margin,
      2 * (p10.published - p10.uniformCost),
    );
  });

  it("charges pitcher-only 70% of the team component and 100% of the program fee", () => {
    const { state, team } = handCheckedClub([mkPlayer(0)]);
    const priced = priceTeam(state, team);
    const po = mkPlayer(7, { roleType: "po" });
    const full = mkPlayer(1, { roleType: "full" });
    const poLock = lockFee(state, team, po, 1);
    const fullLock = lockFee(state, team, full, 1);
    assert.equal(poLock.components.team, Math.round(priced.perPlayerTeam * 0.7));
    assert.equal(poLock.components.program, Math.round(priced.orgFee));
    assert.equal(fullLock.components.program, poLock.components.program);
    assert.equal(fullLock.components.team, Math.round(priced.perPlayerTeam));
    assert.ok(poLock.amount < fullLock.amount);
  });

  it("applies a credit to the balance and never the signed fee", () => {
    const { state, team } = handCheckedClub([]);
    const player = mkPlayer(2);
    player.feeLock = lockFee(state, team, player, 1);
    player.planLock = lockPlan(state, team, player);
    const signed = playerFee(state, team, player);
    const dueBefore = playerBalance(state, team, player);
    assert.equal(signed, player.feeLock.amount);
    assert.equal(dueBefore, signed);

    player.credits = [
      { id: "c1", type: "scholarship", amount: 250, note: "Need-based credit" },
    ];
    assert.equal(creditTotal(player), 250);
    assert.equal(playerFee(state, team, player), signed);
    assert.equal(playerFee(state, team, player), player.feeLock.amount);
    assert.equal(playerBalance(state, team, player), signed - 250);
    assert.equal(player.feeLock.amount, signed);
  });
});
