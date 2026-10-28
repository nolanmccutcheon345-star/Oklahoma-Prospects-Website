import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware, authMiddleware } from "../auth/middleware";
import {
  caseInput,
  pilotInput,
  rolloutInput,
  signatureInput,
  medicalInput,
  mediaInput,
  safetyInput,
  safetyReviewInput,
} from "./enrollment-contracts";
import { z } from "zod";

export const getEnrollmentHome = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const { enrollmentHome } = await import("./enrollment.server");
    return enrollmentHome(await getSql(), context.userId);
  });
export const getEnrollmentCase = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(caseInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { enrollmentCase } = await import("./enrollment.server");
    return enrollmentCase(await getSql(), context.userId, data);
  });
export const setEnrollmentPilot = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(pilotInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { configurePilot } = await import("./enrollment.server");
    return configurePilot(await getSql(), context.userId, data);
  });
export const setEnrollmentContacts = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(rolloutInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { saveRollout } = await import("./enrollment.server");
    return saveRollout(await getSql(), context.userId, data);
  });
export const signEnrollmentPacket = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(signatureInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { signPacket } = await import("./enrollment.server");
    return signPacket(await getSql(), context.userId, data);
  });
export const getEnrollmentMedical = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(caseInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { getMedical } = await import("./enrollment.server");
    return getMedical(await getSql(), context.userId, data);
  });
export const saveEnrollmentMedical = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(medicalInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { saveMedical } = await import("./enrollment.server");
    return saveMedical(await getSql(), context.userId, data);
  });
export const getEnrollmentMedia = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(caseInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { mediaFor } = await import("./enrollment.server");
    return mediaFor(await getSql(), context.userId, data);
  });
export const saveEnrollmentMedia = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(mediaInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { saveMedia } = await import("./enrollment.server");
    return saveMedia(await getSql(), context.userId, data);
  });
export const submitEnrollmentSafety = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(safetyInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { reportSafety } = await import("./enrollment.server");
    return reportSafety(await getSql(), context.userId, data);
  });
export const getEnrollmentSafety = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const { safetyReports } = await import("./enrollment.server");
    return safetyReports(await getSql(), context.userId);
  });
export const respondEnrollmentSafety = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(safetyReviewInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { reviewSafety } = await import("./enrollment.server");
    return reviewSafety(await getSql(), context.userId, data);
  });
export const getEnrollmentFinance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(caseInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { enrollmentFinance } = await import("./financial.server");
    return enrollmentFinance(await getSql(), context.userId, data);
  });
export const approveEnrollment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    caseInput
      .extend({
        reason: z.string().trim().min(10).max(1000),
        medicalReviewed: z.literal(true),
        staffSafetyReviewed: z.literal(true),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { clearEnrollment } = await import("./financial.server");
    return clearEnrollment(await getSql(), context.userId, data);
  });
