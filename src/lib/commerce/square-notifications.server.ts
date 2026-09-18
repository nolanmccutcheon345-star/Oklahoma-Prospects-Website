import type { Sql } from "../db";
import { BOOKABLE_LANES } from "../club";

export function bookingNoticeDetails(
  bookings: {
    starts_at: Date | string;
    ends_at: Date | string;
    resources: string[];
    status: string;
  }[],
) {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return bookings
    .map((b) => {
      const lanes = b.resources
        .filter((r) => r.startsWith("lane:"))
        .map((r) => {
          const id = r.slice(5);
          return BOOKABLE_LANES.find((l) => l.id === id)?.name || `Cage ${id}`;
        });
      return `${date.format(new Date(b.starts_at))}\n${time.format(new Date(b.starts_at))}–${time.format(new Date(b.ends_at))}\n${lanes.join("; ") || "Coach session"}\nBooking status: ${b.status}`;
    })
    .join("\n\n");
}

/** Sends only this Square environment's queued notices. Owner tests remain Sandbox-only. */
export async function deliverPaymentNotifications(
  sql: Sql,
  c: { environment: "sandbox" | "production"; origin: string },
  email: { key: string; from: string },
  ownerTest?: { userId: string; email: string },
  send: typeof fetch = fetch,
  orderId?: string,
  ownerOnly = false,
) {
  if (ownerTest && c.environment !== "sandbox")
    throw new Error("Queued receipt tests are Sandbox-only.");
  const { key, from } = email;
  const notices = await sql<{
    id: string;
    kind: string;
    created_at: Date;
    email: string;
    receipt_url: string | null;
    order_id: string;
    title: string;
    customer_name: string | null;
    total_cents: number;
  }>`select n.*,o.email,o.receipt_url,o.total_cents,u.name as customer_name,o.snapshot->>'title' as title from payment_notifications n join commerce_orders o on o.id=n.order_id left join "user" u on u.id=o.user_id where n.status='pending' and o.payment_provider='square' and o.payment_environment=${c.environment}
    and (${orderId || null}::text is null or o.id=${orderId || null})
    and (${ownerOnly}=false or n.kind in ('owner-booking','owner-payment-review'))
    and (${ownerTest?.userId || null}::text is null or (o.user_id=${ownerTest?.userId || null} and lower(o.email)=lower(${ownerTest?.email || null}) and n.kind='receipt' and o.receipt_url is not null))
    order by case when n.kind like 'owner-%' then 0 else 1 end,n.created_at limit ${ownerTest ? 1 : 15}`;
  const accepted: string[] = [];
  for (const n of notices) {
    // Email provider idempotency retention is 24 h. Older ambiguous sends need owner review.
    if (Date.now() - new Date(n.created_at).getTime() > 23 * 3600000) {
      await sql`update payment_notifications set status='review' where id=${n.id}`;
      continue;
    }
    if (c.environment === "sandbox" && !ownerTest && !n.email.endsWith("@example.invalid"))
      continue;
    if (n.email.endsWith("@example.invalid")) {
      if (c.environment === "sandbox")
        await sql`update payment_notifications set status='sandbox-suppressed' where id=${n.id}`;
      continue;
    }
    const failed = n.kind === "renewal-failed",
      dispute = n.kind === "dispute",
      ownerBooking = n.kind === "owner-booking",
      ownerReview = n.kind === "owner-payment-review";
    const recipients =
      dispute || ownerBooking || ownerReview
        ? (
            await sql<{
              email: string;
            }>`select g.email from owner_grants g join "user" u on u.id=g.user_id and lower(u.email)=g.email where g.revoked_at is null and u."emailVerified"=true and u."disabledAt" is null order by g.email`
          ).map((o) => o.email)
        : [n.email];
    if (!recipients.length) continue;
    const bookings =
      ownerBooking || (!ownerTest && n.kind === "receipt")
        ? await sql<{
            starts_at: Date;
            ends_at: Date;
            resources: string[];
            status: string;
          }>`select starts_at,ends_at,resources,status from booking_records where order_id=${n.order_id} order by starts_at`
        : [];
    const details = bookingNoticeDetails(bookings);
    const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      n.total_cents / 100,
    );
    const ownerText = `${ownerReview ? "Payment needs review — no booking was confirmed." : "Paid booking recorded."}\nCustomer: ${n.customer_name || n.email}\nEmail: ${n.email}\nProduct: ${n.title}\nOrder total: ${amount}\n${details}\nOrder: ${n.order_id}\nOpen the front office: ${c.origin}/office`;
    try {
      const response = await send("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": ownerTest ? `${n.id}-owner-sandbox-receipt` : n.id,
        },
        body: JSON.stringify({
          from,
          to: recipients,
          subject: ownerTest
            ? "Oklahoma Prospects — Sandbox booking receipt test"
            : ownerBooking
              ? `New paid booking — ${n.title} — ${amount}`
              : ownerReview
                ? "Action needed — paid checkout has no confirmed booking"
                : dispute
                  ? "Square payment dispute needs review"
                  : failed
                    ? "Update your membership payment card"
                    : "Oklahoma Prospects payment receipt",
          text: ownerTest
            ? `This is a Sandbox receipt check from your saved test payment for ${n.title}. No real money was charged. This is not an active booking confirmation; the test booking may already have been cancelled or refunded. View the saved test billing record at ${c.origin}/family. Square Sandbox receipt: ${n.receipt_url}`
            : ownerBooking || ownerReview
              ? ownerText
              : dispute
                ? `A Square payment dispute requires owner review. Open ${c.origin}/office and review the deadline in Square.`
                : failed
                  ? `Your membership renewal could not be collected. Update your card in your account: ${c.origin}/family. New credits are issued only after a successful payment.`
                  : `Your payment for ${n.title} is confirmed.\n${details ? details + "\n" : ""}View your booking and billing history at ${c.origin}/family. Receipt: ${n.receipt_url || c.origin + "/paid?order_id=" + n.order_id}`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const result = (await response.json()) as { id?: string };
        if (!result.id) continue;
        await sql`update payment_notifications set status='sent',sent_at=now() where id=${n.id}`;
        accepted.push(result.id);
      }
    } catch {
      // Keep this notice pending and continue; a failed customer email must not block owners.
      console.error("Payment notification delivery pending; queued for retry.");
    }
  }
  return accepted;
}
