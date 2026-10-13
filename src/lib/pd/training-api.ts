import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
import { assignmentInput, practiceInput, trainingReviewInput } from "./training";
export const loadTraining = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ athleteId: z.string().min(1).max(150) }).strict())
  .handler(async ({ context, data }) =>
    (await import("./training.server")).loadTrainingForUser(context.userId, data.athleteId),
  );
export const assignTraining = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(assignmentInput)
  .handler(async ({ context, data }) =>
    (await import("./training.server")).assignTrainingForUser(context.userId, data),
  );
export const logTraining = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(practiceInput)
  .handler(async ({ context, data }) =>
    (await import("./training.server")).logTrainingForUser(context.userId, data),
  );
export const reviewTraining = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(trainingReviewInput)
  .handler(async ({ context, data }) =>
    (await import("./training.server")).reviewTrainingForUser(context.userId, data),
  );
