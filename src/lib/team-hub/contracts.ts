import { z } from "zod";
const id = z.string().min(1).max(150);
export const hubQuery = z
  .object({ teamId: id.optional(), playerId: id.nullable().optional() })
  .strict();
const team = z.object({ teamId: id });
const body = z.string().trim().min(1).max(3000);
export const hubAction = z.discriminatedUnion("kind", [
  team
    .extend({
      kind: z.literal("post"),
      requestId: z.string().uuid(),
      title: z.string().trim().min(1).max(120),
      body,
      urgent: z.boolean(),
    })
    .strict(),
  team.extend({ kind: z.literal("ack"), postKey: z.string().min(1).max(250) }).strict(),
  team
    .extend({
      kind: z.literal("message"),
      requestId: z.string().uuid(),
      playerId: id.nullable(),
      body,
    })
    .strict(),
  team
    .extend({
      kind: z.literal("rsvp"),
      eventId: id,
      playerId: id,
      response: z.enum(["going", "maybe", "cant"]),
    })
    .strict(),
]);
export type HubAction = z.infer<typeof hubAction>;
