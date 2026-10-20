import { createServerFn } from "@tanstack/react-start";
import { authMiddleware, operationalAuthMiddleware } from "../auth/middleware";
import {
  operationalServiceCreateInput,
  operationalServiceSaveInput,
  operationalServiceStatusInput,
} from "./organization-services-contracts";

export const getOrganizationServices = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-services.server")).organizationServices(
      await getSql(),
      context.userId,
    );
  });

export const createOrganizationServiceDraft = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(operationalServiceCreateInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-services.server")).createOrganizationServiceDraft(
      await getSql(),
      context.userId,
      data,
    );
  });

export const saveOrganizationService = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(operationalServiceSaveInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-services.server")).saveOrganizationService(
      await getSql(),
      context.userId,
      data,
    );
  });

export const setOrganizationServiceStatus = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(operationalServiceStatusInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-services.server")).setOrganizationServiceStatus(
      await getSql(),
      context.userId,
      data,
    );
  });

export const getOwnerServiceDrafts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-services.server")).ownerServiceDrafts(
      await getSql(),
      context.userId,
    );
  });
