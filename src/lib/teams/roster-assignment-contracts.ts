import { z } from "zod";

const id = z.string().min(1).max(150);
const reason = z.string().trim().max(500).default("");
/** Front Office places an existing registration or website account on a team.
 * Guardian contact is always read from the source household; it is never typed here. */
export const assignToTeamInput = z
  .object({
    teamId: id,
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("registration"), requestId: id }).strict(),
      z.object({ kind: z.literal("account"), athleteId: id }).strict(),
    ]),
    rosterRole: z.enum(["full", "po"]),
    additionalTeamReason: reason,
    acknowledgePreferenceOverride: z.boolean().default(false),
  })
  .strict();
export const setAssignmentStatusInput = z
  .object({
    teamId: id,
    playerId: id,
    status: z.enum(["active", "removed"]),
    reason,
    additionalTeamReason: reason,
  })
  .strict();
export const assignableCandidatesInput = z.object({ teamId: id }).strict();
export type AssignToTeamInput = z.input<typeof assignToTeamInput>;
export type SetAssignmentStatusInput = z.input<typeof setAssignmentStatusInput>;
/** Minimum characters for the reason that allows a second live team. */
export const ADDITIONAL_TEAM_REASON_MIN = 10;

export type AssignableCandidate = {
  kind: "registration" | "account";
  id: string;
  name: string;
  detail: string;
  guardianOnFile: boolean;
  preferredOtherTeam: boolean;
  otherTeams: string[];
};
export type AssignedMember = {
  playerId: string;
  name: string;
  roleType: "full" | "po";
  status: "active" | "removed" | "invited" | "accepted";
  otherTeams: string[];
};
