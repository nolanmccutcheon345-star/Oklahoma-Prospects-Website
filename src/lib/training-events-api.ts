import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth/middleware";
import { paymentAuth } from "./commerce/payment-auth";
import { trainingEventSchema, eventCheckoutSchema } from "./training-events-contracts";
export const getTrainingEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("./db");
  const { listTrainingEvents } = await import("./training-events.server");
  return listTrainingEvents(await getSql());
});
export const getEventOffice = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    const { eventOffice } = await import("./training-events.server");
    return eventOffice(await getSql(), context.userId);
  });
export const saveEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(trainingEventSchema)
  .handler(async ({ data, context }) => {
    const { getSql } = await import("./db");
    const { saveTrainingEvent } = await import("./training-events.server");
    return saveTrainingEvent(await getSql(), context.userId, data);
  });
export const getEventFamily = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    const { eventFamily } = await import("./training-events.server");
    return eventFamily(await getSql(), context.userId);
  });
export const startEventCheckout = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(eventCheckoutSchema)
  .handler(async ({ data, context }) => {
    const { assertPaymentRequest } = await import("./commerce/square-payments.server");
    assertPaymentRequest();
    const { rateLimit } = await import("./commerce/checkout.server");
    await rateLimit("event-checkout", 20);
    const { squareConfig, squarePublicConfig } = await import("./commerce/square.server");
    const config = squareConfig();
    const { assertSquareCheckoutScope } = await import("./commerce/square-config");
    assertSquareCheckoutScope(config, { kind: "event", recurring: false });
    const { getSql } = await import("./db");
    const { prepareEventCheckout } = await import("./training-events.server");
    return {
      ...(await prepareEventCheckout(
        await getSql(),
        context.paymentUserId,
        data,
        config.environment,
      )),
      square: squarePublicConfig(),
    };
  });
