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

import {
  contentClassificationInput,
  editorialDecisionInput,
  documentMetadataInput,
} from "./organization-communications-contracts";
import { saveProfileInput, metricInput, reviewInput } from "../recruiting-contracts";
export const getOrganizationContent = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-content.server")).organizationContent(
      await getSql(),
      context.userId,
    );
  });
export const getOrganizationContentReview = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-content.server")).organizationContentReview(
      await getSql(),
      context.userId,
    );
  });
export const classifyOrganizationContent = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(contentClassificationInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-content.server")).classifyOrganizationContent(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationEditorialDraft = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(draftInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-content.server")).saveOrganizationEditorialDraft(
      await getSql(),
      context.userId,
      data,
    );
  });
export const decideOrganizationEditorialDraft = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(editorialDecisionInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-content.server")).decideOrganizationEditorialDraft(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationRecruitingProfile = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(saveProfileInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-content.server")).saveOrganizationRecruitingProfile(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationRecruitingMetric = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(metricInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-content.server")).saveOrganizationRecruitingMetric(
      await getSql(),
      context.userId,
      data,
    );
  });
export const reviewOrganizationRecruitingMetric = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(reviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-content.server")).reviewOrganizationRecruitingMetric(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationDocumentMetadata = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(documentMetadataInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-content.server")).saveOrganizationDocumentMetadata(
      await getSql(),
      context.userId,
      data,
    );
  });
