import { activityPoints } from "./automation";
import { scorePitch, tciOf } from "./core-algorithms.js";
import { SERVICES_INIT } from "./content/commerce";
import {
  DRILLS,
  FLAWS,
  drillById,
  iqBandForAge,
  iqModulesFor,
  primaryDiscipline,
  rankedDiagnostics,
  type Discipline,
  type Drill,
  type Flaw,
  type GameIqModule,
} from "./content";
import type { AthleteSlice } from "./context";
import type { Booking, BullpenPitch } from "./types";

export const LESSON_STAGES = [
  { id: "setup", label: "Set up", short: "Setup" },
  { id: "brief", label: "Brief", short: "Brief" },
  { id: "warmup", label: "Warm-up", short: "Warm" },
  { id: "drills", label: "Drills", short: "Drills" },
  { id: "sport", label: "Sport warm-up", short: "Sport" },
  { id: "tracker", label: "Tracker", short: "Track" },
  { id: "iq", label: "Game IQ", short: "IQ" },
  { id: "recap", label: "Recap", short: "Recap" },
] as const;

export type LessonStageId = (typeof LESSON_STAGES)[number]["id"];

export const INTERVENTION_METHODS = [
  "constraint drill",
  "verbal cue",
  "grip",
  "setup",
  "tempo",
  "intent",
] as const;

export const INTERVENTION_OUTCOMES = ["Retained", "Neutral", "Discarded"] as const;

export type RampBlock = {
  letter: "R" | "A" | "M" | "P";
  name: string;
  reps: string;
  detail: string;
};

export type LessonDraft = {
  athleteId: string;
  bookingId?: string;
  serviceId: string;
  lessonType: string;
  discipline: Discipline;
  stage: number;
  flawIds: string[];
  drillIds: string[];
  homeworkIds: string[];
  iqModuleId: string | null;
  method: (typeof INTERVENTION_METHODS)[number];
  constraint: string;
  cue: string;
  preScore: string;
  postScore: string;
  outcome: (typeof INTERVENTION_OUTCOMES)[number];
  pitches: BullpenPitch[];
  swings: { result: string }[];
  catchReps: { kind: string; result: string; pop?: string }[];
  askVelo: boolean;
  pendingVelo: boolean;
  notes: string;
  updatedAt: string;
};

export const DRAFT_KEY = "op.pd.lesson.draft.v1";

export function emptyDraft(partial: Partial<LessonDraft> & { athleteId: string }): LessonDraft {
  return {
    serviceId: "s3",
    lessonType: "Private Development 60",
    discipline: "Pitching",
    stage: 0,
    flawIds: [],
    drillIds: [],
    homeworkIds: [],
    iqModuleId: null,
    method: "constraint drill",
    constraint: "",
    cue: "",
    preScore: "",
    postScore: "",
    outcome: "Retained",
    pitches: [],
    swings: [],
    catchReps: [],
    askVelo: true,
    pendingVelo: false,
    notes: "",
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export function readDrafts(): Record<string, LessonDraft> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, LessonDraft>;
  } catch {
    return {};
  }
}

export function writeDraft(draft: LessonDraft) {
  if (typeof window === "undefined") return;
  const all = readDrafts();
  all[draft.athleteId] = { ...draft, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
}

export function clearDraft(athleteId: string) {
  if (typeof window === "undefined") return;
  const all = readDrafts();
  delete all[athleteId];
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
}

export function lessonTypeFromBooking(booking?: Booking | null) {
  if (!booking) return { serviceId: "s3", name: "Private Development 60", minutes: 60 };
  const service = SERVICES_INIT.find((row) => row.id === booking.serviceId);
  return {
    serviceId: booking.serviceId,
    name: service?.name ?? "Private Development 60",
    minutes: service?.duration ?? 60,
  };
}

export function matchFlaws(slice: AthleteSlice): Flaw[] {
  const disc = primaryDiscipline(slice.athlete.position, slice.athlete.sport);
  const text = [
    ...slice.diagnose.map((row) => row.finding),
    ...slice.plans.map((row) => `${row.focus} ${row.constraint}`),
    ...slice.skillPlans.map((row) => `${row.skill} ${row.drill}`),
    slice.athlete.notes,
  ]
    .join(" ")
    .toLowerCase();
  const rows = FLAWS.filter((row) => row.discipline === disc);
  const scored = rows
    .map((row) => {
      let score = 0;
      const blob = `${row.name} ${row.looksLike} ${row.why}`.toLowerCase();
      for (const word of text.split(/[^a-z]+/).filter((w) => w.length > 3)) {
        if (blob.includes(word)) score += 1;
      }
      if (text.includes("arm side") && blob.includes("arm-side")) score += 8;
      if (text.includes("glove") && blob.includes("glove")) score += 6;
      if (text.includes("pop") && blob.includes("pop")) score += 8;
      if (text.includes("transfer") && blob.includes("exchange")) score += 8;
      if (text.includes("across") && blob.includes("across")) score += 8;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score);
  const picked = scored.filter((row) => row.score > 0).slice(0, 2).map((row) => row.row);
  if (picked.length) return picked;
  return rows.slice(0, 2);
}

export function drillsForFlaws(flawIds: string[], planDrills: string[]): Drill[] {
  const ids: string[] = [];
  for (const id of flawIds) {
    const flaw = FLAWS.find((row) => row.id === id);
    for (const drillId of flaw?.drills ?? []) {
      if (!ids.includes(drillId) && drillById(drillId)) ids.push(drillId);
    }
  }
  for (const name of planDrills) {
    const match = DRILLS.find((row) => row.name.toLowerCase().includes(name.toLowerCase().slice(0, 10)));
    if (match && !ids.includes(match.id)) ids.push(match.id);
  }
  return ids.map((id) => drillById(id)).filter((row): row is Drill => Boolean(row)).slice(0, 6);
}

export function rampFor(discipline: Discipline, age: number): RampBlock[] {
  const youth = age <= 12;
  if (discipline === "Hitting") {
    return [
      { letter: "R", name: "Raise", reps: youth ? "20 skips · 10 open-closes" : "30 skips · 10 open-closes", detail: "Get the tissue warm before a bat is in the hands." },
      { letter: "A", name: "Activate", reps: "8 band pull-aparts · 8 glute bridges", detail: "Scap and posterior chain before rotation." },
      { letter: "M", name: "Mobilize", reps: "6 world's greatest each side · 6 thoracic openers", detail: "Hips and T-spine have to move before the barrel does." },
      { letter: "P", name: "Potentiate", reps: youth ? "5 med-ball rotational throws each side" : "8 med-ball rotational throws each side", detail: "Intent without a bat. Hips lead." },
    ];
  }
  if (discipline === "Catching") {
    return [
      { letter: "R", name: "Raise", reps: "20 lateral shuffles · 10 hip openers", detail: "Hips have to get low before the mitt does." },
      { letter: "A", name: "Activate", reps: "8 band rows · 8 anti-rotation holds", detail: "Quiet core is a quiet mitt." },
      { letter: "M", name: "Mobilize", reps: "6 ankle rocks · 6 hip 90/90 each side", detail: "Receiving and blocking both start at the hips and ankles." },
      { letter: "P", name: "Potentiate", reps: youth ? "8 short hops · 6 stance holds" : "12 short hops · 8 stance holds", detail: "Hands last. Feet first." },
    ];
  }
  if (discipline === "Fielding") {
    return [
      { letter: "R", name: "Raise", reps: "20 skips · 10 carioca each way", detail: "Footwork before a ball is hit." },
      { letter: "A", name: "Activate", reps: "8 mini-band walks · 8 hop holds", detail: "Get the feet loud and the hands quiet." },
      { letter: "M", name: "Mobilize", reps: "6 hip openers · 6 world's greatest each side", detail: "Range on the first step is a mobility problem first." },
      { letter: "P", name: "Potentiate", reps: youth ? "8 short hops · 6 drop steps" : "12 short hops · 8 drop steps", detail: "Game speed, short distance." },
    ];
  }
  return [
    { letter: "R", name: "Raise", reps: youth ? "20 jumping jacks · 10 skips · 10 high knees" : "30 jumping jacks · 15 skips · 12 high knees", detail: "Heart rate up. No throwing yet." },
    { letter: "A", name: "Activate", reps: "8 band pull-aparts · 8 YTWs · 8 reverse throws", detail: "Scap and cuff before the arm path exists." },
    { letter: "M", name: "Mobilize", reps: youth ? "6 world's greatest each side · 6 hip openers" : "8 world's greatest each side · 8 hip openers · 6 sleeper stretch", detail: "Lead hip and T-spine decide whether the arm is on time." },
    { letter: "P", name: "Potentiate", reps: youth ? "8 athletic throws · 8 rocker throws" : "10 athletic throws · 8 rockers · 6 step-behinds", detail: "Intent into the throw. Still sub-max." },
  ];
}

export function sportWarmup(discipline: Discipline, age: number): { name: string; reps: string }[] {
  const youth = age <= 12;
  if (discipline === "Hitting") {
    return [
      { name: "Dry swings", reps: "10, same load every time" },
      { name: "Tee, middle-middle", reps: youth ? "8" : "10" },
      { name: "Tee, outer third", reps: "8 — only hard oppo counts" },
    ];
  }
  if (discipline === "Catching") {
    return [
      { name: "Receives, middle", reps: "10, stick it" },
      { name: "Receives, edges", reps: "6 glove · 6 arm" },
      { name: "Blocks, known location", reps: youth ? "6" : "10" },
    ];
  }
  if (discipline === "Fielding") {
    return [
      { name: "Ground balls, middle", reps: "8" },
      { name: "Forehand / backhand", reps: "6 each" },
      { name: "Do-or-die charge", reps: youth ? "4" : "6" },
    ];
  }
  return [
    { name: "Catch play 45 ft", reps: youth ? "8 each" : "10 each" },
    { name: "Catch play 60 ft", reps: "8 each" },
    { name: "Long toss stretch", reps: youth ? "6 at 75 ft" : "8 at 90–120 ft" },
    { name: "Pull down / compact", reps: "6, downhill" },
  ];
}

export function weeklyPoints(slice: AthleteSlice) {
  const row = activityPoints(slice);
  return { earned: row.earned, target: row.target, met: row.met };
}

export function iqChoices(slice: AthleteSlice, age: number): GameIqModule[] {
  const pack = iqModulesFor(slice, age);
  const covered = new Set(slice.gameIq.map((row) => row.situation.toLowerCase()));
  const fresh = pack.rows.filter((row) => !covered.has(row.t.toLowerCase()));
  return (fresh.length ? fresh : pack.rows).slice(0, 6);
}

export function generateRecaps(input: {
  firstName: string;
  lastName: string;
  lessonType: string;
  constraint: string;
  method: string;
  cue: string;
  pre: string;
  post: string;
  outcome: string;
  drills: Drill[];
  iq?: GameIqModule | null;
  tci?: number | null;
  swings?: number;
}): { parent: string; player: string; coach: string } {
  const homework = input.drills.length
    ? input.drills.map((row) => `${row.name} (${row.dose})`).join("; ")
    : "None assigned.";
  const cue = input.cue ? `"${input.cue}"` : "the constraint we named today";
  const moved =
    input.outcome === "Retained"
      ? "That stays in the plan."
      : input.outcome === "Neutral"
        ? "We'll keep an eye on it next session — not enough to keep or kill."
        : "We're discarding it. It didn't move the number.";
  const scoreLine =
    input.pre || input.post
      ? `Pre ${input.pre || "—"} → post ${input.post || "—"}.`
      : "";
  const parent = [
    `${input.firstName} trained ${input.lessonType.toLowerCase()} today.`,
    input.constraint
      ? `We worked ${input.constraint} with a ${input.method}.`
      : `We stayed on one constraint.`,
    `The cue was ${cue}.`,
    scoreLine,
    moved,
    `Homework: ${homework}`,
    input.iq ? `Game IQ covered: ${input.iq.t}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const player = [
    `${input.firstName} — one thing: ${cue}.`,
    input.constraint ? `That's the ${input.constraint} work.` : "",
    scoreLine,
    `Homework: ${homework}`,
    "Do the dose. Film one set if you can.",
  ]
    .filter(Boolean)
    .join(" ");

  const coach = [
    `${input.lastName}, ${input.firstName}. ${input.lessonType}.`,
    `Method: ${input.method}. Constraint: ${input.constraint || "—"}. Cue: ${input.cue || "—"}.`,
    `Pre ${input.pre || "—"} / post ${input.post || "—"} / ${input.outcome}.`,
    input.tci != null ? `TCI ${input.tci} on ${input.swings ?? 0} scored pitches.` : "",
    input.iq ? `IQ: ${input.iq.t} — ${input.iq.check}` : "No IQ module.",
    `Homework: ${homework}`,
  ]
    .filter(Boolean)
    .join(" ");

  return { parent, player, coach };
}

export function scoreChart(pitches: BullpenPitch[]) {
  const scored = pitches.map((p) => ({
    ...p,
    score: p.score ?? scorePitch(p.intent, p.actual),
  }));
  return { pitches: scored, tci: tciOf(scored) as number };
}

export function diagnosePanel(slice: AthleteSlice) {
  return rankedDiagnostics(slice);
}

export function defaultCue(flawIds: string[]) {
  const flaw = FLAWS.find((row) => row.id === flawIds[0]);
  return flaw?.cues[0] ?? "";
}

export function defaultConstraint(slice: AthleteSlice, flawIds: string[]) {
  const plan = slice.plans.find((row) => row.status === "active");
  if (plan) return plan.constraint;
  const flaw = FLAWS.find((row) => row.id === flawIds[0]);
  return flaw?.name ?? "";
}

export type PublishLessonInput = {
  athleteId: string;
  bookingId?: string;
  serviceId: string;
  lessonType: string;
  focus: string;
  minutes: number;
  homeworkIds: string[];
  iqModuleId: string | null;
  iqTitle?: string;
  intervention: {
    method: string;
    constraint: string;
    cue: string;
    preScore?: number;
    postScore?: number;
    outcome: string;
  };
  recaps: { parent: string; player: string; coach: string };
  bullpen?: { pitches: number; tci: number; chart: BullpenPitch[]; notes: string };
  velocities: number[];
  coachId: string;
};
