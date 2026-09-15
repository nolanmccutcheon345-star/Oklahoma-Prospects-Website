import assert from "node:assert/strict";
import test from "node:test";
import { FEATURE_MIN_TIER, planHasFeature } from "./core-algorithms.js";
import { rescheduleFor } from "./engines.ts";
import { PD_CONTRAST_PAIRS, aaPass, contrastRatio, searchPd } from "./polish.ts";
import { seedDevelopment } from "./seed.ts";

test("WCAG AA contrast on every Train surface pair", () => {
  const fails: string[] = [];
  for (const row of PD_CONTRAST_PAIRS) {
    const ratio = contrastRatio(row.fg, row.bg);
    const ok = aaPass(row.fg, row.bg, row.large);
    if (!ok) fails.push(`${row.name}: ${ratio}:1`);
  }
  assert.deepEqual(fails, [], fails.join("; "));
});

test("Performance tier has more features than Development", () => {
  const keys = Object.keys(FEATURE_MIN_TIER);
  const count = (tier: string) => keys.filter((k) => planHasFeature(tier, k)).length;
  assert.ok(count("performance") > count("development"));
  for (const feature of keys) {
    if (planHasFeature("development", feature)) {
      assert.equal(planHasFeature("performance", feature), true, feature);
    }
  }
});

test("session 2 days out cannot reschedule; 10 days out can", () => {
  const data = seedDevelopment();
  const family = data.families.find((row) => row.id === "f-mccabe")!;
  const two = data.bookings.find((row) => row.id === "b1")!;
  const ten = data.bookings.find((row) => row.id === "b-10d")!;
  const blocked = rescheduleFor(two, family, data);
  const open = rescheduleFor(ten, family, data);
  assert.equal(blocked.ok, false);
  assert.equal(open.ok, true);

  const harper = data.families.find((row) => row.id === "f-harper")!;
  const harperTwo = data.bookings.find((row) => row.id === "b-harper-in")!;
  const harperTen = data.bookings.find((row) => row.id === "b-harper-out")!;
  assert.equal(rescheduleFor(harperTwo, harper, data).ok, false);
  assert.equal(rescheduleFor(harperTen, harper, data).ok, true);
});

test("search hits athletes, coaches, drills, exercises", () => {
  const data = seedDevelopment();
  const ryder = searchPd("Ryder", data);
  assert.ok(ryder.some((row) => row.kind === "athlete" && row.id === "a-full"));
  const steve = searchPd("Steve", data);
  assert.ok(steve.some((row) => row.kind === "coach"));
  const drill = searchPd("Rocker", data);
  assert.ok(drill.some((row) => row.kind === "drill"));
  const lift = searchPd("Trap-bar", data);
  assert.ok(lift.some((row) => row.kind === "exercise"));
});
