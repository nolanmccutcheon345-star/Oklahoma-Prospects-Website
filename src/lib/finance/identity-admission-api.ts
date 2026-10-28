import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";

const identityId = z.string().trim().min(1).max(150);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a valid payroll start month.");
const instructor = { kind: z.literal("instructor"), userId: identityId, coachId: identityId };
const payroll = { kind: z.literal("payroll"), userId: identityId, payrollFromMonth: month };
export const identityAdmissionPreviewSchema = z.discriminatedUnion("kind", [
  z.object(instructor).strict(),
  z.object(payroll).strict(),
]);
const selectedIds = z
  .array(identityId)
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length, "Select each existing record once.");
const review = {
  expectedBasisVersion: z.number().int().positive(),
  reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
  bookingIds: selectedIds,
  orderIds: selectedIds,
  confirmed: z.literal(true),
  reason: z.string().trim().min(5).max(1000),
};
export const identityAdmissionSchema = z.discriminatedUnion("kind", [
  z.object({ ...instructor, ...review }).strict(),
  z
    .object({
      ...payroll,
      ...review,
      bookingIds: z.array(identityId).length(0),
      orderIds: z.array(identityId).length(0),
    })
    .strict(),
]);

export const getFinancialIdentityAdmissionOptions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const { financialIdentityAdmissionOptions } = await import("./identity-admission.server");
    return financialIdentityAdmissionOptions(await getSql(), context.userId);
  });

export const previewFinancialIdentityAdmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(identityAdmissionPreviewSchema)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { previewFinancialIdentityAdmission } = await import("./identity-admission.server");
    return previewFinancialIdentityAdmission(await getSql(), context.userId, data);
  });

export const admitFinancialIdentity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(identityAdmissionSchema)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { admitFinancialIdentity } = await import("./identity-admission.server");
    return admitFinancialIdentity(await getSql(), context.userId, data);
  });
