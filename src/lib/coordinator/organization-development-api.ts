import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import {
  organizationDevelopmentProfileInput,
  organizationDevelopmentMetricInput,
  organizationDevelopmentDayInput,
  organizationDevelopmentCurriculumInput,
} from "./organization-development-contracts";

export const getOrganizationDevelopment = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-development.server")).organizationDevelopment(
      await getSql(),
      context.userId,
    );
  });
export const saveOrganizationDevelopmentProfile = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationDevelopmentProfileInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-development.server")).saveOrganizationDevelopmentProfile(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationDevelopmentMetric = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationDevelopmentMetricInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-development.server")).saveOrganizationDevelopmentMetric(
      await getSql(),
      context.userId,
      data,
    );
  });
export const assignOrganizationDevelopmentDay = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationDevelopmentDayInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-development.server")).assignOrganizationDevelopmentDay(
      await getSql(),
      context.userId,
      data,
    );
  });
export const reviewOrganizationDevelopmentCurriculum = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationDevelopmentCurriculumInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (
      await import("./organization-development.server")
    ).reviewOrganizationDevelopmentCurriculum(await getSql(), context.userId, data);
  });
