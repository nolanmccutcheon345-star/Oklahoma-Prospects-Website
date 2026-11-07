import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { operationalAuthMiddleware } from "../auth/middleware";
export const getTeamInvitations = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(z.object({ teamId: z.string().min(1).max(150) }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { teamInvitationWorkspace } = await import("./invitations.server");
    return teamInvitationWorkspace(await getSql(), context.userId, data.teamId);
  });
export const createTeamInvitation = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(
    z
      .object({
        teamId: z.string().min(1).max(150),
        playerId: z.string().min(1).max(150),
        email: z.string().trim().email().max(254),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { issueTeamInvitation } = await import("./invitations.server");
    const { rateLimit } = await import("../commerce/checkout.server");
    await rateLimit("team-invitation-create", 30);
    return issueTeamInvitation(await getSql(), context.userId, data);
  });
