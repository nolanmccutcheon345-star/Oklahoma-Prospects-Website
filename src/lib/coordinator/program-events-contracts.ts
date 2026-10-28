import { z } from "zod";
import { id, historyCursor, practiceInput } from "./contracts";
import {
  operationalEventCreateInput,
  operationalEventSettingsInput,
  operationalEventSessionCreateInput,
  operationalEventEnrollmentInput,
} from "./organization-events-contracts";
export const programEventsInput = z
  .object({ teamId: id, before: historyCursor.optional() })
  .strict();
export const programEventCreateInput = operationalEventCreateInput
  .omit({ sport: true })
  .extend({ teamId: id, type: z.enum(["camp", "clinic"]) })
  .strict();
export const programEventSettingsInput = operationalEventSettingsInput
  .omit({ publication: true })
  .strict();
export const programEventSessionInput = operationalEventSessionCreateInput
  .extend({ laneIds: practiceInput.shape.laneIds })
  .strict();
export const programEventEnrollmentInput = operationalEventEnrollmentInput;

import { organizationEventSessionOperationInput } from "./organization-bookings-contracts";
export const programEventMoveInput = organizationEventSessionOperationInput
  .safeExtend({ action: z.literal("reschedule"), laneIds: practiceInput.shape.laneIds })
  .strict();

export type ProgramEventLaneIds = z.infer<typeof programEventSessionInput>["laneIds"];

export const programEventReviewInput = z
  .object({
    id: z.string().uuid(),
    teamId: id,
    eventId: id,
    eventRevision: z.number().int().positive(),
    change: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("settings"),
          value: operationalEventSettingsInput
            .extend({ publication: z.enum(["open", "closed"]) })
            .strict(),
        })
        .strict(),
      z.object({ kind: z.literal("session"), value: programEventMoveInput }).strict(),
    ]),
    confirm: z.literal(true),
  })
  .strict();
