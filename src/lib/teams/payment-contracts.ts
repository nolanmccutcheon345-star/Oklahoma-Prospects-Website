import { z } from "zod";
export const teamCheckoutSchema = z
  .object({
    teamId: z.string().min(1).max(150),
    playerId: z.string().min(1).max(150),
    amount: z.number().int().positive().max(10000000),
    requestId: z.string().uuid(),
    consent: z.literal(true),
  })
  .strict();
export type TeamCheckout = z.infer<typeof teamCheckoutSchema>;
export type TeamFeeSnapshot = {
  teamId: string;
  playerId: string;
  lockedAt: string;
  role: string;
  /** Server-written financial references. Historical orders retain their aliases. */
  financialAgreementId?: string;
  financialTeamSeasonId?: string;
  /** Server-written accepted independent agreement identity. */
  independent?: { seasonKey: string; agreementVersion: number; acceptedFeeCents: number };
};
