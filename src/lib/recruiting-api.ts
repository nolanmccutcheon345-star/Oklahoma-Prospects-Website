import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth/middleware";
import {
  playerKey,
  saveProfileInput,
  consentInput,
  metricInput,
  reviewInput,
  linkInput,
  lessonMetricInput,
  lessonMetricKey,
} from "./recruiting-contracts";
export const getRecruitingDirectory = createServerFn({ method: "GET" }).handler(
  async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { publicRecruiting } = await import("./recruiting.server");
    return publicRecruiting(await getSql());
  },
);
export const getRecruitingPlayer = createServerFn({ method: "POST" })
  .validator(playerKey)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { publicRecruiting } = await import("./recruiting.server");
    return publicRecruiting(await getSql(), data.athleteId);
  });
export const getRecruitingWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { recruitingWorkspace } = await import("./recruiting.server");
    return recruitingWorkspace(await getSql(), context.userId);
  });
export const saveRecruiting = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(saveProfileInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { saveRecruitingProfile } = await import("./recruiting.server");
    return saveRecruitingProfile(await getSql(), context.userId, data);
  });
export const setRecruitingConsent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(consentInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { consentRecruiting } = await import("./recruiting.server");
    return consentRecruiting(await getSql(), context.userId, data);
  });
export const submitRecruitingMetric = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(metricInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { saveRecruitingMetric } = await import("./recruiting.server");
    return saveRecruitingMetric(await getSql(), context.userId, data);
  });
export const reviewRecruiting = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { reviewRecruitingMetric } = await import("./recruiting.server");
    return reviewRecruitingMetric(await getSql(), context.userId, data);
  });
export const linkRecruiting = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(linkInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { linkRecruitingRoster } = await import("./recruiting.server");
    return linkRecruitingRoster(await getSql(), context.userId, data);
  });

export const getLessonMetrics = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(lessonMetricKey)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { lessonMetricContext } = await import("./recruiting.server");
    return lessonMetricContext(await getSql(), context.userId, data.bookingId);
  });
export const saveLessonMetric = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(lessonMetricInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { recordLessonMetric } = await import("./recruiting.server");
    return recordLessonMetric(await getSql(), context.userId, data);
  });
