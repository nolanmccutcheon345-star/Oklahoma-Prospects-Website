import { z } from "zod";
import { id } from "./contracts";
import { validDate } from "../scheduling";
export const followupInput = z
  .object({
    requestId: id,
    revision: z.number().int().nonnegative(),
    assigneeId: z.string().max(200),
    dueDate: z.string().refine((v) => !v || validDate(v), "Choose a valid follow-up date."),
  })
  .strict();
export const attendanceInput = z
  .object({
    requestId: id,
    revision: z.number().int().nonnegative(),
    status: z.enum(["attended", "no-show"]),
  })
  .strict();
