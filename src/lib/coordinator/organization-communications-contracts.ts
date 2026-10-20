import { z } from "zod";
import { profileData, metricInput } from "../recruiting-contracts";
export const contentClassificationInput = z
  .object({
    kind: z.enum(["draft", "recruiting-profile", "recruiting-metric", "pd-document"]),
    id: z.string().min(1).max(200),
    revision: z.number().int().nonnegative(),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal(true),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export const editorialDecisionInput = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    approvalRevision: z.number().int().positive(),
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export const documentMetadataInput = z
  .object({
    id: z.string().min(1).max(200),
    athleteId: z.string().min(1).max(150),
    sourceRevision: z.number().int().nonnegative(),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().trim().min(1).max(200),
    kind: z.string().trim().min(1).max(100),
    date: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type ContentKind = z.infer<typeof contentClassificationInput>["kind"];
export type ContentReviewSource = {
  kind: ContentKind;
  id: string;
  revision: number;
  sourceDigest: string;
  content: Record<string, string | number | boolean | null>;
};
export type OrganizationContent = {
  actorId: string;
  owner: boolean;
  sourceRevision: number;
  athletes: { id: string; name: string }[];
  drafts: {
    id: string;
    sport: "baseball" | "softball";
    teamId: string;
    title: string;
    body: string;
    status: "draft" | "submitted" | "approved" | "rejected";
    revision: number;
    authorId: string;
    authorName: string;
    lastEditorId: string;
    approvalRevision: number | null;
  }[];
  profiles: {
    athleteId: string;
    name: string;
    revision: number;
    profile: z.infer<typeof profileData> | null;
    published: boolean;
    consentCurrent: boolean;
  }[];
  metrics: {
    id: string;
    athleteId: string;
    playerName: string;
    revision: number;
    metric: z.infer<typeof metricInput>["metric"];
    value: number;
    measuredOn: string;
    status: "unverified" | "pending" | "verified" | "rejected";
    detail: { evidence: string; method: string; reviewNote: string; verifierName: string } | null;
  }[];
  documents: {
    id: string;
    athleteId: string;
    name: string;
    kind: string;
    date: string;
    sourceRevision: number;
    sourceDigest: string;
  }[];
  withheld: { drafts: number; profiles: number; metrics: number; documents: number };
};
