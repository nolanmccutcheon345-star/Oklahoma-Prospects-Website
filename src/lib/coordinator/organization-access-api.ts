import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
import { organizationAccessTarget, organizationAccessApply } from "./organization-access-contracts";
export const getOrganizationAccessPreview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(organizationAccessTarget)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-access.server")).previewOrganizationAccess(
      await getSql(),
      context.userId,
      data,
    );
  });
export const grantOrganizationAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(organizationAccessApply)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-access.server")).applyOrganizationAccess(
      await getSql(),
      context.userId,
      data,
    );
  });
