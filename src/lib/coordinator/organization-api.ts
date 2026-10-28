import { registrationFilters } from "../registration-filters";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { operationalAuthMiddleware } from "../auth/middleware";
import {
  organizationTeamInput,
  organizationPlayerInput,
  organizationStaffInput,
  organizationMoveInput,
  organizationRegistrationInput,
  organizationEvaluationInput,
  organizationEvaluationReviewInput,
  organizationActivityInput,
  organizationMessageInput,
  organizationTryoutEventInput,
} from "./organization-contracts";
export const getOrganizationWorkspace = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .validator(registrationFilters.optional())
  .handler(async ({ context,data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).organizationWorkspace(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationTeam = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationTeamInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).saveOrganizationTeam(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationPlayer = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationPlayerInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).saveOrganizationPlayer(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationStaff = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationStaffInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).saveOrganizationStaff(
      await getSql(),
      context.userId,
      data,
    );
  });
export const moveOrganizationPlayer = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationMoveInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).moveOrganizationPlayer(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationRegistration = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationRegistrationInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).saveOrganizationRegistration(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationEvaluation = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationEvaluationInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).saveOrganizationEvaluation(
      await getSql(),
      context.userId,
      data,
    );
  });
export const reviewOrganizationEvaluation = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationEvaluationReviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).reviewOrganizationEvaluation(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationActivity = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationActivityInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).saveOrganizationActivity(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getOrganizationOccupancy = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).organizationOccupancy(
      await getSql(),
      context.userId,
      data,
    );
  });
export const sendOrganizationMessage = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationMessageInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).sendOrganizationMessage(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationTryoutEvent = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationTryoutEventInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization.server")).saveOrganizationTryoutEvent(
      await getSql(),
      context.userId,
      data,
    );
  });
