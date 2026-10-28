import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
import { independentActionSchema } from "./independent-ledger";
export const getIndependentWorkspace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ teamId: z.string().min(1).max(150).optional() }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db"),
      { independentWorkspace } = await import("./independent.server");
    return independentWorkspace(await getSql(), context.userId, data.teamId);
  });
export const changeIndependentTeam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(independentActionSchema)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db"),
      { mutateIndependentTeam } = await import("./independent.server");
    return mutateIndependentTeam(await getSql(), context.userId, data);
  });
export const downloadIndependentDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ seasonId: z.string().uuid(), documentId: z.string().uuid() }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db"),
      { independentDocument } = await import("./independent.server");
    return independentDocument(await getSql(), context.userId, data.seasonId, data.documentId);
  });
export const exportIndependentStatement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ seasonId: z.string().uuid() }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db"),
      { independentExport } = await import("./independent.server");
    return independentExport(await getSql(), context.userId, data.seasonId);
  });
export const findIndependentManager = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ seasonId: z.string().uuid(), email: z.string().trim().email().max(254) }).strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db"),
      { independentManager } = await import("./independent.server");
    return independentManager(await getSql(), context.userId, data.seasonId, data.email);
  });
