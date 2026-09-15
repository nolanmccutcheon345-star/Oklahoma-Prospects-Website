import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  DEVELOPMENT_PLANS,
  LESSON_CATALOG,
  LESSON_PACKAGES,
  type LessonService,
} from "@/lib/catalog";
import { MEMBERSHIPS, RENTALS } from "@/lib/club";
import type { ClubRole } from "@/lib/club-data";
import { getSql, type Sql } from "@/lib/db";
import { isOwnerEmail } from "@/lib/owners";

export type ServiceKind =
  | "lesson"
  | "package"
  | "membership"
  | "cage"
  | "cage_plan";

export const SERVICE_KINDS: { id: ServiceKind; label: string }[] = [
  { id: "lesson", label: "Lesson" },
  { id: "package", label: "Package" },
  { id: "membership", label: "Lesson membership" },
  { id: "cage", label: "Cage rental" },
  { id: "cage_plan", label: "Cage membership" },
];

export type ClubService = {
  id: string;
  kind: ServiceKind;
  name: string;
  discipline: string;
  price: number;
  minutes: number;
  purpose: string;
  entry: boolean;
  group_session: boolean;
  requires_assessment: boolean;
  credits: number;
  remote: number;
  expires_days: number;
  hours: number;
  featured: boolean;
  detail: string;
  includes: string[];
  unit: string;
  lanes: string;
  period: string;
  hourly: string;
  bestFor: string;
  savings: string;
  perks: string[];
  active: boolean;
  sort_order: number;
};

export type ServiceInput = {
  id?: string;
  kind: ServiceKind;
  name: string;
  discipline: string;
  price: number;
  minutes: number;
  purpose: string;
  entry: boolean;
  group_session: boolean;
  requires_assessment: boolean;
  credits: number;
  remote: number;
  expires_days: number;
  hours: number;
  featured: boolean;
  detail: string;
  includes: string[];
  unit: string;
  lanes: string;
  period: string;
  hourly: string;
  bestFor: string;
  savings: string;
  perks: string[];
  active: boolean;
  sort_order?: number;
};

export type StaffOffering = {
  service_id: string;
  service_name: string;
  kind: string;
  profit_split: number;
};

export type ClubStaff = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  role: ClubRole;
  access_notes: string;
  active: boolean;
  offerings: StaffOffering[];
};

export type StaffInput = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  role: ClubRole;
  access_notes: string;
  active: boolean;
  createLogin?: boolean;
  password?: string;
  offerings?: { serviceId: string; profitSplit: number }[];
};

export type ClubAccount = {
  user_id: string;
  name: string;
  email: string;
  role: ClubRole;
  player_name: string;
  assessment_complete: boolean;
  owner: boolean;
};

export type AccountInput = {
  userId?: string;
  name: string;
  email: string;
  role: ClubRole;
  playerName: string;
  password?: string;
};

export type PublicCatalog = {
  lessons: LessonService[];
  packages: {
    id: string;
    name: string;
    credits: number;
    minutes: number;
    price: number;
    expiresDays: number;
  }[];
  memberships: {
    id: string;
    name: string;
    price: number;
    lessons: number;
    minutes: number;
    remote: number;
    detail: string;
    includes: string[];
    tier?: string;
  }[];
  cages: {
    id: string;
    name: string;
    price: number;
    unit: string;
    summary: string;
    lanes: string;
  }[];
  cagePlans: {
    id: string;
    name: string;
    price: number;
    period: string;
    hours: number;
    hourly: string;
    bestFor: string;
    savings: string;
    featured: boolean;
    perks: string[];
  }[];
};

type ServiceRow = {
  id: string;
  kind: string;
  name: string;
  discipline: string;
  price: number | string;
  minutes: number | string;
  purpose: string;
  entry: boolean | string;
  group_session: boolean | string;
  requires_assessment: boolean | string;
  credits: number | string;
  remote: number | string;
  expires_days: number | string;
  hours: number | string;
  featured: boolean | string;
  detail: string;
  includes_json: string;
  extra_json: string;
  active: boolean | string;
  sort_order: number | string;
};

function asInt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function asBool(value: unknown) {
  return value === true || value === "t" || value === "true" || value === 1 || value === "1";
}

function asKind(value: string): ServiceKind {
  if (
    value === "lesson" ||
    value === "package" ||
    value === "membership" ||
    value === "cage" ||
    value === "cage_plan"
  ) {
    return value;
  }
  return "lesson";
}

function asRole(value: string, email: string): ClubRole {
  if (isOwnerEmail(email)) return "admin";
  if (value === "player" || value === "parent" || value === "coach" || value === "admin") {
    return value;
  }
  return "parent";
}

function asStaffRole(value: string): ClubRole {
  if (value === "admin" || value === "coach" || value === "parent" || value === "player") {
    return value;
  }
  return "coach";
}

function parseStringList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    /* plain text */
  }
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseExtra(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function extraList(extra: Record<string, unknown>, key: string): string[] {
  const value = extra[key];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") return parseStringList(value);
  return [];
}

function extraText(extra: Record<string, unknown>, key: string) {
  const value = extra[key];
  return typeof value === "string" ? value : "";
}

function mapService(row: ServiceRow): ClubService {
  const extra = parseExtra(row.extra_json || "{}");
  return {
    id: row.id,
    kind: asKind(row.kind),
    name: row.name,
    discipline: row.discipline || "",
    price: asInt(row.price),
    minutes: asInt(row.minutes),
    purpose: row.purpose || "",
    entry: asBool(row.entry),
    group_session: asBool(row.group_session),
    requires_assessment: asBool(row.requires_assessment),
    credits: asInt(row.credits),
    remote: asInt(row.remote),
    expires_days: asInt(row.expires_days),
    hours: asInt(row.hours),
    featured: asBool(row.featured),
    detail: row.detail || "",
    includes: parseStringList(row.includes_json || "[]"),
    unit: extraText(extra, "unit"),
    lanes: extraText(extra, "lanes"),
    period: extraText(extra, "period"),
    hourly: extraText(extra, "hourly"),
    bestFor: extraText(extra, "bestFor"),
    savings: extraText(extra, "savings"),
    perks: extraList(extra, "perks"),
    active: asBool(row.active),
    sort_order: asInt(row.sort_order),
  };
}

function extraJson(input: ServiceInput) {
  return JSON.stringify({
    unit: input.unit || "",
    lanes: input.lanes || "",
    period: input.period || "",
    hourly: input.hourly || "",
    bestFor: input.bestFor || "",
    savings: input.savings || "",
    perks: input.perks ?? [],
  });
}

export function defaultCoachSplit(service: {
  kind: string;
  name: string;
  group_session: boolean;
  entry: boolean;
}) {
  if (service.kind !== "lesson") return 0;
  if (service.group_session || /group/i.test(service.name)) return 50;
  if (/remote/i.test(service.name)) return 65;
  if (service.entry || /assess|lab/i.test(service.name)) return 55;
  return 60;
}

function toLesson(row: ClubService): LessonService {
  const discipline =
    row.discipline === "Hitting" ||
    row.discipline === "Catching" ||
    row.discipline === "Fielding"
      ? row.discipline
      : "Pitching";
  return {
    id: row.id,
    name: row.name,
    discipline,
    price: row.price,
    minutes: row.minutes,
    purpose: row.purpose,
    entry: row.entry,
    group: row.group_session,
    coachSplit: defaultCoachSplit(row),
    requiresAssessment: row.requires_assessment,
  };
}

export function buildPublicCatalog(rows: ClubService[]): PublicCatalog {
  const active = rows.filter((row) => row.active);
  const lessons = active.filter((row) => row.kind === "lesson");
  const packages = active.filter((row) => row.kind === "package");
  const memberships = active.filter((row) => row.kind === "membership");
  const cages = active.filter((row) => row.kind === "cage");
  const cagePlans = active.filter((row) => row.kind === "cage_plan");
  return {
    lessons: lessons.length ? lessons.map(toLesson) : LESSON_CATALOG.map((item) => ({ ...item })),
    packages: packages.length
      ? packages.map((row) => ({
          id: row.id,
          name: row.name,
          credits: row.credits,
          minutes: row.minutes,
          price: row.price,
          expiresDays: row.expires_days,
        }))
      : LESSON_PACKAGES.map((item) => ({ ...item })),
    memberships: memberships.length
      ? memberships.map((row) => ({
          id: row.id,
          name: row.name,
          price: row.price,
          lessons: row.credits,
          minutes: row.minutes,
          remote: row.remote,
          detail: row.detail || row.purpose,
          includes: row.includes,
          tier: DEVELOPMENT_PLANS.find((plan) => plan.id === row.id)?.tier,
        }))
      : DEVELOPMENT_PLANS.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          lessons: item.lessons,
          minutes: item.minutes,
          remote: item.remote,
          detail: item.detail,
          includes: [...item.includes],
          tier: item.tier,
        })),
    cages: cages.length
      ? cages.map((row) => ({
          id: row.id,
          name: row.name,
          price: row.price,
          unit: row.unit || "/ hour",
          summary: row.purpose || row.detail,
          lanes: row.lanes,
        }))
      : RENTALS.map((item) => ({ ...item })),
    cagePlans: cagePlans.length
      ? cagePlans.map((row) => ({
          id: row.id,
          name: row.name,
          price: row.price,
          period: row.period || "/ month",
          hours: row.hours || row.credits,
          hourly: row.hourly,
          bestFor: row.bestFor,
          savings: row.savings,
          featured: row.featured,
          perks: row.perks.length ? row.perks : row.includes,
        }))
      : MEMBERSHIPS.map((item) => ({
          id: item.name.toLowerCase().replace(/\s+/g, "-"),
          name: item.name,
          price: item.price,
          period: item.period,
          hours: item.hours,
          hourly: item.hourly,
          bestFor: item.bestFor,
          savings: item.savings,
          featured: item.featured,
          perks: [...item.perks],
        })),
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function newId(prefix: string, name: string) {
  const slug = slugify(name) || "item";
  return `${prefix}-${slug}-${Date.now().toString(36)}`;
}

async function requireAdmin(userId: string) {
  const sql = await getSql();
  const users = await sql<{ email: string; name: string }>`
    select email, name from "user" where id = ${userId}
  `;
  const email = (users[0]?.email ?? "").toLowerCase();
  if (isOwnerEmail(email)) {
    return { email, name: users[0]?.name ?? "", role: "admin" as const };
  }
  const profiles = await sql<{ role: string; email: string; name: string }>`
    select role, email, name from profiles where user_id = ${userId}
  `;
  if (profiles[0]?.role !== "admin") {
    throw new Error("Admin only.");
  }
  return {
    email: (profiles[0].email || email).toLowerCase(),
    name: profiles[0].name,
    role: "admin" as const,
  };
}

async function ensureOpsTables(sql: Sql) {
  await sql.query(`
    create table if not exists club_services (
      id text primary key,
      kind text not null,
      name text not null,
      discipline text not null default '',
      price integer not null default 0,
      minutes integer not null default 0,
      purpose text not null default '',
      entry boolean not null default false,
      group_session boolean not null default false,
      requires_assessment boolean not null default false,
      credits integer not null default 0,
      remote integer not null default 0,
      expires_days integer not null default 0,
      hours integer not null default 0,
      featured boolean not null default false,
      detail text not null default '',
      includes_json text not null default '[]',
      extra_json text not null default '{}',
      active boolean not null default true,
      sort_order integer not null default 0,
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create table if not exists club_staff (
      id text primary key,
      user_id text not null default '',
      name text not null,
      email text not null default '',
      phone text not null default '',
      role text not null default 'coach',
      access_notes text not null default '',
      active boolean not null default true,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create table if not exists club_staff_services (
      staff_id text not null,
      service_id text not null,
      profit_split integer not null default 60,
      primary key (staff_id, service_id)
    )
  `);
}

async function seedServices(sql: Sql) {
  const existing = await sql<{ n: number }>`select count(*)::int as n from club_services`;
  if (asInt(existing[0]?.n) > 0) return;

  const rows: Array<{
    id: string;
    kind: ServiceKind;
    name: string;
    discipline: string;
    price: number;
    minutes: number;
    purpose: string;
    entry: boolean;
    group_session: boolean;
    requires_assessment: boolean;
    credits: number;
    remote: number;
    expires_days: number;
    hours: number;
    featured: boolean;
    detail: string;
    includes: string[];
    extra: Record<string, unknown>;
    sort_order: number;
  }> = [];

  LESSON_CATALOG.forEach((item, index) => {
    rows.push({
      id: item.id,
      kind: "lesson",
      name: item.name,
      discipline: item.discipline,
      price: item.price,
      minutes: item.minutes,
      purpose: item.purpose,
      entry: Boolean(item.entry),
      group_session: Boolean(item.group),
      requires_assessment: item.requiresAssessment,
      credits: 0,
      remote: 0,
      expires_days: 0,
      hours: 0,
      featured: false,
      detail: item.purpose,
      includes: [],
      extra: {},
      sort_order: 10 + index,
    });
  });

  LESSON_PACKAGES.forEach((item, index) => {
    rows.push({
      id: item.id,
      kind: "package",
      name: item.name,
      discipline: "",
      price: item.price,
      minutes: item.minutes,
      purpose: `${item.credits} credits · expires in ${item.expiresDays} days`,
      entry: false,
      group_session: false,
      requires_assessment: false,
      credits: item.credits,
      remote: 0,
      expires_days: item.expiresDays,
      hours: 0,
      featured: false,
      detail: `${item.credits} credits · ${item.minutes} min`,
      includes: [],
      extra: {},
      sort_order: 100 + index,
    });
  });

  DEVELOPMENT_PLANS.forEach((item, index) => {
    rows.push({
      id: item.id,
      kind: "membership",
      name: item.name,
      discipline: "Pitching",
      price: item.price,
      minutes: item.minutes,
      purpose: item.detail,
      entry: false,
      group_session: item.tier === "group",
      requires_assessment: false,
      credits: item.lessons,
      remote: item.remote,
      expires_days: 0,
      hours: 0,
      featured: item.tier === "performance",
      detail: item.detail,
      includes: [...item.includes],
      extra: { perks: [...item.includes] },
      sort_order: 200 + index,
    });
  });

  RENTALS.forEach((item, index) => {
    rows.push({
      id: item.id,
      kind: "cage",
      name: item.name,
      discipline: "Cage",
      price: item.price,
      minutes: 60,
      purpose: item.summary,
      entry: false,
      group_session: false,
      requires_assessment: false,
      credits: 0,
      remote: 0,
      expires_days: 0,
      hours: 1,
      featured: false,
      detail: item.summary,
      includes: [],
      extra: { unit: item.unit, lanes: item.lanes },
      sort_order: 300 + index,
    });
  });

  MEMBERSHIPS.forEach((item, index) => {
    rows.push({
      id: item.name.toLowerCase().replace(/\s+/g, "-"),
      kind: "cage_plan",
      name: item.name,
      discipline: "Cage",
      price: item.price,
      minutes: item.hours * 60,
      purpose: item.bestFor,
      entry: false,
      group_session: false,
      requires_assessment: false,
      credits: item.hours,
      remote: 0,
      expires_days: 0,
      hours: item.hours,
      featured: item.featured,
      detail: item.bestFor,
      includes: [...item.perks],
      extra: {
        period: item.period,
        hourly: item.hourly,
        bestFor: item.bestFor,
        savings: item.savings,
        perks: [...item.perks],
      },
      sort_order: 400 + index,
    });
  });

  for (const row of rows) {
    await sql`
      insert into club_services (
        id, kind, name, discipline, price, minutes, purpose, entry, group_session,
        requires_assessment, credits, remote, expires_days, hours, featured, detail,
        includes_json, extra_json, active, sort_order
      ) values (
        ${row.id},
        ${row.kind},
        ${row.name},
        ${row.discipline},
        ${row.price},
        ${row.minutes},
        ${row.purpose},
        ${row.entry},
        ${row.group_session},
        ${row.requires_assessment},
        ${row.credits},
        ${row.remote},
        ${row.expires_days},
        ${row.hours},
        ${row.featured},
        ${row.detail},
        ${JSON.stringify(row.includes)},
        ${JSON.stringify(row.extra)},
        true,
        ${row.sort_order}
      )
      on conflict (id) do nothing
    `;
  }
}

async function seedStaff(sql: Sql) {
  const existing = await sql<{ n: number }>`select count(*)::int as n from club_staff`;
  if (asInt(existing[0]?.n) > 0) return;

  const users = await sql<{ id: string }>`
    select id from "user" where lower(email) = ${"stevemccutcheon89@gmail.com"}
  `;
  await sql`
    insert into club_staff (id, user_id, name, email, phone, role, access_notes, active)
    values (
      ${"staff-steve"},
      ${users[0]?.id ?? ""},
      ${"Coach Steve"},
      ${"stevemccutcheon89@gmail.com"},
      ${"(918) 760-2719"},
      ${"coach"},
      ${"Lessons, development, member access"},
      true
    )
    on conflict (id) do nothing
  `;

  const lessons = await sql<{ id: string; name: string; kind: string; group_session: boolean; entry: boolean }>`
    select id, name, kind, group_session, entry from club_services where kind = 'lesson' and active = true
  `;
  for (const lesson of lessons) {
    const split = defaultCoachSplit({
      kind: lesson.kind,
      name: lesson.name,
      group_session: asBool(lesson.group_session),
      entry: asBool(lesson.entry),
    });
    await sql`
      insert into club_staff_services (staff_id, service_id, profit_split)
      values (${"staff-steve"}, ${lesson.id}, ${split})
      on conflict (staff_id, service_id) do nothing
    `;
  }
}

async function syncLaunchCatalog(sql: Sql) {
  await sql`
    update club_services
    set price = 229, updated_at = now()
    where id = 'm1' and price <> 229
  `;
  for (const plan of MEMBERSHIPS) {
    const id = plan.name.toLowerCase().replace(/\s+/g, "-");
    await sql`
      update club_services
      set price = ${plan.price},
          detail = ${plan.bestFor},
          purpose = ${plan.bestFor},
          includes_json = ${JSON.stringify([...plan.perks])},
          extra_json = ${JSON.stringify({
            period: plan.period,
            hourly: plan.hourly,
            bestFor: plan.bestFor,
            savings: plan.savings,
            perks: [...plan.perks],
          })},
          updated_at = now()
      where id = ${id}
    `;
  }
}

async function ensureOps(sql: Sql) {
  await ensureOpsTables(sql);
  await seedServices(sql);
  await syncLaunchCatalog(sql);
  await seedStaff(sql);
}

async function loadServices(sql: Sql) {
  const rows = await sql<ServiceRow>`
    select id, kind, name, discipline, price, minutes, purpose, entry, group_session,
           requires_assessment, credits, remote, expires_days, hours, featured, detail,
           includes_json, extra_json, active, sort_order
    from club_services
    order by sort_order, name
  `;
  return rows.map(mapService);
}

export const getServices = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  await ensureOps(sql);
  return loadServices(sql);
});

export async function loadPublicCatalog() {
  const sql = await getSql();
  await ensureOps(sql);
  return buildPublicCatalog(await loadServices(sql));
}

export const saveService = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: ServiceInput) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await ensureOps(sql);
    const name = data.name.trim();
    if (!name) throw new Error("Name is required.");
    const kind = asKind(data.kind);
    const prefix =
      kind === "cage_plan" ? "plan" : kind === "cage" ? "cage" : kind === "membership" ? "m" : kind === "package" ? "p" : "s";
    const id = data.id?.trim() || newId(prefix, name);
    const maxSort = await sql<{ n: number }>`
      select coalesce(max(sort_order), 0)::int as n from club_services
    `;
    const sort = data.sort_order ?? asInt(maxSort[0]?.n) + 10;
    await sql`
      insert into club_services (
        id, kind, name, discipline, price, minutes, purpose, entry, group_session,
        requires_assessment, credits, remote, expires_days, hours, featured, detail,
        includes_json, extra_json, active, sort_order, updated_at
      ) values (
        ${id},
        ${kind},
        ${name},
        ${data.discipline.trim()},
        ${asInt(data.price)},
        ${asInt(data.minutes)},
        ${data.purpose.trim()},
        ${Boolean(data.entry)},
        ${Boolean(data.group_session)},
        ${Boolean(data.requires_assessment)},
        ${asInt(data.credits)},
        ${asInt(data.remote)},
        ${asInt(data.expires_days)},
        ${asInt(data.hours)},
        ${Boolean(data.featured)},
        ${data.detail.trim()},
        ${JSON.stringify(data.includes ?? [])},
        ${extraJson(data)},
        ${data.active !== false},
        ${sort},
        now()
      )
      on conflict (id) do update set
        kind = excluded.kind,
        name = excluded.name,
        discipline = excluded.discipline,
        price = excluded.price,
        minutes = excluded.minutes,
        purpose = excluded.purpose,
        entry = excluded.entry,
        group_session = excluded.group_session,
        requires_assessment = excluded.requires_assessment,
        credits = excluded.credits,
        remote = excluded.remote,
        expires_days = excluded.expires_days,
        hours = excluded.hours,
        featured = excluded.featured,
        detail = excluded.detail,
        includes_json = excluded.includes_json,
        extra_json = excluded.extra_json,
        active = excluded.active,
        sort_order = excluded.sort_order,
        updated_at = now()
    `;
    return { id };
  });

export const deleteService = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`delete from club_staff_services where service_id = ${data.id}`;
    await sql`delete from club_services where id = ${data.id}`;
    return { ok: true as const };
  });

async function loadStaff(sql: Sql): Promise<ClubStaff[]> {
  const staff = await sql<{
    id: string;
    user_id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    access_notes: string;
    active: boolean | string;
  }>`
    select id, user_id, name, email, phone, role, access_notes, active
    from club_staff
    order by name
  `;
  const offerings = await sql<{
    staff_id: string;
    service_id: string;
    profit_split: number | string;
    service_name: string;
    kind: string;
  }>`
    select s.staff_id, s.service_id, s.profit_split,
           coalesce(c.name, s.service_id) as service_name,
           coalesce(c.kind, '') as kind
    from club_staff_services s
    left join club_services c on c.id = s.service_id
    order by c.sort_order, c.name
  `;
  return staff.map((row) => ({
    id: row.id,
    user_id: row.user_id || "",
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: asStaffRole(row.role),
    access_notes: row.access_notes || "",
    active: asBool(row.active),
    offerings: offerings
      .filter((item) => item.staff_id === row.id)
      .map((item) => ({
        service_id: item.service_id,
        service_name: item.service_name,
        kind: item.kind,
        profit_split: asInt(item.profit_split),
      })),
  }));
}

export const listStaff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await ensureOps(sql);
    return loadStaff(sql);
  });

async function setPasswordForUser(userId: string, email: string, password: string) {
  const { hashPassword } = await import("better-auth/crypto");
  const hashed = await hashPassword(password);
  const sql = await getSql();
  const accounts = await sql<{ id: string }>`
    select id from "account"
    where "userId" = ${userId} and "providerId" = ${"credential"}
  `;
  if (accounts[0]) {
    await sql`
      update "account"
      set password = ${hashed}, "updatedAt" = now()
      where id = ${accounts[0].id}
    `;
    return;
  }
  await sql`
    insert into "account" (
      id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
    ) values (
      ${`cred-${userId}`},
      ${email.toLowerCase()},
      ${"credential"},
      ${userId},
      ${hashed},
      now(),
      now()
    )
  `;
}

async function upsertProfile(input: {
  userId: string;
  name: string;
  email: string;
  role: ClubRole;
  playerName: string;
}) {
  const sql = await getSql();
  const email = input.email.toLowerCase();
  const role = asRole(input.role, email);
  const familyId = `fam-${input.userId.slice(0, 8)}`;
  await sql`
    insert into profiles (user_id, name, email, role, player_name, family_id)
    values (
      ${input.userId},
      ${input.name},
      ${email},
      ${role},
      ${input.playerName},
      ${familyId}
    )
    on conflict (user_id) do update set
      name = excluded.name,
      email = excluded.email,
      role = excluded.role,
      player_name = excluded.player_name
  `;
}

async function findOrCreateUser(input: {
  name: string;
  email: string;
  password?: string;
}) {
  const sql = await getSql();
  const email = input.email.trim().toLowerCase();
  const existing = await sql<{ id: string; name: string }>`
    select id, name from "user" where lower(email) = ${email}
  `;
  if (existing[0]) {
    if (input.name && input.name !== existing[0].name) {
      await sql`update "user" set name = ${input.name}, "updatedAt" = now() where id = ${existing[0].id}`;
    }
    if (input.password && input.password.length >= 8) {
      await setPasswordForUser(existing[0].id, email, input.password);
    }
    return existing[0].id;
  }
  if (!input.password || input.password.length < 8) {
    throw new Error("New accounts need a password of at least 8 characters.");
  }
  const { auth } = await import("@/lib/auth/server");
  await auth.api.signUpEmail({
    body: {
      email,
      password: input.password,
      name: input.name || email,
    },
  });
  const created = await sql<{ id: string }>`
    select id from "user" where lower(email) = ${email}
  `;
  if (!created[0]) throw new Error("Could not create that login.");
  return created[0].id;
}

export const saveStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: StaffInput) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await ensureOps(sql);
    const name = data.name.trim();
    if (!name) throw new Error("Coach name is required.");
    const email = data.email.trim().toLowerCase();
    const id = data.id?.trim() || newId("staff", name);
    let userId = "";
    if (email) {
      const users = await sql<{ id: string }>`
        select id from "user" where lower(email) = ${email}
      `;
      userId = users[0]?.id ?? "";
    }
    if (data.createLogin || data.password) {
      if (!email) throw new Error("Email is required to create a login.");
      userId = await findOrCreateUser({
        name,
        email,
        password: data.password,
      });
      await upsertProfile({
        userId,
        name,
        email,
        role: asRole(data.role || "coach", email),
        playerName: "",
      });
    }
    await sql`
      insert into club_staff (id, user_id, name, email, phone, role, access_notes, active)
      values (
        ${id},
        ${userId},
        ${name},
        ${email},
        ${data.phone.trim()},
        ${asStaffRole(data.role || "coach")},
        ${data.access_notes.trim()},
        ${data.active !== false}
      )
      on conflict (id) do update set
        user_id = case when excluded.user_id = '' then club_staff.user_id else excluded.user_id end,
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        role = excluded.role,
        access_notes = excluded.access_notes,
        active = excluded.active
    `;
    if (data.offerings) {
      await sql`delete from club_staff_services where staff_id = ${id}`;
      for (const offer of data.offerings) {
        await sql`
          insert into club_staff_services (staff_id, service_id, profit_split)
          values (${id}, ${offer.serviceId}, ${Math.min(100, Math.max(0, asInt(offer.profitSplit)))})
        `;
      }
    }
    return { id };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`delete from club_staff_services where staff_id = ${data.id}`;
    await sql`delete from club_staff where id = ${data.id}`;
    return { ok: true as const };
  });

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      name: string;
      email: string;
      role: string;
      player_name: string;
      assessment_complete: boolean | string | null;
    }>`
      select
        u.id as user_id,
        coalesce(nullif(p.name, ''), u.name) as name,
        lower(u.email) as email,
        coalesce(p.role, 'parent') as role,
        coalesce(p.player_name, '') as player_name,
        p.assessment_complete
      from "user" u
      left join profiles p on p.user_id = u.id
      order by u.email
    `;
    return rows.map((row) => {
      const email = row.email.toLowerCase();
      return {
        user_id: row.user_id,
        name: row.name,
        email,
        role: asRole(row.role, email),
        player_name: row.player_name || "",
        assessment_complete: asBool(row.assessment_complete),
        owner: isOwnerEmail(email),
      } satisfies ClubAccount;
    });
  });

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: AccountInput) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const email = data.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    const name = data.name.trim() || email;
    let userId = data.userId?.trim() || "";
    if (userId) {
      const current = await sql<{ email: string }>`
        select email from "user" where id = ${userId}
      `;
      const currentEmail = (current[0]?.email ?? "").toLowerCase();
      if (current[0] && isOwnerEmail(currentEmail) && email !== currentEmail) {
        throw new Error("Owner emails stay locked.");
      }
      await sql`
        update "user"
        set name = ${name}, email = ${isOwnerEmail(currentEmail) ? currentEmail : email}, "updatedAt" = now()
        where id = ${userId}
      `;
      if (data.password && data.password.length >= 8) {
        await setPasswordForUser(userId, isOwnerEmail(currentEmail) ? currentEmail : email, data.password);
      }
    } else {
      userId = await findOrCreateUser({
        name,
        email,
        password: data.password,
      });
    }
    const savedEmail = isOwnerEmail(email) ? email : email;
    await upsertProfile({
      userId,
      name,
      email: savedEmail,
      role: asRole(data.role, savedEmail),
      playerName: data.playerName.trim(),
    });
    if (data.role === "coach" || data.role === "admin") {
      const staff = await sql<{ id: string }>`
        select id from club_staff where lower(email) = ${savedEmail}
      `;
      if (!staff[0] && data.role === "coach") {
        await sql`
          insert into club_staff (id, user_id, name, email, phone, role, access_notes, active)
          values (
            ${newId("staff", name)},
            ${userId},
            ${name},
            ${savedEmail},
            ${""},
            ${"coach"},
            ${""},
            true
          )
        `;
      } else if (staff[0]) {
        await sql`
          update club_staff
          set user_id = ${userId}, name = ${name}, role = ${asStaffRole(data.role)}
          where id = ${staff[0].id}
        `;
      }
    }
    return { id: userId };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (data.userId === context.userId) {
      throw new Error("You cannot delete the account you are signed in with.");
    }
    const sql = await getSql();
    const users = await sql<{ email: string }>`
      select email from "user" where id = ${data.userId}
    `;
    if (!users[0]) return { ok: true as const };
    if (isOwnerEmail(users[0].email)) {
      throw new Error("Owner accounts stay locked.");
    }
    await sql`delete from drills where user_id = ${data.userId}`;
    await sql`delete from athlete_logs where user_id = ${data.userId}`;
    await sql`delete from programs where user_id = ${data.userId}`;
    await sql`delete from reservations where user_id = ${data.userId}`;
    await sql`delete from profiles where user_id = ${data.userId}`;
    await sql`update club_staff set user_id = ${""} where user_id = ${data.userId}`;
    await sql`delete from "session" where "userId" = ${data.userId}`;
    await sql`delete from "account" where "userId" = ${data.userId}`;
    await sql`delete from "user" where id = ${data.userId}`;
    return { ok: true as const };
  });
