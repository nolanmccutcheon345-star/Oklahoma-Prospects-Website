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
