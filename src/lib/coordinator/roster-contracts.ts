import { z } from "zod";
import { id, historyCursor } from "./contracts";
export const rosterCandidateInput = z
  .object({ search: z.string().trim().max(100).default("") })
  .strict();
export const rosterClearanceInput = z
  .object({
    id: z.string().uuid(),
    athleteId: id,
    teamId: id,
    guardianId: id,
    identityDigest: z.string().regex(/^[a-f0-9]{64}$/),
    clubRevision: z.number().int().nonnegative(),
    expiresAt: z.iso.datetime(),
    reason: z.string().trim().min(10).max(1000),
    confirmEligibility: z.literal(true),
  })
  .strict();
export const rosterClearanceRevokeInput = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export const rosterEligibleInput = z
  .object({ teamId: id, before: historyCursor.optional() })
  .strict();
export const rosterAdmissionInput = z
  .object({
    id: z.string().uuid(),
    teamId: id,
    revision: z.number().int().positive(),
    clubRevision: z.number().int().nonnegative(),
    confirm: z.literal(true),
  })
  .strict();
export const rosterInformationInput = z
  .object({
    teamId: id,
    playerId: id,
    revision: z.number().int().nonnegative(),
    bats: z.enum(["", "R", "L", "S"]),
    throws: z.enum(["", "R", "L"]),
    gradYear: z.string().regex(/^$|^\d{4}$/),
    school: z.string().trim().max(160),
  })
  .strict();
