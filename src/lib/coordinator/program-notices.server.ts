import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { tryoutEmailAllowed } from "../tryout-notifications.server";
import { authority, requireTeam, audit, CoordinatorDenied } from "./access.server";
import { operationalEvent, allSessions } from "./organization-events.server";
import { currentPublicationGuardian } from "./player-publication.server";
class EventRelationshipChanged extends Error {}
type Capability = "owner" | "events.assign";
type State = {
  eventId: string;
  sessionKey: string;
  athleteId: string;
  teamId: string;
  sport: string;
  capability: Capability;
  actorId: string;
  recipientId: string;
};
async function state(tx: Sql, v: State) {
  if (v.capability === "owner") await authority(tx, v.actorId, "staff_approvals.review");
  else await requireTeam(tx, v.actorId, v.capability, v.teamId);
  const e = await operationalEvent(tx, v.eventId),
    s = e && (await allSessions(tx, e)).find((s) => s.sessionKey === v.sessionKey);
  const [scope] =
    await tx`select event_id from coordinator_event_scopes where event_id=${v.eventId} and team_id=${v.teamId}`;
  const [n] = await tx<{
    revision: number;
    status: string;
    name: string;
    household_id: string;
  }>`select n.revision,n.status,a.name,a.household_id from operational_event_enrollments n join club_athletes a on a.id=n.athlete_id where n.event_id=${v.eventId} and n.session_key=${v.sessionKey} and n.athlete_id=${v.athleteId}`;
  if (!e || !s || !n || !scope || e.sport.toLowerCase() !== v.sport)
    throw new EventRelationshipChanged("Event relationship changed.");
  const guardian = await currentPublicationGuardian(tx, n.household_id, { id: v.recipientId });
  if (!guardian) throw new EventRelationshipChanged("Guardian relationship changed.");
  const details = {
    eventId: e.id,
    eventRevision: e.revision,
    eventName: e.name,
    publication: e.publication,
    sessionKey: s.sessionKey,
    sessionRevision: s.revision,
    start: s.startsAt,
    end: s.endsAt,
    location: s.location,
    status: s.status,
    enrollmentRevision: n.revision,
    enrollmentStatus: n.status,
    athlete: v.athleteId,
    name: n.name,
    household: n.household_id,
    guardian,
  };
  return {
    sourceDigest: createHash("sha256").update(JSON.stringify(details)).digest("hex"),
    details,
    guardian,
  };
}
/** Called in the same transaction as the enrollment/change/cancellation and its audit. */
export async function queueProgramEventNotices(
  tx: Sql,
  actorId: string,
  eventId: string,
  capability: Capability,
  kind: "enrollment" | "change" | "cancellation",
  sessionKey?: string,
  athleteId?: string,
) {
  const [scope] = await tx<{
    team_id: string;
    sport: string;
  }>`select s.team_id,lower(e.sport) sport from coordinator_event_scopes s join operational_event_records e on e.id=s.event_id where s.event_id=${eventId}`;
  if (!scope) return { queued: 0 };
  const rows = await tx<{
    session_key: string;
    athlete_id: string;
    recipient_id: string;
  }>`select distinct n.session_key,n.athlete_id,u.id recipient_id from operational_event_enrollments n join club_athletes a on a.id=n.athlete_id join "user" u on u."emailVerified" and u."disabledAt" is null join profiles p on p.user_id=u.id where n.event_id=${eventId} and (n.status='active' or ${athleteId || null}::text is not null) and (${sessionKey || null}::text is null or n.session_key=${sessionKey || null}) and (${athleteId || null}::text is null or n.athlete_id=${athleteId || null}) and (exists(select 1 from person_guardian_links g where g.user_id=u.id and g.household_id=a.household_id) or (p.role<>'player' and exists(select 1 from household_members m where m.user_id=u.id and m.household_id=a.household_id)))`;
  let queued = 0;
  for (const row of rows) {
    const v = {
        eventId,
        sessionKey: row.session_key,
        athleteId: row.athlete_id,
        teamId: scope.team_id,
        sport: scope.sport,
        capability,
        actorId,
        recipientId: row.recipient_id,
      },
      s = await state(tx, v),
      d = s.details;
    const subject = `Prospects Sports Academy — ${d.eventName}: ${kind === "cancellation" ? "cancelled" : kind === "enrollment" ? "enrollment update" : "schedule update"}`;
    const date = (value: string) =>
      new Date(value).toLocaleString("en-US", {
        timeZone: "America/Chicago",
        dateStyle: "full",
        timeStyle: "short",
      });
    const body = `${d.eventName}\nPlayer: ${d.name}\nStatus: ${d.publication === "archived" || d.status === "cancelled" ? "Cancelled" : d.enrollmentStatus === "cancelled" ? "Enrollment cancelled" : "Enrolled"}\nStart: ${date(d.start)}\nEnd: ${date(d.end)}\nTime zone: America/Chicago\nLocation: ${d.location}\n\nSign in to your existing Prospects account to review your schedule. This notice contains no billing changes.`;
    const inserted =
      await tx`insert into coordinator_program_notices(id,actor_id,recipient_id,event_id,session_key,athlete_id,team_id,sport,capability,email,subject,body,source_digest,dedupe_key) values(${randomUUID()},${actorId},${row.recipient_id},${eventId},${row.session_key},${row.athlete_id},${scope.team_id},${scope.sport},${capability},${s.guardian.email},${subject},${body},${s.sourceDigest},${[eventId, row.session_key, row.athlete_id, row.recipient_id, kind, s.sourceDigest].join(":")}) on conflict(dedupe_key) do nothing returning id`;
    queued += inserted.length;
  }
  await audit(
    tx,
    actorId,
    "events.notifications.queued",
    eventId,
    "allowed",
    { kind, count: queued },
    scope.sport as "baseball" | "softball",
    scope.team_id,
  );
  return { queued };
}
type Notice = {
  id: string;
  actor_id: string;
  recipient_id: string;
  event_id: string;
  session_key: string;
  athlete_id: string;
  team_id: string;
  sport: string;
  capability: Capability;
  email: string;
  subject: string;
  body: string;
  source_digest: string;
  attempts: number;
  first_attempt_at: string | null;
  request_body: { from: string; to: string[]; subject: string; text: string } | null;
};
async function valid(sql: Sql, n: Notice) {
  try {
    const s = await state(sql, {
      eventId: n.event_id,
      sessionKey: n.session_key,
      athleteId: n.athlete_id,
      teamId: n.team_id,
      sport: n.sport,
      capability: n.capability,
      actorId: n.actor_id,
      recipientId: n.recipient_id,
    });
    return s.sourceDigest === n.source_digest && s.guardian.email === n.email;
  } catch (e) {
    if (e instanceof CoordinatorDenied || e instanceof EventRelationshipChanged) return false;
    throw e;
  }
}
export async function deliverProgramEventNotices(
  sql: Sql,
  env: Record<string, string | undefined>,
  send: typeof fetch = fetch,
) {
  if (
    !env.RESEND_API_KEY ||
    !(env.RESEND_FROM_EMAIL || env.EMAIL_FROM) ||
    !tryoutEmailAllowed("policy-probe@example.invalid", {
      ...env,
      TRYOUT_EMAIL_TEST_RECIPIENTS: "policy-probe@example.invalid",
    })
  )
    return { accepted: 0, failed: 0, skipped: true };
  const candidates =
    await sql<Notice>`select * from coordinator_program_notices where (status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<now()) order by created_at limit 10`;
  let accepted = 0,
    failed = 0;
  for (const c of candidates) {
    if (!tryoutEmailAllowed(c.email, env)) continue;
    const token = randomUUID();
    const n = await sql.transaction(async (tx) => {
      const [n] =
        await tx<Notice>`select * from coordinator_program_notices where id=${c.id} and ((status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<now())) for update skip locked`;
      if (!n) return null;
      if (
        n.attempts >= 8 ||
        (n.first_attempt_at && Date.now() - Date.parse(n.first_attempt_at) > 23 * 3600000)
      ) {
        await tx`update coordinator_program_notices set status='review',lease_token=null,lease_until=null where id=${n.id}`;
        return null;
      }
      if (!(await valid(tx, n))) {
        await tx`update coordinator_program_notices set status='superseded',lease_token=null,lease_until=null where id=${n.id}`;
        return null;
      }
      const requestBody = n.request_body || {
        from: (env.RESEND_FROM_EMAIL || env.EMAIL_FROM)!,
        to: [n.email],
        subject: n.subject,
        text: n.body,
      };
      await tx`update coordinator_program_notices set request_body=${JSON.stringify(requestBody)}::jsonb,status='processing',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_token=${token},lease_until=now()+interval '2 minutes' where id=${n.id}`;
      return { ...n, request_body: requestBody };
    });
    if (!n) continue;
    if (!(await valid(sql, n))) {
      await sql`update coordinator_program_notices set status='superseded',lease_token=null,lease_until=null where id=${n.id} and lease_token=${token}`;
      continue;
    }
    const [leased] =
      await sql`select id from coordinator_program_notices where id=${n.id} and status='processing' and lease_token=${token} and lease_until>now()`;
    if (!leased) continue;
    try {
      const r = await send("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `program-${n.id}`,
        },
        body: JSON.stringify({
          from: n.request_body.from,
          to: n.request_body.to,
          subject: n.request_body.subject,
          text: n.request_body.text,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const result = (await r.json()) as { id?: unknown };
      if (!r.ok || typeof result.id !== "string" || !result.id)
        throw Error("No provider acceptance");
      await sql`update coordinator_program_notices set status='sent',provider_message_id=${result.id},accepted_at=now(),lease_token=null,lease_until=null where id=${n.id} and lease_token=${token} and status='processing'`;
      accepted++;
    } catch {
      await sql`update coordinator_program_notices set status='pending',next_attempt_at=now()+least(3600,power(2,attempts)*60)::int*interval '1 second',lease_token=null,lease_until=null where id=${n.id} and lease_token=${token} and status='processing'`;
      failed++;
    }
  }
  return { accepted, failed, skipped: false };
}
