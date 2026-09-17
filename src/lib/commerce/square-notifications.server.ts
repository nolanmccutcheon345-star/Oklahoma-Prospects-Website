import type { Sql } from "../db";

/** Sends only this Square environment's queued notices. Owner tests remain Sandbox-only. */
export async function deliverPaymentNotifications(
  sql: Sql,
  c: { environment: "sandbox" | "production"; origin: string },
  email: { key: string; from: string },
  ownerTest?: { userId: string; email: string },
  send: typeof fetch = fetch,
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
  }>`select n.*,o.email,o.receipt_url,o.snapshot->>'title' as title from payment_notifications n join commerce_orders o on o.id=n.order_id where n.status='pending' and o.payment_provider='square' and o.payment_environment=${c.environment}
    and (${ownerTest?.userId || null}::text is null or (o.user_id=${ownerTest?.userId || null} and lower(o.email)=lower(${ownerTest?.email || null}) and n.kind='receipt' and o.receipt_url is not null))
    order by n.created_at limit ${ownerTest ? 1 : 15}`;
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
      dispute = n.kind === "dispute";
    const recipients = dispute
      ? (
          await sql<{
            email: string;
          }>`select email from owner_grants where user_id is not null and revoked_at is null`
        ).map((o) => o.email)
      : [n.email];
    if (!recipients.length) continue;
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
          : dispute
            ? "Square payment dispute needs review"
            : failed
              ? "Update your membership payment card"
              : "Oklahoma Prospects payment receipt",
        text: ownerTest
          ? `This is a Sandbox receipt check from your saved test payment for ${n.title}. No real money was charged. This is not an active booking confirmation; the test booking may already have been cancelled or refunded. View the saved test billing record at ${c.origin}/family. Square Sandbox receipt: ${n.receipt_url}`
          : dispute
            ? `A Square payment dispute requires owner review. Open ${c.origin}/office and review the deadline in Square.`
            : failed
              ? `Your membership renewal could not be collected. Update your card in your account: ${c.origin}/family. New credits are issued only after a successful payment.`
              : `Your payment for ${n.title} is confirmed. View your booking and billing history at ${c.origin}/family. Receipt: ${n.receipt_url || c.origin + "/paid?order_id=" + n.order_id}`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const result = (await response.json()) as { id?: string };
      if (!result.id) continue;
      await sql`update payment_notifications set status='sent',sent_at=now() where id=${n.id}`;
      accepted.push(result.id);
    }
  }
  return accepted;
}
