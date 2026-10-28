import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
export const getEnrollmentGuide = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const { enrollmentGuide } = await import("./guide.server");
    return enrollmentGuide(await getSql(), context.userId);
  });
