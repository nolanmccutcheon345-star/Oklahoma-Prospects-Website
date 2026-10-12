import { DRILLS } from "./content/drills";
import { IQ_BY_DISCIPLINE } from "./content/gameiq";
import { WARMUPS } from "./content/warmups";
import { sportWarmup } from "./lesson";
import { z } from "zod";
export const lessonSports = ["baseball", "softball"] as const;
export const lessonDisciplines = [
  "Pitching",
  "Hitting",
  "Catching",
  "Fielding",
  "Strength/Speed",
] as const;
export type LessonSport = (typeof lessonSports)[number];
export type LessonDiscipline = (typeof lessonDisciplines)[number];
export const stageNames = [
  "Setup",
  "Briefing",
  "General Warm-up",
  "Sport-Specific Warm-up",
  "Drills",
  "Tracking/Assessment",
  "Game IQ",
  "Recap",
] as const;
export const TEMPLATE_VERSION = "2026-10-12.1";
export function disciplineFor(value: string): LessonDiscipline {
  const key = value.trim().toLowerCase();
  const map: Record<string, LessonDiscipline> = {
    pitching: "Pitching",
    hitting: "Hitting",
    catching: "Catching",
    fielding: "Fielding",
    defense: "Fielding",
    "fielding/defense": "Fielding",
    strength: "Strength/Speed",
    speed: "Strength/Speed",
    "strength/speed": "Strength/Speed",
  };
  if (!map[key])
    throw new Error(
      "This service needs an approved discipline mapping in Front Office. No pitching fallback is used.",
    );
  return map[key];
}
export function resolveTemplate(
  sport: LessonSport,
  discipline: LessonDiscipline,
  minutes: number,
  age: number,
  level: number,
  priorities: string[] = [],
) {
  if (
    !lessonSports.includes(sport) ||
    !lessonDisciplines.includes(discipline) ||
    ![30, 60, 75].includes(minutes)
  )
    throw new Error(
      "No reviewed lesson template for this sport, discipline and duration. Ask an admin to review the service configuration.",
    );
  const band = age <= 12 ? "youth" : age <= 15 ? "developing" : "advanced";
  const softballPitching = sport === "softball" && discipline === "Pitching";
  const allocations =
    minutes === 30
      ? [2, 3, 4, 4, 7, 5, 2, 3]
      : minutes === 60
        ? [3, 5, 6, 7, 15, 15, 4, 5]
        : [5, 7, 8, 8, 15, 20, 5, 7];
  // Throwing disciplines reserve extra preparation; strength reserves setup checks.
  if (softballPitching || discipline === "Catching") {
    allocations[3]++;
    allocations[4]--;
  }
  if (discipline === "Strength/Speed") {
    allocations[0]++;
    allocations[4]--;
  }
  const warmup =
    WARMUPS.find(
      (w) => w.discipline === discipline && (!w.sport || w.sport === sport) && w.band === band,
    ) || WARMUPS.find((w) => w.discipline === discipline && (!w.sport || w.sport === sport));
  const candidates = DRILLS.filter(
    (d) =>
      d.discipline === discipline &&
      d.levels.includes(Math.max(1, age <= 12 ? Math.min(2, level) : level)) &&
      !/fatigue|weighted|pull.?down/i.test(d.name),
  );
  const text = priorities.join(" ").toLowerCase();
  const fundamentals: Partial<
    Record<
      LessonDiscipline,
      { id: string; name: string; setup: string; dose: string; cues: string[]; watch: string[] }[]
    >
  > = {
    Hitting: [
      {
        id: "hit-foundation",
        name: "Balanced tee contact",
        setup:
          "Use a correctly sized bat, a tee and a clear hitting lane. Rehearse a balanced stance and controlled swings toward a clear target.",
        dose: "Short sets with feedback and rest; prioritize safe, clean contact.",
        cues: ["See the ball", "Finish balanced"],
        watch: ["Unsafe bat path near others", "Loss of balance"],
      },
    ],
    Catching: [
      {
        id: "catch-foundation",
        name: "Controlled receiving and blocking",
        setup:
          "With appropriate catcher protection, begin with gentle feeds to a stable receiving position. Rehearse blocking footwork before increasing difficulty.",
        dose: "Small sets of controlled feeds; stop and reset if protection or technique is inadequate.",
        cues: ["Quiet target", "Balanced position"],
        watch: ["Unprotected athlete", "Discomfort"],
      },
    ],
    Fielding: [
      {
        id: "field-foundation",
        name: "Ready position and rolled ground balls",
        setup:
          "Roll predictable ground balls from a short appropriate distance. Rehearse ready position, moving behind the ball and a controlled throw to a target.",
        dose: "Small sets with separate footwork and throwing practice.",
        cues: ["Ready before the roll", "Move behind the ball"],
        watch: ["Looking away", "Rushed throws"],
      },
    ],
  };
  const ranked = [...candidates].sort(
    (a, b) =>
      Number(text.includes(b.problem.toLowerCase())) -
      Number(text.includes(a.problem.toLowerCase())),
  );
  const drills = softballPitching
    ? [
        {
          id: "sb-circle",
          name: "Underhand arm-circle rehearsal",
          setup:
            "Rehearse a comfortable underhand circle without a ball, then easy close-range releases. Instructor checks rhythm and release direction.",
          dose: "Short quality sets with rest; stop when mechanics or comfort change.",
          cues: ["Smooth circle", "Balanced finish"],
          watch: ["Discomfort", "Forced range of motion"],
        },
        {
          id: "sb-stride",
          name: "Stride and release connection",
          setup:
            "Progress from an easy underhand release to the athlete’s familiar full delivery. Use an appropriate distance selected by the instructor.",
          dose: "Instructor sets a low initial volume after reviewing recent pitching workload.",
          cues: ["Stay in rhythm", "Repeat the target line"],
          watch: ["Rushing", "Loss of balance"],
        },
        {
          id: "sb-command",
          name: "Underhand called-target challenge",
          setup:
            "Call a target before each pitch; record intended and actual locations using the existing command chart.",
          dose: "Short sets separated by feedback and rest.",
          cues: ["One target", "Repeat your routine"],
          watch: ["Fatigue", "Command loss"],
        },
      ]
    : discipline === "Strength/Speed"
      ? [
          {
            id: "ss-move",
            name: "Movement-quality circuit",
            setup:
              "Choose age-appropriate squat, hinge, push and pull patterns. Begin unloaded; use the athlete’s existing reviewed strength plan.",
            dose: "Document exercises, sets, repetitions and any load actually used.",
            cues: ["Control each repetition", "Quality before load"],
            watch: ["Pain", "Loss of technique"],
          },
          {
            id: "ss-speed",
            name: "Acceleration and landing practice",
            setup:
              "Rehearse starts, controlled deceleration and balanced landings in a clear space. Use full recovery between quality attempts.",
            dose: "Log distance and time only when measured; stop before technique deteriorates.",
            cues: ["Controlled finish", "Recover between attempts"],
            watch: ["Unsafe surface", "Fatigue"],
          },
        ]
      : [
          ...ranked.map((d) => ({
            id: d.id,
            name: d.name,
            setup: d.setup,
            dose: d.dose,
            cues: d.cues,
            watch: d.watch,
          })),
          ...(fundamentals[discipline] || []),
        ].slice(0, minutes === 30 ? 2 : 3);
  if (!drills.length)
    throw new Error(
      "No appropriate drills in the approved curriculum for this lesson. Ask an admin to review the template.",
    );
  const general = [
    "Ask about readiness, pain, fatigue and recent training before movement.",
    "Raise temperature with comfortable locomotion; activate and dynamically mobilize relevant movement patterns.",
  ];
  const sportPrep = softballPitching
    ? [
        "Underhand dry-circle rehearsal, easy close-range releases, then a gradual familiar windmill delivery. Do not use the baseball overhand progression.",
      ]
    : discipline === "Strength/Speed"
      ? [
          "Rehearse the selected movements unloaded and at controlled speed before adding resistance or faster attempts.",
        ]
      : sportWarmup(discipline, age).map((w) => `${w.name}: ${w.reps}`);
  const safety = [
    "Stop activity for pain or unusual symptoms; follow existing restrictions and refer concerns to the appropriate professional.",
    "Review recent games, practices, lessons and the existing workload plan. This template does not grant clearance or prescribe extra throwing.",
    "Use appropriate equipment, protective screens and a clear training space. Do not chase maximum measurements when fatigued.",
  ];
  if (discipline === "Pitching")
    safety.push(
      softballPitching
        ? "Review underhand pitching and other throwing together; do not copy baseball pitch-count rules as softball clearance."
        : "Follow the athlete’s applicable baseball pitch-count/rest restrictions; include lesson throws in workload review.",
    );
  const iq =
    (discipline === "Pitching" && sport === "baseball") ||
    discipline === "Hitting" ||
    discipline === "Catching"
      ? IQ_BY_DISCIPLINE[discipline as "Pitching" | "Hitting" | "Catching"]
          .filter((m) => m.band === band && !/fatigue|running|runners/.test(m.id))
          .slice(0, 2)
      : [];
  const decision =
    discipline === "Fielding"
      ? "Before the ball is put in play, identify outs, runners and the first safe throwing option. Explain when holding the ball is the better play."
      : discipline === "Strength/Speed"
        ? "Explain how readiness, movement quality and recovery change today’s training choices. Identify when to reduce load or stop."
        : sport === "softball" && discipline === "Pitching"
          ? "Use a count-and-runner scenario: select a familiar pitch and target, explain the decision, and rehearse the underhand pre-pitch routine. Discuss runner timing under the applicable softball rules."
          : "";
  const instructions = [
    ["Confirm the booked athlete, instructor, sport and service. Check attendance and equipment."],
    [
      "Review goals, recent assessments, previous feedback and restrictions. Agree on one observable objective.",
    ],
    general,
    sportPrep,
    [
      minutes === 30
        ? "Work one priority with a concise drill and transfer block."
        : "Work the main priority, then transfer the same cue into a realistic task.",
      ...drills.map((d) => `${d.name}: ${d.setup}`),
    ],
    [
      minutes === 75
        ? "Record a baseline, coach one adjustment, allow recovery, then retest under comparable conditions. Avoid a continuous 20-minute high-intensity block."
        : "Log representative practice repetitions and compare execution before and after the chosen cue.",
      "Practice observations stay separate from formally verified recruiting measurements.",
    ],
    [
      sport === "softball"
        ? "Discuss one softball situation appropriate to this discipline, the athlete’s age and current rules."
        : "Discuss one baseball situation appropriate to this discipline, the athlete’s age and current rules.",
      "Ask the athlete to explain the decision rather than merely repeat the cue.",
      ...(decision ? [decision] : []),
      ...iq.map((m) => `${m.t}: ${m.teach} Check: ${m.check}`),
    ],
    [
      "Record what improved, what still needs work, and an achievable next step. Assign existing safe homework with a clear dose and stop conditions.",
      "Share the family recap; keep instructor observations private. Confirm attendance and documentation before publishing.",
    ],
  ];
  return {
    id: `${sport}:${discipline}:${minutes}`,
    version: TEMPLATE_VERSION,
    sport,
    discipline,
    minutes,
    ageBand: band,
    objective:
      minutes === 75
        ? "Establish a baseline, coach a focused adjustment and compare a controlled retest."
        : "Improve one identified development priority and demonstrate transfer.",
    stages: stageNames.map((name, i) => ({
      name,
      minutes: allocations[i],
      instructions: instructions[i],
    })),
    drills,
    warmupReference: warmup ? { id: warmup.id, title: warmup.title, steps: warmup.steps } : null,
    safety,
    homework:
      "Choose one suitable drill from this session; document dose, purpose and any restrictions.",
    measurements:
      discipline === "Pitching"
        ? ["Command/TCI", "Pitch count", "Optional measured velocity"]
        : discipline === "Hitting"
          ? ["Contact quality", "Swing outcomes", "Optional measured exit velocity"]
          : discipline === "Catching"
            ? ["Receiving/blocking outcomes", "Optional measured transfer/pop time"]
            : discipline === "Fielding"
              ? ["Clean execution", "Throw quality", "Errors"]
              : ["Movement quality", "Sets/reps/load", "Measured sprint time"],
    adaptation: { age, level, priorities },
  };
}
const short = z.string().trim().max(500);
const numeric = z.number().finite().nonnegative().max(10000).optional();
const cell = z
  .object({
    row: z.number().int().min(0).max(4),
    col: z.number().int().min(0).max(4),
    noncompetitive: z.boolean().optional(),
  })
  .strict();
export const practiceLog = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum(lessonDisciplines),
    drill: short.default(""),
    observations: short.default(""),
    pitchType: short.optional(),
    velocity: z.number().min(0).max(120).optional(),
    intent: cell.optional(),
    actual: cell.optional(),
    outcome: short.optional(),
    contactQuality: short.optional(),
    mechanics: short.optional(),
    skill: short.optional(),
    transfer: short.optional(),
    footwork: short.optional(),
    position: short.optional(),
    repetitions: z.number().int().min(0).max(1000).optional(),
    ballType: short.optional(),
    execution: short.optional(),
    errors: z.number().int().min(0).max(1000).optional(),
    throwQuality: short.optional(),
    exercise: short.optional(),
    sets: z.number().int().min(0).max(100).optional(),
    load: numeric,
    loadUnit: z.enum(["lb", "kg", "bodyweight"]).optional(),
    timeSeconds: numeric,
    distance: short.optional(),
    measurement: short.optional(),
    measurementValue: numeric,
    measurementUnit: short.optional(),
  })
  .strict();
export const lessonDocument = z
  .object({
    stage: z.number().int().min(0).max(7),
    attendance: z.enum(["unconfirmed", "present", "partial", "no-show"]),
    readiness: z.enum(["unchecked", "ready", "restricted"]),
    restrictions: short,
    objective: short,
    overrideReason: short,
    actualMinutes: z.array(z.number().finite().min(0).max(300)).length(8),
    stageNotes: z.array(z.string().max(2000)).length(8),
    logs: z.array(practiceLog).max(2000),
    familyRecap: z.string().trim().max(5000),
    coachNotes: z.string().max(5000),
    homework: z.string().trim().max(2000),
    nextSteps: short,
  })
  .strict();
export type LessonDocument = z.infer<typeof lessonDocument>;
export const blankLessonDocument = (): LessonDocument => ({
  stage: 0,
  attendance: "unconfirmed",
  readiness: "unchecked",
  restrictions: "",
  objective: "",
  overrideReason: "",
  actualMinutes: Array(8).fill(0),
  stageNotes: Array(8).fill(""),
  logs: [],
  familyRecap: "",
  coachNotes: "",
  homework: "",
  nextSteps: "",
});
