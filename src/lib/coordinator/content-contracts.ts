import { z } from "zod";
import type { Capability } from "./contracts";
export const draftKinds = ["announcement", "recruiting", "tryout", "team"] as const;
export const draftCreatePermission = (kind: (typeof draftKinds)[number]): Capability =>
  (
    ({
      announcement: "content.draft",
      recruiting: "content.recruiting.draft",
      tryout: "content.tryout.draft",
      team: "content.team.draft",
    }) as const
  )[kind];
export const publishDraftInput = z
  .object({
    draftId: z.string().uuid(),
    revision: z.number().int().positive(),
    approvalRevision: z.number().int().positive(),
    confirm: z.literal(true),
    generalProgramContentOnly: z.literal(true),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export const unpublishPostInput = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    reason: z.string().trim().min(10).max(1000),
    confirm: z.literal(true),
  })
  .strict();
export const contentVersionsInput = z.object({ id: z.string().uuid() }).strict();
