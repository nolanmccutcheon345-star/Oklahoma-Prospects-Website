import { z } from "zod";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
/** Exact owner review only: callers cannot supply financial inputs or bindings. */
export const financialBasisActivationInput = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRelease: z.string().regex(/^[a-f0-9]{40}$/),
    asOf: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
    outputDigest: digest,
    sourceClubRevision: z.number().int().nonnegative(),
    sourceDigest: digest,
    readinessDigest: digest,
    reviewDigest: digest,
    confirmed: z.literal(true),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
