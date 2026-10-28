import { z } from "zod";
import { id, historyCursor, practiceInput } from "./contracts";
import { tryoutEventInput } from "../tryout-events-contracts";
export const scopedTryoutListInput = z
  .object({ teamId: id, before: historyCursor.optional() })
  .strict();
const { sport: _sport, status: _status, ...eventFields } = tryoutEventInput.shape;
export const scopedTryoutSaveInput = z
  .object({
    ...eventFields,
    teamId: id,
    coachId: id,
    laneIds: practiceInput.shape.laneIds,
    reason: z.string().trim().min(10).max(500),
  })
  .strict()
  .refine((v) => v.endTime > v.startTime, "End time must follow start time.");
export const scopedTryoutReviewInput = z
  .object({
    id: z.string().uuid(),
    change: scopedTryoutSaveInput,
    status: z.enum(["published", "cancelled"]),
    confirm: z.literal(true),
  })
  .strict();
export type ScopedTryoutChange = z.infer<typeof scopedTryoutReviewInput>;
