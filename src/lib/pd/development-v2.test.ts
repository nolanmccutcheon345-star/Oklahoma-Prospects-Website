import test from "node:test";
import assert from "node:assert/strict";
import { developmentPrograms, compatibleProgram } from "./development-programs";
import {
  developmentEvidence,
  recommendPrograms,
  developmentWorkload,
  pitchingRest,
} from "./development-evidence";
import { trainingDrills } from "./training-catalog";
import { emptyDevelopment } from "./empty";
import { lessonChoices } from "./lesson-choices";
test("specialty sequences reference real compatible drills and distinct checkpoints", () => {
  assert.equal(developmentPrograms.length, 51);
  for (const p of developmentPrograms) {
    assert.equal(p.phases.length, 4);
    assert.equal(new Set(p.phases.map((x) => x.checkpoint)).size, 4);
    for (const phase of p.phases)
      for (const id of phase.drillIds) {
        const d = trainingDrills.find((d) => d.id === id);
        assert.ok(d, `${p.id}: ${id}`);
        assert.equal(d.discipline, p.discipline);
        assert.ok(d.sports.includes(p.sport));
      }
    assert.ok(compatibleProgram(p, p.sport, 25, 4));
    assert.ok(!compatibleProgram(p, p.sport === "baseball" ? "softball" : "baseball", 25, 4));
  }
  const foundation = developmentPrograms.find((p) => p.id === "softball-pitch-foundation")!;
  assert.ok(
    foundation.phases.every((p) => p.drillIds.every((id) => id.includes("softballpitching"))),
  );
  assert.ok(
    !compatibleProgram(
      developmentPrograms.find((p) => p.id === "baseball-competitive")!,
      "baseball",
      10,
      4,
    ),
  );
});
test("catalog coaching cues and corrections are specific, with honest review status", () => {
  const additions = trainingDrills.filter((d) => d.id.startsWith("training-"));
  assert.equal(new Set(additions.map((d) => d.correction)).size, additions.length);
  for (const d of additions) {
    assert.ok(d.cue.split(";").length >= 2, d.name);
    assert.ok(!d.correction.includes("If balance, control or understanding"));
    assert.equal(d.lastQualifiedReviewAt, null);
    assert.ok(d.steps.length);
  }
});
test("template choices differentiate drill sequence, all eight stages and booked duration", () => {
  for (const sport of ["baseball", "softball"] as const)
    for (const discipline of [
      "Pitching",
      "Hitting",
      "Catching",
      "Fielding",
      "Strength/Speed",
    ] as const)
      for (const minutes of [30, 60, 75]) {
        const choices = lessonChoices(sport, discipline, minutes, 16, 4);
        assert.equal(
          new Set(choices.map((c) => c.drills.map((d) => d.id).join(","))).size,
          3,
          `${sport} ${discipline}`,
        );
        for (const c of choices) {
          assert.equal(c.stages.length, 8);
          assert.equal(
            c.stages.reduce((n, s) => n + s.minutes, 0),
            minutes,
          );
          assert.ok(c.drills.length);
          assert.ok(c.equipment.length);
        }
      }
});
test("recommendations cite actual records and preserve missing baseline data", () => {
  const file = emptyDevelopment();
  file.goals = [
    {
      id: "g1",
      athleteId: "a",
      title: "Glove-side fastball command",
      target: "Observe intended versus actual locations",
      status: "active",
    },
  ];
  const context = developmentEvidence(file, "a", "2026-10-13");
  assert.ok(context.missing.includes("Coach evaluation"));
  const rec = recommendPrograms(context, "baseball", 13, "intermediate");
  assert.equal(rec[0].programId, "baseball-command");
  assert.equal(rec[0].findings[0].id, "g1");
  assert.ok(
    recommendPrograms(
      developmentEvidence(file, "other", "2026-10-13"),
      "baseball",
      13,
      "intermediate",
    ).every((r) => r.findings.length === 0),
  );
});
test("baseball rest boundaries are age-specific and never imposed on windmill pitchers", () => {
  assert.equal(pitchingRest(12, 20), 0);
  assert.equal(pitchingRest(12, 21), 1);
  assert.equal(pitchingRest(16, 76), 4);
  assert.equal(pitchingRest(18, 76), 3);
  assert.equal(pitchingRest(6, 10), null);
  const file = emptyDevelopment();
  file.outings = [
    {
      id: "g",
      athleteId: "a",
      date: "2026-10-12",
      opponent: "Synthetic",
      ip: "1",
      k: 0,
      bb: 0,
      notes: "",
      pitches: 36,
    },
  ];
  assert.equal(
    developmentWorkload(file, "a", [], [], "2026-10-13", "baseball", 12).restUntil,
    "2026-10-15",
  );
  assert.equal(
    developmentWorkload(file, "a", [], [], "2026-10-13", "softball", 12).restUntil,
    null,
  );
  assert.ok(
    developmentWorkload(file, "a", [], [], "2026-10-13", "softball", 12).warnings.some((w) =>
      w.includes("separate softball"),
    ),
  );
});
