import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { clubIdentity } from "@/lib/identity.server";
import { z } from "zod";
import { readAccountProfile, readLegacySchedule, saveAccountProfile } from "./account-records.server";
import { createLegacyProgram, addLegacyDrill, legacyProgramInput, legacyDrillInput } from "./legacy-training.server";

export type ClubRole = "player" | "parent" | "coach" | "admin";

export type Profile = {
  user_id: string;
  name: string;
  email: string;
  role: ClubRole;
  player_name: string;
  assessment_complete: boolean;
  lesson_credits: number;
  remote_credits: number;
  plan_name: string;
  plan_price: number;
};

export const getProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const me = await clubIdentity(context.userId);
    const sql = await getSql();
    return readAccountProfile(sql, me);
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ name: z.string().trim().min(1).max(120),
    role: z.enum(["parent", "player", "coach", "admin"]),
    playerName: z.string().trim().max(120), email: z.string().email().max(254) }))
  .handler(async ({ context, data }) => {
    const me = await clubIdentity(context.userId);
    const sql = await getSql();
    return saveAccountProfile(sql, me, data);
  });

/** Retired browser mutation: completion belongs to the assigned coach. */
export const markAssessment = createServerFn({ method: "POST" })
  .middleware([authMiddleware]).handler(() => { throw new Error("Only the assigned coach can complete an assessment."); });

/** Retired browser mutation: fulfillment belongs to the verified Stripe webhook. */
export const createReservation = createServerFn({ method: "POST" })
  .middleware([authMiddleware]).validator((input: unknown) => input)
  .handler(() => { throw new Error("Payment is required to book a session. Use secure checkout."); });

export const listReservations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await clubIdentity(context.userId);
    return readLegacySchedule(sql, me);
  });

export const listPrograms = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: number;
      athlete: string;
      focus: string;
      status: string;
    }>`
      select id, athlete, focus, status
      from programs
      where user_id = ${context.userId}
      order by id desc
    `;
  });

export const createProgram = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(legacyProgramInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return createLegacyProgram(sql, await clubIdentity(context.userId), data);
  });

export const listDrills = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: number;
      program_id: number;
      name: string;
      detail: string;
      done: boolean;
    }>`
      select id, program_id, name, detail, done
      from drills
      where user_id = ${context.userId}
      order by id desc
    `;
  });

export const addDrill = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(legacyDrillInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return addLegacyDrill(sql, await clubIdentity(context.userId), data);
  });

export const toggleDrill = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; done: boolean }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update drills set done = ${data.done}
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const addLog = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { athlete: string; note: string; metric: string }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into athlete_logs (user_id, athlete, note, metric)
      values (${context.userId}, ${data.athlete}, ${data.note}, ${data.metric})
    `;
    return { ok: true };
  });

export const listLogs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: number;
      athlete: string;
      note: string;
      metric: string;
      created_at: string;
    }>`
      select id, athlete, note, metric, created_at
      from athlete_logs
      where user_id = ${context.userId}
      order by id desc
    `;
  });

export const applyPurchase = createServerFn({ method: "POST" })
  .middleware([authMiddleware]).validator((input: unknown) => input)
  .handler(() => { throw new Error("Purchase confirmation must come from the verified payment webhook."); });
