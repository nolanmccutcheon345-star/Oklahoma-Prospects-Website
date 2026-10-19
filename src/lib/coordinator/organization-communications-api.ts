import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import { draftInput, emailInput, scopeInput } from "./contracts";

export const sendOrganizationRecruitingEmail = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(emailInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-communications.server")).sendOrganizationRecruitingEmail(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getOrganizationDrafts = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(scopeInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-communications.server")).organizationDrafts(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationDraft = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(draftInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-communications.server")).saveOrganizationDraft(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getOrganizationOwnActivity = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-communications.server")).organizationOwnActivity(
      await getSql(),
      context.userId,
    );
  });
