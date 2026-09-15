import assert from "node:assert/strict";
import test from "node:test";
import { COURSES, TOTAL_LESSONS, moduleId, progressOf, seedEducationProgress } from "./education.ts";

test("catalog has 8 courses and 47 modules", () => {
  assert.equal(COURSES.length, 8);
  assert.equal(TOTAL_LESSONS, 47);
});

test("Steve seed is 11 of 47", () => {
  const seed = seedEducationProgress();
  const steve = progressOf(seed["stevemccutcheon89@gmail.com"]);
  assert.equal(steve.done, 11);
  assert.equal(steve.total, 47);
  assert.equal(steve.pct, Math.round((11 / 47) * 100));
});

test("course progress is scoped", () => {
  const ids = [moduleId("pit-1", 0), moduleId("pit-1", 1)];
  const pit = progressOf(ids, "pit-1");
  assert.equal(pit.done, 2);
  assert.equal(pit.total, 8);
});
