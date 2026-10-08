import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { paymentAuth } from "./payment-auth";
import { authMiddleware } from "../auth/middleware";
const id = z.object({ id: z.string().min(1).max(150) }).strict();
export const getClubCancellationChoices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { clubIdentity } = await import("../identity.server"),
      { getSql } = await import("../db");
    const me = await clubIdentity(context.userId),
      sql = await getSql();
    if (me.role === "player") throw new Error("Parent billing access required.");
    return sql<{
      id: string;
      starts_at: Date;
      product_id: string;
      initiator: string;
      resolution_status: string;
    }>`select b.id,b.starts_at,b.product_id,r.payload->>'initiator' as initiator,r.status as resolution_status from club_requests r join booking_records b on r.id='club-booking-cancellation:' || b.id where r.status in ('pending','refund_pending') and r.kind='club-booking-cancellation' and b.status='cancelled' and b.household_id=any(${me.billingHouseholdIds}::text[]) order by b.starts_at`;
  });
export const getStaffCancellationBookings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { staffCancellationContext } = await import("./booking-resolution-actions.server");
    const { me, sql, coachId } = await staffCancellationContext(context.userId);
    return sql<{
      id: string;
      starts_at: Date;
      product_id: string;
      coach_id: string | null;
      athlete_name: string | null;
    }>`select b.id,b.starts_at,b.product_id,b.coach_id,a.name as athlete_name from booking_records b left join club_athletes a on a.id=b.athlete_id where b.status='confirmed' and b.starts_at>now() and b.checked_in_at is null and b.household_id is not null and (${me.role === "admin"} or (b.coach_id=${coachId} and b.participant_count=1)) order by b.starts_at limit 100`;
  });
export const getBookingRescheduleQuote = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db"),
      { clubIdentity } = await import("../identity.server"),
      { bookingRescheduleQuote } = await import("./booking-resolution.server");
    return bookingRescheduleQuote(await getSql(), data.id, await clubIdentity(context.userId));
  });
export const cancelClubSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id.extend({ initiator: z.enum(["coach", "facility"]) }))
  .handler(async ({ context, data }) => {
    const { cancelClubSessionAction } = await import("./booking-resolution-actions.server");
    return cancelClubSessionAction(context.userId, data);
  });
export const chooseClubCancellationRefund = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { clubRefundAction } = await import("./booking-resolution-actions.server");
    return clubRefundAction(context.userId, data.id);
  });
export const rescheduleBooking = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    id.extend({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^\d{2}:\d{2}$/),
      requestId: z.string().uuid(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { rescheduleBookingAction } = await import("./booking-resolution-actions.server");
    return rescheduleBookingAction(context.userId, data);
  });

export const startBookingRescheduleFee = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(
    id.extend({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^\d{2}:\d{2}$/),
      requestId: z.string().uuid(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { startRescheduleFeeAction } = await import("./booking-resolution-actions.server");
    return startRescheduleFeeAction(context.paymentUserId, data);
  });
export const getBookingRescheduleFeeStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ orderId: z.string().uuid() }).strict())
  .handler(async ({ context, data }) => {
    const { rescheduleFeeStatus } = await import("./booking-resolution-actions.server");
    return rescheduleFeeStatus(context.userId, data.orderId);
  });
export const resumeBookingRescheduleFee = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { resumeRescheduleFeeAction } = await import("./booking-resolution-actions.server");
    return resumeRescheduleFeeAction(context.userId, data.id);
  });
