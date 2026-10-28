import { registrationFilters } from "./registration-filters";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "./auth/middleware";
import {
  centerWorkInput,
  centerMessageInput,
  centerPreferencesInput,
  centerAppointmentInput,
} from "./tryout-center-contracts";
export const getTryoutCenter = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(registrationFilters.optional())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    return (await import("./tryout-center.server")).centerWorkspaceFor(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getTryoutDetail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1).max(200) }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    return (await import("./tryout-center.server")).centerDetailFor(
      await getSql(),
      context.userId,
      data.id,
    );
  });
export const saveTryoutWork = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(centerWorkInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    return (await import("./tryout-center.server")).saveCenterWorkFor(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveTryoutMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(centerMessageInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    return (await import("./tryout-center.server")).saveCenterMessageFor(
      await getSql(),
      context.userId,
      data,
    );
  });
export const saveTryoutPreferences = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(centerPreferencesInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    return (await import("./tryout-center.server")).saveCenterPreferencesFor(
      await getSql(),
      context.userId,
      data,
    );
  });
export const readTryoutNotice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1).max(300) }))
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    return (await import("./tryout-center.server")).readCenterNoticeFor(
      await getSql(),
      context.userId,
      data.id,
    );
  });
export const saveTryoutAppointment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(centerAppointmentInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    return (await import("./tryout-center.server")).saveCenterAppointmentFor(
      await getSql(),
      context.userId,
      data,
    );
  });
export const setTryoutCoordinator = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string().min(1).max(200), enabled: z.boolean() }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const sql = await getSql();
    const { setRegistrationReaderFor } = await import("./registrations.server");
    await setRegistrationReaderFor(sql, context.userId, { userId: data.userId, enabled: true });
    await sql`update registration_readers set can_manage_tryouts=${data.enabled} where user_id=${data.userId}`;
    return { ok: true };
  });
