import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
const id = z.string().min(1).max(150);
export const getLessonAssignments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await import("./lesson-assignment.server");
    return m.lessonAssignmentList(context.userId);
  });
export const getLessonInstructors = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id }).strict())
  .handler(async ({ context, data }) => {
    const m = await import("./lesson-assignment.server");
    return m.lessonInstructorChoices(context.userId, data.id);
  });
export const saveLessonInstructor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        id,
        coachId: id,
        expectedCoachId: id.nullable(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const m = await import("./lesson-assignment.server");
    return m.assignLessonInstructor(context.userId, data);
  });
