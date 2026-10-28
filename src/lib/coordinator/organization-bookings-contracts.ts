import { z } from "zod";
const id = z.string().trim().min(1).max(150),
  revision = z.number().int().nonnegative();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time = z.string().regex(/^([01]\d|2[0-3]):[0-5][05]$/),
  reason = z.string().trim().min(5).max(1000);
export const organizationBookingOperationInput = z
  .object({
    bookingId: id,
    revision,
    expectedStartsAt: z.string().datetime(),
    expectedEndsAt: z.string().datetime(),
    action: z.enum(["reschedule", "cancel", "restore", "check-in"]),
    date: date.optional(),
    time: time.optional(),
    reason,
  })
  .strict()
  .superRefine((v, c) => {
    if (v.action === "reschedule" && (!v.date || !v.time))
      c.addIssue({ code: "custom", message: "Choose a new date and start time." });
    if (v.action !== "reschedule" && (v.date || v.time))
      c.addIssue({ code: "custom", message: "Only rescheduling accepts a date or time." });
  });
export type OrganizationBookingOperation = z.infer<typeof organizationBookingOperationInput>;
export const organizationEventSessionOperationInput = z
  .object({
    eventId: id,
    sessionKey: z.string().regex(/^[a-f0-9]{64}$/),
    revision,
    action: z.enum(["reschedule", "cancel", "restore"]),
    date: date.optional(),
    start: time.optional(),
    end: time.optional(),
    location: z.string().trim().min(3).max(300).optional(),
    reason,
  })
  .strict()
  .superRefine((v, c) => {
    if (v.action === "reschedule" && (!v.date || !v.start || !v.end || !v.location))
      c.addIssue({ code: "custom", message: "Enter the session date, times and location." });
    if (v.action !== "reschedule" && (v.date || v.start || v.end || v.location))
      c.addIssue({ code: "custom", message: "Only rescheduling accepts session details." });
  });
export type OrganizationEventSessionOperation = z.infer<
  typeof organizationEventSessionOperationInput
>;
export type OrganizationBookingSchedule = {
  canAdjust: boolean;
  bookings: {
    id: string;
    revision: number;
    title: string;
    player: string;
    coach: string;
    startsAt: string;
    endsAt: string;
    status: string;
    checkedInAt: string | null;
    eventId: string | null;
    editable: boolean;
  }[];
  events: {
    id: string;
    name: string;
    editable: boolean;
    sessions: {
      sessionKey: string;
      revision: number;
      date: string;
      start: string;
      end: string;
      location: string;
      status: string;
    }[];
  }[];
};
