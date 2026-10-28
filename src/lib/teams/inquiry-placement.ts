import type { Team } from "./types";
import { chicagoDate, validDate } from "../scheduling";

export type TeamInquiryDetails = {
  sport?: string;
  age?: string;
  preferredTeamId?: string;
  preferredCoachId?: string;
};

/** Protect the owner's roster and registration-stage actions from cross-sport/age assignments. */
export function assertTeamInquiryPlacement(
  request: TeamInquiryDetails,
  team: Pick<Team, "id" | "sport" | "age" | "closed" | "seasonEnd">,
  acknowledgedPreferenceOverride = false,
  today = chicagoDate(),
): void {
  const normalize = (s: string | undefined) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!team.id || team.closed || !validDate(team.seasonEnd) || team.seasonEnd < today) {
    throw new Error("Select an active team with a current or upcoming season.");
  }
  const sport = normalize(request.sport);
  const age = normalize(request.age);
  if (!["baseball", "softball"].includes(sport) || team.sport !== sport || !age || normalize(team.age) !== age) {
    throw new Error("The team must match the player's sport and age group. Check the registration before assigning.");
  }
  if (request.preferredTeamId && request.preferredTeamId !== team.id && !acknowledgedPreferenceOverride) {
    throw new Error("This family requested another team. Confirm the different assignment before saving.");
  }
}
