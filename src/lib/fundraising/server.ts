import { AppError } from "./errors";
export { AppError } from "./errors";
import { getSql } from "../db";
import { getSessionUser } from "../auth/verify.server";
import { clubIdentity } from "../identity.server";
import { squareConfig } from "../commerce/square.server";
import { TEAMS } from "./shared";
export function config(): Record<string, string> {
  const c = squareConfig();
  return {
    SQUARE_ACCESS_TOKEN: c.token,
    SQUARE_ENVIRONMENT: c.environment,
    SQUARE_LOCATION_ID: c.locationId,
    SQUARE_MERCHANT_ID: c.merchantId,
    SITE_ORIGIN: c.origin,
  };
}
export function db() {
  return {
    prepare(query: string) {
      let params: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          params = values;
          return stmt;
        },
        async all<T = Record<string, unknown>>() {
          return { results: await (await getSql()).query<T>(query, params) };
        },
        async first<T = Record<string, unknown>>() {
          return (await stmt.all<T>()).results[0] ?? null;
        },
        async run() {
          await stmt.all();
        },
      };
      return stmt;
    },
  };
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
export function fail(error: unknown) {
  if (error instanceof AppError) return json({ error: error.message }, error.status);
  console.error("Fundraising operation failed", error instanceof Error ? error.message : "unknown");
  return json(
    {
      error:
        "We could not complete that request. Your existing records are safe. Please try again.",
    },
    503,
  );
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin)
    throw new AppError("Please submit this request from the fundraising app.", 403);
}
export async function body(req: Request) {
  sameOrigin(req);
  if (Number(req.headers.get("content-length") || 0) > 12000)
    throw new AppError("Request is too large.", 413);
  const raw = await req.text();
  if (raw.length > 12000) throw new AppError("Request is too large.", 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("Please check the form and try again.");
  }
}
export async function identity() {
  const session = await getSessionUser();
  if (!session) return { user: null, admin: false };
  const me = await clubIdentity(session.id);
  return {
    user: { userId: me.userId, email: me.email, displayName: me.name, role: me.role },
    admin: me.role === "admin",
  };
}
export async function requireUser() {
  const i = await identity();
  if (!i.user) throw new AppError("Please sign in to manage player fundraising.", 401);
  return i as typeof i & { user: NonNullable<typeof i.user> };
}
export async function requireAdmin() {
  const i = await requireUser();
  if (!i.admin)
    throw new AppError(
      "This page is for Oklahoma Prospects owners. Sign in with the authorized owner account.",
      403,
    );
  return i;
}
const projection = `p.id,p.name,p.team,p.number,p.goal,p.story,p.approved,p.active,COALESCE(SUM(CASE WHEN c.status='completed' THEN GREATEST(0,c.amount-c.refunded) ELSE 0 END),0) AS raised,COUNT(CASE WHEN c.status='completed' AND c.amount>c.refunded THEN 1 END) AS sponsors`;
export async function listPlayers(scope: "home" | "my" | "office", userId?: string) {
  const where =
    scope === "home" ? "p.approved=1 AND p.active=1" : scope === "my" ? "p.owner_id=$1" : "1=1";
  const privateFields = scope === "home" ? "" : ",p.parent_email,p.shares,p.created";
  const stmt = db().prepare(
    `SELECT ${projection}${privateFields} FROM fundraising_players p LEFT JOIN fundraising_contributions c ON c.player_id=p.id WHERE ${where} GROUP BY p.id ORDER BY p.created DESC`,
  );
  return (await (scope === "my" ? stmt.bind(userId) : stmt).all()).results;
}
export async function publicPlayer(id: string) {
  return db()
    .prepare(
      `SELECT ${projection} FROM fundraising_players p LEFT JOIN fundraising_contributions c ON c.player_id=p.id WHERE p.id=$1 AND p.approved=1 AND p.active=1 GROUP BY p.id`,
    )
    .bind(id)
    .first<any>();
}
export function amount(value: unknown, min = 100, max = 1000000) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    throw new AppError(`Enter an amount between $${min / 100} and $${max / 100}.`);
  return value;
}
export function text(value: unknown, max: number, required = true) {
  const v = typeof value === "string" ? value.trim() : "";
  if ((required && !v) || v.length > max)
    throw new AppError("Please complete the required fields within the character limits.");
  return v;
}
export function playerInput(b: any) {
  const name = text(b.name, 40);
  if (!TEAMS.includes(b.team)) throw new AppError("Choose a Prospects team.");
  const number = text(b.number, 2, false);
  if (number && !/^\d{1,2}$/.test(number)) throw new AppError("Jersey number must be 0–99.");
  if (b.consent !== true)
    throw new AppError("Confirm parent or guardian permission to publish this player page.");
  return {
    name,
    team: b.team,
    number,
    goal: amount(b.goal, 10000, 1000000),
    story: text(b.story, 1200),
  };
}
export async function rateLimit(key: string, max: number, seconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db()
    .prepare(
      "INSERT INTO fundraising_rate_limits(key,count,expires) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN fundraising_rate_limits.expires<$3 THEN 1 ELSE fundraising_rate_limits.count+1 END,expires=CASE WHEN fundraising_rate_limits.expires<$4 THEN excluded.expires ELSE fundraising_rate_limits.expires END RETURNING count",
    )
    .bind(key, now + seconds, now, now)
    .first<{ count: number }>();
  if ((row?.count || 0) > max) throw new AppError("Please wait a moment before trying again.", 429);
}
export function paymentReady() {
  try {
    const c = squareConfig();
    return (
      process.env.FUNDRAISING_PAYMENTS_ENABLED === "true" &&
      (c.environment === "sandbox" || process.env.FUNDRAISING_SANDBOX_VERIFIED === "true")
    );
  } catch {
    return false;
  }
}
