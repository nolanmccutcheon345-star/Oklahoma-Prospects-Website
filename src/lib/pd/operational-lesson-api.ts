import { createServerFn } from "@tanstack/react-start";
import { operationalAuthMiddleware } from "../auth/middleware";
import { operationalLessonCompletionInput } from "./operational-lesson-contracts";
export const getOperationalLessonCompletions = createServerFn({ method: "GET" })
  .middleware([operationalAuthMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./operational-lesson.server")).operationalLessonCompletions(
      await getSql(),
      context.userId,
    );
  });
export const saveOperationalLessonCompletion = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(operationalLessonCompletionInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./operational-lesson.server")).recordOperationalLessonCompletion(
      await getSql(),
      context.userId,
      data,
    );
  });
