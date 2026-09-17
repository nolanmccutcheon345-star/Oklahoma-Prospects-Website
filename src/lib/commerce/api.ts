import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalPaymentAuth, paymentAuth } from "./payment-auth";
import { checkoutInput } from "./contracts";
export const getCheckoutContext = createServerFn({ method: "GET" })
  .middleware([optionalPaymentAuth])
  .handler(async ({ context }) => {
    const { checkoutContext } = await import("./checkout.server");
    return checkoutContext(context.verifiedUserId || undefined);
  });
export const getCheckoutQuote = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(checkoutInput)
  .handler(async ({ data, context }) => {
    const { availableSlots } = await import("./checkout.server");
    return availableSlots(data, context.paymentUserId);
  });
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(checkoutInput)
  .handler(async ({ data, context }) => {
    const { beginCheckout } = await import("./checkout.server");
    return beginCheckout(data, context.paymentUserId);
  });
export const getOrderStatus = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(z.object({ orderId: z.string().uuid() }).strict())
  .handler(async ({ data, context }) => {
    const { orderStatus } = await import("./checkout.server");
    return orderStatus(data.orderId, context.paymentUserId);
  });
export const getCageAvailability = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        date: z.string().max(10),
        duration: z.number().int().min(30).max(180).multipleOf(30),
        laneIds: z
          .array(z.enum(["1", "2", "3-4", "5", "6", "7"]))
          .min(1)
          .max(6),
      })
      .strict(),
  )
  .handler(async ({ data }) => {
    const { cageAvailability } = await import("./checkout.server");
    return cageAvailability(data);
  });

export const submitSquarePayment = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(
    z
      .object({
        orderId: z.string().uuid(),
        attemptId: z.string().uuid(),
        sourceId: z
          .string()
          .regex(/^cnon:/)
          .max(512),
      })
      .strict(),
  )
  .handler(async ({ data, context }) => {
    const { paySquareOrder } = await import("./square-payments.server");
    return paySquareOrder(data, context.paymentUserId);
  });
