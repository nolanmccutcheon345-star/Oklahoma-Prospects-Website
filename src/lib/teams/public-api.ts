import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
import { publicTeamsView, canReadTeamStats, playerStatsView } from "./public-view";

const teamInput = z.object({teamId: z.string().min(1).max(150)}).strict();
export const getPublicTeamsView = createServerFn({method: "GET"}).handler(async () => {
  const { loadPublicClub, enrichPublicCoaches } = await import("./public-view.server");
  const club = await loadPublicClub();
  const teams = club ? publicTeamsView(club) : [];
  return enrichPublicCoaches(teams);
});

export const getTeamStatsAccess = createServerFn({method: "POST"}).middleware([authMiddleware])
  .validator(teamInput).handler(async ({context, data}) => {
    const { loadPublicClub } = await import("./public-view.server");
    const { clubIdentity } = await import("../identity.server");
    const [club, me] = await Promise.all([loadPublicClub(), clubIdentity(context.userId)]);
    const team = club?.teams.find(t => t.id === data.teamId);
    return {allowed: Boolean(team && canReadTeamStats(team, me))};
  });

export const getTeamPlayerStats = createServerFn({method: "POST"}).middleware([authMiddleware])
  .validator(teamInput.extend({playerId: z.string().min(1).max(150)}).strict())
  .handler(async ({context, data}) => {
    const { loadPublicClub } = await import("./public-view.server");
    const { clubIdentity } = await import("../identity.server");
    const [club, me] = await Promise.all([loadPublicClub(), clubIdentity(context.userId)]);
    const team = club?.teams.find(t => t.id === data.teamId);
    if (!team) throw new Error("Team unavailable.");
    return playerStatsView(team, data.playerId, me);
  });
