import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import { organizationGameResultInput } from "./organization-contracts";

export const getOrganizationGameResults = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-game-results.server")).organizationGameResults(
      await getSql(),
      context.userId,
    );
  });

export const saveOrganizationGameResult = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationGameResultInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-game-results.server")).saveOrganizationGameResult(
      await getSql(),
      context.userId,
      data,
    );
  });
