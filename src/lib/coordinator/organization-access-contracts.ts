import { z } from "zod";
export const organizationAccessTarget = z.object({ userId: z.string().min(1).max(150) }).strict();
export const organizationAccessApply = organizationAccessTarget
  .extend({
    reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
    expectedRelease: z.string().regex(/^[a-f0-9]{40}$/),
    expectedBasisVersion: z.number().int().positive(),
    expectedRevision: z.number().int().nonnegative(),
    confirmed: z.literal(true),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export const organizationAccessScope = [
  "All current and future teams in both sports",
  "Operational teams, rosters, guardian contacts, staff assignments and schedules",
  "Registrations, tryouts, evaluations and recruiting review",
  "Bookings, camps, facilities and operational service management",
  "Classified communications, profiles, document metadata and operational exports",
] as const;
export const organizationAccessExclusions = [
  "All authenticated financial information, actions, reports and exports, including personal and household finance",
  "Own permissions, owner/admin grants, authentication email, credentials and account recovery",
  "Unclassified historical mixed content and consent impersonation",
] as const;
export type OrganizationAccessPreview = {
  userId: string;
  name: string;
  email: string;
  revision: number;
  currentStatus: string;
  release: string;
  basisVersion: number | null;
  reviewDigest: string;
  ready: boolean;
  blockers: string[];
  scope: readonly string[];
  exclusions: readonly string[];
};
