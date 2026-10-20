import { z } from "zod";
import { id } from "./contracts";
export const publicationCandidateInput = z
  .object({ teamId: id, kind: z.enum(["roster", "photo"]) })
  .strict();
export const publicationPreviewInput = publicationCandidateInput.extend({ playerId: id }).strict();
export const publicationRequestInput = publicationPreviewInput
  .extend({
    id: z.string().uuid(),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().trim().min(10).max(1000),
    confirm: z.literal(true),
  })
  .strict();
export const publicationWithdrawInput = z
  .object({
    kind: z.enum(["roster", "photo"]),
    targetId: id,
    revision: z.number().int().positive(),
    reason: z.string().trim().min(10).max(1000),
    confirm: z.literal(true),
  })
  .strict();
export const publicationPermission = (kind: "roster" | "photo") =>
  kind === "roster" ? "rosters.publication.request" : "photos.publication.request";
