import { z } from "zod";
export const operationalLessonCompletionInput = z
  .object({
    bookingId: z.string().trim().min(1).max(150),
    expectedEndsAt: z.string().datetime(),
    attendance: z.literal("present"),
    recap: z.string().trim().min(10).max(5000),
    qualifiedReview: z.literal(true),
  })
  .strict();
export type OperationalLessonCompletion = z.infer<typeof operationalLessonCompletionInput>;
