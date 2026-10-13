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
  const groups: Record<LessonDiscipline, number[][]> = {
    Pitching:
      sport === "softball"
        ? [
            [1, 3, 7],
            [2, 5, 9],
            [13, 16, 18],
          ]
        : [
            [1, 2],
            [3, 11],
            [12, 16],
          ],
    Hitting: [
      [1, 2, 3],
      [9, 10, 11],
      [14, 16, 21],
    ],
    Catching: [
      [1, 2, 3],
      [11, 12, 14],
      [15, 17, 19],
    ],
    Fielding: [
      [1, 2, 5],
      [3, 4, 8],
      [17, 18, 19],
    ],
    "Strength/Speed": [
      [1, 2, 6],
      [7, 8, 10],
      [16, 17, 19],
    ],
  };
  const prefix =
    discipline === "Pitching"
      ? sport === "softball"
        ? "training-softballpitching-"
        : "academy-d"
      : `training-${discipline.toLowerCase().replace(/[^a-z]/g, "")}-`;
  const eligible = trainingDrills.filter(
    (d) =>
      d.sports.includes(sport) &&
      d.discipline === discipline &&
      d.minAge <= age &&
      d.minimumSkill <= Math.max(0, level - 1),
  );
  return approaches.map((approach, i) => {
    let selected = groups[discipline][i]
      .map((n) => eligible.find((d) => d.id === prefix + n))
      .filter((d): d is (typeof trainingDrills)[number] => !!d);
    if (!selected.length)
      selected = eligible.slice(i, i + 2).length ? eligible.slice(i, i + 2) : eligible.slice(0, 2);
    const drills = selected.map((d) => ({
      id: d.id,
      name: d.name,
      setup: d.steps.join(" "),
      dose: d.dose,
      cues: d.cue.split(";"),
      watch: [d.correction, d.safety],
    }));
    const objective = [
      `Establish ${selected[0]?.purpose.toLowerCase() || discipline.toLowerCase() + " fundamentals"}; record comfortable execution before adding difficulty.`,
      `Compare one observed limitation using ${selected.map((d) => d.name).join(" and ")}; retain one cue and repeat the same measurement.`,
      `Explain and execute a game or movement choice using ${selected.map((d) => d.name).join(" and ")} within an approved workload.`,
    ][i];
    return {
      ...base,
      id: `${base.id}:${approach}`,
      version: "2026-10-13.3",
      name: `${sport} ${discipline} — ${approach}`,
      ageBand: ageBand(age),
      approach,
      objective,
      drills,
      recommendedDrillIds: drills.map((d) => d.id),
      equipment: [...new Set(selected.map((d) => d.equipment))],
      rationale: [
        "Use when a reliable baseline is missing. Observe first; age is not evidence of proficiency.",
        priorities.filter(Boolean).length
          ? "Review the recorded priorities and recent results, then select the specific constraint to test."
          : "No priority is recorded. Obtain an observation before choosing a corrective focus.",
        "Use only after the coach confirms control of the component skills. Review decisions separately from execution.",
      ][i],
      stages: base.stages.map((stage, index) => ({
        ...stage,
        instructions:
          index === 0
            ? [...stage.instructions, `Prepare: ${selected.map((d) => d.equipment).join("; ")}`]
            : index === 4
              ? [
                  [
                    "Demonstrate the task, let the athlete explain it, then rehearse at comfortable effort.",
                    "Record a baseline, give one specific cue, allow recovery, and compare the same task.",
                    "State a realistic situation, require an athlete choice, and review the decision before the outcome.",
                  ][i],
                  ...selected.map(
                    (d) =>
                      `${d.name}: ${d.steps.join(" ")} Cues: ${d.cue}. Correct: ${d.correction}. Easier: ${d.regression}. Next: ${d.progression}. ${d.dose}`,
                  ),
                ]
              : index === 5
                ? [
                    ...stage.instructions,
                    ...selected.map(
                      (d) =>
                        `Record ${d.measure}; compare only like-for-like conditions and preserve missing measurements.`,
                    ),
                  ]
                : index === 7
                  ? [
                      ...stage.instructions,
                      `Discuss whether ${selected[0]?.name || "the selected task"} is suitable for home practice. Publish an individualized program only after supervision and workload review.`,
                    ]
                  : stage.instructions,
      })),
    };
  });
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
