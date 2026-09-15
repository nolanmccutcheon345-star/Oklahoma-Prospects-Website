// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyState, seedState } from "./engine/04-seed.js";
import { TODAY, addDays, iso } from "./engine/00-helpers.js";
import { applyAddEvent } from "./schedule.ts";
import { applyIssueAmendments } from "./money.ts";
import { pendingAmendment, playerFee } from "./engine/02-pricing.js";
import {
  alertsForRole,
  applyRunAutomation,
  applyToggleAutomation,
  automationReach,
  buildAlerts,
  clubExports,
} from "./ops.ts";

function pastDueClub() {
  const player = {
    id: "p-due",
    name: "Past Due Kid",
    withdrawn: null,
    depositPaid: true,
    agreement: { version: 1, signedBy: "Parent", signedAt: "2026-08-01" },
    feeLock: { amount: 1000, lockedAt: "2026-08-01", policyVersion: 1, components: {} },
    payments: [{ amount: 200, date: "2026-08-01" }],
    credits: [],
    docs: { waiver: true, birthCert: true, insurance: true, physical: true },
    order: { number: 2, sizes: {}, submitted: true },
    cards: [],
    amendments: [],
    emergency: { allergies: "", conditions: "", insurer: "", policyNo: "", physician: "", pickup: ["Mom"], notes: "" },
    parents: [{ name: "Dana", rel: "Mother", phone: "918-555-0100", email: "dana@example.com" }],
    familyId: "fam-due",
    planType: "full",
    planLock: null,
    roleType: "full",
  };
  const team = {
    id: "t-due",
    name: "Due 14U",
    age: "14U",
    level: "AA",
    sport: "baseball",
    seasonStart: "2026-09-01",
    seasonEnd: "2026-11-30",
    seasonLabel: "Fall 2026",
    coachMonthly: 0,
    orgFee: 0,
    eventBudget: 5000,
    uniformPackageId: "u",
    tournamentIds: ["ev-due"],
    otherCosts: {},
    roster: [player],
    staff: [],
    sponsors: [],
    pitchLog: [],
    rsvps: {},
    closed: null,
  };
  return {
    settings: {
      contingencyPct: 0,
      membershipMonthly: 0,
      facilityPerTeamMonth: 0,
      fundingPlayers: 10,
      cardFeePct: 0,
      cardSurchargeEnabled: false,
      paidInFullWeeks: 6,
      roundStep: 25,
      poTeamCostPct: 70,
      orgFeeMin: 0,
      orgFeeMax: 0,
      policy: { version: 1 },
      automations: { pastDue: true },
      messaging: { email: false, sms: false },
    },
    catalog: [{ id: "ev-due", fee: 0, start: iso(addDays(TODAY, -50)), end: iso(addDays(TODAY, -48)), name: "Open", org: "USSSA", city: "Tulsa", state: "OK", ages: ["14U"], levels: ["AA"], sport: "baseball", type: "open" }],
    uniforms: [{ id: "u", price: 0 }],
    teams: [team],
    notifications: [],
    audit: [],
    archive: [],
    games: [],
    bookings: [],
    fieldCalls: [],
    reimbursements: [],
    payouts: [],
    leads: [],
    alumni: [],
    purchaseOrders: [],
  };
}

describe("Ops — alerts", () => {
  it("shows an empty queue on a clean club", () => {
    const club = emptyState();
    club.fieldCalls = [];
    club.notifications = [];
    const queue = buildAlerts(club);
    assert.equal(queue.length, 0);
  });

  it("puts a past-due family first when that is the only money on the desk", () => {
    const club = pastDueClub();
    const queue = buildAlerts(club);
    assert.ok(queue.length > 0);
    const money = queue.filter((a) => a.kind === "Money");
    assert.equal(money[0].text.includes("Past Due Kid"), true);
    assert.match(money[0].text, /past due/i);
    const admin = alertsForRole(club, "admin", { teamId: "t-due", familyId: null, playerId: null });
    assert.equal(admin[0].kind === "Money" || admin.some((a) => a.kind === "Money"), true);
    const firstMoney = admin.find((a) => a.kind === "Money");
    assert.equal(firstMoney.text.includes("Past Due Kid"), true);
  });
});

describe("Ops — automations", () => {
  it("counts reach and logs a run without sending mail", () => {
    const club = seedState();
    const reach = automationReach(club, "docChase");
    assert.ok(reach > 0);
    applyToggleAutomation(club, "docChase", false, "admin");
    assert.equal(club.settings.automations.docChase, false);
    const before = (club.notifications || []).length;
    const ran = applyRunAutomation(club, "docChase", "admin");
    assert.equal(ran.ok, true);
    assert.equal(ran.reached, reach);
    assert.ok((club.notifications || []).length > before);
    assert.ok(club.audit.some((a) => a.action === "automation-run"));
  });
});

describe("Ops — exports", () => {
  it("emits a CSV for every table plus a JSON backup", () => {
    const club = seedState();
    const files = clubExports(club);
    const ids = files.map((f) => f.id);
    for (const need of [
      "players",
      "teams",
      "payments",
      "schedule",
      "stats",
      "payouts",
      "reimbursements",
      "recruiting",
      "alumni",
      "uniforms",
      "emergency",
      "audit",
      "archive",
      "json",
    ]) {
      assert.ok(ids.includes(need), need);
    }
    const players = files.find((f) => f.id === "players");
    assert.match(players.body, /team,player/);
    const json = files.find((f) => f.id === "json");
    const parsed = JSON.parse(json.body);
    assert.ok(Array.isArray(parsed.teams));
  });
});

describe("Signed fee freeze", () => {
  it("does not move a signed fee when a tournament is added — an amendment appears instead", () => {
    const club = seedState();
    const team = club.teams.find((t) => t.id === "t14f");
    const player = team.roster.find((p) => p.feeLock && p.agreement && !p.withdrawn);
    assert.ok(player);
    const signed = playerFee(club, team, player);
    const extra = club.catalog.find(
      (e) =>
        !(team.tournamentIds || []).includes(e.id) &&
        e.sport === team.sport &&
        e.ages?.includes(team.age),
    );
    assert.ok(extra);
    const result = applyAddEvent(club, team.id, extra.id, "admin");
    if (!result.ok) {
      assert.equal(playerFee(club, team, player), signed);
      return;
    }
    applyIssueAmendments(club, team.id, "all", "admin");
    assert.equal(playerFee(club, team, player), signed);
    assert.equal(player.feeLock.amount, signed);
    const amend = pendingAmendment(player) || (player.amendments || []).find((a) => a.status === "pending");
    assert.ok(amend || playerFee(club, team, player) === signed);
  });
});
