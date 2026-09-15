// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyState, seedState } from "./engine/04-seed.js";
import { playerFee, pendingAmendment } from "./engine/02-pricing.js";
import { applyAddEvent, eventEligible } from "./schedule.ts";
import { applyChat, submissionRoster } from "./field.ts";
import { applyRunAutomation } from "./ops.ts";
import { moneyCopyLeak } from "./money.ts";
import { alertsForRole, buildAlerts } from "./ops.ts";
import { inspectCoachScope, requestPlayer, requestTeam, scopeClub } from "./scope.ts";
import { TEAMS_CONTRAST_PAIRS, aaPass, contrastRatio } from "./polish.ts";
import { TODAY, addDays, iso } from "./engine/00-helpers.js";

function demoIdentity(state, role) {
  const fall = state.teams.find((t) => t.id === "t14f") ?? state.teams[0];
  if (role === "admin") {
    return { role, email: "nolanmccutcheon@icloud.com", familyId: null, playerId: null, teamId: null };
  }
  if (role === "coach") {
    return { role, email: fall.coachEmail, familyId: null, playerId: null, teamId: fall.id };
  }
  const player =
    fall.roster.find((p) => p.roleType === "full" && p.coachChild !== "head") ?? fall.roster[1] ?? fall.roster[0];
  if (role === "parent") {
    return {
      role,
      email: player?.parents?.[0]?.email ?? "",
      familyId: player?.familyId ?? null,
      playerId: player?.id ?? null,
      teamId: fall.id,
    };
  }
  return {
    role,
    email: player?.email ?? "",
    familyId: player?.familyId ?? null,
    playerId: player?.id ?? null,
    teamId: fall.id,
  };
}

describe("WCAG AA contrast on every Teams surface", () => {
  it("measures every pair", () => {
    const fails = [];
    for (const row of TEAMS_CONTRAST_PAIRS) {
      const ratio = contrastRatio(row.fg, row.bg);
      if (!aaPass(row.fg, row.bg, row.large)) fails.push(`${row.name}: ${ratio}:1`);
    }
    assert.deepEqual(fails, [], fails.join("; "));
  });
});

describe("Step 15 checks — data layer", () => {
  it("1. a player payload carries no dollar copy and no payment keys", () => {
    const raw = seedState();
    const identity = demoIdentity(raw, "player");
    const alerts = alertsForRole(raw, "player", identity);
    const scoped = scopeClub(raw, identity, alerts);
    const report = inspectCoachScope(scoped.state);
    assert.equal(report.paymentKeysFound.length, 0, report.paymentKeysFound.join(","));
    for (const alert of scoped.alerts) {
      assert.equal(moneyCopyLeak(`${alert.text} ${alert.action || ""}`), false, alert.text);
    }
    const blob = JSON.stringify({
      alerts: scoped.alerts,
      notes: scoped.state.notifications,
    });
    assert.equal(/\$/.test(blob), false, blob.slice(0, 400));
  });

  it("2. a coach payload deletes player payment fields instead of hiding them", () => {
    const raw = seedState();
    const identity = demoIdentity(raw, "coach");
    const scoped = scopeClub(raw, identity, []);
    const report = inspectCoachScope(scoped.state);
    assert.ok(report.players > 0);
    assert.equal(report.paymentKeysFound.length, 0, report.paymentKeysFound.join(","));
    const other = raw.teams.find((t) => t.id !== identity.teamId && t.coachEmail !== identity.email);
    if (other) {
      assert.equal(scoped.state.teams.some((t) => t.id === other.id), false);
    }
  });

  it("3. a signed fee does not move when a tournament is added — an amendment appears", () => {
    const club = seedState();
    const team = club.teams.find((t) => t.id === "t14f");
    const player = team.roster.find((p) => p.feeLock && p.agreement && !p.withdrawn);
    assert.ok(player);
    const signed = playerFee(club, team, player);
    const extra =
      club.catalog.find(
        (e) =>
          !(team.tournamentIds || []).includes(e.id) &&
          eventEligible(e, team) &&
          e.fee > 0,
      ) || {
        id: "ev-amend-test",
        org: "USSSA",
        name: "Amendment Open",
        city: "Tulsa",
        state: "OK",
        start: "2026-11-21",
        end: "2026-11-22",
        ages: ["14U"],
        levels: ["AA"],
        fee: 650,
        sport: "baseball",
        type: "tournament",
      };
    if (!club.catalog.some((e) => e.id === extra.id)) club.catalog.push(extra);
    team.eventBudget = Math.max(Number(team.eventBudget) || 0, 50000);
    const result = applyAddEvent(club, team.id, extra.id, "admin");
    assert.equal(result.ok, true, result.reason);
    assert.equal(playerFee(club, team, player), signed);
    assert.equal(player.feeLock.amount, signed);
    const amend = pendingAmendment(player) || (player.amendments || []).find((a) => a.status === "pending");
    assert.ok(amend);
  });

  it("4. a player missing a document cannot sit on a tournament submission roster", () => {
    const club = seedState();
    const team = club.teams.find((t) => t.id === "t14f");
    const missing = team.roster.find((p) => !p.withdrawn && !(p.docs && p.docs.waiver && p.docs.birthCert && p.docs.insurance && p.docs.physical));
    if (!missing) {
      team.roster[0].docs = { waiver: true, birthCert: false, insurance: true, physical: true };
    }
    const target = missing || team.roster[0];
    const sub = submissionRoster(team);
    assert.equal(sub.eligible.some((p) => p.id === target.id), false);
    assert.ok(sub.ineligible.some((row) => row.player.id === target.id));
  });

  it("rejects adult-to-player direct messages", () => {
    const club = seedState();
    const team = club.teams.find((t) => t.id === "t14f");
    const dm = applyChat(club, team.id, {
      author: "Ty Redmond",
      role: "coach",
      text: "You are batting leadoff.",
      toPlayerId: team.roster[0].id,
    });
    assert.equal(dm.ok, false);
    assert.equal(dm.reason, "dm");
  });

  it("a coach cannot fetch another team's roster by crafting the team id", () => {
    const raw = seedState();
    const identity = demoIdentity(raw, "coach");
    const other = raw.teams.find((t) => t.id !== identity.teamId && t.coachEmail !== identity.email);
    assert.ok(other);
    assert.equal(requestTeam(raw, identity, other.id), null);
    assert.ok(requestTeam(raw, identity, identity.teamId));
  });

  it("a parent cannot fetch another family's player by crafting the id", () => {
    const raw = seedState();
    const identity = demoIdentity(raw, "parent");
    const team = raw.teams.find((t) => t.id === identity.teamId);
    const foreign = team.roster.find((p) => p.familyId !== identity.familyId);
    assert.ok(foreign);
    assert.equal(requestPlayer(raw, identity, team.id, foreign.id), null);
    assert.ok(requestPlayer(raw, identity, identity.teamId, identity.playerId));
  });
});

describe("Automations queue in-app only", () => {
  it("run-now writes a notification that is not marked delivered", () => {
    const club = seedState();
    const ran = applyRunAutomation(club, "docChase", "admin");
    assert.equal(ran.ok, true);
    const note = club.notifications[0];
    assert.ok(note);
    assert.equal(note.delivered, false);
    assert.equal(/Sent by /i.test(note.body), false);
  });
});

describe("Alerts accept-when", () => {
  it("a clean club shows an empty queue; a past-due family shows first", () => {
    const clean = emptyState();
    clean.fieldCalls = [];
    assert.equal(buildAlerts(clean).length, 0);

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
    const club = {
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
        automations: {},
        messaging: { email: false, sms: false },
      },
      catalog: [
        {
          id: "ev-due",
          fee: 0,
          start: iso(addDays(TODAY, -50)),
          end: iso(addDays(TODAY, -48)),
          name: "Open",
          org: "USSSA",
          city: "Tulsa",
          state: "OK",
          ages: ["14U"],
          levels: ["AA"],
          sport: "baseball",
          type: "open",
        },
      ],
      uniforms: [{ id: "u", price: 0 }],
      teams: [
        {
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
        },
      ],
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
    const queue = buildAlerts(club);
    const money = queue.filter((a) => a.kind === "Money");
    assert.ok(money.length > 0);
    assert.match(money[0].text, /past due/i);
  });
});
