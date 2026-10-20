import { z } from "zod";
import { id, sportInput, historyCursor, type Capability } from "./contracts";
export const noticeKinds = ["team", "announcement", "practice", "event", "program"] as const;
export const noticePermission = (kind: (typeof noticeKinds)[number]): Capability =>
  ({
    team: "communications.team.send",
    announcement: "communications.announcement.schedule",
    practice: "communications.practice.remind",
    event: "communications.event.notify",
    program: "communications.program.request",
  })[kind] as Capability;
export const emailPermission = (
  purpose: "recruiting" | "invitation" | "inquiry" | "tryout-reminder" = "recruiting",
): Capability =>
  ({
    recruiting: "communications.recruit.send",
    invitation: "recruiting.invite",
    inquiry: "communications.inquiry.reply",
    "tryout-reminder": "communications.tryout.remind",
  })[purpose] as Capability;
export const noticeProposalInput = z
  .object({
    id: z.uuid(),
    sport: sportInput,
    teamIds: z.array(id).min(1).max(100),
    kind: z.enum(noticeKinds),
    targetId: z.string().max(200).default(""),
    body: z.string().trim().min(1).max(3000),
    sendAt: z.iso.datetime(),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export const noticeSendInput = noticeProposalInput
  .extend({ previewDigest: z.string().regex(/^[a-f0-9]{64}$/), confirm: z.literal(true) })
  .strict();
export const noticeHistoryInput = z
  .object({ sport: sportInput, teamId: id, before: historyCursor.optional() })
  .strict();
export const noticeCancelInput = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    reason: z.string().trim().min(10).max(1000),
    confirm: z.literal(true),
  })
  .strict();
export const messageReviewListInput = z
  .object({ teamId: id, before: historyCursor.optional() })
  .strict();
export const messageReviewInput = z
  .object({
    id: z.uuid(),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    operational: z.boolean(),
    reason: z.string().trim().min(10).max(1000),
    confirm: z.literal(true),
  })
  .strict();
