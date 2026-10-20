import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import {
  organizationTournamentExportInput,
  organizationTournamentSourceInput,
} from "./organization-tournaments-contracts";

export const getOrganizationTournaments = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-tournaments.server")).organizationTournaments(
      await getSql(),
      context.userId,
    );
  });
export const saveOrganizationTournamentSource = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationTournamentSourceInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-tournaments.server")).saveOrganizationTournamentSource(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getOrganizationTournamentReport = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationTournamentExportInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-tournaments.server")).organizationTournamentReport(
      await getSql(),
      context.userId,
      data,
    );
  });
