import { drillSubmission } from "./training-content";
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

export const getTrainingContent = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    (await import("./training-content.server")).contentForUser(context.userId),
  );
export const submitTrainingDrill = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(drillSubmission)
  .handler(async ({ context, data }) =>
    (await import("./training-content.server")).submitDrillForUser(context.userId, data),
  );
export const reviewTrainingDrill = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["approved", "retired"]),
        reason: z.string().trim().min(10).max(2000),
      })
      .strict(),
  )
  .handler(async ({ context, data }) =>
    (await import("./training-content.server")).reviewDrillForUser(context.userId, data),
  );
export const reviewAcademyCurriculum = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        kind: z.enum(["drill", "program"]),
        id: z.string().min(1).max(150),
        version: z.string().min(1).max(150),
        revision: z.number().int().min(0),
        status: z.enum(["review-required", "approved", "retired"]),
        recommended: z.boolean(),
        reason: z.string().trim().min(10).max(2000),
        qualifiedReview: z.literal(true),
      })
      .strict(),
  )
  .handler(async ({ context, data }) =>
    (await import("./curriculum-controls.server")).reviewCurriculumForUser(context.userId, data),
  );
export const loadTrainingInbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    (await import("./training.server")).trainingInboxForUser(context.userId),
  );
export const loadTrainingQuality = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ athleteId: z.string().min(1).max(150) }).strict())
  .handler(async ({ context, data }) =>
    (await import("./training.server")).trainingQualityForUser(context.userId, data.athleteId),
  );
export const reviewTrainingQuality = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        assignmentId: z.string().min(1).max(150),
        requestId: z.string().uuid(),
        feedback: z.string().trim().min(10).max(3000),
        checks: z
          .array(
            z.enum([
              "objective alignment",
              "prior work reviewed",
              "homework appropriate",
              "evidence supports progression",
              "safeguarding reviewed",
            ]),
          )
          .min(1)
          .max(5),
      })
      .strict(),
  )
  .handler(async ({ context, data }) =>
    (await import("./training.server")).reviewTrainingQualityForUser(context.userId, data),
  );
