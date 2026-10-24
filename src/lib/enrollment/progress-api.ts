import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import { caseInput, pilotInput } from "./enrollment-contracts";
import { progressInput, pilotReviewInput, expandInput } from "./progress-contracts";
export const getSeasonProgress = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(caseInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { seasonProgress } = await import("./progress.server");
    return seasonProgress(await getSql(), context.userId, data);
  });
export const saveSeasonProgress = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(progressInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { saveProgress } = await import("./progress.server");
    return saveProgress(await getSql(), context.userId, data);
  });
export const savePilotReview = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(pilotReviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { reviewPilot } = await import("./progress.server");
    return reviewPilot(await getSql(), context.userId, data);
  });
export const enableOrganizationEnrollment = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(expandInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { expandEnrollment } = await import("./progress.server");
    return expandEnrollment(await getSql(), context.userId, data);
  });
export const setAdditionalEnrollmentTeam = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(pilotInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { configureAdditionalTeam } = await import("./progress.server");
    return configureAdditionalTeam(await getSql(), context.userId, data);
  });
