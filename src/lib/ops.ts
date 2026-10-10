import type { PurchaseAvailability } from "./purchase-availability";
import { publishedServices } from "./public-services";
import { formatMoney, eligibility } from "./pricing";
import { revokeStaffAccess } from './staff-access.server';
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  DEVELOPMENT_PLANS,
  type LessonService,
} from "@/lib/catalog";
import type { ClubRole } from "@/lib/club-data";
import { getSql, type Sql } from "@/lib/db";
import { isOwnerEmail } from "@/lib/owners";
import { clubIdentity } from "./identity.server";
import { accountInput, recordIdInput, serviceInput, staffInput, userIdInput } from "./ops-contracts";

export type ServiceKind =
  | "lesson"
  | "package"
  | "membership"
  | "cage"
  | "cage_plan" | "fee" | "team_plan";

export const SERVICE_KINDS: { id: ServiceKind; label: string }[] = [
  { id: "fee", label: "Fee" },
  { id: "team_plan", label: "Team monthly plan (office invoiced)" },
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
  instructor?:boolean;
  status?: "active" | "inactive" | "invited";
  assignments?: string;
  expires_at?: string;
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
  purchaseAvailability?: PurchaseAvailability;
  setupFee: number;
  teamPlans: ClubService[];
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
    value === "cage_plan" || value === "fee" || value === "team_plan"
  ) {
    return value;
  }
  return "lesson";
}

function asRole(value: string, email: string): ClubRole {
  void email;
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
    price: Math.round(Number(row.price) * 100) / 100,
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
    requiresAssessment: eligibility("lesson", row.id, false).locked,
  };
}

export function buildPublicCatalog(rows: ClubService[]): PublicCatalog {
  const active = rows.filter(row => row.active);
  const lessons = active.filter((row) => row.kind === "lesson");
  const packages = active.filter((row) => row.kind === "package");
  const memberships = active.filter((row) => row.kind === "membership");
  const cages = active.filter((row) => row.kind === "cage");
  const cagePlans = active.filter((row) => row.kind === "cage_plan");
  const individual = cages.find(r => r.id === "individual")?.price;
  return {
    setupFee: active.find(r => r.id === "assessment-setup")?.price ?? 0,
    teamPlans: active.filter(r => r.kind === "team_plan"),
    lessons: lessons.map(toLesson),
    packages: packages.map(r => ({id:r.id,name:r.name,credits:r.credits,minutes:r.minutes,price:r.price,expiresDays:r.expires_days})),
    memberships: memberships.map(r => ({id:r.id,name:r.name,price:r.price,lessons:r.credits,minutes:r.minutes,remote:r.remote,detail:r.detail||r.purpose,includes:r.includes,tier:DEVELOPMENT_PLANS.find(p=>p.id===r.id)?.tier})),
    cages: cages.map(r => ({id:r.id,name:r.name,price:r.price,unit:r.unit||"/ hour",summary:r.purpose||r.detail,lanes:r.lanes})),
    cagePlans: cagePlans.map(r => ({id:r.id,name:r.name,price:r.price,period:r.period||"/ month",hours:r.hours||r.credits,
      hourly:(r.hours||r.credits)>0 ? `${formatMoney(Math.round(r.price*100/(r.hours||r.credits)))} / included hour` : "",
      bestFor:r.bestFor,savings:individual === undefined ? "" : `${formatMoney(Math.max(0,Math.round(((r.hours||r.credits)*individual-r.price)*100)))} vs ${r.hours||r.credits} drop-in hours`,featured:r.featured,perks:r.perks.length?r.perks:r.includes})),
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
  const me = await clubIdentity(userId);
  if (me.role !== "admin") throw new Error("Front office only.");
  return me;
}

export async function loadServices(sql: Sql) {
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
  // Signed-out callers must never receive inactive or unpublished catalog items.
  // Office editors use their authenticated mutation/editor paths, not this public API.
  return publishedServices(await loadServices(sql));
});

export const getAdminServices = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({context}) => {
  await requireAdmin(context.userId);
  return loadServices(await getSql());
});

export const getPurchaseAvailability = createServerFn({ method: "GET" }).handler(async (): Promise<PurchaseAvailability> => {
  const { squarePublicConfig, ensureOwnerLaunchCatalog } = await import("./commerce/square.server");
  const config = squarePublicConfig();
  let unavailableProductIds: string[] = [];
  if(config?.environment==='production' && config.checkoutScope==='all') {
    try { unavailableProductIds=(await ensureOwnerLaunchCatalog())?.filter(p=>!p.ready).map(p=>p.id)||[]; }
    catch { unavailableProductIds=['prospect','all-star','elite-family','m1','m2','m3','m4','m5']; }
  }
  return { ready: true, scope: config?.checkoutScope ?? "disabled", unavailableProductIds };
});

export const loadPublicCatalog = createServerOnlyFn(async () => {
  const sql = await getSql();
  return buildPublicCatalog(await loadServices(sql));
});

export const saveService = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(serviceInput)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const name = data.name.trim();
    if (!name) throw new Error("Name is required.");
    const kind = asKind(data.kind);
    const prefix =
      kind === "cage_plan" ? "plan" : kind === "cage" ? "cage" : kind === "membership" ? "m" : kind === "package" ? "p" : "s";
    const id = data.id?.trim() || newId(prefix, name);
    if (kind !== "fee" && data.price <= 0) throw new Error("Enter a customer price greater than zero.");
    const [existing] = await sql<{kind:string}>`select kind from club_services where id=${id}`;
    if (existing && existing.kind !== kind) throw new Error("An existing service’s category cannot be changed. Create a new service instead.");
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
        ${Math.round(Number(data.price) * 100) / 100},
        ${asInt(data.minutes)},
        ${data.purpose.trim()},
        ${Boolean(data.entry)},
        ${Boolean(data.group_session)},
        ${kind === "lesson" || kind === "package" ? eligibility(kind,id,false).locked : false},
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
  .validator(recordIdInput)
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
    return loadStaff(sql);
  });

async function upsertProfile(input: {
  userId: string;
  name: string;
  email: string;
  role: ClubRole;
  playerName: string;
}) {
  const sql = await getSql();
  const email = input.email.toLowerCase();
  if (input.role === 'admin' && !await isOwnerEmail(email)) throw new Error('Only the approved owners may receive admin access.');
  const role = asRole(input.role, email);
  const familyId = `fam-${input.userId}`;
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

export const saveStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(staffInput)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
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
    if(data.role==='admin'&&!await isOwnerEmail(email))throw new Error('Only approved owners may have admin access.');
    let invitation:string|undefined;
    if(data.createLogin){
      if(!email)throw new Error('Email is required for an invitation.');
      const {issueInvitation}=await import('./invitations.server');
      invitation=(await issueInvitation(context.userId,email,data.role||'coach')).message;
    }
    await sql.transaction(async tx => {
    const [saved] = await tx<{ user_id: string; email: string }>`
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
      returning user_id, email
    `;
    if (data.offerings) {
      const { replaceCoachServices } = await import("./commerce/coach-services.server");
      await replaceCoachServices(tx, id, data.offerings);
    }
      if (data.active === false && saved) await revokeStaffAccess(tx, saved);
    });
    return { id, invitation };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(recordIdInput)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql.transaction(async tx=>{
      const [staff]=await tx<{user_id:string;email:string}>`update club_staff set active=false where id=${data.id} returning user_id,email`;
      if(staff)await revokeStaffAccess(tx,staff);
    });
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
      disabled_at: Date | null;
      assignments:string; instructor:boolean;
    }>`
      select
        u.id as user_id,
        coalesce(nullif(p.name, ''), u.name) as name,
        lower(u.email) as email,
        coalesce(p.role, 'parent') as role,
        coalesce(p.player_name, '') as player_name,
        p.assessment_complete, u."disabledAt" as disabled_at,
        coalesce((select instructor from person_profiles where user_id=u.id),exists(select 1 from club_staff cs join club_staff_services offers on offers.staff_id=cs.id where cs.active=true and (cs.user_id=u.id or (cs.user_id='' and lower(trim(cs.email))=lower(trim(u.email)))))) as instructor,
        coalesce((select string_agg(s.name,', ') from club_staff_services c join club_staff st on st.id=c.staff_id join club_services s on s.id=c.service_id where st.user_id=u.id),'') as assignments
      from "user" u
      left join profiles p on p.user_id = u.id

      order by u.email
    `;
    const accounts=await Promise.all(rows.map(async (row) => {
      const email = row.email.toLowerCase();
      return {
        status: row.disabled_at ? "inactive" as const : "active" as const,
        assignments:row.assignments,instructor:row.instructor,
        user_id: row.user_id,
        name: row.name,
        email,
        role: asRole(row.role, email),
        player_name: row.player_name || "",
        assessment_complete: asBool(row.assessment_complete),
        owner: await isOwnerEmail(email),
      } satisfies ClubAccount;
    }));
    const invites=await sql<{id:string;email:string;role:string;expires_at:Date}>`select id,email,role,expires_at from club_invites where status='pending' and expires_at>now() order by email`;
    return [...accounts,...invites.map(i=>({user_id:`invite:${i.id}`,name:i.email,email:i.email,role:asRole(i.role,i.email),player_name:'',assessment_complete:false,owner:false,status:'invited' as const,expires_at:new Date(i.expires_at).toISOString(),assignments:''}))] satisfies ClubAccount[];
  });

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(accountInput)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const email = data.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    const name = data.name.trim() || email;
    const userId = data.userId?.trim() || "";
    if (userId) {
      const current = await sql<{ email: string }>`
        select email from "user" where id = ${userId}
      `;
      const currentEmail = (current[0]?.email ?? "").toLowerCase();
      if (!current[0]) throw new Error("Account not found.");
      if (current[0] && await isOwnerEmail(currentEmail) && email !== currentEmail) {
        throw new Error("Owner emails stay locked.");
      }
      await sql.transaction(async tx => {
        await tx`update "user" set name = ${name}, email = ${email},
          "emailVerified" = case when lower(email) = ${email} then "emailVerified" else false end,
          "updatedAt" = now() where id = ${userId}`;
        if (email !== currentEmail) await tx`delete from "session" where "userId" = ${userId}`;
      });
    } else {
      const {issueInvitation}=await import('./invitations.server');
      const invitation=await issueInvitation(context.userId,email,data.role);
      return {id:invitation.id,invitation:invitation.message};
    }
    const savedEmail = email;
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
    return { id: userId, invitation:undefined as string|undefined };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(userIdInput)
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
    if (await isOwnerEmail(users[0].email)) {
      throw new Error("Owner accounts stay locked.");
    }
    await sql.transaction(async tx => {
      await tx`update "user" set "disabledAt"=now(), "updatedAt"=now() where id=${data.userId}`;
      await tx`update club_staff set active=false where user_id=${data.userId}`;
      await tx`delete from "session" where "userId"=${data.userId}`;
    });
    return { ok: true as const };
  });
