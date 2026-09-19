import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { bookingNoticeDetails } from "./commerce/square-notifications.server";

type Event = {
  id: number;
  action: string;
  target_table: string;
  target_id: string;
  created_at: Date;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
};
const labels: Record<string, string> = {
  user: "Account",
  profiles: "Account profile",
  club_requests: "Registration or inquiry",
  booking_records: "Booking",
  commerce_orders: "Checkout",
  square_payments: "Payment",
  commerce_refunds: "Refund",
  club_subscriptions: "Membership",
  club_waivers: "Waiver",
  club_invites: "Invitation",
  club_staff: "Staff",
  club_staff_services: "Staff assignment",
  club_state: "Team records",
  pd_working_file: "Development records",
  club_services: "Service or pricing",
  owner_grants: "Owner access",
  club_athletes: "Athlete",
  household_members: "Household membership",
  service_resources: "Facility assignment",
  square_disputes: "Payment dispute",
  commerce_policy: "Booking policy",
  credit_grants: "Session credits",
  credit_uses: "Credit use",
  contractor_earnings: "Coach earnings",
  coach_profiles: "Coach profile",
  athlete_assessments: "Assessment",
  athlete_track_progress: "Development progress",
  athlete_training_days: "Training plan",
  athlete_training_logs: "Training log",
  athlete_session_metrics: "Session results",
  programs: "Program",
  drills: "Drill",
  athlete_logs: "Athlete log",
  reservations: "Legacy booking",
  billing_invoices: "Invoice",
  booking_participants: "Booking participants",
};

export function activityLine(e: Event) {
  const when = new Date(e.created_at).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    timeZoneName: "short",
  });
  const verb = e.action === "INSERT" ? "created" : e.action === "DELETE" ? "removed" : "updated";
  const status =
    typeof e.after_state?.status === "string" ? ` (${e.after_state.status.slice(0, 60)})` : "";
  return `${when} — ${labels[e.target_table] || "Site record"} ${verb}${status}\nReference: ${e.target_id}`;
}
async function owners(sql: Sql) {
  return sql<{
    email: string;
  }>`select g.email from owner_grants g join "user" u on u.id=g.user_id and lower(u.email)=g.email where g.revoked_at is null and u."emailVerified"=true and u."disabledAt" is null order by g.email`;
}
async function addDelivery(
  sql: Sql,
  id: string,
  recipient: string,
  audience: string,
  subject: string,
  body: string,
) {
  await sql`insert into site_alert_deliveries(id,recipient,audience,subject,body) values(${id},${recipient},${audience},${subject},${body}) on conflict do nothing`;
}
export async function batchSiteAlerts(sql: Sql, origin: string) {
  return sql.transaction(async (tx) => {
    const recipients = await owners(tx);
    const events =
      await tx<Event>`select a.* from site_alert_events q join audit_events a on a.id=q.id where q.batched_at is null order by q.id limit 50 for update of q skip locked`;
    if (!events.length) return 0;
    const batch = randomUUID();
    // Summaries omit raw form bodies, credentials, medical details, and private coaching notes.
    const lines: string[] = [];
    for (const e of events) {
      let line = activityLine(e);
      if (e.target_table === "club_requests") {
        const [r] = await tx<{
          kind: string;
          payload: Record<string, unknown>;
        }>`select kind,payload from club_requests where id=${e.target_id}`;
        if (r)
          line += `\nType: ${r.kind}\n${["name", "parent", "player", "age", "session", "email"]
            .filter((k) => typeof r.payload[k] === "string")
            .map((k) => `${k}: ${String(r.payload[k]).slice(0, 200)}`)
            .join("\n")}`;
      }
      lines.push(line);
      if (
        e.target_table === "booking_records" &&
        e.after_state?.status === "confirmed" &&
        e.before_state?.status !== "confirmed"
      ) {
        const [b] = await tx<{
          starts_at: Date;
          ends_at: Date;
          resources: string[];
          status: string;
          email: string;
          title: string;
        }>`select b.starts_at,b.ends_at,b.resources,b.status,o.email,o.snapshot->>'title' as title from booking_records b join commerce_orders o on o.id=b.order_id where b.id=${e.target_id} and b.status='confirmed' and o.status='paid' and o.kind='cage' and o.payment_provider='square' and o.payment_environment='production'`;
        if (b) {
          const staff = await tx<{
            email: string;
          }>`select email from cage_alert_recipients where active order by email`;
          for (const r of staff)
            await addDelivery(
              tx,
              `cage:${e.id}:${r.email}`,
              r.email,
              "cage",
              "Cage booked — Oklahoma Prospects",
              `A paid cage booking is confirmed.\nCustomer: ${b.email}\n${bookingNoticeDetails([b])}\nFor changes, contact Coach Steve or Nolan.`,
            );
        }
      }
    }
    const subject = `Oklahoma Prospects — ${events.length} site activity update${events.length === 1 ? "" : "s"}`;
    const body = `Saved site activity:\n\n${lines.join("\n\n")}\n\nReview details: ${origin}/office`;
    for (const r of recipients)
      await addDelivery(tx, `activity:${batch}:${r.email}`, r.email, "owners", subject, body);
    await tx`update site_alert_events set batched_at=now() where id=any(${events.map((e) => e.id)}::bigint[])`;
    return events.length;
  });
}
export async function deliverSiteAlerts(
  sql: Sql,
  config: { key: string; from: string; origin: string; production: boolean },
  send: typeof fetch = fetch,
) {
  if (!config.production) return [];
  await batchSiteAlerts(sql, config.origin);
  const pending = await sql<{
    id: string;
    recipient: string;
    audience: string;
    subject: string;
    body: string;
    first_attempt_at: Date | null;
  }>`select * from site_alert_deliveries where status='pending' order by created_at limit 12`;
  const results = await Promise.all(
    pending.map(async (d) => {
      // A booking can be cancelled/refunded after batching but before mail is sent.
      if (d.audience === "cage" && d.id.startsWith("cage:")) {
        const eventId = d.id.split(":")[1];
        const active =
          await sql`select b.id from audit_events a join booking_records b on b.id=a.target_id
          join commerce_orders o on o.id=b.order_id where a.id=${eventId}::bigint and b.status='confirmed'
          and o.status='paid' and o.payment_environment='production'`;
        if (!active.length) {
          await sql`update site_alert_deliveries set status='resolved' where id=${d.id} and status='pending'`;
          return null;
        }
      }
      // Revocation applies to queued mail too. This does not grant staff owner access.
      const valid =
        d.audience === "owners"
          ? (await owners(sql)).some((r) => r.email === d.recipient)
          : (
              await sql`select email from cage_alert_recipients where active and email=${d.recipient}`
            ).length > 0;
      if (!valid) {
        await sql`update site_alert_deliveries set status='revoked' where id=${d.id}`;
        return null;
      }
      if (
        d.first_attempt_at &&
        Date.now() - new Date(d.first_attempt_at).getTime() > 23 * 3600000
      ) {
        await sql`update site_alert_deliveries set status='review' where id=${d.id}`;
        return null;
      }
      await sql`update site_alert_deliveries set first_attempt_at=coalesce(first_attempt_at,now()) where id=${d.id}`;
      try {
        const response = await send("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.key}`,
            "Content-Type": "application/json",
            "Idempotency-Key": d.id,
          },
          body: JSON.stringify({
            from: config.from,
            to: [d.recipient],
            subject: d.subject,
            text: d.body,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return null;
        const result = (await response.json()) as { id?: string };
        if (!result.id) return null;
        await sql`update site_alert_deliveries set status='sent',sent_at=now(),provider_id=${result.id} where id=${d.id}`;
        return { recipient: d.recipient, id: result.id };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((x): x is { recipient: string; id: string } => x !== null);
}
export async function flushSiteAlerts() {
  const production =
    process.env.CONTEXT === "production" && process.env.SQUARE_ENVIRONMENT === "production";
  if (!production) return [];
  const key = process.env.RESEND_API_KEY,
    from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM,
    origin = process.env.APP_BASE_URL;
  if (!key || !from || !origin) throw new Error("Site alert email is not configured.");
  const { getSql } = await import("./db");
  return deliverSiteAlerts(await getSql(), { key, from, origin, production });
}
export async function trySiteAlerts() {
  try {
    await flushSiteAlerts();
  } catch {
    /* Durable events remain queued for scheduled retry. */
  }
}

export async function testSiteAlerts(userId: string) {
  const { requirePaymentOwner } = await import("./commerce/square-office.server");
  const { assertPaymentRequest } = await import("./commerce/square-payments.server");
  const { rateLimit } = await import("./commerce/checkout.server");
  await requirePaymentOwner(userId);
  assertPaymentRequest();
  await rateLimit("site-alert-test", 3);
  if (process.env.CONTEXT !== "production" || process.env.SQUARE_ENVIRONMENT !== "production")
    throw new Error("Live alert tests are production-only.");
  const { getSql } = await import("./db");
  const sql = await getSql();
  const recipients = [
    ...(await owners(sql)).map((r) => ({ ...r, audience: "owners" })),
    ...(await sql<{ email: string }>`select email from cage_alert_recipients where active`).map(
      (r) => ({ ...r, audience: "cage" }),
    ),
  ];
  const id = randomUUID();
  for (const r of recipients)
    await addDelivery(
      sql,
      `test:${id}:${r.email}`,
      r.email,
      r.audience,
      "TEST — Oklahoma Prospects site alerts",
      r.audience === "owners"
        ? "Your owner site-activity alerts are enabled. New saved business activity is checked every minute. This is a delivery test; no booking or payment was created."
        : "Your cage-booking alerts are enabled. New paid cage bookings will include the date, time and lanes. This is a delivery test; no booking or payment was created.",
    );
  await flushSiteAlerts();
  return sql<{
    recipient: string;
    status: string;
  }>`select recipient,status from site_alert_deliveries where id like ${`test:${id}:%`} order by recipient`;
}
