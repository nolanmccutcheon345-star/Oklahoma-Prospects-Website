import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
import { messageRemovalInput } from "./message-removal-contracts";
export const removeChatMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(messageRemovalInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { removeTeamMessage } = await import("./message-removal.server");
    return removeTeamMessage(await getSql(), context.userId, data);
  });
