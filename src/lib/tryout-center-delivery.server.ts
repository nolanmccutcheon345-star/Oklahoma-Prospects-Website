import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { tryoutEmailAllowed } from "./tryout-notifications.server";
import { centerStaff, queueCenterNotice } from "./tryout-center.server";
type Env = Record<string, string | undefined>;
export async function deliverCenterNotifications(sql: Sql, env: Env, send: typeof fetch = fetch) {
  if (
    !env.RESEND_API_KEY ||
    !(env.RESEND_FROM_EMAIL || env.EMAIL_FROM) ||
    !tryoutEmailAllowed("probe@example.invalid", {
      ...env,
      TRYOUT_EMAIL_TEST_RECIPIENTS: "probe@example.invalid",
    })
  )
    return { accepted: 0, failed: 0, skipped: true };
  const existingStaff = await centerStaff(sql, { includeInactive: true });
  // Reminder delivery may include a scoped coordinator, without widening the
  // legacy registration center's global staff directory or its authority.
  const scopedStaff = await sql<{
    id: string;
    email: string;
  }>`select distinct u.id,lower(trim(u.email)) as email from "user" u join coordinator_assignments g on g.user_id=u.id where u."emailVerified"=true and u."disabledAt" is null and g.status='active' and 'recruiting.read'=any(g.permissions)`;
  const staff = [...existingStaff, ...scopedStaff];
  const due = await sql<{
    request_id: string;
    assignee_id: string;
    updated_at: Date;
  }>`select w.request_id,w.assignee_id,w.updated_at from office_request_work w join club_requests r on r.id=w.request_id where r.kind in ('tryout','team-inquiry') and w.follow_up_date<=(now() at time zone 'America/Chicago')::date and w.follow_up not in ('closed','accepted') limit 100`;
  for (const w of due) {
    const recipient = staff.find((s) => s.id === w.assignee_id);
    const [allowed] = recipient
      ? await sql`select coordinator_recipient_allowed(${recipient.id},${w.request_id}) as allowed`
      : [];
    if (recipient && allowed?.allowed)
      await queueCenterNotice(
        sql,
        w.request_id,
        recipient,
        "due:" + w.request_id + ":" + new Date(w.updated_at).toISOString(),
        "Tryout follow-up due",
        "A player needs follow-up. Open https://prospectssports.club/registrations",
      );
  }
  const candidates = await sql<{
    id: string;
    email: string;
    recipient_id: string | null;
  }>`select id,email,recipient_id from tryout_center_notices where (status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<now()) order by created_at,id limit 30`;
  for (const c of candidates) {
    if (c.recipient_id && !staff.some((s) => s.id === c.recipient_id && s.email === c.email)) {
      await sql`update tryout_center_notices set status='skipped' where id=${c.id} and status in ('pending','processing')`;
      continue;
    }
    if (!tryoutEmailAllowed(c.email, env)) continue;
    const lease = randomUUID();
    const n = await sql.transaction(async (tx) => {
      const [row] = await tx<{
        id: string;
        email: string;
        subject: string;
        body: string;
        reply_to: string;
        request_id: string;
        recipient_id: string | null;
        request_body: Record<string, unknown> | null;
        attempts: number;
        first_attempt_at: Date | null;
      }>`select * from tryout_center_notices where id=${c.id} and ((status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<now())) for update skip locked`;
      if (!row) return null;
      const [permitted] =
        await tx`select id from tryout_center_notices where id=${row.id} and (coordinator_actor_id is null or coordinator_notice_allowed(coordinator_actor_id,request_id,email)) and (recipient_id is null or (coordinator_recipient_allowed(recipient_id,request_id) and exists(select 1 from "user" u where u.id=recipient_id and lower(trim(u.email))=lower(trim(tryout_center_notices.email)))))`;
      if (!permitted) {
        await tx`update tryout_center_notices set status='skipped',lease_token=null,lease_until=null where id=${row.id}`;
        return null;
      }
      if (
        row.attempts >= 8 ||
        (row.first_attempt_at &&
          Date.now() - new Date(row.first_attempt_at).getTime() > 23 * 3600000)
      ) {
        await tx`update tryout_center_notices set status='review',lease_token=null,lease_until=null where id=${row.id}`;
        return null;
      }
      let message = row.body;
      if (!row.request_body && row.recipient_id) {
        const [registration] = await tx<{
          payload: Record<string, string>;
        }>`select payload from club_requests where id=${row.request_id}`;
        const p = registration?.payload;
        message += `\n\nPlayer: ${p?.player || "Registered player"}\nDivision: ${p?.sport || ""} ${p?.age || ""}\nRequested event: ${p?.session || p?.requestedEventId || p?.requestType || "See registration"}\nSecure registration: https://prospectssports.club/registrations?registration=${encodeURIComponent(row.request_id)}`;
      }
      const body = row.request_body ?? {
        from: env.RESEND_FROM_EMAIL || env.EMAIL_FROM,
        to: [row.email],
        subject: row.subject,
        text: message,
        ...(row.reply_to ? { reply_to: row.reply_to } : {}),
      };
      await tx`update tryout_center_notices set status='processing',lease_token=${lease},lease_until=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),request_body=${JSON.stringify(body)}::jsonb where id=${row.id}`;
      return { id: row.id, body };
    });
    if (!n) continue;
    const [current] =
      await sql`select id from tryout_center_notices where id=${n.id} and status='processing' and lease_token=${lease} and (coordinator_actor_id is null or coordinator_notice_allowed(coordinator_actor_id,request_id,email)) and (recipient_id is null or (coordinator_recipient_allowed(recipient_id,request_id) and exists(select 1 from "user" u where u.id=recipient_id and lower(trim(u.email))=lower(trim(tryout_center_notices.email)))))`;
    if (!current) continue;
    try {
      const response = await send("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.RESEND_API_KEY,
          "Content-Type": "application/json",
          "Idempotency-Key": "tryout-center-" + n.id,
        },
        body: JSON.stringify({
          from: n.body.from,
          to: n.body.to,
          subject: n.body.subject,
          text: n.body.text,
          ...(n.body.reply_to ? { reply_to: n.body.reply_to } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Provider rejected message.");
      const result = (await response.json()) as { id?: string };
      if (typeof result.id !== "string" || !result.id)
        throw new Error("Acceptance reference missing.");
      await sql`update tryout_center_notices set status='sent',provider_id=${result.id},accepted_at=now(),lease_token=null,lease_until=null where id=${n.id} and lease_token=${lease}`;
      return { accepted: 1, failed: 0, skipped: false };
    } catch {
      await sql`update tryout_center_notices set status='pending',next_attempt_at=now()+least(3600,power(2,attempts)*60)::int*interval '1 second',lease_token=null,lease_until=null where id=${n.id} and lease_token=${lease}`;
      return { accepted: 0, failed: 1, skipped: false };
    }
  }
  return { accepted: 0, failed: 0, skipped: false };
}
