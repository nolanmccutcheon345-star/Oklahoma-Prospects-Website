import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./auth/middleware";
export const requestWorkInput = z
  .object({
    id: z.string().min(1).max(200),
    assignee: z.string().max(200),
    status: z.enum(["new", "contacted", "scheduled", "closed"]),
    note: z.string().trim().max(3000),
    noteId: z.string().uuid(),
  })
  .strict();
export const getFrontOffice = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./front-office.server");
    return m.frontOffice(context.userId);
  });
export const getRequestWork = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./front-office.server");
    return m.requestWork(context.userId);
  });
export const saveRequestWork = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(requestWorkInput)
  .handler(async ({ context, data }) => {
    const m = await import("./front-office.server");
    return m.saveRequestWork(context.userId, data);
  });
export const getEvaluationReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./front-office.server");
    return m.evaluationReviews(context.userId);
  });
export const markEvaluationReviewed = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1), revision: z.number().int().positive() }).strict())
  .handler(async ({ context, data }) => {
    const m = await import("./front-office.server");
    return m.markReviewed(context.userId, data);
  });
