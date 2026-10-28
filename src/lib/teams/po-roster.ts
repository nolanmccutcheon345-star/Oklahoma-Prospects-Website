import { z } from "zod";
import type { Team } from "./types";
export type RosterRole = "full" | "po";
export function poRosterLimit(age: string) {
  const n = Number(age.trim().match(/^(\d{1,2})\s*[uU]?$/)?.[1]);
  return n >= 6 && n <= 14 ? 1 : n >= 15 && n <= 17 ? 4 : 0;
}
export function assertPORosterSpace(
  team: Pick<Team, "age" | "roster">,
  pending = 0,
  excludePlayer = "",
  override?: number,
) {
  const limit = override ?? poRosterLimit(team.age);
  if (!limit)
    throw Error(
      "This team has no pitcher-only spots available. Ask Front Office to review the team PO limit.",
    );
  const count = team.roster.filter(
    (p) => p.id !== excludePlayer && !p.withdrawn && p.roleType === "po",
  ).length;
  if (count + pending >= limit)
    throw Error(
      `This ${team.age} team allows a maximum of ${limit} pitcher-only ${limit === 1 ? "player" : "players"}. Active PO offers also reserve a spot.`,
    );
}

export const rosterAddInput = z
  .object({
    teamId: z.string().min(1).max(150),
    name: z.string().trim().min(1).max(200),
    parentName: z.string().trim().max(200),
    parentEmail: z.string().trim().email().max(254),
    rosterRole: z.enum(["full", "po"]),
  })
  .strict();
export const inquiryRosterInput = z
  .object({
    id: z.string().min(1).max(150),
    teamId: z.string().min(1).max(150),
    stage: z.enum(["registered", "evaluated", "offer", "accepted", "waitlist"]),
    rosterRole: z.enum(["full", "po"]).optional(),
    acknowledgePreferenceOverride: z.boolean().default(false),
  })
  .strict()
  .refine(
    (d) => !["offer", "accepted"].includes(d.stage) || Boolean(d.rosterRole),
    "Select Full / Position Player or Pitcher Only before making an offer or adding a player.",
  );
