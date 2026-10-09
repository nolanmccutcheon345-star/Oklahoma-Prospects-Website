import { formatClockTime } from "./time-display";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Sql } from "./db";
import { authEmailAllowed } from "./auth/email.server";
type Env = Record<string, string | undefined>;
const payloadSchema = z.object({
  email: z.email(),
  player: z.string().min(1).max(120),
  sport: z.enum(["Baseball", "Softball"]),
  season: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string(),
  endTime: z.string(),
  location: z.string().min(1).max(500),
});
export function tryoutEmailAllowed(to: string, env: Env) {
  return (
    env.TRYOUT_NOTIFICATIONS_ENABLED === "true" &&
    authEmailAllowed(to, { ...env, AUTH_EMAIL_TEST_RECIPIENTS: env.TRYOUT_EMAIL_TEST_RECIPIENTS })
  );
}
function emailBody(kind: string, payload: unknown, from: string) {
  const p = payloadSchema.parse(payload);
  const subject =
    kind === "cancelled"
      ? "Your group tryout was cancelled"
      : kind === "updated"
        ? "Your group tryout details changed"
        : "Your group tryout enrollment is confirmed";
  return {
    from,
    to: [p.email.trim()],
    subject: `Oklahoma Prospects Academy — ${subject}`,
    text: `${subject}.\n\nPlayer: ${p.player}\nSport: ${p.sport}\nSeason: ${p.season}\nDate: ${p.date}\nTime: ${formatClockTime(p.startTime)}–${formatClockTime(p.endTime)} Central (America/Chicago)\nLocation: ${p.location}\n\n${kind === "cancelled" ? "Do not attend this cancelled event. Your request remains on file for matching group opportunities." : "This is a group tryout appointment. Private tryouts are arranged separately with a coach."}`,
  };
}
type Notice = {
  id: string;
  enrollment_id: string;
  event_revision: number;
  kind: string;
  payload: unknown;
  request_body: ReturnType<typeof emailBody> | null;
  attempts: number;
  first_attempt_at: Date | null;
};
export async function deliverTryoutNotifications(sql: Sql, env: Env, send: typeof fetch = fetch) {
  if (
    env.TRYOUT_NOTIFICATIONS_ENABLED !== "true" ||
    !env.RESEND_API_KEY ||
    !(env.RESEND_FROM_EMAIL || env.EMAIL_FROM)
  )
    return { accepted: 0, failed: 0, skipped: true };
  // No database work for an unknown build/runtime context.
  if (
    !tryoutEmailAllowed("policy-probe@example.invalid", {
      ...env,
      TRYOUT_EMAIL_TEST_RECIPIENTS: "policy-probe@example.invalid",
    })
  )
    return { accepted: 0, failed: 0, skipped: true };
  let accepted = 0,
    failed = 0;
  const candidates = await sql<{
    id: string;
    payload: { email?: string };
  }>`select id,payload from tryout_notification_outbox where (status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<now()) order by created_at,id limit 20`;
  for (const candidate of candidates) {
    if (accepted + failed >= 2) break;
    if (!candidate.payload.email || !tryoutEmailAllowed(candidate.payload.email, env)) continue;
    const lease = randomUUID();
    const notice = await sql.transaction(async (tx) => {
      const [n] =
        await tx<Notice>`select * from tryout_notification_outbox where id=${candidate.id} and ((status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<now())) for update skip locked`;
      if (!n) return null;
      if (
        n.first_attempt_at &&
        (Date.now() - new Date(n.first_attempt_at).getTime() > 23 * 3600000 || n.attempts >= 8)
      ) {
        await tx`update tryout_notification_outbox set status='review',lease_token=null,lease_until=null where id=${n.id}`;
        return null;
      }
      let body;
      try {
        body =
          n.request_body ||
          emailBody(n.kind, n.payload, (env.RESEND_FROM_EMAIL || env.EMAIL_FROM)!);
      } catch {
        await tx`update tryout_notification_outbox set status='review' where id=${n.id}`;
        return null;
      }
      await tx`update tryout_notification_outbox set status='processing',lease_token=${lease},lease_until=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),request_body=${JSON.stringify(body)}::jsonb where id=${n.id}`;
      return { ...n, body };
    });
    if (!notice) continue;
    // Event edits may supersede a committed claim before the provider call.
    const [current] =
      await sql`select o.id from tryout_notification_outbox o join tryout_enrollments n on n.id=o.enrollment_id join tryout_events e on e.id=n.event_id where o.id=${notice.id} and o.status='processing' and o.lease_token=${lease} and o.event_revision=e.revision and ((o.kind='cancelled' and n.status='cancelled') or (o.kind!='cancelled' and n.status='enrolled' and e.status='published'))`;
    if (!current) {
      await sql`update tryout_notification_outbox set status='superseded',lease_token=null,lease_until=null where id=${notice.id} and lease_token=${lease} and status='processing'`;
      continue;
    }
    try {
      const response = await send("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `tryout-${notice.id}`,
        },
        body: JSON.stringify({
          from: notice.body.from,
          to: notice.body.to,
          subject: notice.body.subject,
          text: notice.body.text,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Provider did not accept notice.");
      const result = (await response.json()) as { id?: unknown };
      if (typeof result.id !== "string" || !result.id)
        throw new Error("Provider acceptance reference missing.");
      await sql`update tryout_notification_outbox set status='sent',provider_message_id=${result.id},accepted_at=now(),lease_token=null,lease_until=null where id=${notice.id} and lease_token=${lease} and status='processing'`;
      accepted++;
    } catch {
      await sql`update tryout_notification_outbox set status='pending',next_attempt_at=now()+least(3600,power(2,attempts)*60)::int*interval '1 second',lease_token=null,lease_until=null where id=${notice.id} and lease_token=${lease} and status='processing'`;
      failed++;
    }
  }
  return { accepted, failed, skipped: false };
}
