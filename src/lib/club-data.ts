import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isOwnerEmail, isStaffEmail } from "@/lib/owners";
import { resolveViewerRole } from "@/lib/pd/access";
import { ASSESSMENT_IDS, lessonNeedsAssessment } from "@/lib/catalog";

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

function asRole(value: string, email: string): ClubRole {
  if (isOwnerEmail(email)) return "admin";
  if (isStaffEmail(email)) return "coach";
  if (value === "player") return "player";
  return "parent";
}

async function ensurePdColumns() {
  try {
    const sql = await getSql();
    await sql.query(
      "alter table profiles add column if not exists lesson_credits integer not null default 0",
    );
    await sql.query(
      "alter table profiles add column if not exists remote_credits integer not null default 0",
    );
    await sql.query(
      "alter table profiles add column if not exists plan_name text not null default ''",
    );
    await sql.query(
      "alter table profiles add column if not exists plan_price integer not null default 0",
    );
  } catch {
    /* already present or migrating */
  }
}

function emptyPlan(): Pick<
  Profile,
  "lesson_credits" | "remote_credits" | "plan_name" | "plan_price"
> {
  return {
    lesson_credits: 0,
    remote_credits: 0,
    plan_name: "",
    plan_price: 0,
  };
}

async function authUser(userId: string) {
  try {
    const sql = await getSql();
    const rows = await sql<{ email: string; name: string }>`
      select email, name from "user" where id = ${userId}
    `;
    return rows[0] ?? { email: "", name: "" };
  } catch {
    return { email: "", name: "" };
  }
}

async function ensureProfile(
  userId: string,
  fallback: { name: string; email: string; role: ClubRole; playerName: string },
) {
  const sql = await getSql();
  const auth = await authUser(userId);
  const email = (auth.email || fallback.email).toLowerCase();
  const name = fallback.name || auth.name || "Prospects member";
  const role = asRole(fallback.role, email);
  const familyId = `fam-${userId.slice(0, 8)}`;
  await sql`
    insert into profiles (user_id, name, email, role, player_name, family_id)
    values (
      ${userId},
      ${name},
      ${email},
      ${role},
      ${fallback.playerName},
      ${familyId}
    )
    on conflict (user_id) do update set
      name = excluded.name,
      email = excluded.email,
      role = excluded.role,
      player_name = excluded.player_name
  `;
  if (isOwnerEmail(email)) {
    await sql`
      update profiles set role = 'admin', email = ${email} where user_id = ${userId}
    `;
  }
}

async function serviceFlags(id: string) {
  try {
    const sql = await getSql();
    const rows = await sql<{
      requires_assessment: boolean | string;
      entry: boolean | string;
    }>`
      select requires_assessment, entry from club_services where id = ${id}
    `;
    if (rows[0]) {
      const flag = (value: unknown) =>
        value === true || value === "t" || value === "true" || value === 1 || value === "1";
      return {
        needsAssessment: flag(rows[0].requires_assessment),
        isEntry: flag(rows[0].entry),
      };
    }
  } catch {
    /* table may not exist yet */
  }
  return {
    needsAssessment: lessonNeedsAssessment(id),
    isEntry: ASSESSMENT_IDS.has(id),
  };
}

export const getProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      const sql = await getSql();
      await ensurePdColumns();
      const auth = await authUser(context.userId);
      if (isOwnerEmail(auth.email)) {
        await ensureProfile(context.userId, {
          name: auth.name,
          email: auth.email,
          role: "admin",
          playerName: "",
        });
      }
      const rows = await sql<Profile>`
        select user_id, name, email, role, player_name, assessment_complete,
               coalesce(lesson_credits, 0) as lesson_credits,
               coalesce(remote_credits, 0) as remote_credits,
               coalesce(plan_name, '') as plan_name,
               coalesce(plan_price, 0) as plan_price
        from profiles
        where user_id = ${context.userId}
      `;
      const row = rows[0] ?? null;
      if (row && isOwnerEmail(auth.email || row.email)) {
        return {
          ...emptyPlan(),
          ...row,
          role: "admin" as const,
          email: auth.email || row.email,
        };
      }
      return row
        ? {
            ...emptyPlan(),
            ...row,
            role: resolveViewerRole(auth.email || row.email, row.role),
            email: auth.email || row.email,
          }
        : null;
    } catch (err) {
      if (err instanceof Error && /unauthor/i.test(err.message)) throw err;
      throw err;
    }
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      name: string;
      role: ClubRole;
      playerName: string;
      email: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const role = asRole(data.role, data.email);
    await ensureProfile(context.userId, {
      name: data.name,
      email: data.email,
      role,
      playerName: data.playerName,
    });
    return { ok: true, role: isOwnerEmail(data.email) ? "admin" : role };
  });

export const markAssessment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`
      update profiles
      set assessment_complete = true
      where user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const createReservation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      kind: string;
      title: string;
      date: string;
      startTime: string;
      durationMin: number;
      price: number;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const profile = await sql<Profile>`
      select user_id, name, email, role, player_name, assessment_complete
      from profiles where user_id = ${context.userId}
    `;
    const hasAssessment = profile[0]?.assessment_complete === true;
    const flags = await serviceFlags(data.kind);
    if (flags.needsAssessment && !hasAssessment && data.price < 50) {
      throw new Error("First lesson without an assessment is $50 more.");
    }
    const rows = await sql<{ id: number }>`
      insert into reservations (user_id, kind, title, date, start_time, duration_min, price, status)
      values (
        ${context.userId},
        ${data.kind},
        ${data.title},
        ${data.date},
        ${data.startTime},
        ${data.durationMin},
        ${data.price},
        'paid'
      )
      returning id
    `;
    if (flags.isEntry) {
      await sql`update profiles set assessment_complete = true where user_id = ${context.userId}`;
    }
    return { id: rows[0].id };
  });

export const listReservations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const auth = await authUser(context.userId);
    const profile = await sql<{ role: string; email: string }>`
      select role, email from profiles where user_id = ${context.userId}
    `;
    const role = resolveViewerRole(auth.email || profile[0]?.email || "", profile[0]?.role);
    if (role === "admin" || role === "coach") {
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
  .middleware([authMiddleware])
  .validator(
    (input: {
      kind: string;
      title: string;
      date: string;
      startTime: string;
      durationMin: number;
      price: number;
      credits?: number;
      remote?: number;
      planName?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await ensurePdColumns();
    const sql = await getSql();
    const profile = await sql<Profile>`
      select user_id, name, email, role, player_name, assessment_complete,
             coalesce(lesson_credits, 0) as lesson_credits,
             coalesce(remote_credits, 0) as remote_credits,
             coalesce(plan_name, '') as plan_name,
             coalesce(plan_price, 0) as plan_price
      from profiles where user_id = ${context.userId}
    `;
    const hasAssessment = profile[0]?.assessment_complete === true;
    const flags = await serviceFlags(data.kind);
    if (flags.needsAssessment && !hasAssessment && data.price < 50) {
      throw new Error("First lesson without an assessment is $50 more.");
    }
    const rows = await sql<{ id: number }>`
      insert into reservations (user_id, kind, title, date, start_time, duration_min, price, status)
      values (
        ${context.userId},
        ${data.kind},
        ${data.title},
        ${data.date},
        ${data.startTime},
        ${data.durationMin},
        ${data.price},
        'paid'
      )
      returning id
    `;
    if (flags.isEntry) {
      await sql`update profiles set assessment_complete = true where user_id = ${context.userId}`;
    }
    if (data.planName || data.credits || data.remote) {
      const credits = (profile[0]?.lesson_credits ?? 0) + (data.credits ?? 0);
      const remote = (profile[0]?.remote_credits ?? 0) + (data.remote ?? 0);
      await sql`
        update profiles
        set lesson_credits = ${credits},
            remote_credits = ${remote},
            plan_name = ${data.planName || profile[0]?.plan_name || ""},
            plan_price = ${data.planName ? data.price : (profile[0]?.plan_price ?? 0)}
        where user_id = ${context.userId}
      `;
    }
    return { id: rows[0].id };
  });
