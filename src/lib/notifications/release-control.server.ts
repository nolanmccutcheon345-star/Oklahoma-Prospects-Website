import { createHash } from "node:crypto";
import type { Sql } from "../db";
import {
  noticeQueues,
  noticeAuditInput,
  noticeApproveInput,
  noticeHoldInput,
  noticeDispatchInput,
  type NoticeQueue,
  type NoticeAuditRow,
} from "./release-control-contracts";
import type { z } from "zod";
type Env = Record<string, string | undefined>;
type Raw = Record<string, unknown>;
type Source = { queue: NoticeQueue; id: string; raw: Raw; created_at: string };
type Body = { from?: string; to: string[]; subject: string; text: string; reply_to?: string };
const obj = (v: unknown): Raw =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const union = `select 'invitation'::text queue,d.invitation_id::text id,to_jsonb(d)||jsonb_build_object('invite',to_jsonb(i)) raw,d.requested_at::text created_at from invitation_delivery d join club_invites i on i.id=d.invitation_id
union all select 'fee',id,to_jsonb(f),requested_at::text from fee_ready_notifications f
union all select 'tryout',id::text,to_jsonb(t),created_at::text from tryout_notification_outbox t
union all select 'center',c.id,to_jsonb(c)||jsonb_build_object('registration',r.payload),c.created_at::text from tryout_center_notices c left join club_requests r on r.id=c.request_id
union all select 'program',id::text,to_jsonb(p),created_at::text from coordinator_program_notices p
union all select 'team',id::text,to_jsonb(t),created_at::text from coordinator_team_notices t`;
export async function requireNoticeOwner(sql: Sql, actor: string) {
  const [r] =
    await sql`select g.user_id from owner_grants g join "user" u on u.id=g.user_id and lower(trim(u.email))=g.email join profiles p on p.user_id=u.id where u.id=${actor} and u."emailVerified" and u."disabledAt" is null and p.role='admin' and g.revoked_at is null and not exists(select 1 from organization_operational_access a where a.user_id=u.id and a.financial_restricted)`;
  if (!r) throw Error("Current Prospects owner access required.");
}
const mutable = new Set([
  "status",
  "attempts",
  "first_attempt_at",
  "next_attempt_at",
  "lease_token",
  "lease_until",
  "request_body",
  "provider_id",
  "provider_message_id",
  "accepted_at",
  "delivery_event",
  "delivery_checked_at",
  "read_at",
  "sent_at",
]);
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, stable(x)]),
    );
  return v;
}
const sourceContent = (r: Raw) =>
  Object.fromEntries(Object.entries(r).filter(([k]) => !mutable.has(k)));
async function source(sql: Sql, queue: NoticeQueue, id: string) {
  return (
    await sql.query<Source>(`select * from (${union}) n where queue=$1 and id=$2`, [queue, id])
  )[0];
}
async function bodyFor(s: Source, env: Env, sql?: Sql): Promise<Body> {
  const r = s.raw,
    frozen = obj(r.request_body);
  if (Object.keys(frozen).length) return frozen as unknown as Body;
  const from = env.RESEND_FROM_EMAIL || env.EMAIL_FROM || "";
  if (s.queue === "invitation") {
    const { invitationEmailBody } = await import("../invitation-delivery.server");
    return invitationEmailBody(
      obj(r.invite) as unknown as Parameters<typeof invitationEmailBody>[0],
      env,
    );
  }
  if (s.queue === "fee") {
    const { feeReadyBody } = await import("../teams/fee-notifications.server");
    return feeReadyBody(
      obj(r.snapshot) as unknown as Parameters<typeof feeReadyBody>[0],
      env.SQUARE_DEPLOY_CONTEXT === "production"
        ? "https://prospectssports.club"
        : env.DEPLOY_PRIME_URL || env.APP_BASE_URL || "https://audit.example.invalid",
      from,
    );
  }
  if (s.queue === "tryout") {
    const { emailBody } = await import("../tryout-notifications.server");
    return emailBody(str(r.kind), r.payload, from);
  }
  if (s.queue === "team") {
    const p = obj(r.proposal),
      ids = Object.values(obj(r.recipients)).flatMap(list);
    const people = sql
      ? await sql<{
          id: string;
          name: string;
          email: string;
        }>`select id,name,email from "user" where id=any(${ids}::text[])`
      : [];
    return {
      to: ids.map((id) => {
        const person = people.find((p) => p.id === id);
        return person ? `${person.name} <${person.email}> [${id}]` : id;
      }),
      subject: "Team notice",
      text: str(p.body),
    };
  }
  let text = str(r.body);
  if (s.queue === "center" && r.recipient_id) {
    const p = obj(r.registration);
    text += `\n\nPlayer: ${str(p.player) || "Registered player"}\nDivision: ${str(p.sport)} ${str(p.age)}\nRequested event: ${str(p.session) || str(p.requestedEventId) || str(p.requestType) || "See registration"}\nSecure registration: https://prospectssports.club/registrations?registration=${encodeURIComponent(str(r.request_id))}`;
  }
  return {
    from,
    to: [str(r.email)],
    subject: str(r.subject),
    text,
    ...(r.reply_to ? { reply_to: str(r.reply_to) } : {}),
  };
}
async function describe(sql: Sql, s: Source, env: Env): Promise<NoticeAuditRow> {
  let body: Body,
    problem = "";
  try {
    body = await bodyFor(s, env, sql);
  } catch {
    body = { to: [], subject: "Invalid notice", text: "" };
    problem = "Source content cannot be rendered safely.";
  }
  const digest = createHash("sha256")
    .update(JSON.stringify(stable([s.queue, s.id, sourceContent(s.raw), body])))
    .digest("hex");
  const [a] = await sql<{
    digest: string;
    approved: boolean;
    owner_id: string;
  }>`select digest,approved,owner_id from notice_release_approvals where queue=${s.queue} and source_id=${s.id}`;
  let approved = Boolean(a?.approved && a.digest === digest);
  if (approved)
    try {
      await requireNoticeOwner(sql, a.owner_id);
    } catch {
      approved = false;
    }
  const status = str(s.raw.status),
    sent = ["sent", "accepted"].includes(status),
    invalid =
      Boolean(problem) ||
      ["superseded", "review", "skipped", "blocked", "cancelled"].includes(status);
  const snap = obj(s.raw.snapshot),
    invite = obj(s.raw.invite);
  return {
    queue: s.queue,
    id: s.id,
    digest,
    status,
    approvalStatus: sent ? "sent" : invalid ? "invalid" : approved ? "approved" : "held",
    recipients: body.to,
    subject: body.subject,
    text: body.text,
    teamIds: [
      str(s.raw.team_id) || str(snap.teamId) || str(invite.team_id),
      ...list(s.raw.team_ids),
    ].filter(Boolean),
    revision:
      typeof snap.publication === "number"
        ? snap.publication
        : typeof s.raw.revision === "number"
          ? s.raw.revision
          : typeof s.raw.event_revision === "number"
            ? s.raw.event_revision
            : null,
    createdAt: s.created_at,
    channel: s.queue === "team" ? "in-app" : "email",
    attempts: Number(s.raw.attempts || 0),
    providerStatus:
      str(s.raw.delivery_event) ||
      str(s.raw.provider_message_id) ||
      str(s.raw.provider_id) ||
      "not submitted",
    ...(problem ? { message: problem } : {}),
  };
}
export async function auditNoticeReleases(
  sql: Sql,
  actor: string,
  env: Env,
  raw: z.input<typeof noticeAuditInput> = {},
) {
  const input = noticeAuditInput.parse(raw);
  await requireNoticeOwner(sql, actor);
  const all = await sql.query<Source>(`select * from (${union}) n order by queue,id`);
  const described: NoticeAuditRow[] = [];
  for (let offset = 0; offset < all.length; offset += 10)
    described.push(
      ...(await Promise.all(all.slice(offset, offset + 10).map((row) => describe(sql, row, env)))),
    );
  const available = described.filter(
    (row) =>
      (!input.queue || row.queue === input.queue) &&
      (!input.cursor || `${row.queue}:${row.id}` > input.cursor),
  );
  const rows = available.slice(0, input.limit);
  const blockers = [
    ...(!env.RESEND_API_KEY || !(env.RESEND_FROM_EMAIL || env.EMAIL_FROM)
      ? ["Email provider is not configured."]
      : []),
    ...(env.SQUARE_DEPLOY_CONTEXT !== "production" || (env.CONTEXT && env.CONTEXT !== "production")
      ? ["Manual delivery requires the production owner workspace."]
      : []),
    ...(env.INVITATION_EMAIL_PAUSED === "true" ? ["Invitation and fee delivery are paused."] : []),
  ];
  return {
    rows,
    counts: noticeQueues.map((queue) => {
      const records = described.filter((row) => row.queue === queue);
      return {
        queue,
        total: records.length,
        approved: records.filter((r) => r.approvalStatus === "approved").length,
        held: records.filter((r) => r.approvalStatus === "held").length,
        sent: records.filter((r) => r.approvalStatus === "sent").length,
        invalid: records.filter((r) => r.approvalStatus === "invalid").length,
      };
    }),
    nextCursor: available.length > input.limit ? `${rows.at(-1)!.queue}:${rows.at(-1)!.id}` : null,
    readiness: {
      enabled: blockers.length === 0,
      blockers,
      schedulerEnabled: env.TRYOUT_NOTIFICATIONS_ENABLED === "true",
    },
  };
}
export async function noticeReleaseAllowed(
  sql: Sql,
  queue: NoticeQueue,
  id: string,
  env: Env,
  body?: unknown,
) {
  const s = await source(sql, queue, id);
  if (!s) return false;
  const d = await describe(sql, s, env);
  if (d.approvalStatus !== "approved") return false;
  if (body && JSON.stringify(stable(body)) !== JSON.stringify(stable(await bodyFor(s, env, sql))))
    return false;
  return true;
}
export async function approveNoticeReleases(
  sql: Sql,
  actor: string,
  env: Env,
  raw: z.input<typeof noticeApproveInput>,
) {
  const { items } = noticeApproveInput.parse(raw);
  return sql.transaction(async (tx) => {
    await requireNoticeOwner(tx, actor);
    for (const i of items) {
      const s = await source(tx, i.queue, i.id);
      if (!s) throw Error("Notice no longer exists. Refresh.");
      const d = await describe(tx, s, env);
      if (
        d.digest !== i.digest ||
        ["sent", "invalid"].includes(d.approvalStatus) ||
        d.status === "processing"
      )
        throw Error("Notice changed or was already submitted. Refresh before approving.");
      if (d.attempts > 0 && d.approvalStatus !== "approved")
        throw Error("Previously attempted notice requires delivery review before approval.");
      await tx`insert into notice_release_approvals(queue,source_id,digest,owner_id,approved) values(${i.queue},${i.id},${i.digest},${actor},true) on conflict(queue,source_id) do update set digest=excluded.digest,owner_id=excluded.owner_id,approved=true,approved_at=now(),revoked_at=null`;
      await tx`insert into notice_release_audit(queue,source_id,digest,actor_id,action) values(${i.queue},${i.id},${i.digest},${actor},'approve')`;
    }
    return { approved: items.length };
  });
}
export async function holdNoticeReleases(
  sql: Sql,
  actor: string,
  env: Env,
  raw: z.input<typeof noticeHoldInput>,
) {
  const { items, reason } = noticeHoldInput.parse(raw);
  return sql.transaction(async (tx) => {
    await requireNoticeOwner(tx, actor);
    for (const i of items) {
      const s = await source(tx, i.queue, i.id);
      if (!s) throw Error("Notice not found.");
      const d = await describe(tx, s, env);
      if (d.digest !== i.digest) throw Error("Notice changed. Refresh.");
      await tx`update notice_release_approvals set approved=false,revoked_at=now() where queue=${i.queue} and source_id=${i.id}`;
      await tx`insert into notice_release_audit(queue,source_id,digest,actor_id,action,reason) values(${i.queue},${i.id},${i.digest},${actor},'hold',${reason})`;
    }
    return { held: items.length };
  });
}
export async function dispatchNoticeReleases(
  sql: Sql,
  actor: string,
  env: Env,
  raw: z.input<typeof noticeDispatchInput>,
  send: typeof fetch = fetch,
) {
  const { items } = noticeDispatchInput.parse(raw);
  await requireNoticeOwner(sql, actor);
  if (env.SQUARE_DEPLOY_CONTEXT !== "production" || (env.CONTEXT && env.CONTEXT !== "production"))
    throw Error("Manual delivery requires the production owner workspace.");
  const results: { queue: NoticeQueue; id: string; status: string; message?: string }[] = [];
  for (const i of items) {
    await requireNoticeOwner(sql, actor);
    const s = await source(sql, i.queue, i.id);
    if (!s) throw Error("Notice not found.");
    const before = await describe(sql, s, env);
    if (before.digest !== i.digest || before.approvalStatus !== "approved")
      throw Error("Selected notice is not currently approved. Refresh.");
    await sql`insert into notice_release_audit(queue,source_id,digest,actor_id,action) values(${i.queue},${i.id},${i.digest},${actor},'dispatch')`;
    // This bounded invocation does not change runtime configuration or start the shared scheduler.
    const scoped = { ...env, TRYOUT_NOTIFICATIONS_ENABLED: "true" };
    if (i.queue === "invitation")
      await (
        await import("../invitation-delivery.server")
      ).deliverInvitationEmails(sql, scoped, send, i.id);
    else if (i.queue === "fee")
      await (
        await import("../teams/fee-notifications.server")
      ).deliverFeeReadyEmails(sql, scoped, send, [i.id]);
    else if (i.queue === "tryout")
      await (
        await import("../tryout-notifications.server")
      ).deliverTryoutNotifications(sql, scoped, send, 1, [i.id]);
    else if (i.queue === "center")
      await (
        await import("../tryout-center-delivery.server")
      ).deliverCenterNotifications(sql, scoped, send, [i.id]);
    else if (i.queue === "program")
      await (
        await import("../coordinator/program-notices.server")
      ).deliverProgramEventNotices(sql, scoped, send, [i.id]);
    else await (await import("../coordinator/communications.server")).deliverTeamNotices(sql, i.id);
    const after = await source(sql, i.queue, i.id);
    results.push({
      queue: i.queue,
      id: i.id,
      status: str(after?.raw.status) || "unknown",
      message:
        str(after?.raw.delivery_event) || "Provider acceptance is not proof of inbox delivery.",
    });
  }
  return { results };
}

// Called only before any provider invocation, with the lease owned by this worker.
// Undo this local claim, not any earlier (possibly uncertain) provider attempt.
export async function releaseUnsubmittedNoticeClaim(
  sql: Sql,
  queue: Exclude<NoticeQueue, "team">,
  id: string,
  lease: string,
) {
  const tables = {
    invitation: ["invitation_delivery", "invitation_id", "pending"],
    fee: ["fee_ready_notifications", "id", "queued"],
    tryout: ["tryout_notification_outbox", "id", "pending"],
    center: ["tryout_center_notices", "id", "pending"],
    program: ["coordinator_program_notices", "id", "pending"],
  } as const;
  const [table, key, status] = tables[queue];
  await sql.query(
    `update ${table} set status=$3,attempts=greatest(attempts-1,0),first_attempt_at=case when attempts=1 then null else first_attempt_at end,lease_token=null,lease_until=null where ${key}::text=$1 and lease_token=$2 and status='processing'`,
    [id, lease, status],
  );
}
