import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { operationalAuthMiddleware } from "../auth/middleware";
export const getOrganizationReport = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(z.enum(["rosters", "registrations", "schedules", "evaluations"]))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-reports.server")).organizationReport(
      await getSql(),
      context.userId,
      data,
    );
  });
