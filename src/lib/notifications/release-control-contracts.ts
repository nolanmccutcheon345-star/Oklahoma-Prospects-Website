import { z } from "zod";
export const noticeQueues = ["invitation", "fee", "tryout", "center", "program", "team"] as const;
export const noticeQueueSchema = z.enum(noticeQueues);
export type NoticeQueue = z.infer<typeof noticeQueueSchema>;
export const noticeReleaseItemSchema = z
  .object({
    queue: noticeQueueSchema,
    id: z.string().min(1).max(200),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type NoticeReleaseItem = z.infer<typeof noticeReleaseItemSchema>;
export type NoticeAuditRow = NoticeReleaseItem & {
  status: string;
  approvalStatus: "held" | "approved" | "sent" | "invalid";
  recipients: string[];
  subject: string;
  text: string;
  teamIds: string[];
  revision: number | null;
  createdAt: string;
  channel: "email" | "in-app";
  attempts: number;
  providerStatus: string;
  message?: string;
};
export const noticeAuditInput = z
  .object({
    queue: noticeQueueSchema.optional(),
    cursor: z.string().max(300).optional(),
    limit: z.number().int().min(1).max(50).default(25),
  })
  .strict();
export const noticeApproveInput = z
  .object({ items: z.array(noticeReleaseItemSchema).min(1).max(20), confirmed: z.literal(true) })
  .strict();
export const noticeHoldInput = z
  .object({
    items: z.array(noticeReleaseItemSchema).min(1).max(20),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const noticeDispatchInput = z
  .object({ items: z.array(noticeReleaseItemSchema).min(1).max(2), confirmed: z.literal(true) })
  .strict();
