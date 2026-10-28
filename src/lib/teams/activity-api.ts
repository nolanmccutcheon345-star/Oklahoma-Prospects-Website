import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
import { teamKey, activityInput, chatInput } from "./activity-contracts";
export const getTeamActivities = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(teamKey)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { teamActivityWorkspace } = await import("./activity.server");
    return teamActivityWorkspace(await getSql(), context.userId, data.teamId);
  });
export const changeTeamActivity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(activityInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { saveTeamActivity } = await import("./activity.server");
    return saveTeamActivity(await getSql(), context.userId, data);
  });
export const sendTeamChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(chatInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { postTeamChat } = await import("./activity.server");
    return postTeamChat(await getSql(), context.userId, data);
  });
