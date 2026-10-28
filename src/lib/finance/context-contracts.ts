import { z } from "zod";

const amount = z.number().finite().nonnegative().max(1_000_000_000);
const cost = z
  .object({ insurance: amount, balls: amount, fields: amount, admin: amount, travel: amount })
  .strict();
export const financialClubTermsChangeSchema = z
  .object({
    expectedBasisVersion: z.number().int().positive().optional(),
    reason: z.string().trim().min(1).max(1000),
    settings: z
      .object({
        contingencyPct: amount,
        membershipMonthly: amount,
        facilityMonthly: amount,
        fundingPlayers: amount,
        cardFeePct: amount,
        orgFeeFloor: amount,
        orgFeeCeiling: amount,
        coachPayMin: amount,
        coachPayMax: amount,
        cageHourly: amount,
        roundTo: amount,
        policyVersion: z.string().max(150),
      })
      .partial()
      .strict()
      .optional(),
    teams: z
      .array(
        z
          .object({
            teamId: z.string().min(1),
            terms: z
              .object({
                orgFee: amount,
                coachMonthly: amount,
                eventBudget: amount,
                otherCosts: cost,
                teamCageHoursPerWeek: amount,
                playerCageHoursPerWeek: amount,
                closed: z.boolean(),
              })
              .partial()
              .strict()
              .optional(),
            players: z
              .array(z.object({ playerId: z.string().min(1), uniformWaived: z.boolean() }).strict())
              .optional(),
            staff: z
              .array(
                z
                  .object({
                    id: z.string().min(1),
                    monthly: amount,
                    applyAmount: amount,
                    childId: z.string(),
                  })
                  .strict(),
              )
              .optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const financialAdmissionSchema = z
  .object({
    expectedBasisVersion: z.number().int().positive(),
    sourceClubRevision: z.number().int().nonnegative(),
    reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
    teamId: z.string().min(1).max(150),
    playerIds: z
      .array(z.string().min(1).max(150))
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, "Choose each player once."),
    confirmed: z.literal(true),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

/** Exact new self-finance identity. Historical selections require separate owner review. */
export const financialSelfAdmissionSelection = z
  .object({
    kind: z.enum(["instructor", "payroll"]),
    userId: z.string().trim().min(1).max(150),
    coachId: z.string().trim().max(150).default(""),
    payeeId: z.string().trim().min(1).max(200),
    fromMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    bookingIds: z.array(z.string().min(1).max(150)).max(1000).default([]),
    orderIds: z.array(z.string().min(1).max(150)).max(1000).default([]),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.kind === "instructor" && !v.coachId)
      c.addIssue({
        code: "custom",
        message: "Choose an approved instructor identity.",
        path: ["coachId"],
      });
    if (
      v.kind === "payroll" &&
      (!v.fromMonth || v.coachId || v.bookingIds.length || v.orderIds.length)
    )
      c.addIssue({
        code: "custom",
        message: "Payroll admission requires a month and no lesson selections.",
      });
    if (
      new Set(v.bookingIds).size !== v.bookingIds.length ||
      new Set(v.orderIds).size !== v.orderIds.length
    )
      c.addIssue({ code: "custom", message: "Choose each lesson and order once." });
  });
export const financialSelfAdmissionCommand = z
  .object({
    selection: financialSelfAdmissionSelection,
    expectedBasisVersion: z.number().int().positive(),
    reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal(true),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
