import type { Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import {
  THANKSGIVING_CAMP,
  thanksgivingDetailsSchema,
  thanksgivingGroup,
} from "../thanksgiving-camp";
import { bookingNoticeDetails } from "./square-notifications.server";
import { chicagoInstant } from "../scheduling";
import { thanksgivingMail } from "./thanksgiving-mail";

const academyEmail = "prospectssportsacademy@gmail.com";
type Config = { environment: "sandbox" | "production"; origin: string; context?: string };
type Notice = {
  id: string;
  kind: "receipt" | "thanksgiving-registration";
  status: string;
  created_at: Date;
};

async function eligibleCampMailTest(
  sql: Sql,
  userId: string,
  orderId: string,
  c: Config,
  knownOwner?: Awaited<ReturnType<typeof resolveIdentity>>,
) {
  if (
    c.environment !== "sandbox" ||
    !["deploy-preview", "branch-deploy", "dev", "test"].includes(c.context || "")
  )
    throw new Error("Camp email tests require an isolated non-production Square Sandbox.");
  const me = knownOwner || (await resolveIdentity(sql, userId));
  if (me.role !== "admin") throw new Error("Owner access required.");
  const [authority] =
    await sql`select u.id from "user" u join profiles p on p.user_id=u.id and p.role='admin'
    join owner_grants g on g.user_id=u.id and g.email=lower(trim(u.email)) and g.revoked_at is null
    where u.id=${userId} and lower(trim(u.email))=${me.email} and u."emailVerified"=true and u."disabledAt" is null`;
  if (!authority) throw new Error("Owner access required.");
  const [order] = await sql<{
    id: string;
    product_id: string;
    total_cents: number;
    receipt_url: string | null;
    snapshot: {
      title: string;
      eventRegistration?: {
        location?: string;
        sessions?: { date: string; start: string; end: string }[];
        thanksgivingDetails?: unknown;
      };
    };
  }>`select o.id,o.product_id,o.total_cents,o.receipt_url,o.snapshot from commerce_orders o
    join square_payments p on p.id=o.square_payment_id and p.order_id=o.id
    where o.id=${orderId} and o.user_id=${userId} and lower(trim(o.email))=${me.email}
      and o.kind='event' and o.status='paid' and o.payment_provider='square' and o.payment_environment='sandbox'
      and o.created_at>now()-interval '23 hours' and o.paid_at>now()-interval '23 hours'
      and p.environment='sandbox' and p.status='COMPLETED' and p.amount_cents=o.total_cents and p.refunded_cents=0
      and p.created_at>now()-interval '23 hours'
      and not exists(select 1 from commerce_refunds r where r.order_id=o.id and r.status not in ('failed','rejected'))
      and exists(select 1 from training_event_registrations r where r.order_id=o.id and r.event_id=o.product_id and r.user_id=${userId} and r.status='confirmed')`;
  const group = order && thanksgivingGroup(order.product_id);
  const registration = order?.snapshot.eventRegistration;
  const metadata = thanksgivingDetailsSchema.safeParse(registration?.thanksgivingDetails);
  const sessions = registration?.sessions;
  if (
    !order ||
    !group ||
    !metadata.success ||
    metadata.data.ageGroup !== group.value ||
    !sessions?.length ||
    sessions.length > 3 ||
    new Set(sessions.map((s) => s.date)).size !== sessions.length ||
    sessions.some(
      (s) =>
        !(THANKSGIVING_CAMP.dates as readonly string[]).includes(s.date) ||
        s.start !== group.start ||
        s.end !== group.end,
    ) ||
    order.total_cents !== (sessions.length === 3 ? 12000 : sessions.length * 4500) ||
    registration?.location !== THANKSGIVING_CAMP.location
  )
    throw new Error("Use your own recent verified-paid Thanksgiving Sandbox registration.");
  const bookings = await sql<{
    starts_at: Date;
    ends_at: Date;
    resources: string[];
    status: string;
  }>`
    select starts_at,ends_at,resources,status from operational_booking_schedule where order_id=${orderId} order by starts_at`;
  if (
    bookings.length !== sessions.length ||
    bookings.some((b) => b.status !== "confirmed") ||
    sessions.some(
      (s) =>
        !bookings.some(
          (b) =>
            new Date(b.starts_at).getTime() === chicagoInstant(s.date, s.start).getTime() &&
            new Date(b.ends_at).getTime() === chicagoInstant(s.date, s.end).getTime(),
        ),
    )
  )
    throw new Error("Every selected camp session must have a confirmed Sandbox booking.");
  const notices = await sql<Notice>`select id,kind,status,created_at from payment_notifications
    where order_id=${orderId} and ((id=${"receipt:" + orderId} and kind='receipt') or (id=${"thanksgiving-registration:" + orderId} and kind='thanksgiving-registration')) order by kind`;
  if (
    notices.length !== 2 ||
    notices.some(
      (n) =>
        !["pending", "sandbox-test-accepted"].includes(n.status) ||
        Date.now() - new Date(n.created_at).getTime() > 23 * 3600000,
    )
  )
    throw new Error("Both recent camp notification records must be available for this test.");
  return { order, group, bookings, notices, parentEmail: me.email };
}

export async function reviewCampMailTest(sql: Sql, userId: string, orderId: string, c: Config) {
  const { order, parentEmail } = await eligibleCampMailTest(sql, userId, orderId, c);
  return {
    orderId,
    parentEmail,
    academyEmail,
    title: order.snapshot.title,
    totalCents: order.total_cents,
  };
}

/** Never creates a payment, registration, new recipient, or broad notification queue. */
export async function sendCampMailTest(
  sql: Sql,
  userId: string,
  orderId: string,
  c: Config,
  email: { key: string; from: string },
  send: typeof fetch = fetch,
) {
  if (!email.key || !email.from) throw new Error("Camp email delivery is not configured.");
  const me = await resolveIdentity(sql, userId);
  return sql.transaction(async (tx) => {
    // Serialize repeats of this exact order. No general payment or alert recovery runs.
    await tx`select id from commerce_orders where id=${orderId} for update`;
    const { order, group, bookings, notices, parentEmail } = await eligibleCampMailTest(
      tx,
      userId,
      orderId,
      c,
      me,
    );
    const results: { kind: string; status: "accepted" | "pending"; providerMessageId?: string }[] =
      [];
    for (const n of notices) {
      if (n.status === "sandbox-test-accepted") {
        results.push({ kind: n.kind, status: "accepted" });
        continue;
      }
      const message = thanksgivingMail({
        kind: n.kind,
        title: order.snapshot.title,
        ageGroup: group.value,
        sessions: bookingNoticeDetails(bookings.map((b) => ({ ...b, resources: [] }))).replaceAll(
          "Coach session\n",
          "",
        ),
        location: THANKSGIVING_CAMP.location,
        totalCents: order.total_cents,
        orderId,
        receiptUrl: order.receipt_url,
        origin: c.origin,
      });
      try {
        const response = await send("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${email.key}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `${n.id}-thanksgiving-sandbox-v1`,
          },
          body: JSON.stringify({
            from: email.from,
            to: [n.kind === "receipt" ? parentEmail : academyEmail],
            subject: `[SANDBOX TEST] ${message.subject}`,
            text: `SANDBOX TEST ONLY. No real money was charged. This does not confirm a live camp place.\n\n${message.text}`,
          }),
          signal: AbortSignal.timeout(10000),
        });
        const result = response.ok ? ((await response.json()) as { id?: string }) : undefined;
        if (result?.id) {
          await tx`update payment_notifications set status='sandbox-test-accepted',sent_at=now() where id=${n.id} and status='pending'`;
          results.push({ kind: n.kind, status: "accepted", providerMessageId: result.id });
          continue;
        }
      } catch {
        /* Stable provider key handles uncertain responses on a later explicit retry. */
      }
      results.push({ kind: n.kind, status: "pending" });
    }
    return results;
  });
}
