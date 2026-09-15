// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedState } from "./engine/04-seed.js";
import {
  applyAddEvent,
  applyAskBudget,
  applyCancelEvent,
  applySlate,
  buildSlate,
  coachCopyHasMoney,
  coachEventCopy,
  datesOverlap,
  eligibleEvents,
  eventEligible,
  formatShare,
  replacementsFor,
  sharePct,
  spentOf,
  wouldOverflow,
} from "./schedule.ts";

function club() {
  return seedState();
}

function teamById(state, id) {
  return state.teams.find((t) => t.id === id);
}

describe("Schedule builder", () => {
  it("filters to age, level, sport, and OK/TX/AR/KS", () => {
    const state = club();
    const team = teamById(state, "t14f");
    const list = eligibleEvents(state.catalog, team);
    assert.ok(list.every((e) => e.ages.includes("14U")));
    assert.ok(list.every((e) => e.levels.includes("AA")));
    assert.ok(list.every((e) => e.sport === "baseball"));
    assert.ok(list.every((e) => ["OK", "TX", "AR", "KS"].includes(e.state)));
    assert.ok(list.every((e) => e.start >= team.seasonStart && e.start <= team.seasonEnd));
    assert.equal(list.some((e) => e.sport === "softball"), false);
  });

  it("hides showcase organizers from teams under 15U and shows them at 15U", () => {
    const state = club();
    const u14 = eligibleEvents(state.catalog, teamById(state, "t14f"));
    const u12 = eligibleEvents(state.catalog, teamById(state, "t12s"));
    const u15 = eligibleEvents(state.catalog, teamById(state, "t15su"));
    const showcase = (list) =>
      list.filter((e) => e.type === "showcase" || /Five Tool|Perfect Game|Bigfire|PBR Prep/.test(e.org));
    assert.equal(showcase(u14).length, 0);
    assert.equal(showcase(u12).length, 0);
    assert.ok(showcase(u15).length > 0);
    const fiveTool = state.catalog.find((e) => e.org === "Five Tool" && e.sport === "baseball");
    assert.equal(eventEligible(fiveTool, teamById(state, "t14f")), false);
    assert.equal(eventEligible(fiveTool, teamById(state, "t15su")), true);
  });

  it("skips date conflicts and stays inside budget when building a slate", () => {
    const catalog = [
      { id: "a", org: "USSSA", name: "A", city: "Tulsa", state: "OK", start: "2027-03-06", end: "2027-03-07", ages: ["13U"], levels: ["AAA"], fee: 500, sport: "baseball", type: "tournament" },
      { id: "b", org: "USSSA", name: "B", city: "Tulsa", state: "OK", start: "2027-03-06", end: "2027-03-08", ages: ["13U"], levels: ["AAA"], fee: 500, sport: "baseball", type: "tournament" },
      { id: "c", org: "USSSA", name: "C", city: "Tulsa", state: "OK", start: "2027-03-20", end: "2027-03-21", ages: ["13U"], levels: ["AAA"], fee: 500, sport: "baseball", type: "tournament" },
      { id: "d", org: "USSSA", name: "D", city: "Dallas", state: "TX", start: "2027-04-10", end: "2027-04-11", ages: ["13U"], levels: ["AAA"], fee: 900, sport: "baseball", type: "tournament" },
    ];
    const team = {
      id: "t",
      age: "13U",
      level: "AAA",
      sport: "baseball",
      seasonStart: "2027-03-01",
      seasonEnd: "2027-05-31",
      eventBudget: 1600,
      tournamentIds: [],
      roster: [],
    };
    assert.equal(datesOverlap("2027-03-06", "2027-03-07", "2027-03-06", "2027-03-08"), true);
    const slate = buildSlate(catalog, team, 4);
    assert.deepEqual(slate.ids, ["a", "c"]);
    assert.equal(slate.skippedConflict, 1);
    assert.equal(slate.skippedBudget, 1);
    assert.equal(slate.short, true);
    assert.equal(slate.spent, 1000);
  });

  it("blocks an add that would pass budget and asks the office instead", () => {
    const state = club();
    const team = teamById(state, "t15su");
    team.eventBudget = 3000;
    const spent = spentOf(team, state.catalog);
    const extra = state.catalog.find((e) => e.name.includes("Five Tool Oklahoma"));
    assert.ok(extra);
    assert.ok(spent + extra.fee > team.eventBudget);
    assert.equal(wouldOverflow(team, state.catalog, extra), true);
    const blocked = applyAddEvent(state, team.id, extra.id, "coach");
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "budget");
    applyAskBudget(state, team.id, extra.id, "Ty Redmond");
    assert.ok(state.notifications.some((n) => n.title === "Budget request" && n.audience === "admin"));
    assert.equal(/\$/.test(state.notifications.find((n) => n.title === "Budget request").body), false);
  });

  it("cancels an event, notifies everyone, and suggests same-month replacements", () => {
    const state = club();
    const team = teamById(state, "t13s");
    const on = team.tournamentIds.map((id) => state.catalog.find((e) => e.id === id)).filter(Boolean);
    const target = on[1] || on[0];
    const alts = replacementsFor(state.catalog, team, target);
    const result = applyCancelEvent(state, team.id, target.id, "Dell Cathey", "Rainout");
    assert.equal(team.tournamentIds.includes(target.id), false);
    assert.ok(state.notifications.some((n) => n.title === "Event cancelled" && n.audience === "all"));
    assert.equal(result.replacements.length, alts.length);
    assert.ok(result.replacements.every((e) => e.start.slice(0, 7) === target.start.slice(0, 7)));
  });

  it("coach-facing copy is a share of budget, never an entry fee", () => {
    const text = coachEventCopy(
      { name: "Route 66 Fall Open", city: "Tulsa", state: "OK", start: "2026-10-10", stayToPlay: true, type: "tournament" },
      sharePct(525, 2300),
    );
    assert.equal(coachCopyHasMoney(text), false);
    assert.match(text, /% of budget/);
    assert.match(text, /stay-to-play/);
    assert.equal(formatShare(18), "18% of budget");
  });

  it("applies a built slate onto the team", () => {
    const state = club();
    const team = teamById(state, "t13s");
    const slate = buildSlate(state.catalog, team, 3);
    assert.ok(slate.ids.length >= 2);
    applySlate(state, team.id, slate.ids, "Dell Cathey");
    assert.deepEqual(team.tournamentIds, slate.ids);
  });

  it("replacement weekends stay in the same month and skip date conflicts", () => {
    const catalog = [
      { id: "keep", org: "USSSA", name: "Keep", city: "Tulsa", state: "OK", start: "2027-04-10", end: "2027-04-11", ages: ["13U"], levels: ["AAA"], fee: 500, sport: "baseball", type: "tournament" },
      { id: "gone", org: "USSSA", name: "Gone", city: "Tulsa", state: "OK", start: "2027-04-17", end: "2027-04-18", ages: ["13U"], levels: ["AAA"], fee: 500, sport: "baseball", type: "tournament" },
      { id: "clash", org: "USSSA", name: "Clash", city: "Tulsa", state: "OK", start: "2027-04-10", end: "2027-04-12", ages: ["13U"], levels: ["AAA"], fee: 500, sport: "baseball", type: "tournament" },
      { id: "alt", org: "USSSA", name: "Alt", city: "Norman", state: "OK", start: "2027-04-24", end: "2027-04-25", ages: ["13U"], levels: ["AAA"], fee: 500, sport: "baseball", type: "tournament" },
      { id: "may", org: "USSSA", name: "May", city: "Tulsa", state: "OK", start: "2027-05-01", end: "2027-05-02", ages: ["13U"], levels: ["AAA"], fee: 500, sport: "baseball", type: "tournament" },
    ];
    const team = {
      id: "t",
      age: "13U",
      level: "AAA",
      sport: "baseball",
      seasonStart: "2027-03-01",
      seasonEnd: "2027-05-31",
      eventBudget: 4000,
      tournamentIds: ["keep", "gone"],
      roster: [],
    };
    const alts = replacementsFor(catalog, team, catalog[1]);
    assert.deepEqual(alts.map((e) => e.id), ["alt"]);
  });
});
