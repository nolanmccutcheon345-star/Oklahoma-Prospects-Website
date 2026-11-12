import { z } from "zod";
export const messageRemovalInput = z
  .object({
    channel: z.enum(["team", "family"]),
    teamId: z.string().min(1).max(150),
    id: z.string().uuid(),
    author: z.string().max(1000),
    body: z.string().min(1).max(10000),
    reason: z.string().trim().min(10).max(1000),
    confirm: z.literal(true),
  })
  .strict();
export type MessageRemoval = z.infer<typeof messageRemovalInput>;
