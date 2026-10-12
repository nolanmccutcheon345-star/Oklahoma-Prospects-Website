import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
import { lessonDocument, lessonDisciplines } from "./lesson-templates";
const id = z.string().min(1).max(150);
export const openBookedLesson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ bookingId: id }).strict())
  .handler(async ({ context, data }) => {
    const m = await import("./lesson-session.server");
    return m.openLessonSession(context.userId, data.bookingId);
  });
export const saveBookedLesson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        bookingId: id,
        revision: z.number().int().positive(),
        document: lessonDocument,
        complete: z.boolean(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const m = await import("./lesson-session.server");
    return m.saveLessonSession(context.userId, data);
  });
export const reviewBookedLesson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        bookingId: id,
        sport: z.enum(["baseball", "softball"]),
        discipline: z.enum(lessonDisciplines),
        reason: z.string().trim().min(10).max(2000),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const m = await import("./lesson-session.server");
    return m.reviewLegacyLesson(context.userId, data);
  });
export const getBookedLessonHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ athleteId: id }).strict())
  .handler(async ({ context, data }) => {
    const m = await import("./lesson-session.server");
    return m.lessonHistory(context.userId, data.athleteId);
  });
export const getLessonExceptions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./lesson-session.server");
    return m.historicalLessonExceptions(context.userId);
  });
