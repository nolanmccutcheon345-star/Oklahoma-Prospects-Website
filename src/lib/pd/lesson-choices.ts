import { z } from "zod";
import { approaches, skillBands, trainingDrills, ageBand } from "./training-catalog";
import { resolveTemplate, type LessonSport, type LessonDiscipline } from "./lesson-templates";
export const lessonChoiceInput = z
  .object({
    bookingId: z.string().min(1).max(150),
    revision: z.number().int().positive(),
    approach: z.enum(approaches),
    skill: z.enum(skillBands),
    drillIds: z.array(z.string().min(1).max(150)).min(1).max(6),
    objective: z.string().trim().min(5).max(500),
    dose: z.string().trim().min(5).max(1000),
    reason: z.string().trim().min(5).max(1000),
    qualifiedReview: z.literal(true),
    timing: z.array(z.number().int().min(1).max(60)).length(8),
    saveAs: z.string().trim().max(100).optional(),
  })
  .strict();
export type LessonChoiceInput = z.infer<typeof lessonChoiceInput>;
export function lessonChoices(
  sport: LessonSport,
  discipline: LessonDiscipline,
  minutes: number,
  age: number,
  level: number,
  priorities: string[] = [],
) {
  const base = resolveTemplate(sport, discipline, minutes, age, level, priorities);
  return approaches.map((approach, i) => ({
    ...base,
    id: `${base.id}:${approach}`,
    version: "2026-10-13.1",
    ageBand: ageBand(age),
    approach,
    objective: [
      `Establish comfortable, repeatable ${discipline.toLowerCase()} fundamentals and record a baseline.`,
      `Address one observed ${discipline.toLowerCase()} constraint; compare the same task before and after one cue.`,
      `Apply a familiar ${discipline.toLowerCase()} skill to a game decision; review both the choice and execution.`,
    ][i],
    rationale: [
      `Useful when skill experience or a reliable baseline is missing. Age ${age} sets eligibility, not expertise.`,
      `Use when an actual assessment or recent lesson identifies a constraint: ${priorities.filter(Boolean).length ? "review the recorded goals and observations in the briefing" : "no priorities recorded; ask and observe first"}.`,
      `Use after the coach confirms foundational control. Requires familiarity; age alone does not qualify the player.`,
    ][i],
    stages: base.stages.map((s, index) => ({
      ...s,
      instructions:
        index === 4
          ? [
              [
                "Demonstrate one simple task. Rehearse slowly, rest, and record comfortable control.",
                "Give one cue and repeat the same task. Compare like-for-like outcomes after recovery.",
                "Name outs, runners or a performance situation. Athlete chooses an action, then performs a familiar task.",
              ][i],
              ...s.instructions,
            ]
          : s.instructions,
    })),
  }));
}
export function customizeLesson(
  base: ReturnType<typeof resolveTemplate>,
  input: LessonChoiceInput,
  library = trainingDrills,
) {
  const choice = lessonChoices(
    base.sport,
    base.discipline,
    base.minutes,
    base.adaptation.age,
    base.adaptation.level,
    base.adaptation.priorities,
  ).find((c) => c.approach === input.approach)!;
  if (input.timing.reduce((a, b) => a + b, 0) !== base.minutes)
    throw new Error("Stage timing must equal the booked duration.");
  if (new Set(input.drillIds).size !== input.drillIds.length)
    throw new Error("Choose distinct drills.");
  if (input.approach === "game performance" && skillBands.indexOf(input.skill) < 1)
    throw new Error("Confirm foundational skill before game-performance training.");
  const drills = input.drillIds.map((id) => {
    const d = library.find((d) => d.id === id);
    if (
      !d ||
      !d.sports.includes(base.sport) ||
      d.discipline !== base.discipline ||
      d.minAge > base.adaptation.age ||
      d.minimumSkill > skillBands.indexOf(input.skill)
    )
      throw new Error("Incompatible drill for booked sport, discipline, age or skill.");
    return {
      id: d.id,
      name: d.name,
      setup: d.steps.join(" "),
      dose: input.dose,
      cues: [d.cue],
      watch: [d.safety, d.correction],
    };
  });
  return {
    ...choice,
    objective: input.objective,
    drills,
    review: { skill: input.skill, reason: input.reason, qualifiedReview: true },
    stages: choice.stages.map((s, i) => ({
      ...s,
      minutes: input.timing[i],
      instructions:
        i === 4
          ? [s.instructions[0], ...drills.map((d) => `${d.name}: ${d.setup} Dose: ${d.dose}`)]
          : s.instructions,
    })),
  };
}
