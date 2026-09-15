import assert from "node:assert/strict";
import test from "node:test";
import { grade2080, interpolatePercentile } from "./grade.ts";

test("18U fastball 81 mph is a 50", () => {
  const knots: [number, number][] = [
    [25, 74],
    [50, 81],
    [75, 89],
    [99, 94],
  ];
  const p = interpolatePercentile(81, knots);
  assert.equal(p, 50);
  assert.equal(grade2080(p!), 50);
});

test("pop time lower-is-better grades faster times higher", () => {
  const knots: [number, number][] = [
    [25, 2.7],
    [50, 2.55],
    [75, 2.4],
    [90, 2.25],
  ];
  const p50 = interpolatePercentile(2.55, knots, true);
  const p75 = interpolatePercentile(2.4, knots, true);
  assert.ok(p50 != null && Math.abs(p50 - 50) < 0.01);
  assert.ok(p75 != null && Math.abs(p75 - 75) < 0.01);
  assert.equal(grade2080(75), 65);
});
