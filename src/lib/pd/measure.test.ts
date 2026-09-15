import assert from "node:assert/strict";
import test from "node:test";
import { seedDevelopment } from "./seed.ts";
import {
  CALIB_CASES,
  evidenceRows,
  facilityCaseReport,
  parseTrackingFile,
} from "./measure.ts";
import { cohortFor } from "./engines.ts";
import type { AthleteSlice } from "./context.tsx";

function sliceOf(id: string): AthleteSlice {
  const data = seedDevelopment();
  const athlete = data.athletes.find((row) => row.id === id)!;
  const of = <T extends { athleteId: string }>(rows: T[]) => rows.filter((row) => row.athleteId === id);
  return {
    athlete,
    family: data.families.find((row) => row.id === athlete.familyId),
    coaches: data.coaches.filter((row) => athlete.coachIds.includes(row.id)),
    bookings: of(data.bookings),
    waitlist: of(data.waitlist),
    outings: of(data.outings),
    workoutLog: of(data.workoutLog),
    strengthLog: of(data.strengthLog),
    pointsLog: of(data.pointsLog),
    scorecards: of(data.scorecards),
    evaluations: of(data.evaluations),
    lessons: of(data.lessons),
    filmReviews: of(data.filmReviews),
    interventions: of(data.interventions),
    calibration: of(data.calibration),
    certifications: of(data.certifications),
    messages: of(data.messages),
    plans: of(data.plans),
    diagnose: of(data.diagnose),
    cohorts: data.cohorts.filter((row) => row.athleteIds.includes(id)),
    gameIq: of(data.gameIq),
    reportCards: of(data.reportCards),
    velocity: of(data.velocity),
    goals: of(data.goals),
    arsenal: of(data.arsenal),
    pitchDesign: of(data.pitchDesign),
    skillPlans: of(data.skillPlans),
    warmups: of(data.warmups),
    strengthSets: of(data.strengthSets),
    throwingAssignments: of(data.throwingAssignments),
    bullpens: of(data.bullpens),
    workload: of(data.workload),
    armCare: of(data.armCare),
    physicalTests: of(data.physicalTests),
    metrics: of(data.metrics),
    recruiting: data.recruiting.find((row) => row.athleteId === id),
    intake: data.intake.find((row) => row.athleteId === id),
    videos: of(data.videos),
    documents: of(data.documents),
  };
}

test("CSV with one malformed row imports the good rows and names the bad one", () => {
  const csv = [
    "Pitch Type,Release Speed,Spin Rate,IVB,HB",
    "FB,81.2,2100,16.1,12.0",
    "FB,999,2100,16.1,12.0",
    "CH,72.4,1800,8.2,14.1",
  ].join("\n");
  const out = parseTrackingFile(csv);
  assert.equal("error" in out, false);
  if ("error" in out) return;
  assert.equal(out.count, 2);
  assert.equal(out.skipped.length, 1);
  assert.equal(out.skipped[0].row, 3);
  assert.match(out.skipped[0].why, /999|out of range/);
  assert.ok(out.byType.some((row) => row.type === "FB"));
  assert.ok(out.byType.some((row) => row.type === "CH"));
});

test("under 10 tests is a hint; 10+ is a finding", () => {
  const data = seedDevelopment();
  const rows = evidenceRows(data);
  const drill = rows.find((row) => row.method === "constraint drill");
  const grip = rows.find((row) => row.method === "grip");
  assert.ok(drill && drill.n >= 10 && drill.hint === false);
  assert.ok(grip && grip.n < 10 && grip.hint === true);
});

test("13U rear-only case flags a 2+ spread as a rubric problem", () => {
  const data = seedDevelopment();
  const report = facilityCaseReport(data, "case-13u-lhp");
  assert.ok(report);
  assert.equal(CALIB_CASES.length, 3);
  const flagged = report!.spread.filter((row) => row.flag);
  assert.ok(flagged.length >= 1);
  const steve = report!.coaches.find((row) => row.coachId === "c-steve");
  assert.equal(steve?.vsTruth?.off2, 0);
});

test("cohort refuses below n=3 and shows spread when ok", () => {
  const miles = sliceOf("a-empty");
  const data = seedDevelopment();
  const thin = cohortFor(miles, data, "velo");
  assert.ok(thin.status === "no-baseline" || thin.status === "thin");
  const ryder = sliceOf("a-full");
  const ok = cohortFor(ryder, data, "velo");
  if (ok.status === "ok") {
    assert.ok(ok.n >= 3);
    assert.ok(ok.q1 != null && ok.q3 != null);
    assert.ok(ok.min != null && ok.max != null);
  }
});
