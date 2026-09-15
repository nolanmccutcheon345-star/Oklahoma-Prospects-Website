import assert from "node:assert/strict";
import test from "node:test";
import { DRILLS } from "./content/drills.ts";
import { generateRecaps, rampFor, scoreChart } from "./lesson.ts";

test("recaps are three audiences, not one paragraph reused", () => {
  const recaps = generateRecaps({
    firstName: "Ryder",
    lastName: "McCabe",
    lessonType: "Private Development 60",
    constraint: "Hold the target",
    method: "verbal cue",
    cue: "Show the hitter your back pocket longer",
    pre: "62",
    post: "70",
    outcome: "Retained",
    drills: [DRILLS[0]],
    tci: 70,
    swings: 18,
  });
  assert.match(recaps.parent, /Ryder trained/);
  assert.match(recaps.parent, /Homework/);
  assert.match(recaps.player, /one thing/);
  assert.match(recaps.coach, /McCabe/);
  assert.match(recaps.coach, /TCI 70/);
  assert.notEqual(recaps.parent, recaps.player);
  assert.notEqual(recaps.player, recaps.coach);
});

test("RAMP is age and position specific with exact reps", () => {
  const youth = rampFor("Pitching", 9);
  const older = rampFor("Pitching", 16);
  assert.equal(youth.length, 4);
  assert.equal(youth[0].letter, "R");
  assert.notEqual(youth[0].reps, older[0].reps);
  assert.match(youth[3].reps, /rocker/i);
});

test("TCI chart scores a called pitch", () => {
  const chart = scoreChart([
    { intent: { row: 2, col: 2 }, actual: { row: 2, col: 2 } },
  ]);
  assert.equal(chart.tci, 100);
  assert.equal(chart.pitches[0].score, 4);
});
