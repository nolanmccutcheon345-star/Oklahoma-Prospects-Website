import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
export const getSquareOffice = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./square-office.server");
    return m.squareOffice(context.userId);
  });
export const sendOwnerBookingAlerts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./square-office.server");
    return m.sendOwnerBookingAlerts(context.userId);
  });
export const reconcilePayments = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./square-office.server");
    return m.ownerReconcile(context.userId);
  });
export const checkSquareLocation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./square-office.server");
    return m.verifySquareLocation(context.userId);
  });
export const checkSquareWebhooks = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./square-office.server");
    return m.verifySquareWebhooks(context.userId);
  });
export const ownerRefund = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        paymentId: z.string().min(1).max(192),
        amountCents: z.number().int().positive(),
        reason: z.string().min(5).max(192),
        requestId: z.string().uuid(),
        withdrawUnused: z.boolean(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const m = await import("./square-office.server");
    return m.manualSquareRefund(context.userId, data);
  });
export const approveMembershipPause = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ id: z.string().min(1).max(150), cycles: z.number().int().min(1).max(12) }).strict(),
  )
  .handler(async ({ context, data }) => {
    const m = await import("./square-management.server");
    return m.changeRenewal(context.userId, data.id, "pause", data.cycles);
  });

export const saveCageWindow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ standardDays: z.number().int().min(1).max(13) }).strict())
  .handler(async ({ context, data }) => {
    const m = await import("./square-office.server");
    return m.setCageWindow(context.userId, data.standardDays);
  });

export const checkReceiptEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ messageId: z.string().uuid().optional() }).strict())
  .handler(async ({ context, data }) => {
    const m = await import("./square-office.server");
    return m.testReceiptEmail(context.userId, data.messageId);
  });

export const prepareSquareMonthlyPlans = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./square-office.server");
    return m.setupMonthlyPlans(context.userId);
  });

export const prepareSquareMembershipWebhooks = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./square-office.server");
    return m.verifySquareWebhooks(context.userId, true);
  });
