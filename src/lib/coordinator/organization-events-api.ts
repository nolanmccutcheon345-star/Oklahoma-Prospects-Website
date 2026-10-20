import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import {
  operationalEventCreateInput,
  operationalEventSettingsInput,
  operationalEventSessionCreateInput,
  operationalEventEnrollmentInput,
} from "./organization-events-contracts";
export const getOrganizationEvents = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-events.server")).organizationEvents(
      await getSql(),
      context.userId,
    );
  });
export const createOperationalEvent = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(operationalEventCreateInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-events.server")).createOperationalEvent(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOperationalEventSettings = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(operationalEventSettingsInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-events.server")).saveOperationalEventSettings(
      await getSql(),
      context.userId,
      data,
    );
  });
export const addOperationalEventSession = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(operationalEventSessionCreateInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-events.server")).addOperationalEventSession(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOperationalEventEnrollment = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(operationalEventEnrollmentInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-events.server")).saveOperationalEventEnrollment(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getPublicOperationalEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("../db");
  return (await import("./organization-events.server")).publicOperationalEvents(await getSql());
});
