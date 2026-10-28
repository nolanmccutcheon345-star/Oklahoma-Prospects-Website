import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import {
  organizationBookingOperationInput,
  organizationEventSessionOperationInput,
} from "./organization-bookings-contracts";
export const getOrganizationBookings = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-bookings.server")).organizationBookings(
      await getSql(),
      context.userId,
    );
  });
export const saveOrganizationBookingOperation = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationBookingOperationInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-bookings.server")).saveOrganizationBookingOperation(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationEventSessionOperation = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationEventSessionOperationInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-bookings.server")).saveOrganizationEventSessionOperation(
      await getSql(),
      context.userId,
      data,
    );
  });
