import { z } from "zod";
import { scopeId, type HandbookVersion } from "./contracts";
export const caseInput = z.object({ teamId: scopeId, playerId: scopeId }).strict();
export const pilotInput = z
  .object({
    teamId: scopeId,
    seasonKey: scopeId,
    revision: z.number().int().nonnegative(),
    signaturesOpen: z.boolean(),
  })
  .strict();
export const rolloutInput = z
  .object({
    revision: z.number().int().nonnegative(),
    safetyName: z.string().trim().min(3).max(150),
    safetyContact: z.string().trim().min(7).max(250),
    alternateName: z.string().trim().min(3).max(150),
    alternateContact: z.string().trim().min(7).max(250),
    emergencyPlanReference: z.string().trim().min(10).max(1000),
  })
  .strict();
export const signatureInput = caseInput
  .extend({
    packetDigest: z.string().length(64),
    signerName: z.string().trim().min(3).max(150),
    guardian: z.literal(true),
    electronicConsent: z.literal(true),
    conductDiscussed: z.literal(true),
    medicalAuthorization: z.literal(true),
    concussionAcknowledged: z.literal(true),
    athleteAcknowledged: z.literal(true),
    athleteSignerName: z.string().trim().min(1).max(150),
  })
  .strict();
export const medicalInput = caseInput
  .extend({
    revision: z.number().int().nonnegative(),
    emergencyName: z.string().trim().min(3).max(150),
    emergencyPhone: z.string().trim().min(7).max(40),
    medicalAlerts: z.string().max(4000),
    restrictions: z.string().max(4000),
    accuracyConfirmed: z.literal(true),
  })
  .strict();
export const mediaInput = caseInput
  .extend({ consent: z.boolean(), signerName: z.string().trim().min(3).max(150) })
  .strict();
export const safetyInput = caseInput
  .extend({
    concerning: z.enum(["other", "steve", "nolan"]),
    body: z.string().trim().min(10).max(8000),
  })
  .strict();
export const safetyReviewInput = z
  .object({
    reportId: scopeId,
    status: z.enum(["reviewing", "closed"]),
    response: z.string().trim().min(10).max(4000),
  })
  .strict();
export const SIGNATURE_STATEMENT =
  "I am this athlete’s parent or legal guardian, consent to electronic records and signature, acknowledge the exact handbook, sport supplement and team standards displayed, authorize emergency medical arrangements under the separately displayed medical authorization, and have discussed the player conduct expectations with my athlete in an age-appropriate way. This acknowledgment does not replace the separate financial agreement, annual waiver, or any medical clearance. Optional media permission is separate.";
export const MEDIA_STATEMENT =
  "I optionally permit Prospects Sports Academy to use photos and video of my athlete from academy activities in academy promotional material. This permission may be withdrawn for future use and is not required for enrollment. It does not permit publication of contact information, medical records or private documents. Separate public roster/recruiting permissions still apply. Previously distributed material may not be recoverable.";
export type Pilot = {
  sport: "baseball" | "softball";
  teamId: string;
  seasonKey: string;
  signaturesOpen: boolean;
  pilotPassed: boolean;
  pilotReview: string;
  revision: number;
};
export type CaseSummary = {
  id: string;
  teamId: string;
  playerId: string;
  playerName: string;
  seasonKey: string;
  guardian: boolean;
  medicalComplete: boolean;
  waiverCurrent: boolean;
  concussionCurrent: boolean;
  athleteLinked: boolean;
  packetSigned: boolean;
  acknowledgmentUpdate: boolean;
  clearedAt: string | null;
  clearanceReason: string;
  createdAt: string;
};
export type Packet = {
  documents: HandbookVersion[];
  digest: string;
  ready: boolean;
  blockers: string[];
};
export type Rollout = {
  revision: number;
  mode: "pilot" | "organization";
  safetyName: string;
  safetyContact: string;
  alternateName: string;
  alternateContact: string;
  emergencyPlanReference: string;
  activationBasis: "pilot" | "owner-directed";
  allTeamsEnabled: boolean;
};
