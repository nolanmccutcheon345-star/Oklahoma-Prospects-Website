import { z } from "zod";

export const scopeId = z.string().trim().min(1).max(150);
export const sectionSchema = z
  .object({ title: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(16000) })
  .strict();
export const documentContent = z
  .object({
    title: z.string().trim().min(1).max(180),
    sections: z.array(sectionSchema).min(1).max(100),
  })
  .strict();
export const reviewSchema = z
  .object({
    legalReviewer: z.string().trim().max(180),
    legalReviewedOn: z.string().max(10),
    insuranceReviewer: z.string().trim().max(180),
    insuranceReviewedOn: z.string().max(10),
    reviewReference: z.string().trim().max(1000),
  })
  .strict();
export const emptyReview = {
  legalReviewer: "",
  legalReviewedOn: "",
  insuranceReviewer: "",
  insuranceReviewedOn: "",
  reviewReference: "",
};
export const standardsSchema = z
  .object({
    designation: z.enum(["developmental", "competitive"]),
    playingTime: z.string().trim().min(30).max(4000),
    practiceExpectations: z.string().trim().min(20).max(4000),
    tournamentCommitment: z.string().trim().min(20).max(4000),
    evaluationMethod: z.string().trim().min(20).max(4000),
    communicationChannel: z.string().trim().min(3).max(500),
    rsvpIsNotice: z.boolean(),
    practiceNoticeHours: z.number().int().min(48).max(720),
    tournamentNoticeDays: z.number().int().min(14).max(90),
    inSeasonUpdates: z.number().int().min(1).max(12),
    finalEvaluation: z.literal(true),
  })
  .strict();
export const defaultStandards: z.infer<typeof standardsSchema> = {
  designation: "developmental",
  playingTime: "",
  practiceExpectations: "",
  tournamentCommitment: "",
  evaluationMethod: "",
  communicationChannel: "Team account and direct coach communication",
  rsvpIsNotice: false,
  practiceNoticeHours: 48,
  tournamentNoticeDays: 14,
  inSeasonUpdates: 1,
  finalEvaluation: true,
};
export const saveDocumentInput = z
  .object({
    documentId: scopeId,
    version: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    action: z.enum(["draft", "publish"]),
    effectiveOn: z.iso.date(),
    content: documentContent,
    review: reviewSchema,
  })
  .strict();
export const saveStandardsInput = z
  .object({
    teamId: scopeId,
    version: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    action: z.enum(["draft", "publish"]),
    effectiveOn: z.iso.date(),
    standards: standardsSchema,
  })
  .strict();
export type HandbookVersion = {
  documentId: string;
  version: number;
  revision: number;
  kind: "master" | "baseball" | "softball" | "team";
  teamId: string | null;
  status: "draft" | "published";
  effectiveOn: string;
  content: z.infer<typeof documentContent>;
  standards: z.infer<typeof standardsSchema> | null;
  hash: string;
  review: z.infer<typeof reviewSchema>;
  publishedAt: string | null;
};
export type EnrollmentTeam = {
  id: string;
  name: string;
  sport: "baseball" | "softball";
  season: string;
  coach: boolean;
  guardianPlayerIds: string[];
  playerIds: string[];
  canRead: boolean;
  canManage: boolean;
  canDraft: boolean;
};
export type HandbookWorkspace = {
  owner: boolean;
  teams: EnrollmentTeam[];
  documents: HandbookVersion[];
};

export function reviewedForSignatures(review: z.infer<typeof reviewSchema>, today: string) {
  return Boolean(
    review.legalReviewer &&
    review.insuranceReviewer &&
    review.reviewReference &&
    z.iso.date().safeParse(review.legalReviewedOn).success &&
    z.iso.date().safeParse(review.insuranceReviewedOn).success &&
    review.legalReviewedOn <= today &&
    review.insuranceReviewedOn <= today,
  );
}
