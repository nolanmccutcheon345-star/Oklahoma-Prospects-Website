import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./auth/middleware";

export const getRegistrationAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    const { registrationAccessFor } = await import("./registrations.server");
    return registrationAccessFor(await getSql(), context.userId);
  });
export const getRegistrationRows = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    const { registrationRowsFor } = await import("./registrations.server");
    return registrationRowsFor(await getSql(), context.userId);
  });
export const getRegistrationReaders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    const { registrationReadersFor } = await import("./registrations.server");
    return registrationReadersFor(await getSql(), context.userId);
  });
export const setRegistrationReader = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string().min(1).max(200), enabled: z.boolean() }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { setRegistrationReaderFor } = await import("./registrations.server");
    return setRegistrationReaderFor(await getSql(), context.userId, data);
  });
