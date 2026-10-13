import { z } from "zod";
import { lessonDisciplines } from "./lesson-templates";
import { skillBands } from "./training-catalog";
const id = z.string().trim().min(1).max(150),
  text = z.string().trim().max(3000),
  required = text.min(5);
export const trainingDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
export const trainingTask = z
  .object({
    id,
    drillId: id,
    phase: z.number().int().min(0).max(3).optional(),
    date: trainingDate,
    dose: required,
    rest: required,
    target: required,
  })
  .strict();
export const assignmentInput = z
  .object({
    id,
    athleteId: id,
    programId: id.optional(),
    reviewedAssignmentIds: z.array(id).max(200).default([]),
    sport: z.enum(["baseball", "softball"]),
    discipline: z.enum(lessonDisciplines),
    title: z.string().trim().min(3).max(150),
    skill: z.enum(skillBands),
    weeks: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(8), z.literal(12)]),
    startDate: trainingDate,
    reviewDate: trainingDate,
    goal: required,
    baseline: required,
    workload: required,
    equipment: required,
    reason: required,
    qualifiedReview: z.literal(true),
    tasks: z.array(trainingTask).min(1).max(84),
  })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.tasks.map((t) => t.id)).size !== v.tasks.length)
      c.addIssue({ code: "custom", message: "Duplicate task IDs" });
    if (v.reviewDate < v.startDate)
      c.addIssue({ code: "custom", message: "Review must follow start" });
    const end = new Date(Date.parse(v.startDate) + v.weeks * 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    if (v.tasks.some((t) => t.date < v.startDate || t.date >= end))
      c.addIssue({ code: "custom", message: "Tasks must fall within program dates" });
  });
export const practiceInput = z
  .object({
    assignmentId: id,
    taskId: id,
    revision: z.number().int().nonnegative(),
    status: z.enum(["full", "partial", "skipped", "modified"]),
    notes: text,
    question: text,
    repetitions: z.number().int().min(0).max(1000),
    successful: z.number().int().min(0).max(1000),
    sets: z.number().int().min(0).max(100),
    load: z.number().min(0).max(1000),
    minutes: z.number().min(0).max(600),
    throws: z.number().int().min(0).max(500),
    throwType: text.max(100),
    distance: text.max(100),
    intensity: z.enum(["none", "easy", "moderate", "high"]),
    rpe: z.number().int().min(0).max(10),
    fatigue: z.enum(["none", "mild", "unusual"]),
    pain: z.boolean(),
  })
  .strict()
  .refine((v) => v.successful <= v.repetitions, "Successful repetitions cannot exceed attempts");
export const trainingReviewInput = z
  .object({
    assignmentId: id,
    revision: z.number().int().positive(),
    action: z.enum([
      "continue",
      "advance",
      "repeat",
      "modify",
      "reassess",
      "pause",
      "complete",
      "discontinue",
    ]),
    feedback: required,
    safetyReviewed: z.boolean(),
  })
  .strict();
export type AssignmentInput = z.infer<typeof assignmentInput>;
export type PracticeInput = z.infer<typeof practiceInput>;
export type TrainingReviewInput = z.infer<typeof trainingReviewInput>;
export type TrainingAssignment = {
  id: string;
  athlete_id: string;
  created_by: string;
  revision: number;
  status: "active" | "paused" | "completed" | "discontinued";
  document: AssignmentInput & {
    age: number;
    ageBand: string;
    version: string;
    coachName: string;
    phases: string[];
    drills: import("./training-catalog").TrainingDrill[];
    phase: number;
    program?: import("./development-programs").DevelopmentProgram;
    evidence?: import("./development-evidence").Evidence[];
    workloadSnapshot?: ReturnType<typeof import("./development-evidence").developmentWorkload>;
  };
};
export type TrainingLog = {
  id: string;
  assignment_id: string;
  athlete_id: string;
  task_id: string;
  actor_id: string;
  revision: number;
  document: PracticeInput & { source: "self-reported" | "coach-observed"; phase?: number };
};
