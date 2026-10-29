import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";

export const getStaffTeamRoster = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ teamId: z.string().min(1).max(150) }).strict())
  .handler(async ({ context, data }) => {
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const { clubIdentity } = await import("../identity.server");
    const { loadPublicClub } = await import("./public-view.server");
    const { staffTeamRosterView } = await import("./staff-roster");
    // Never accept a role, email, or roster from the browser. Existing middleware
    // also keeps the restricted coordinator role out of this legacy endpoint.
    const me = await clubIdentity(context.userId);
    return staffTeamRosterView(await loadPublicClub(), data.teamId, me);
  });
