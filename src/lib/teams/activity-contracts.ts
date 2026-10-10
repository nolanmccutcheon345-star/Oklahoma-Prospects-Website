import { z } from "zod";
export const teamKey = z.object({ teamId: z.string().min(1).max(150) }).strict();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
  }, "Choose a real date.");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const count = z.number().int().min(0).max(999);
export const statKeys = ["ab", "h", "r", "hr", "rbi", "sb", "bb", "so"] as const;
export const battingStats = z
  .object({ ab: count, h: count, r: count, hr: count, rbi: count, sb: count, bb: count, so: count })
  .strict()
  .refine(
    (s) => s.h <= s.ab && s.hr <= s.h,
    "Hits cannot exceed at-bats; home runs cannot exceed hits.",
  );
export const activityInput = teamKey
  .extend({
    id: z.union([z.string().uuid(), z.literal("")]),
    revision: z.number().int().nonnegative(),
    kind: z.enum(["game", "tournament", "practice"]),
    title: z.string().trim().min(2).max(140),
    date: day,
    startTime: clock,
    endTime: clock,
    location: z.string().trim().min(1).max(240),
    status: z.enum(["scheduled", "live", "final", "cancelled"]),
    ourRuns: count,
    oppRuns: count,
    stats: z
      .array(z.object({ playerId: z.string().min(1).max(150), values: battingStats }).strict())
      .max(100),
  })
  .strict()
  .superRefine((a, c) => {
    if (a.endTime <= a.startTime)
      c.addIssue({
        code: "custom",
        message: "End time must follow start time.",
        path: ["endTime"],
      });
    if (
      a.kind !== "game" &&
      (a.stats.length || a.ourRuns || a.oppRuns || a.status === "live" || a.status === "final")
    )
      c.addIssue({ code: "custom", message: "Scores and player stats belong to games only." });
    if (new Set(a.stats.map((s) => s.playerId)).size !== a.stats.length)
      c.addIssue({ code: "custom", message: "Duplicate player stats." });
  });
export type TeamActivity = z.infer<typeof activityInput>;
export const chatInput = teamKey.extend({ body: z.string().trim().min(1).max(3000) }).strict();
export function resultOf(g: Pick<TeamActivity, "kind" | "status" | "ourRuns" | "oppRuns">) {
  return g.kind !== "game" || g.status !== "final"
    ? null
    : g.ourRuns > g.oppRuns
      ? "w"
      : g.ourRuns < g.oppRuns
        ? "l"
        : "t";
}
