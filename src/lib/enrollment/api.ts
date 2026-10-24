import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import { saveDocumentInput, saveStandardsInput } from "./contracts";
export const getPublicHandbooks = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("../db");
  const { publicHandbooks } = await import("./handbooks.server");
  return publicHandbooks(await getSql());
});
export const getHandbookWorkspace = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const { handbookWorkspace } = await import("./handbooks.server");
    return handbookWorkspace(await getSql(), context.userId);
  });
export const prepareHandbookDrafts = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const { seedHandbooks } = await import("./handbooks.server");
    return seedHandbooks(await getSql(), context.userId);
  });
export const saveHandbookDocument = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(saveDocumentInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { saveHandbook } = await import("./handbooks.server");
    return saveHandbook(await getSql(), context.userId, data);
  });
export const saveStandards = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(saveStandardsInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { saveTeamStandards } = await import("./handbooks.server");
    return saveTeamStandards(await getSql(), context.userId, data);
  });
