import { z } from "zod";
import { lessonDisciplines } from "./lesson-templates";
const text = z.string().trim().min(5).max(2000);
export const drillSubmission = z
  .object({
    id: z.string().uuid(),
    parentId: z.string().uuid().optional(),
    name: z.string().trim().min(3).max(120),
    discipline: z.enum(lessonDisciplines),
    sports: z
      .array(z.enum(["baseball", "softball"]))
      .min(1)
      .max(2),
    purpose: text,
    equipment: text,
    steps: z.array(text).min(1).max(12),
    cue: text,
    correction: text,
    regression: text,
    progression: text,
    measure: text,
    minAge: z.number().int().min(5).max(19),
    minimumSkill: z.number().int().min(0).max(4),
    supervision: text,
    safety: text,
    dose: text,
    provenance: text,
    demoUrl: z
      .string()
      .url()
      .max(1000)
      .refine((u) => new URL(u).protocol === "https:", "Use a secure video link")
      .nullable(),
  })
  .strict();
export type DrillSubmission = z.infer<typeof drillSubmission>;
