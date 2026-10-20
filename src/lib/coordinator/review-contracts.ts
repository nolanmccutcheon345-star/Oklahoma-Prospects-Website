import { z } from "zod";
import { id, sports } from "./contracts";
export const reviewPeriods = { weekly: 7, monthly: 30, quarterly: 90 } as const;
export const accessReviewInput = z
  .object({
    userId: id,
    sport: z.enum(sports),
    revision: z.number().int().positive(),
    period: z.enum(["weekly", "monthly", "quarterly"]),
    reason: z.string().trim().min(10).max(500),
    confirmed: z.literal(true),
  })
  .strict();
export const reviewPolicyInput = z
  .object({
    revision: z.number().int().nonnegative(),
    weeklyDays: z.number().int().min(1).max(14),
    monthlyDays: z.number().int().min(15).max(60),
    quarterlyDays: z.number().int().min(61).max(180),
    rosterChangeThreshold: z.number().int().min(1).max(1000).default(25),
    contactReadThreshold: z.number().int().min(1).max(10000).default(200),
    riskWindowHours: z.number().int().min(1).max(168).default(24),
    denialThreshold: z.number().int().min(1).max(100),
    denialWindowHours: z.number().int().min(1).max(168),
  })
  .strict();
export const defaultReviewPolicy = {
  revision: 0,
  weeklyDays: 7,
  monthlyDays: 30,
  quarterlyDays: 90,
  rosterChangeThreshold: 25,
  contactReadThreshold: 200,
  riskWindowHours: 24,
  denialThreshold: 5,
  denialWindowHours: 24,
};
