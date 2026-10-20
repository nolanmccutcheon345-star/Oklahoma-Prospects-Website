import { createServerFn } from "@tanstack/react-start";
import { authMiddleware, operationalAuthMiddleware } from "./auth/middleware";
import { operationalLessonCompletionInput } from "./pd/operational-lesson-contracts";
import { operationalInstructionInput } from "./operational-instruction-contracts";
export const getOperationalInstructionEntry = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    return (await import("./operational-instruction.server")).operationalInstructionEntry(
      await getSql(),
      context.userId,
    );
  });
export const getOperationalInstructionBookings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    return (await import("./operational-instruction.server")).operationalInstructionBookings(
      await getSql(),
      context.userId,
    );
  });
export const recordInstructorAttendance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(operationalLessonCompletionInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    return (await import("./pd/operational-lesson.server")).recordInstructorAttendance(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveOrganizationInstruction = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(operationalInstructionInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    return (await import("./operational-instruction.server")).saveOrganizationInstruction(
      await getSql(),
      context.userId,
      data,
    );
  });
