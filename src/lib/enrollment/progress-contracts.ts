import { z } from "zod";
import { caseInput } from "./enrollment-contracts";
import { scopeId } from "./contracts";
const revision = z.number().int().nonnegative();
export const checklistTasks = [
  { key: "uniform", label: "Submit uniform sizes in Family account", day: 7, guardian: true },
  { key: "schedule", label: "Review the team schedule and facility rules", day: 7, guardian: true },
  { key: "orientation", label: "Complete coach orientation", day: 7, guardian: false },
  { key: "goals", label: "Record athlete development goals", day: 14, guardian: false },
  { key: "day30", label: "Complete the first-30-days check-in", day: 30, guardian: false },
] as const;
export const progressInput = z.discriminatedUnion("action", [
  caseInput
    .extend({
      action: z.literal("notice"),
      activityKey: scopeId,
      availability: z.enum(["going", "absent", "late", "early"]),
      noticeKind: z.enum(["planned", "emergency"]),
      directContact: z.boolean(),
      revision,
    })
    .strict(),
  caseInput.extend({ action: z.literal("acknowledge"), activityKey: scopeId, revision }).strict(),
  caseInput
    .extend({
      action: z.literal("attendance"),
      activityKey: scopeId,
      status: z.enum(["present", "late", "excused", "absent"]),
      expected: z.enum(["", "present", "late", "excused", "absent"]),
    })
    .strict(),
  caseInput
    .extend({
      action: z.literal("checklist"),
      task: z.enum(["uniform", "schedule", "orientation", "goals", "day30"]),
      complete: z.boolean(),
      revision,
    })
    .strict(),
  caseInput
    .extend({
      action: z.literal("checkpoint"),
      id: z.string().max(150),
      kind: z.enum(["baseline", "in-season", "final"]),
      dueOn: z.iso.date(),
      completedOn: z.union([z.literal(""), z.iso.date()]),
      feedback: z.string().trim().max(8000),
      assessmentId: z.string().max(150),
      revision,
    })
    .strict(),
  caseInput
    .extend({
      action: z.literal("travel"),
      adultName: z.string().trim().min(3).max(150),
      adultPhone: z.string().trim().min(7).max(40),
      adultAtLeast18: z.literal(true),
      guardianAuthorization: z.literal(true),
      revision,
    })
    .strict(),
]);
// Separate owner-only rollout controls.
export const pilotReviewInput = z
  .object({
    teamId: scopeId,
    revision,
    passed: z.boolean(),
    evidence: z.string().trim().min(30).max(6000),
    permissionsVerified: z.literal(true),
    familyAndCoachFeedback: z.literal(true),
  })
  .strict();
export const expandInput = z
  .object({
    revision,
    evidence: z.string().trim().min(30).max(6000),
    enabled: z.boolean().default(true),
  })
  .strict();
