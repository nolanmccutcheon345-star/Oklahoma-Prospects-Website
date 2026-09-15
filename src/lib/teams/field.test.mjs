// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedState } from "./engine/04-seed.js";
import { attention, restDays, visibleNotes } from "./engine/03-domain.js";
import { iso, addDays, TODAY } from "./engine/00-helpers.js";
import {
  applyChat,
  applyFieldCall,
  applyLogPitch,
  applyMoneyNotice,
  applyPostFinal,
  applyStartGame,
  applyTapRun,
  pitcherStatus,
  submissionRoster,
  weekSunday,
} from "./field.ts";

function club() {
  return seedState();
}

describe("Field ops — emergency, packet, pitches", () => {
  it("keeps a player missing any of the four documents off the submission roster", () => {
    const team = club().teams.find((t) => t.id === "t14f");
    const sub = submissionRoster(team);
    assert.ok(sub.eligible.length > 0);
    assert.ok(sub.ineligible.length > 0);
    for (const p of sub.eligible) {
      const docs = p.docs || {};
      assert.equal(Boolean(docs.waiver && docs.birthCert && docs.insurance && docs.physical), true);
    }
    for (const row of sub.ineligible) {
      assert.ok(row.missing.length > 0);
      assert.ok(row.reason.length > 0);
    }
    assert.equal(
      sub.eligible.some((p) => sub.ineligible.some((r) => r.player.id === p.id)),
      false,
    );
  });

  it("flags a missing birth certificate on the ineligible list", () => {
    const team = club().teams.find((t) => t.id === "t14f");
    const sub = submissionRoster(team);
    const birth = sub.ineligible.filter((r) => r.birthCert);
    assert.ok(birth.length > 0);
    assert.ok(birth.every((r) => r.missing.includes("birthCert")));
    assert.ok(birth.every((r) => /birth/i.test(r.reason)));
  });

  it("rest table: 21 is one day, 36 two, 51 three, 66 four", () => {
    assert.equal(restDays(20), 0);
    assert.equal(restDays(21), 1);
    assert.equal(restDays(35), 1);
    assert.equal(restDays(36), 2);
    assert.equal(restDays(50), 2);
    assert.equal(restDays(51), 3);
    assert.equal(restDays(65), 3);
    assert.equal(restDays(66), 4);
    assert.equal(restDays(70), 4);
  });

  it("shows a pitcher who threw 70 pitches two days ago as resting", () => {
    const team = club().teams.find((t) => t.id === "t14f");
    const outing = team.pitchLog.find((l) => l.pitches === 70);
    assert.ok(outing);
    assert.equal(outing.date, iso(addDays(TODAY, -2)));
    const st = pitcherStatus(team, outing.playerId);
    assert.equal(st.available, false);
    assert.equal(st.last.pitches, 70);
    assert.equal(st.need, 4);
    assert.ok(st.readyOn > iso(TODAY));
  });

  it("warns when a logged count exceeds the age maximum", () => {
    const state = club();
    const team = state.teams.find((t) => t.id === "t14f");
    const pitcher = team.roster[0];
    const ok = applyLogPitch(state, team.id, pitcher.id, 96, iso(TODAY), "Scrimmage", "coach");
    assert.equal(ok.ok, true);
    assert.equal(ok.warn, true);
    assert.equal(ok.max, 95);
    const safe = applyLogPitch(state, team.id, pitcher.id, 70, iso(TODAY), "Scrimmage", "coach");
    assert.equal(safe.warn, false);
  });
});

describe("Field ops — running the team", () => {
  it("sends a field call to everyone and a money notice to admin only", () => {
    const state = club();
    applyFieldCall(state, {
      teamId: "t14f",
      status: "delayed",
      note: "Lightning delay. Stay in the cars.",
      actor: "ty@prospectsbaseball.club",
    });
    applyMoneyNotice(state, "t14f", "Card failed", "Invoice did not clear for an unpaid deposit.");
    const field = state.notifications.find((n) => n.kind === "field");
    const money = state.notifications.find((n) => n.kind === "money");
    assert.equal(field.audience, "all");
    assert.equal(money.audience, "admin");
    const family = visibleNotes(state, "family");
    const coach = visibleNotes(state, "coach");
    const admin = visibleNotes(state, "admin");
    assert.ok(family.some((n) => n.kind === "field"));
    assert.equal(family.some((n) => n.kind === "money"), false);
    assert.ok(coach.some((n) => n.kind === "field"));
    assert.equal(coach.some((n) => n.kind === "money"), false);
    assert.ok(admin.some((n) => n.kind === "money"));
  });

  it("does not put a money alert on a coach desk", () => {
    const state = club();
    const alerts = attention(state);
    assert.ok(alerts.some((a) => a.kind === "Money"));
    const coach = alerts.filter((a) => a.teamId === "t14f" && a.kind !== "Money" && !/\$/.test(a.text));
    assert.equal(coach.some((a) => a.kind === "Money"), false);
    assert.equal(coach.some((a) => /\$/.test(a.text)), false);
  });

  it("rejects adult-to-player direct messages", () => {
    const state = club();
    const team = state.teams.find((t) => t.id === "t14f");
    const dm = applyChat(state, team.id, {
      author: "Ty Redmond",
      role: "coach",
      text: "You are batting leadoff.",
      toPlayerId: team.roster[0].id,
    });
    assert.equal(dm.ok, false);
    assert.equal(dm.reason, "dm");
    const group = applyChat(state, team.id, {
      author: "Ty Redmond",
      role: "coach",
      text: "Hats on. No surprise locations.",
    });
    assert.equal(group.ok, true);
    assert.ok(team.messages.some((m) => m.text === "Hats on. No surprise locations."));
  });

  it("posts a final that updates the team record", () => {
    const state = club();
    const team = state.teams.find((t) => t.id === "t14f");
    const before = { ...team.record };
    applyStartGame(state, team.id, { opponent: "Owasso Rams", actor: "coach" });
    const game = state.games.find((g) => g.status === "live" && g.opponent === "Owasso Rams");
    applyTapRun(state, game.id, "us");
    applyTapRun(state, game.id, "us");
    applyTapRun(state, game.id, "them");
    applyPostFinal(state, game.id, "coach");
    assert.equal(game.status, "final");
    assert.equal(game.ourRuns, 2);
    assert.equal(game.oppRuns, 1);
    assert.equal(team.record.w, before.w + 1);
    assert.equal(team.record.l, before.l);
  });

  it("resets cage credits on Sunday and never rolls the week to Monday", () => {
    assert.equal(weekSunday(TODAY), "2026-09-13");
    assert.equal(weekSunday("2026-09-13"), "2026-09-13");
    assert.equal(weekSunday("2026-09-19"), "2026-09-13");
    assert.equal(weekSunday("2026-09-20"), "2026-09-20");
  });
});
