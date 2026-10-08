import { z } from "zod";
import { validDate } from "./scheduling";

export const EVALUATION_SKILLS = [
  { key: "contact", label: "Contact / barrel control" },
  { key: "approach", label: "Hitting approach / balance" },
  { key: "fielding", label: "Fielding hands / feet" },
  { key: "throwing", label: "Throw accuracy / transfer" },
  { key: "movement", label: "Athletic movement" },
  { key: "knowledge", label: "Baseball / softball knowledge" },
  { key: "coachability", label: "Coachability / effort" },
] as const;
export type EvaluationSkill = (typeof EVALUATION_SKILLS)[number]["key"];
const score = z.number().int().min(1).max(5).nullable();
const note = z.string().trim().max(1500);
const ratingShape = {
  contact: score,
  approach: score,
  fielding: score,
  throwing: score,
  movement: score,
  knowledge: score,
  coachability: score,
};
const evidenceShape = {
  contact: note,
  approach: note,
  fielding: note,
  throwing: note,
  movement: note,
  knowledge: note,
  coachability: note,
};
export const evaluationPayloadInput = z
  .object({
    playerNumber: z.string().trim().max(20),
    positions: z.string().trim().max(120),
    bats: z.enum(["", "R", "L", "S"]),
    throws: z.enum(["", "R", "L"]),
    session: z.string().trim().max(120),
    readiness: z.enum(["", "ready", "rest", "recheck"]),
    workload: note,
    readinessNotes: note,
    ratings: z.object(ratingShape).strict(),
    evidence: z.object(evidenceShape).strict(),
    throwingReps: z.string().trim().max(100),
    groundReps: z.string().trim().max(100),
    outfieldReps: z.string().trim().max(100),
    contactReps: z.string().trim().max(100),
    movementResult: z.string().trim().max(150),
    pitchingReps: z.string().trim().max(100),
    drillDetails: note,
    strengths: note,
    nextLook: note,
    followUpDate: z
      .string()
      .refine((v) => v === "" || validDate(v), "Choose a valid follow-up date."),
  })
  .strict();
export const evaluationInput = z
  .object({
    id: z.string().uuid(),
    baseRevision: z.number().int().min(0),
    registrationId: z.string().min(1).max(200).nullable(),
    teamId: z.string().min(1).max(150),
    playerName: z.string().trim().min(1, "Enter the player name.").max(120),
    evaluationDate: z.string().refine(validDate, "Choose a valid evaluation date."),
    status: z.enum(["draft", "submitted"]),
    recommendation: z.enum(["undecided", "invite", "callback", "development", "incomplete"]),
    payload: evaluationPayloadInput,
  })
  .strict();
export type EvaluationPayload = z.infer<typeof evaluationPayloadInput>;
export type EvaluationInput = z.infer<typeof evaluationInput>;
export type EvaluationTeam = {
  id: string;
  name: string;
  age: string;
  sport: "baseball" | "softball";
};
export type EvaluationCandidate = {
  id: string;
  name: string;
  age: string;
  sport: string;
  session: string;
  teamIds: string[];
};
export type SavedEvaluation = Omit<EvaluationInput, "baseRevision"> & {
  revision: number;
  evaluatorId: string;
  evaluatorName: string;
  ageGroup: string;
  sport: "baseball" | "softball";
  updatedAt: string;
  canEdit: boolean;
};
export type EvaluationWorkspace = {
  owner: boolean;
  name: string;
  teams: EvaluationTeam[];
  candidates: EvaluationCandidate[];
  evaluations: SavedEvaluation[];
};
export const RECOMMENDATIONS = {
  undecided: "Undecided",
  invite: "Consider invite",
  callback: "Callback",
  development: "Development follow-up",
  incomplete: "Incomplete evaluation",
} as const;
export function blankEvaluationPayload(): EvaluationPayload {
  return {
    playerNumber: "",
    positions: "",
    bats: "",
    throws: "",
    session: "",
    readiness: "",
    workload: "",
    readinessNotes: "",
    ratings: {
      contact: null,
      approach: null,
      fielding: null,
      throwing: null,
      movement: null,
      knowledge: null,
      coachability: null,
    },
    evidence: {
      contact: "",
      approach: "",
      fielding: "",
      throwing: "",
      movement: "",
      knowledge: "",
      coachability: "",
    },
    throwingReps: "",
    groundReps: "",
    outfieldReps: "",
    contactReps: "",
    movementResult: "",
    pitchingReps: "",
    drillDetails: "",
    strengths: "",
    nextLook: "",
    followUpDate: "",
  };
}
export function evaluationTotal(ratings: EvaluationPayload["ratings"]) {
  const values = EVALUATION_SKILLS.map((s) => ratings[s.key]);
  return values.every((v): v is number => v !== null && Number.isInteger(v) && v >= 1 && v <= 5)
    ? values.reduce((a, b) => a + b, 0)
    : null;
}
export function normalizedEvaluationAge(value: string) {
  const match = value.trim().match(/^(\d{1,2})\s*[uU]?(?:\s|$)/);
  return match ? `${Number(match[1])}U` : value.trim().toUpperCase();
}
