import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import {
  organizationServiceMetadataInput,
  organizationTrainingEventMetadataInput,
} from "./organization-catalog-contracts";

export const getOrganizationCatalog = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-catalog.server")).organizationCatalog(
      await getSql(),
      context.userId,
    );
  });

export const saveOrganizationServiceMetadata = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationServiceMetadataInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-catalog.server")).saveOrganizationServiceMetadata(
      await getSql(),
      context.userId,
      data,
    );
  });

export const saveOrganizationTrainingEventMetadata = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationTrainingEventMetadataInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-catalog.server")).saveOrganizationTrainingEventMetadata(
      await getSql(),
      context.userId,
      data,
    );
  });
