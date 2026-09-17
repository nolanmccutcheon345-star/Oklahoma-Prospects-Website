import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { clubIdentity } from "@/lib/identity.server";
import { z } from "zod";

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
    const [row] = await sql<Profile>`select * from profiles where user_id = ${context.userId}`;
    return row ? { ...row, email: me.email, role: me.role } : null;
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ name: z.string().trim().min(1).max(120),
    role: z.enum(["parent", "player", "coach", "admin"]),
    playerName: z.string().trim().max(120), email: z.string().email().max(254) }))
  .handler(async ({ context, data }) => {
    const me = await clubIdentity(context.userId);
    const sql = await getSql();
    // Self-service never changes role, household ownership, email or financial fields.
    const role = me.role === "parent" && data.role === "player" ? "player" : me.role;
    await sql`insert into profiles (user_id, name, email, role, player_name, family_id)
      values (${me.userId}, ${data.name}, ${me.email}, ${role}, ${data.playerName}, ${me.familyId})
      on conflict (user_id) do update set name = excluded.name, player_name = excluded.player_name`;
    return { ok: true, role };
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
    // Legacy reservations have no coach assignment. Only front office can see all.
    if (me.role === "admin") {
      return sql<{
        id: number;
        user_id: string;
        kind: string;
        title: string;
        date: string;
        start_time: string;
        duration_min: number;
        price: number;
        status: string;
      }>`
        select id, user_id, kind, title, date, start_time, duration_min, price, status
        from reservations
        order by date desc, start_time desc
      `;
    }
    return sql<{
      id: number;
      user_id: string;
      kind: string;
      title: string;
      date: string;
      start_time: string;
      duration_min: number;
      price: number;
      status: string;
    }>`
      select id, user_id, kind, title, date, start_time, duration_min, price, status
      from reservations
      where user_id = ${context.userId}
      order by date desc, start_time desc
    `;
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
  .validator((input: { athlete: string; focus: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      insert into programs (user_id, athlete, focus)
      values (${context.userId}, ${data.athlete}, ${data.focus})
      returning id
    `;
    return { id: rows[0].id };
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
  .validator(
    (input: { programId: number; name: string; detail: string }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into drills (program_id, user_id, name, detail)
      values (${data.programId}, ${context.userId}, ${data.name}, ${data.detail})
    `;
    return { ok: true };
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
