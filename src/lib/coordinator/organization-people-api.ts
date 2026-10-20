import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import { organizationPersonInput, organizationPersonKey } from "./organization-people-contracts";
export const getOrganizationPeople = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-people.server")).organizationPeople(
      await getSql(),
      context.userId,
    );
  });
export const getOrganizationPerson = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationPersonKey)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-people.server")).organizationPerson(
      await getSql(),
      context.userId,
      data.userId,
    );
  });
export const saveOrganizationPerson = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(organizationPersonInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./organization-people.server")).saveOrganizationPerson(
      await getSql(),
      context.userId,
      data,
    );
  });
