import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./auth/middleware";
export const getPrivatePlayerBirthday = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ athleteId: z.string().min(1).max(200) }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { privatePlayerBirthday } = await import("./player-birthdays.server");
    return privatePlayerBirthday(await getSql(), context.userId, data.athleteId);
  });
export const getMissingPlayerBirthdays = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    const { missingPlayerBirthdays } = await import("./player-birthdays.server");
    return missingPlayerBirthdays(await getSql(), context.userId);
  });
export const savePlayerBirthday = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        athleteId: z.string().min(1).max(200),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { completePlayerBirthday } = await import("./player-birthdays.server");
    return completePlayerBirthday(await getSql(), context.userId, data.athleteId, data.birthDate);
  });
