import assert from "node:assert/strict";
import test from "node:test";
import {
  activityPoints,
  alertsByBucket,
  alreadyLogged,
  buildAlerts,
  coachNotes,
  creditDecision,
  familyThread,
  leaderboardRows,
} from "./automation.ts";
import { seedDevelopment } from "./seed.ts";

test("Kane's arm-health alerts outrank commercial noise and sit first today", () => {
  const data = seedDevelopment();
  const rows = buildAlerts(data, { role: "coach", coachId: "c-steve" });
  const today = alertsByBucket(rows).today;
  assert.ok(today.length > 0, "Steve's today queue is not empty");
  assert.equal(today[0].kind, "health");
  assert.match(today[0].title, /Kane|Eli/i);
  assert.ok(today.every((row, i, list) => i === 0 || list[0].rank <= row.rank));
});

test("Coach Lane's today queue is empty on a clean hitting roster", () => {
  const data = seedDevelopment();
  const today = alertsByBucket(buildAlerts(data, { role: "coach", coachId: "c-hitting" })).today;
  assert.equal(today.length, 0);
});

test("weekly targets are 80 / 130 / 180 by age band", () => {
  const data = seedDevelopment();
  const jett = data.athletes.find((row) => row.id === "a-9u")!;
  const kane = data.athletes.find((row) => row.id === "a-spike")!;
  const ryder = data.athletes.find((row) => row.id === "a-full")!;
  assert.equal(activityPoints({ athlete: jett, pointsLog: [] }).target, 80);
  assert.equal(activityPoints({ athlete: kane, pointsLog: data.pointsLog.filter((p) => p.athleteId === "a-spike") }).target, 130);
  assert.equal(activityPoints({ athlete: ryder, pointsLog: [] }).target, 180);
});

test("one log per type per day is a hard limit; high-value stays pending", () => {
  const data = seedDevelopment();
  const first = creditDecision(data, { athleteId: "a-9u", key: "throwing", date:"2026-09-14" });
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.status, "pending");
  data.pointsLog.unshift({
    id: "x",
    athleteId: "a-9u",
    date: "2026-09-14",
    points: 25,
    reason: "Throwing",
    activity: "throwing",
    status: "pending",
  });
  const second = creditDecision(data, { athleteId: "a-9u", key: "throwing", date:"2026-09-14" });
  assert.equal(second.ok, false);
  const checkin = creditDecision(data, { athleteId: "a-9u", key: "checkin" });
  assert.equal(checkin.ok, true);
  if (checkin.ok) assert.equal(checkin.status, "auto");
});

test("leaderboard omits blanks and respects parent opt-out", () => {
  const data = seedDevelopment();
  const velo18 = leaderboardRows(data, "velo", "18U");
  assert.ok(velo18.every((row) => row.value != null));
  const trap14 = leaderboardRows(data, "trap", "14U");
  assert.ok(trap14.length === 0 || trap14.every((row) => row.value != null));
  const allVelo = leaderboardRows(data, "velo", "16U");
  assert.ok(!allVelo.some((row) => row.id === "a-hitter"), "opted-out Quinn stays off the public board");
  const withSelf = leaderboardRows(data, "velo", "16U", { includeOptOutIds: ["a-hitter"] });
  assert.ok(withSelf.some((row) => row.id === "a-hitter"));
});

test("family thread never includes coach-only notes", () => {
  const data = seedDevelopment();
  const family = familyThread(data.messages, "a-down");
  const notes = coachNotes(data.messages, "a-down");
  assert.ok(family.every((row) => row.channel !== "coach"));
  assert.ok(notes.length >= 1);
  assert.ok(notes.every((row) => row.channel === "coach"));
  assert.ok(!family.some((row) => /UCL/i.test(row.body)));
});

test("alreadyLogged keys off activity, not a duplicate reason string", () => {
  const data = seedDevelopment();
  assert.equal(alreadyLogged(data.pointsLog, "a-full", "2026-09-14", "throwing"), true);
  assert.equal(alreadyLogged(data.pointsLog, "a-full", "2026-09-14", "workout"), false);
});
