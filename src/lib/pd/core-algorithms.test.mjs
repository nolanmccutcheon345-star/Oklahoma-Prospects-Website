import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FEATURE_MIN_TIER,
  REST_RULES,
  buildCohort,
  canReschedule,
  classifyFastball,
  invNorm,
  loadStats,
  parseTrackingCsv,
  pdiFrom,
  planHasFeature,
  restRequired,
  scorePitch,
  tciOf,
  velocityPotential,
} from "./core-algorithms.js";

describe("Acklam invNorm", () => {
  it("maps 0.5 to ~0", () => {
    assert.ok(Math.abs(invNorm(0.5)) < 1e-10);
  });
  it("maps 0.975 to ~1.96", () => {
    assert.ok(Math.abs(invNorm(0.975) - 1.959964) < 1e-4);
  });
});

describe("Pitch Smart restRequired", () => {
  it("uses the pasted age bands", () => {
    assert.equal(REST_RULES[0].ages[0], 7);
    assert.equal(restRequired(12, 20), 0);
    assert.equal(restRequired(12, 21), 1);
    assert.equal(restRequired(12, 36), 2);
    assert.equal(restRequired(12, 51), 3);
    assert.equal(restRequired(12, 66), 4);
    assert.equal(restRequired(16, 30), 0);
    assert.equal(restRequired(16, 31), 1);
    assert.equal(restRequired(16, 76), 4);
  });
});

describe("TCI scorePitch / tciOf", () => {
  it("scores the 5x5 grid as pasted", () => {
    assert.equal(scorePitch({ row: 2, col: 2 }, { row: 2, col: 2 }), 4);
    assert.equal(scorePitch({ row: 2, col: 2 }, { row: 2, col: 3 }), 3);
    assert.equal(scorePitch({ row: 2, col: 2 }, { row: 1, col: 3 }), 3);
    assert.equal(scorePitch({ row: 2, col: 2 }, { row: 3, col: 0 }), 1);
    assert.equal(scorePitch({ row: 1, col: 1 }, { row: 3, col: 3 }), 2);
    assert.equal(scorePitch({ row: 2, col: 2 }, { row: 2, col: 2, noncompetitive: true }), 0);
  });
  it("indexes as round(sum / (n*4) * 100)", () => {
    assert.equal(tciOf([]), 0);
    assert.equal(tciOf([{ score: 4 }, { score: 4 }, { score: 4 }, { score: 4 }]), 100);
    assert.equal(tciOf([{ score: 2 }, { score: 2 }, { score: 2 }, { score: 2 }]), 50);
  });
});

describe("loadStats ACWR", () => {
  it("refuses an empty log", () => {
    assert.equal(loadStats([]).band, "Not enough data");
  });
  it("flags a spike above 1.5", () => {
    const history = [...Array(21).fill(30), ...Array(7).fill(90)];
    const stats = loadStats(history);
    assert.ok(stats.acwr > 1.5);
    assert.equal(stats.tone, "warn");
  });
});

describe("velocityPotential coefficients", () => {
  it("lists missing inputs instead of inventing a number", () => {
    const out = velocityPotential({ sport: "baseball", age: 12, frame: {}, veloHistory: [] });
    assert.equal(out.ceiling, null);
    assert.ok(out.missing.includes("a current velocity reading"));
    assert.ok(out.missing.includes("height"));
  });
  it("uses Huang 2022 adult field-test coefficients", () => {
    const h = 74;
    const cmj = 32 / 28;
    const sprint = 1.62 / 4.1;
    const kmh = 53.22 + 0.21 * (h * 2.54) + 14.3 * cmj + 75.03 * sprint;
    const expected = kmh * 0.621371;
    const out = velocityPotential({
      sport: "baseball",
      age: 20,
      frame: { height: 74, cmjLoaded: 32, cmjUnloaded: 28, sprint10: 1.62, sprint30: 4.1 },
      veloHistory: [88],
    });
    assert.match(out.method, /Adult field-test/);
    assert.ok(Math.abs(out.ceiling - expected) < 1e-9);
  });
  it("uses Sgroi 2015 per-unit effects for developing athletes", () => {
    const out = velocityPotential({
      sport: "baseball",
      age: 16,
      movementScore: 62,
      frame: { height: "5'11\"", fatherHeight: "6'1\"", motherHeight: "5'5\"", weight: 175 },
      veloHistory: [81],
    });
    assert.match(out.method, /Developmental/);
    assert.equal(out.current, 81);
    assert.ok(out.ceiling > 81);
    assert.ok(out.floor < out.ceiling);
    assert.equal(out.ci, 5);
  });
});

describe("buildCohort n=3 gate", () => {
  it("returns no-baseline with an empty series", () => {
    const out = buildCohort({ athletes: [] }, { id: "a", age: 16, veloHistory: [] }, "velo");
    assert.equal(out.status, "no-baseline");
  });
  it("refuses a comparison below n=3", () => {
    const athletes = [
      { id: "p1", age: 16, archived: false, veloHistory: [70, 71, 72, 73, 74, 75] },
      { id: "p2", age: 16, archived: false, veloHistory: [70, 71, 72, 73, 74, 76] },
    ];
    const out = buildCohort(
      { athletes },
      { id: "me", age: 16, veloHistory: [70, 71, 72, 73, 74, 77] },
      "velo",
    );
    assert.equal(out.status, "thin");
    assert.equal(out.needed, 3);
    assert.equal(out.found, 2);
  });
  it("returns IQR and full range, not median alone", () => {
    const athletes = [1, 2, 3, 4].map((n) => ({
      id: `p${n}`,
      age: 16,
      archived: false,
      veloHistory: [70, 71, 72, 73, 74, 70 + n],
    }));
    const out = buildCohort(
      { athletes },
      { id: "me", age: 16, veloHistory: [70, 71, 72, 73, 74, 76] },
      "velo",
    );
    assert.equal(out.status, "ok");
    assert.ok(out.n >= 3);
    assert.equal(typeof out.q1, "number");
    assert.equal(typeof out.q3, "number");
    assert.equal(typeof out.min, "number");
    assert.equal(typeof out.max, "number");
    assert.equal(typeof out.med, "number");
  });
});

describe("FEATURE_MIN_TIER rank gating", () => {
  it("never lets a cheaper plan outrank a more expensive one", () => {
    const features = Object.keys(FEATURE_MIN_TIER);
    for (const feature of features) {
      const dev = planHasFeature("development", feature);
      const perf = planHasFeature("performance", feature);
      const elite = planHasFeature("elite", feature);
      if (dev) assert.equal(perf, true, feature);
      if (perf) assert.equal(elite, true, feature);
    }
    assert.equal(planHasFeature("development", "pitchDesign"), false);
    assert.equal(planHasFeature("performance", "pitchDesign"), true);
    assert.equal(planHasFeature("elite", "film"), true);
    assert.equal(planHasFeature("development", "film"), false);
  });
});

describe("canReschedule policy", () => {
  it("blocks inside 5 days and caps one per month", () => {
    const data = {
      policy: { rescheduleDaysNotice: 5, reschedulesPerMonth: 1 },
      bookings: [],
    };
    const family = { athleteIds: ["a1"] };
    const inside = canReschedule({ date: "2026-09-16" }, family, data);
    assert.equal(inside.ok, false);
    const outside = canReschedule({ date: "2026-09-30" }, family, data);
    assert.equal(outside.ok, true);
    assert.equal(outside.remaining, 1);
    const used = canReschedule(
      { date: "2026-09-30" },
      family,
      { ...data, bookings: [{ athleteId: "a1", rescheduledMonth: "2026-09" }] },
    );
    assert.equal(used.ok, false);
  });
});

describe("classifyFastball / parseTrackingCsv / pdiFrom", () => {
  it("classifies ride / sink / cut", () => {
    assert.equal(classifyFastball(17, 4, "R"), "Ride");
    assert.equal(classifyFastball(8, 14, "R"), "Sink");
    assert.equal(classifyFastball(12, -5, "L"), "Cut");
  });
  it("parses a velocity column", () => {
    const csv = "Pitch Type,Velocity,IVB,HB\nFB,88.1,16.2,8.1\nSL,79.0,4.1,-5.2\n";
    const out = parseTrackingCsv(csv);
    assert.equal(out.count, 2);
    assert.equal(out.maxVelo, 88.1);
  });
  it("scores a partial PDI card", () => {
    const pdi = pdiFrom({ posture: 2, tempo: 2, separation: 1, direction: 2, glove: 2, finish: 2 });
    assert.ok(pdi.index >= 0 && pdi.index <= 100);
    assert.ok(pdi.completeness < 100);
  });
});
