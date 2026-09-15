import assert from "node:assert/strict";
import test from "node:test";
import { seedDevelopment } from "./seed.ts";
import {
  epley1rm,
  generateStrengthProgram,
  healthReturning,
  suggestLoad,
  throwingForSlice,
  warmupForSlice,
} from "./programs.ts";
import { exerciseById } from "./content/exercises.ts";
import type { AthleteSlice } from "./context.tsx";

function sliceOf(id: string): AthleteSlice {
  const data = seedDevelopment();
  const athlete = data.athletes.find((row) => row.id === id)!;
  return {
    athlete,
    family: data.families.find((row) => row.id === athlete.familyId),
    coaches: data.coaches.filter((row) => athlete.coachIds.includes(row.id)),
    bookings: data.bookings.filter((row) => row.athleteId === id),
    waitlist: data.waitlist.filter((row) => row.athleteId === id),
    outings: data.outings.filter((row) => row.athleteId === id),
    workoutLog: data.workoutLog.filter((row) => row.athleteId === id),
    strengthLog: data.strengthLog.filter((row) => row.athleteId === id),
    pointsLog: data.pointsLog.filter((row) => row.athleteId === id),
    scorecards: data.scorecards.filter((row) => row.athleteId === id),
    evaluations: data.evaluations.filter((row) => row.athleteId === id),
    lessons: data.lessons.filter((row) => row.athleteId === id),
    filmReviews: data.filmReviews.filter((row) => row.athleteId === id),
    interventions: data.interventions.filter((row) => row.athleteId === id),
    calibration: data.calibration.filter((row) => row.athleteId === id),
    certifications: data.certifications.filter((row) => row.athleteId === id),
    messages: data.messages.filter((row) => row.athleteId === id),
    plans: data.plans.filter((row) => row.athleteId === id),
    diagnose: data.diagnose.filter((row) => row.athleteId === id),
    cohorts: data.cohorts.filter((row) => row.athleteIds.includes(id)),
    gameIq: data.gameIq.filter((row) => row.athleteId === id),
    reportCards: data.reportCards.filter((row) => row.athleteId === id),
    velocity: data.velocity.filter((row) => row.athleteId === id),
    goals: data.goals.filter((row) => row.athleteId === id),
    arsenal: data.arsenal.filter((row) => row.athleteId === id),
    pitchDesign: data.pitchDesign.filter((row) => row.athleteId === id),
    skillPlans: data.skillPlans.filter((row) => row.athleteId === id),
    warmups: data.warmups.filter((row) => row.athleteId === id),
    strengthSets: data.strengthSets.filter((row) => row.athleteId === id),
    throwingAssignments: data.throwingAssignments.filter((row) => row.athleteId === id),
    bullpens: data.bullpens.filter((row) => row.athleteId === id),
    workload: data.workload.filter((row) => row.athleteId === id),
    armCare: data.armCare.filter((row) => row.athleteId === id),
    physicalTests: data.physicalTests.filter((row) => row.athleteId === id),
    metrics: data.metrics.filter((row) => row.athleteId === id),
    recruiting: data.recruiting.find((row) => row.athleteId === id),
    intake: data.intake.find((row) => row.athleteId === id),
    videos: data.videos.filter((row) => row.athleteId === id),
    documents: data.documents.filter((row) => row.athleteId === id),
  };
}

test("Eli's health outranks a velocity goal", () => {
  const eli = sliceOf("a-down");
  assert.equal(healthReturning(eli), true);
  const program = generateStrengthProgram(eli, { emphasis: "Velocity" });
  assert.equal(program.emphasis, "Return to play");
  assert.equal(program.healthOverride, true);
  assert.ok(program.slots.every((slot) => slot.targetRpe <= 7));
  assert.ok(!program.slots.some((slot) => slot.exerciseId === "lmj"));
});

test("Velocity and size are not relabelled copies", () => {
  const ryder = sliceOf("a-full");
  const velo = generateStrengthProgram(ryder, {
    phase: "Power",
    emphasis: "Velocity",
  });
  const size = generateStrengthProgram(ryder, {
    phase: "Accumulation",
    emphasis: "Size",
  });
  assert.equal(velo.emphasis, "Velocity");
  assert.equal(size.emphasis, "Size");
  const veloRest = velo.slots.find((s) => s.exerciseId === "trap-bar")?.restSec ?? 0;
  const sizeRest = size.slots.find((s) => s.exerciseId === "goblet")?.restSec ?? 0;
  assert.ok(veloRest >= 150, "velocity main lift rests long");
  assert.ok(sizeRest <= 75, "size rests short");
  assert.ok(velo.slots.some((s) => s.stopRule));
  assert.ok(!size.slots.some((s) => s.stopRule));
});

test("in-season blocks a velocity emphasis", () => {
  const ryder = sliceOf("a-full");
  const program = generateStrengthProgram(ryder, { phase: "In-Season", emphasis: "Velocity" });
  assert.equal(program.emphasis, "Balanced");
  assert.equal(program.inSeasonBlockedVelocity, true);
});

test("warm-ups are position and age specific", () => {
  const jett = warmupForSlice(sliceOf("a-9u"));
  const deacon = warmupForSlice(sliceOf("a-catcher"));
  const maya = warmupForSlice(sliceOf("a-softball"));
  assert.match(jett.title, /youth/i);
  assert.ok(jett.steps.some((s) => s.play));
  assert.match(deacon.principle, /Copenhagen/i);
  assert.equal(maya.sport, "softball");
});

test("throwing plans: youth and RTP gates", () => {
  const jett = throwingForSlice(sliceOf("a-9u"));
  const eli = throwingForSlice(sliceOf("a-down"));
  assert.ok(jett.every((row) => row.goal === "Youth"));
  assert.ok(eli.every((row) => row.goal === "Return to Throw"));
});

test("load suggestion progresses at or under target RPE and backs off over", () => {
  const trap = exerciseById("trap-bar")!;
  const under = suggestLoad(
    trap,
    17,
    false,
    [{ id: "1", athleteId: "a", date: "2026-09-08", exerciseId: "trap-bar", setNumber: 3, weight: 275, reps: 5, rpe: 7 }],
    8,
  );
  const over = suggestLoad(
    trap,
    17,
    false,
    [{ id: "1", athleteId: "a", date: "2026-09-08", exerciseId: "trap-bar", setNumber: 3, weight: 275, reps: 5, rpe: 9 }],
    8,
  );
  assert.ok((under.weight ?? 0) > 275);
  assert.ok((over.weight ?? 0) < 275);
  assert.match(under.note, /Progress/);
  assert.match(over.note, /Back off/);
});

test("Epley 1RM", () => {
  assert.equal(epley1rm(275, 5), Math.round(275 * (1 + 5 / 30)));
});
