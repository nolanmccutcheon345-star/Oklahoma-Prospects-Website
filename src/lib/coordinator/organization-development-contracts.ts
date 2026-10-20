import { z } from "zod";
import { lessonDisciplines, lessonSports } from "../pd/lesson-templates";
import { trainingDate } from "../pd/training";
import { skillBands, type TrainingDrill } from "../pd/training-catalog";
import type { DevelopmentProgram } from "../pd/development-programs";

const id = z.string().trim().min(1).max(150);
export const organizationDevelopmentProfileInput = z
  .object({
    athleteId: id,
    revision: z.number().int().nonnegative(),
    position: z.string().trim().max(80),
    throws: z.enum(["", "R", "L"]),
    bats: z.enum(["", "R", "L"]),
    graduationYear: z.number().int().min(0).max(2200),
    school: z.string().trim().max(150),
    city: z.string().trim().max(150),
  })
  .strict();
export type OrganizationDevelopmentProfileInput = z.infer<
  typeof organizationDevelopmentProfileInput
>;

export const developmentMetricKinds = [
  "velocity",
  "average-velocity",
  "spin",
  "ivb",
  "hb",
] as const;
export const organizationDevelopmentMetricInput = z
  .object({
    id,
    athleteId: id,
    revision: z.number().int().nonnegative(),
    kind: z.enum(developmentMetricKinds),
    date: trainingDate,
    value: z.number().finite().min(-100).max(10000),
  })
  .strict()
  .superRefine((v, c) => {
    const valid =
      v.kind === "spin"
        ? v.value >= 0 && v.value <= 10000
        : ["ivb", "hb"].includes(v.kind)
          ? Math.abs(v.value) <= 100
          : v.value >= 0 && v.value <= 150;
    if (!valid)
      c.addIssue({
        code: "custom",
        message: "Use a measured value within the metric range.",
        path: ["value"],
      });
  });
export type OrganizationDevelopmentMetricInput = z.infer<typeof organizationDevelopmentMetricInput>;

/** This is the existing daily-plan workflow, limited to a new day and public built-in content. */
export const organizationDevelopmentDayInput = z
  .object({
    athleteId: id,
    day: trainingDate,
    skill: z.enum(skillBands),
    qualifiedReview: z.literal(true),
    items: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            drillId: id,
            version: id,
            restSeconds: z.number().int().min(1).max(3600),
            sets: z.number().int().min(1).max(100),
            reps: z.number().int().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((i) => i.id)).size === v.items.length,
    "Each drill needs a unique assignment ID.",
  );
export type OrganizationDevelopmentDayInput = z.infer<typeof organizationDevelopmentDayInput>;

export const organizationDevelopmentCurriculumInput = z
  .object({
    kind: z.enum(["drill", "program"]),
    id,
    version: id,
    revision: z.number().int().nonnegative(),
    status: z.enum(["review-required", "approved", "retired"]),
    recommended: z.boolean(),
    reason: z.string().trim().min(10).max(2000),
    qualifiedReview: z.literal(true),
  })
  .strict()
  .refine(
    (v) => !v.recommended || v.status === "approved",
    "Only approved content can be academy recommended.",
  );
export type OrganizationDevelopmentCurriculumInput = z.infer<
  typeof organizationDevelopmentCurriculumInput
>;

export type OrganizationDevelopmentAthlete = OrganizationDevelopmentProfileInput & {
  name: string;
  sport: "baseball" | "softball" | "";
  profileEditable: boolean;
};
export type OrganizationDevelopmentMetric = Omit<OrganizationDevelopmentMetricInput, "revision">;
export type OrganizationDevelopmentDay = {
  athleteId: string;
  day: string;
  items: { id: string; track: string; sets: number | null; reps: number | null }[];
};
export type OrganizationDevelopmentAssignment = {
  id: string;
  athleteId: string;
  revision: number;
  status: "active" | "paused" | "completed" | "discontinued";
  sport: (typeof lessonSports)[number] | "";
  discipline: (typeof lessonDisciplines)[number] | "";
  startDate: string;
  reviewDate: string;
  phase: number | null;
  tasks: { id: string; drillId: string; date: string; phase: number | null }[];
};
export type OrganizationDevelopmentControl = {
  kind: "drill" | "program";
  id: string;
  version: string;
  status: "review-required" | "approved" | "retired";
  recommended: boolean;
  revision: number;
};
export type OrganizationDevelopment = {
  revision: number;
  athletes: OrganizationDevelopmentAthlete[];
  metrics: OrganizationDevelopmentMetric[];
  sessionMetrics: {
    id: string;
    athleteId: string;
    track: string;
    day: string;
    successes: number;
    attempts: number;
    verified: boolean;
  }[];
  days: OrganizationDevelopmentDay[];
  assignments: OrganizationDevelopmentAssignment[];
  curriculum: {
    drills: TrainingDrill[];
    programs: DevelopmentProgram[];
    controls: OrganizationDevelopmentControl[];
  };
};
