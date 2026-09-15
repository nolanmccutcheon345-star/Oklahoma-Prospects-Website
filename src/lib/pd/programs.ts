import type { AthleteSlice } from "./context";
import {
  EXERCISES,
  exerciseById,
  loadBandForAge,
  type Exercise,
} from "./content/exercises";
import { THROWING_PLANS, type ThrowGoal, type ThrowTemplate } from "./content/throwing";
import { WARMUPS, warmupBandForAge, type WarmupPlan } from "./content/warmups";
import { ageOnClubDay, CLUB_DAY_ISO } from "./engines";
import { primaryDiscipline } from "./content";
import type { StrengthSet } from "./types";

export const TRACKS = ["Pitching", "Hitting", "Catching", "Two-way", "All-around"] as const;
export type StrengthTrack = (typeof TRACKS)[number];

export const PHASES = [
  "Postseason Recovery",
  "Accumulation",
  "Strength",
  "Power",
  "Preseason",
  "In-Season",
] as const;
export type SeasonPhase = (typeof PHASES)[number];

export const EMPHASES = [
  "Balanced",
  "Strength",
  "Speed & power",
  "Size",
  "Velocity",
  "Return to play",
] as const;
export type Emphasis = (typeof EMPHASES)[number];

export type ProgramSlot = {
  exerciseId: string;
  sets: number;
  reps: string;
  restSec: number;
  targetRpe: number;
  stopRule?: string;
  whySlot: string;
};

export type StrengthProgram = {
  track: StrengthTrack;
  phase: SeasonPhase;
  emphasis: Emphasis;
  emphasisReason: string;
  healthOverride: boolean;
  inSeasonBlockedVelocity: boolean;
  conservative: boolean;
  slots: ProgramSlot[];
  sessionNote: string;
};

function monthOfClub() {
  return Number(CLUB_DAY_ISO.slice(5, 7));
}

export function trackFromSlice(slice: AthleteSlice): StrengthTrack {
  const pos = slice.athlete.position.toLowerCase();
  const twoWay = /\b(p|hp)\b/.test(pos) && /\b(ss|2b|3b|1b|of|c|dh)\b/.test(pos);
  if (twoWay) return "Two-way";
  const disc = primaryDiscipline(slice.athlete.position, slice.athlete.sport);
  if (disc === "Catching") return "Catching";
  if (disc === "Hitting" || disc === "Fielding") return "Hitting";
  if (disc === "Pitching") return "Pitching";
  return "All-around";
}

export function healthReturning(slice: AthleteSlice): boolean {
  const blob = [
    slice.intake?.health ?? "",
    slice.athlete.notes,
    slice.athlete.tags.join(" "),
    slice.goals.map((g) => g.title + g.target).join(" "),
    slice.armCare.map((a) => `${a.feel} ${a.notes}`).join(" "),
    slice.plans.map((p) => p.focus + p.constraint).join(" "),
  ].join(" ");
  if (slice.athlete.tags.includes("trending-down")) return true;
  if (slice.armCare.some((row) => row.feel >= 7)) return true;
  return /soreness|pain|injur|return to|rtp|guarded|elbow|shoulder|recover/i.test(blob);
}

export function phaseFromSlice(slice: AthleteSlice): SeasonPhase {
  const month = monthOfClub();
  const recentOuting = slice.outings.some((row) => row.date >= "2026-09-01");
  const college = slice.athlete.opLevel === 7 || ageOnClubDay(slice.athlete.birthDate) >= 19;
  if (healthReturning(slice)) return "Postseason Recovery";
  if (month >= 11 || month === 12) return "Postseason Recovery";
  if (month === 1) return "Accumulation";
  if (month === 2) return "Strength";
  if (month === 3) return "Power";
  if (college && recentOuting) return "In-Season";
  if (recentOuting && month >= 4 && month <= 6) return "In-Season";
  if (recentOuting && (month === 8 || month === 9 || month === 10)) return "In-Season";
  if (month === 8 || month === 9) return "Preseason";
  if (month >= 4 && month <= 7) return "In-Season";
  return "Accumulation";
}

export function emphasisFromGoals(slice: AthleteSlice, phase: SeasonPhase): Emphasis {
  const text = [
    slice.intake?.goals ?? "",
    ...slice.goals.map((g) => `${g.title} ${g.target}`),
    slice.athlete.notes,
  ]
    .join(" ")
    .toLowerCase();
  if (/velo|velocity|\bmph\b|throw harder/.test(text)) return "Velocity";
  if (/size|mass|weight room|get bigger/.test(text)) return "Size";
  if (/speed|power|bat speed|explode/.test(text)) return "Speed & power";
  if (/strength|stronger|force/.test(text)) return "Strength";
  if (phase === "Power") return "Speed & power";
  if (phase === "Strength") return "Strength";
  if (phase === "Accumulation") return "Size";
  return "Balanced";
}

function pick(ids: string[], age: number, track: StrengthTrack): Exercise[] {
  return ids
    .map((id) => exerciseById(id))
    .filter((row): row is Exercise => {
      if (!row) return false;
      if (row.minAge > age) return false;
      if (row.tracks.includes(track) || row.tracks.includes("All-around")) return true;
      return false;
    });
}

function slot(
  exerciseId: string,
  sets: number,
  reps: string,
  restSec: number,
  targetRpe: number,
  whySlot: string,
  stopRule?: string,
): ProgramSlot {
  return { exerciseId, sets, reps, restSec, targetRpe, whySlot, stopRule };
}

function slotsFor(emphasis: Emphasis, phase: SeasonPhase, track: StrengthTrack, age: number): ProgramSlot[] {
  const youth = age <= 12;
  const inSeason = phase === "In-Season";
  const recovery = phase === "Postseason Recovery";

  if (emphasis === "Return to play" || recovery) {
    const ids = youth
      ? ["iso-split", "goblet", "farmer", "ytw", "mb-chest"]
      : ["iso-split", "goblet", "farmer", "ytw", "er", "row"];
    const exercises = pick(ids, age, track);
    return exercises.map((ex) => {
      if (ex.id === "iso-split") return slot(ex.id, 4, "30s hold", 90, 5, "Capacity in the stance. Nothing above RPE 7.");
      if (ex.id === "goblet") return slot(ex.id, 3, "10", 120, 6, "Higher reps, moderate load, long rest.");
      if (ex.id === "farmer") return slot(ex.id, 3, "40 yd", 120, 6, "Work capacity before output.");
      return slot(ex.id, 3, "12–15", 90, 6, "Tissue. Slow. If it talks, you stop.");
    });
  }

  if (emphasis === "Velocity") {
    const ids = youth
      ? ["broad", "mb-rot", "goblet", "ytw"]
      : ["trap-bar", "lmj", "mb-rot", "rfess", "ytw", "er", "reverse-throw"];
    const exercises = pick(ids, age, track);
    return exercises.map((ex) => {
      if (ex.id === "trap-bar") return slot(ex.id, 4, "3–5", 180, 8, "Heavier, lower-volume main lift. The force ceiling, not the pump.");
      if (ex.id === "rfess") return slot(ex.id, 3, "5", 150, 8, "Lead-leg force at a real load.");
      if (ex.id === "lmj")
        return slot(ex.id, 5, "3", 120, 9, "More power volume.", "Stop the set the moment the jump shortens.");
      if (ex.id === "mb-rot")
        return slot(ex.id, 6, "3 each", 90, 9, "More power volume. Hips last the ball.");
      if (ex.id === "broad")
        return slot(ex.id, 6, "2", 90, 8, "Youth power. Full recovery.", "Stop when the jump shortens.");
      return slot(ex.id, 3, "12", 60, 6, "Extra cuff work is the tax on a velocity block.");
    });
  }

  if (emphasis === "Size") {
    const ids = youth ? ["goblet", "pushup", "row", "farmer", "pallof"] : ["goblet", "rfess", "row", "pushup", "farmer"];
    return pick(ids, age, track).map((ex) => {
      if (ex.id === "farmer") return slot(ex.id, 3, "45–60s", 60, 7, "Higher volume, shorter rest.");
      return slot(ex.id, 4, "8–12", 60, 7, "Higher volume, moderate load, shorter rest. Size is sets, not hero weight.");
    });
  }

  if (emphasis === "Speed & power") {
    const ids = youth ? ["broad", "mb-chest", "goblet"] : ["broad", "lmj", "mb-rot", "trap-bar"];
    return pick(ids, age, track).map((ex) => {
      if (ex.id === "trap-bar") return slot(ex.id, 3, "3", 180, 7, "Contrast, not a grind. Fresh for the jumps.");
      if (ex.id === "goblet") return slot(ex.id, 3, "5", 120, 6, "Keep the squat in so the jump has a home.");
      return slot(
        ex.id,
        6,
        "2–3",
        120,
        9,
        "Full recovery between reps.",
        "Stop when output drops, not when the set ends.",
      );
    });
  }

  if (emphasis === "Strength") {
    const ids = youth ? ["goblet", "sl-rdl", "row", "ytw"] : ["trap-bar", "rfess", "row", "ytw"];
    return pick(ids, age, track).map((ex) => {
      if (ex.id === "ytw") return slot(ex.id, 2, "10", 60, 6, "Keep the platform.");
      return slot(ex.id, inSeason ? 3 : 5, youth ? "6–8" : "4–6", 150, 8, "Raise the force ceiling. Rest is part of the lift.");
    });
  }

  // Balanced
  const extra =
    track === "Catching"
      ? ["copenhagen", "deep-squat"]
      : track === "Hitting"
        ? ["pallof", "clams"]
        : track === "Pitching"
          ? ["ytw", "rfess"]
          : ["pallof", "ytw"];
  const ids = youth
    ? ["goblet", "broad", "mb-chest", ...extra]
    : ["trap-bar", "mb-rot", "rfess", ...extra];
  const list = pick(ids, age, track).slice(0, inSeason ? 4 : 5);
  return list.map((ex) => {
    if (ex.category === "Power" || ex.category === "Rotational")
      return slot(ex.id, 4, "4", 90, 8, "A little speed so the strength has somewhere to go.");
    if (ex.category === "Cuff" || ex.category === "Core" || ex.category === "Mobility")
      return slot(ex.id, 2, "10–12", 60, 6, "Keep the positions the sport uses.");
    return slot(ex.id, inSeason ? 3 : 4, "6", 120, 7, "Enough strength work to hold the quality. Not a second practice.");
  });
}

export function generateStrengthProgram(
  slice: AthleteSlice,
  overrides?: { track?: StrengthTrack; phase?: SeasonPhase; emphasis?: Emphasis },
): StrengthProgram {
  const age = ageOnClubDay(slice.athlete.birthDate);
  const college = slice.athlete.opLevel === 7 || age >= 19;
  const conservative = !slice.athlete.assessmentComplete;
  const returning = healthReturning(slice);
  const track = overrides?.track ?? trackFromSlice(slice);
  let phase = overrides?.phase ?? phaseFromSlice(slice);
  let emphasis = overrides?.emphasis ?? emphasisFromGoals(slice, phase);
  let healthOverride = false;
  let inSeasonBlockedVelocity = false;

  if (returning) {
    healthOverride = true;
    emphasis = "Return to play";
    if (!overrides?.phase) phase = "Postseason Recovery";
  } else if ((phase === "In-Season" || phase === "Preseason") && emphasis === "Velocity") {
    inSeasonBlockedVelocity = true;
    emphasis = "Balanced";
  }

  if (conservative && emphasis === "Velocity") emphasis = "Balanced";
  if (age <= 10 && emphasis === "Size") emphasis = "Balanced";

  const slots = slotsFor(emphasis, phase, track, age).filter((row) => {
    const ex = exerciseById(row.exerciseId);
    if (!ex) return false;
    if (slice.athlete.sport !== "softball" && ex.id === "windmill-circle") return false;
    if (college && ex.minAge > 19) return false;
    return true;
  });

  if (slice.athlete.sport === "softball" && track === "Pitching" && !slots.some((s) => s.exerciseId === "windmill-circle")) {
    const wm = exerciseById("windmill-circle");
    if (wm && age >= wm.minAge) {
      slots.push(slot("windmill-circle", 2, "8 circles", 45, 5, "Softball adds a windmill progression. Baseball cuff work does not replace it."));
    }
  }

  const emphasisReason = healthOverride
    ? "Health status outranks goals. An athlete returning from injury never gets a velocity block regardless of what their goal says."
    : inSeasonBlockedVelocity
      ? "Velocity work belongs in the offseason, not in-season. The goal still says velo; the calendar says no."
      : conservative
        ? "No assessment on file. Conservative defaults — we still build a session, we do not invent a max."
        : `Emphasis from stated goals and ${phase.toLowerCase()} on the calendar.`;

  const sessionNote =
    emphasis === "Return to play"
      ? "Nothing above RPE 7. Higher reps, longer rest — capacity before output."
      : emphasis === "Velocity"
        ? "More power volume, heavier but lower-volume main lifts, extra cuff work."
        : emphasis === "Size"
          ? "Higher volume, moderate load, shorter rest."
          : emphasis === "Speed & power"
            ? "Full recovery between reps. Stop when output drops, not when the set ends."
            : emphasis === "Strength"
              ? "The force ceiling. Rest is the work."
              : "Enough of each quality to keep the athlete an athlete.";

  return {
    track,
    phase,
    emphasis,
    emphasisReason,
    healthOverride,
    inSeasonBlockedVelocity,
    conservative,
    slots,
    sessionNote,
  };
}

export function epley1rm(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  if (reps >= 12) return Math.round(weight * 1.4);
  return Math.round(weight * (1 + reps / 30));
}

export function historyFor(sets: StrengthSet[], exerciseId: string) {
  return sets
    .filter((row) => row.exerciseId === exerciseId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.setNumber - b.setNumber);
}

export function lastWorkingSet(sets: StrengthSet[], exerciseId: string): StrengthSet | null {
  const rows = historyFor(sets, exerciseId);
  return rows.length ? rows[rows.length - 1] : null;
}

export function suggestLoad(
  exercise: Exercise,
  age: number,
  college: boolean,
  sets: StrengthSet[],
  targetRpe: number,
): { display: string; weight: number | null; note: string } {
  const band = loadBandForAge(age, college);
  const start = exercise.loads[band];
  const last = lastWorkingSet(sets, exercise.id);
  if (!last || exercise.loadMode !== "load") {
    return {
      display: start,
      weight: parseStartWeight(start),
      note: last ? "Use the starting load for this age. Jumps and holds are not loaded from a 1RM." : "Starting load for this age band. Progress from here, not from a made-up max.",
    };
  }
  if (last.rpe <= targetRpe) {
    const next = Math.round((last.weight + Math.max(5, last.weight * 0.025)) / 5) * 5;
    return {
      display: `${next} lb`,
      weight: next,
      note: `Last set ${last.weight}×${last.reps} at RPE ${last.rpe} (at or under target ${targetRpe}). Progress.`,
    };
  }
  const back = Math.round((last.weight * 0.9) / 5) * 5;
  return {
    display: `${back} lb`,
    weight: back,
    note: `Last set ${last.weight}×${last.reps} at RPE ${last.rpe} (over target ${targetRpe}). Back off.`,
  };
}

function parseStartWeight(raw: string): number | null {
  const nums = [...raw.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  if (nums.length === 1) return nums[0];
  return Math.round((nums[0] + nums[1]) / 2);
}

export function e1rmTrend(sets: StrengthSet[], exerciseId: string) {
  const byDate = new Map<string, StrengthSet[]>();
  for (const row of historyFor(sets, exerciseId)) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  return Array.from(byDate.entries()).map(([date, rows]) => {
    const best = rows.reduce((acc, row) => {
      const est = epley1rm(row.weight, row.reps);
      return est > acc ? est : acc;
    }, 0);
    return { date, e1rm: best };
  });
}

export function warmupForSlice(slice: AthleteSlice): WarmupPlan {
  const age = ageOnClubDay(slice.athlete.birthDate);
  const band = warmupBandForAge(age);
  const disc = primaryDiscipline(slice.athlete.position, slice.athlete.sport);
  const sport = slice.athlete.sport;
  if (sport === "softball" && disc === "Pitching") {
    return WARMUPS.find((row) => row.sport === "softball" && row.band === band) ?? WARMUPS[9];
  }
  if (disc === "Fielding") {
    return WARMUPS.find((row) => row.discipline === "Fielding") ?? WARMUPS[WARMUPS.length - 1];
  }
  return (
    WARMUPS.find((row) => row.discipline === disc && row.band === band && row.sport !== "softball") ??
    WARMUPS.find((row) => row.discipline === disc && row.sport !== "softball") ??
    WARMUPS[0]
  );
}

export function throwingForSlice(slice: AthleteSlice): ThrowTemplate[] {
  const disc = primaryDiscipline(slice.athlete.position, slice.athlete.sport);
  const age = ageOnClubDay(slice.athlete.birthDate);
  const returning = healthReturning(slice);
  return THROWING_PLANS.filter((row) => {
    if (row.discipline !== disc && !(disc === "Fielding" && row.discipline === "Hitting")) return false;
    if (age <= 12 && row.goal !== "Youth" && row.goal !== "Return to Throw") return false;
    if (age > 12 && row.goal === "Youth") return false;
    if (returning && row.goal !== "Return to Throw") return false;
    if (!returning && row.goal === "Return to Throw") return false;
    return true;
  });
}

export function defaultThrowGoal(slice: AthleteSlice): ThrowGoal {
  if (healthReturning(slice)) return "Return to Throw";
  const age = ageOnClubDay(slice.athlete.birthDate);
  if (age <= 12) return "Youth";
  const phase = phaseFromSlice(slice);
  if (phase === "In-Season") return "In-Season";
  const emph = emphasisFromGoals(slice, phase);
  if (emph === "Velocity") return "Velocity";
  return "Command";
}
