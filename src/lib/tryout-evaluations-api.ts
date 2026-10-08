import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth/middleware";
import { evaluationInput } from "./tryout-evaluation-contracts";

export const getTryoutEvaluations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    const { evaluationWorkspaceFor } = await import("./tryout-evaluations.server");
    return evaluationWorkspaceFor(await getSql(), context.userId);
  });
export const saveTryoutEvaluation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(evaluationInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { saveEvaluationFor } = await import("./tryout-evaluations.server");
    return saveEvaluationFor(await getSql(), context.userId, data);
  });
