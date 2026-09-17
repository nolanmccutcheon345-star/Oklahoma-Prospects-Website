import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { redemptionInput } from "./redemption";
import { authMiddleware } from "../auth/middleware";
const id = z.object({ id: z.string().min(1).max(150) }).strict();
export const getFamilyBilling = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { familyBilling } = await import("./portal.server");
    return familyBilling(context.userId);
  });
export const claimPurchases = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { claimGuestOrders } = await import("./portal.server");
    return claimGuestOrders(context.userId);
  });
export const stopAutoRenew = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { cancelRenewal } = await import("./portal.server");
    return cancelRenewal(context.userId, data.id);
  });
export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { billingPortal } = await import("./portal.server");
    return billingPortal(context.userId, data.id);
  });
export const askForPause = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id.extend({ reason: z.string().trim().min(3).max(1000) }))
  .handler(async ({ context, data }) => {
    const { requestPause } = await import("./portal.server");
    return requestPause(context.userId, data.id, data.reason);
  });
export const getRefundPreview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { previewRefund } = await import("./portal.server");
    return previewRefund(context.userId, data.id);
  });
export const requestRefund = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { cancelAndRefund } = await import("./portal.server");
    return cancelAndRefund(context.userId, data.id);
  });
export const checkInBooking = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { checkIn } = await import("./portal.server");
    return checkIn(context.userId, data.id);
  });
export const getCoachBookings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { coachBookings } = await import("./portal.server");
    return coachBookings(context.userId);
  });
export const finishSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id.extend({ notes: z.string().trim().min(5).max(5000) }))
  .handler(async ({ context, data }) => {
    const { completeSession } = await import("./portal.server");
    return completeSession(context.userId, data.id, data.notes);
  });
export const getCreditSlots = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(redemptionInput)
  .handler(async ({ context, data }) => {
    const { creditSlots } = await import("./credits.server");
    return creditSlots(context.userId, data);
  });
export const bookWithCredit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(redemptionInput)
  .handler(async ({ context, data }) => {
    const { redeemCredit } = await import("./credits.server");
    return redeemCredit(context.userId, data);
  });

export const getBillingHistoryPage = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ page: z.number().int().min(0).max(10000) }).strict())
  .handler(async ({ context, data }) => {
    const { familyBilling } = await import("./portal.server");
    return familyBilling(context.userId, data.page);
  });

export const resumeMembership = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(id)
  .handler(async ({ context, data }) => {
    const { changeRenewal } = await import("./square-management.server");
    return changeRenewal(context.userId, data.id, "resume");
  });
export const savePaymentCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    id.extend({
      requestId: z.string().uuid(),
      sourceId: z
        .string()
        .regex(/^cnon:/)
        .max(512),
    }),
  )
  .handler(async ({ context, data }) => {
    const { updateSquareCard } = await import("./square-management.server");
    return updateSquareCard(context.userId, data);
  });
