import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import { facilityBlockInput, cancelFacilityBlockInput } from "./facility-block-contracts";
export const getFacilityBlocks = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./facility-blocks.server")).facilityBlocks(
      await getSql(),
      context.userId,
    );
  });
export const createFacilityBlock = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(facilityBlockInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./facility-blocks.server")).createFacilityBlock(
      await getSql(),
      context.userId,
      data,
    );
  });
export const cancelFacilityBlock = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(cancelFacilityBlockInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./facility-blocks.server")).cancelFacilityBlock(
      await getSql(),
      context.userId,
      data,
    );
  });
