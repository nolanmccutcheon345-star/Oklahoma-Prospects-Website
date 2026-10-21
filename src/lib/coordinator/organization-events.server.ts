import { randomUUID, createHash } from "node:crypto";
import type { Sql } from "../db";
import { audit, requireOrganizationOperations, secured } from "./access.server";
import {
  lockFinancialExecution,
  financialSourceModeInTransaction,
} from "../finance/context.server";
import { chicagoInstant, validDate } from "../scheduling";
import {
  operationalEventSessions,
  operationalEventSessionKey,
  replaceOperationalOccupancy,
  publicOperationalSession,
} from "../commerce/operational-schedule.server";
import { enforceVisitWaivers } from "../commerce/waivers.server";
import { operationalCoachAvailability } from "../operational-person.server";
import type { Coach } from "../pd/types";
import {
  operationalEventCreateInput,
  operationalEventSettingsInput,
  operationalEventSessionCreateInput,
  operationalEventEnrollmentInput,
  type OperationalEventCreate,
  type OperationalEventSettings,
  type OperationalEventSessionCreate,
  type OperationalEventEnrollment,
  type OperationalEventWorkspace,
} from "./organization-events-contracts";
export type OperationalEvent = {
  id: string;
  revision: number;
  name: string;
  description: string;
  type: string;
  sport: string;
  location: string;
  capacity: number;
  coachIds: string[];
  publication: string;
  trainingEventId: string | null;
  originalSessions: { date: string; start: string; end: string }[];
};
/** SQL projection only. Unclassified legacy draft/history text never enters an operational DTO. */
export async function operationalEvent(sql: Sql, id: string): Promise<OperationalEvent | null> {
  const [e] = await sql<OperationalEvent>`select r.id,r.revision,
 coalesce(r.name,case when public.allowed then e.payload->>'name' else 'Unreviewed event' end) as name,
 coalesce(r.description,case when public.allowed then e.payload->>'description' else '' end) as description,
 coalesce(r.event_type,case when public.allowed then e.payload->>'type' else 'special-event' end) as type,
 coalesce(r.sport,case when public.allowed then e.payload->>'sport' else 'Both' end) as sport,
 coalesce(r.location,case when public.allowed then e.payload->>'location' else 'Location withheld' end) as location,
 coalesce(r.capacity,case when public.allowed then (e.payload->>'capacity')::integer else 1 end) as capacity,
 coalesce(r.coach_ids,case when public.allowed then e.payload->'coachIds' else '[]'::jsonb end,'[]'::jsonb) as "coachIds",
 coalesce(r.publication,case e.payload->>'status' when 'published' then 'open' when 'cancelled' then 'archived' else e.payload->>'status' end) as publication,
 r.training_event_id as "trainingEventId",coalesce((select jsonb_agg(jsonb_build_object('date',s->>'date','start',s->>'start','end',s->>'end'))
 from jsonb_array_elements(case when jsonb_typeof(e.payload->'sessions')='array' then e.payload->'sessions' else '[]'::jsonb end) s
 where jsonb_typeof(s->'date')='string' and s->>'date' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
 and s->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][05]$' and s->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][05]$'),'[]'::jsonb) as "originalSessions"
 from operational_event_records r left join training_events e on e.id=r.training_event_id
 cross join lateral(select e.payload->>'status' in ('published','closed') and
 (exists(select 1 from jsonb_array_elements(case when jsonb_typeof(e.payload->'sessions')='array' then e.payload->'sessions' else '[]'::jsonb end) future
 where future->>'date' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' and future->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][05]$'
 and (future->>'date')||' '||(future->>'end')>to_char(now() at time zone 'America/Chicago','YYYY-MM-DD HH24:MI')))) public(allowed)
 where r.id=${id}`;
  return e || null;
}
async function roster(tx: Sql) {
  const coaches =
    await tx<Coach>`select c->>'id' as id,c->>'name' as name,c->>'email' as email,coalesce(c->'active','true'::jsonb)<>'false'::jsonb as active from pd_working_file f cross join lateral jsonb_array_elements(coalesce(f.payload::jsonb->'coaches','[]'::jsonb)) c where f.id='club'`;
  return (
    await operationalCoachAvailability(
      tx,
      coaches.map((c) => ({ ...c, specialties: [] })),
      [],
    )
  ).coaches.filter((c) => c.active);
}
async function authorizedCoaches(tx: Sql, ids: string[], existing: string[] = []) {
  const allowed = await roster(tx);
  if (ids.some((id) => !allowed.some((c) => c.id === id) && !existing.includes(id)))
    throw Error("Choose an active instructor from the current roster.");
}
async function editable(tx: Sql, id: string) {
  const [row] = await tx`select id from operational_event_records where id=${id} for update`;
  if (!row) throw Error("Event not found.");
  return (await operationalEvent(tx, id))!;
}
async function independentIfCommitted(tx: Sql, e: OperationalEvent) {
  if (
    e.trainingEventId &&
    (
      await tx`select id from commerce_orders where kind='event' and product_id=${e.trainingEventId} limit 1`
    ).length &&
    (await financialSourceModeInTransaction(tx)) !== "basis"
  )
    throw Error("Independent paid event changes require the reviewed financial cutover.");
}
export const allSessions = (tx: Sql, e: OperationalEvent) =>
  operationalEventSessions(tx, e.id, e.originalSessions, e.location, { includeAdditional: true });
export async function organizationEvents(
  sql: Sql,
  userId: string,
): Promise<OperationalEventWorkspace> {
  return secured(
    sql,
    userId,
    "organization.events.read",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      const ids = await tx<{
        id: string;
      }>`select id from operational_event_records order by updated_at desc,id limit 200`;
      const events = await Promise.all(
        ids.map(async ({ id }) => {
          const e = (await operationalEvent(tx, id))!,
            sessions = await allSessions(tx, e);
          return {
            id: e.id,
            revision: e.revision,
            name: e.name,
            description: e.description,
            type: e.type,
            sport: e.sport,
            location: e.location,
            capacity: e.capacity,
            coachIds: e.coachIds,
            publication: e.publication,
            metadataEditable: !e.trainingEventId,
            sessions: await Promise.all(
              sessions.map(async (s) => {
                const original = e.originalSessions.find(
                    (o) => operationalEventSessionKey(e.id, o) === s.sessionKey,
                  ),
                  start = original
                    ? chicagoInstant(original.date, original.start).toISOString()
                    : null,
                  end = original ? chicagoInstant(original.date, original.end).toISOString() : null;
                const enrollments = await tx<{
                  athleteId: string;
                  name: string;
                  revision: number;
                  status: string;
                  checkedIn: boolean;
                }>`select a.id as "athleteId",a.name,coalesce(n.revision,0) as revision,case when b.status in ('confirmed','completed') then 'active' else 'cancelled' end as status,b.checked_in_at is not null as "checkedIn" from operational_booking_schedule b join club_athletes a on a.id=b.athlete_id left join operational_event_enrollments n on n.booking_id=b.id where (n.event_id=${e.id} and n.session_key=${s.sessionKey}) or (b.product_id=${e.id} and ${start}::timestamptz is not null and exists(select 1 from booking_records original where original.id=b.id and original.starts_at=${start} and original.ends_at=${end})) order by a.name,a.id`;
                return { ...publicOperationalSession(s), additional: !original, enrollments };
              }),
            ),
          };
        }),
      );
      return {
        events,
        coaches: (await roster(tx)).map((c) => ({ id: c.id, name: c.name })),
        athletes: await tx<{
          id: string;
          name: string;
        }>`select id,name from club_athletes order by name,id limit 3000`,
      };
    },
    lockFinancialExecution,
  );
}
export async function createOperationalEvent(
  sql: Sql,
  userId: string,
  raw: OperationalEventCreate,
) {
  const v = operationalEventCreateInput.parse(raw);
  return secured(
    sql,
    userId,
    "organization.events.create",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      return createOperationalEventInTransaction(tx, userId, v);
    },
    lockFinancialExecution,
  );
}
/** Internal domain executor; callers must authorize the current account and actual event scope. */
export async function createOperationalEventInTransaction(
  tx: Sql,
  userId: string,
  v: OperationalEventCreate,
) {
  await authorizedCoaches(tx, v.coachIds);
  const digest = createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const [prior] = await tx<{
    created_by: string;
    creation_digest: string;
  }>`select created_by,creation_digest from operational_event_records where id=${v.requestId}`;
  if (prior) {
    if (prior.created_by !== userId || prior.creation_digest !== digest)
      throw Error("Creation request changed or already belongs to another event.");
    return { ok: true, id: v.requestId };
  }
  await tx`insert into operational_event_records(id,created_by,creation_digest,revision,name,description,event_type,sport,location,capacity,coach_ids,publication,updated_by) values(${v.requestId},${userId},${digest},1,${v.name},${v.description},${v.type},${v.sport},${v.location},${v.capacity},${JSON.stringify(v.coachIds)}::jsonb,'draft',${userId})`;
  await audit(tx, userId, "organization.events.create", v.requestId, "allowed", {
    reason: v.reason,
  });
  return { ok: true, id: v.requestId };
}
async function staffBooking(
  tx: Sql,
  e: OperationalEvent,
  s: Awaited<ReturnType<typeof allSessions>>[number],
  userId: string,
  resources: string[],
) {
  const id = "operational-event-staff:" + s.sessionKey;
  const [existing] =
    await tx`select id from booking_records where id=${id} and order_id is null and athlete_id is null for update`;
  if (!existing)
    await tx`insert into booking_records(id,user_id,product_id,starts_at,ends_at,resources,status,participants_verified) values(${id},${userId},${"training-event:" + e.id},${s.startsAt},${s.endsAt},${JSON.stringify(resources)}::jsonb,'confirmed',true) on conflict(id) do nothing`;
  await replaceOperationalOccupancy(
    tx,
    { id, athlete_id: null, resources },
    new Date(s.startsAt),
    new Date(s.endsAt),
    s.status === "cancelled",
  );
  await tx`insert into operational_booking_changes(booking_id,revision,starts_at,ends_at,resources,status,reason,updated_by,source_kind,source_key) values(${id},1,${s.startsAt},${s.endsAt},${JSON.stringify(resources)}::jsonb,${s.status},'Event instructor schedule updated',${userId},'event-session',${s.sessionKey}) on conflict(booking_id) do update set resources=excluded.resources,revision=operational_booking_changes.revision+1,updated_by=excluded.updated_by,updated_at=now()`;
}
export async function saveOperationalEventSettings(
  sql: Sql,
  userId: string,
  raw: OperationalEventSettings,
) {
  const v = operationalEventSettingsInput.parse(raw);
  return secured(
    sql,
    userId,
    "organization.events.settings",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      return saveOperationalEventSettingsInTransaction(tx, userId, v);
    },
    lockFinancialExecution,
  );
}
/** Internal domain executor; callers must authorize the current account and actual event scope. */
export async function saveOperationalEventSettingsInTransaction(
  tx: Sql,
  userId: string,
  v: OperationalEventSettings,
) {
  const e = await editable(tx, v.eventId);
  if (e.revision !== v.revision) throw Error("Event changed. Reload before saving.");
  await independentIfCommitted(tx, e);
  await authorizedCoaches(tx, v.coachIds, e.coachIds);
  if (
    e.trainingEventId &&
    (v.name !== undefined || v.description !== undefined || v.location !== undefined)
  )
    throw Error(
      "Edit existing published event copy in the catalog; use session controls for delivery locations.",
    );
  const sessions = await allSessions(tx, e);
  if (
    v.publication === "open" &&
    !sessions.some((s) => s.status === "confirmed" && new Date(s.endsAt) > new Date())
  )
    throw Error("Add a future session before opening enrollment.");
  if (JSON.stringify(v.coachIds) !== JSON.stringify(e.coachIds))
    for (const s of sessions.filter((s) => new Date(s.startsAt) > new Date()))
      await staffBooking(
        tx,
        e,
        s,
        userId,
        v.coachIds.map((id) => "coach:" + id),
      );
  await tx`update operational_event_records set name=coalesce(${v.name || null},name),description=coalesce(${v.description || null},description),location=coalesce(${v.location || null},location),capacity=${v.capacity},coach_ids=${JSON.stringify(v.coachIds)}::jsonb,publication=${v.publication},revision=revision+1,updated_by=${userId},updated_at=now() where id=${e.id}`;
  await audit(tx, userId, "organization.events.settings", e.id, "allowed", {
    reason: v.reason,
  });
  return { ok: true, revision: e.revision + 1 };
}
export async function addOperationalEventSession(
  sql: Sql,
  userId: string,
  raw: OperationalEventSessionCreate,
) {
  const v = operationalEventSessionCreateInput.parse(raw);
  return secured(
    sql,
    userId,
    "organization.events.session.add",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      return addOperationalEventSessionInTransaction(tx, userId, v);
    },
    lockFinancialExecution,
  );
}
/** Internal domain executor; callers must authorize the current account and actual event scope. */
export async function addOperationalEventSessionInTransaction(
  tx: Sql,
  userId: string,
  v: OperationalEventSessionCreate,
) {
  const e = await editable(tx, v.eventId);
  if (e.revision !== v.revision) throw Error("Event changed. Reload before saving.");
  await independentIfCommitted(tx, e);
  if (!validDate(v.date) || v.end <= v.start) throw Error("Use a valid session date and time.");
  const start = chicagoInstant(v.date, v.start),
    end = chicagoInstant(v.date, v.end);
  if (start <= new Date()) throw Error("Add a future session.");
  const sessions = await allSessions(tx, e);
  if (
    sessions.some(
      (s) =>
        s.status === "confirmed" && +new Date(s.startsAt) < +end && +new Date(s.endsAt) > +start,
    )
  )
    throw Error("Event sessions cannot overlap.");
  const key = operationalEventSessionKey(e.id, v);
  if (sessions.some((s) => s.sessionKey === key))
    throw Error("This original session already exists. Reschedule or restore it instead.");
  await tx`insert into operational_event_sessions(event_id,session_key,is_additional,original_date,original_start,original_end,starts_at,ends_at,location,status,revision,reason,updated_by) values(${e.id},${key},true,${v.date},${v.start},${v.end},${start.toISOString()},${end.toISOString()},${v.location},'confirmed',1,${v.reason},${userId})`;
  const s = (await allSessions(tx, e)).find((s) => s.sessionKey === key)!;
  await staffBooking(
    tx,
    e,
    s,
    userId,
    e.coachIds.map((id) => "coach:" + id),
  );
  await tx`update operational_event_records set revision=revision+1,updated_by=${userId},updated_at=now() where id=${e.id}`;
  await audit(tx, userId, "organization.events.session.add", e.id, "allowed", {
    reason: v.reason,
  });
  return { ok: true, sessionKey: key };
}
export async function saveOperationalEventEnrollment(
  sql: Sql,
  userId: string,
  raw: OperationalEventEnrollment,
) {
  const v = operationalEventEnrollmentInput.parse(raw);
  return secured(
    sql,
    userId,
    "organization.events.enrollment",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      return saveOperationalEventEnrollmentInTransaction(tx, userId, v);
    },
    lockFinancialExecution,
  );
}
/** Internal domain executor; callers must authorize the current account and actual event scope. */
export async function saveOperationalEventEnrollmentInTransaction(
  tx: Sql,
  userId: string,
  v: OperationalEventEnrollment,
) {
  const e = await editable(tx, v.eventId);
  await independentIfCommitted(tx, e);
  const s = (await allSessions(tx, e)).find((s) => s.sessionKey === v.sessionKey);
  if (!s || s.revision !== v.sessionRevision) throw Error("Session changed. Reload before saving.");
  const [athlete] = await tx<{
    id: string;
    name: string;
    user_id: string;
    household_id: string;
  }>`select id,name,user_id,household_id from club_athletes where id=${v.athleteId}`;
  if (!athlete) throw Error("Choose a current player.");
  const [prior] = await tx<{
    id: string;
    booking_id: string;
    revision: number;
    status: string;
  }>`select id,booking_id,revision,status from operational_event_enrollments where event_id=${e.id} and session_key=${s.sessionKey} and athlete_id=${athlete.id} for update`;
  if ((prior?.revision || 0) !== v.revision)
    throw Error("Enrollment changed. Reload before saving.");
  const original = e.originalSessions.find(
      (o) => operationalEventSessionKey(e.id, o) === s.sessionKey,
    ),
    originalStart = original
      ? chicagoInstant(original.date, original.start).toISOString()
      : s.startsAt,
    originalEnd = original ? chicagoInstant(original.date, original.end).toISOString() : s.endsAt;
  const [paid] = original
    ? await tx<{
        id: string;
      }>`select id from booking_records where product_id=${e.id} and athlete_id=${athlete.id} and starts_at=${originalStart} and ends_at=${originalEnd} and status in ('confirmed','completed') order by id limit 1 for update`
    : [];
  let bookingId = prior?.booking_id || paid?.id;
  const [existing] = bookingId
    ? await tx<{
        id: string;
        status: string;
        checked_in_at: Date | null;
        participant_count: number;
        participants_verified: boolean;
        starts_at: Date;
        ends_at: Date;
        resources: string[];
        athlete_id: string;
      }>`select id,status,checked_in_at,participant_count,participants_verified,starts_at,ends_at,resources,athlete_id from operational_booking_schedule where id=${bookingId}`
    : [];
  if (v.action === "check-in") {
    if (!existing || existing.status !== "confirmed")
      throw Error("Enroll this player before check-in.");
    await enforceVisitWaivers(tx, existing);
    await tx`insert into operational_booking_changes(booking_id,revision,checked_in_at,reason,updated_by,source_kind,source_key) values(${bookingId!},1,now(),${v.reason},${userId},'event-session',${s.sessionKey}) on conflict(booking_id) do update set checked_in_at=coalesce(operational_booking_changes.checked_in_at,excluded.checked_in_at),revision=operational_booking_changes.revision+1,updated_by=excluded.updated_by,updated_at=now()`;
  } else {
    if (existing?.checked_in_at || new Date(s.startsAt) <= new Date())
      throw Error("Change enrollment before the session starts or checks in.");
    if (v.action === "enroll") {
      if (s.status !== "confirmed" || e.publication !== "open")
        throw Error("Open a scheduled session before enrolling players.");
      if (!existing || existing.status !== "confirmed") {
        const [count] = await tx<{
          count: number;
        }>`select count(distinct b.athlete_id)::integer as count from operational_booking_schedule b left join operational_event_enrollments n on n.booking_id=b.id where b.status in ('confirmed','completed') and b.athlete_id is not null and ((n.event_id=${e.id} and n.session_key=${s.sessionKey}) or (b.product_id=${e.id} and exists(select 1 from booking_records original where original.id=b.id and original.starts_at=${originalStart} and original.ends_at=${originalEnd})))`;
        const pending = original
          ? await tx<{
              athlete_id: string;
            }>`select distinct o.athlete_id from commerce_orders o cross join lateral jsonb_array_elements(coalesce(o.snapshot->'eventRegistration'->'sessions','[]'::jsonb)) ss where o.kind='event' and o.product_id=${e.id} and ((o.status in ('pending','pending_fee') and o.hold_until>now()) or exists(select 1 from square_payment_attempts a where a.order_id=o.id and a.status in ('pending','unknown'))) and ss->>'date'=${original.date} and ss->>'start'=${original.start} and ss->>'end'=${original.end}`
          : [];
        if (pending.some((p) => p.athlete_id === athlete.id))
          throw Error(
            "This player has an existing checkout. Resolve that checkout before manual enrollment.",
          );
        if (count.count + pending.length >= e.capacity)
          throw Error(
            "This session is at its operational capacity. Existing enrollments are retained.",
          );
      }
      if (!bookingId) {
        bookingId = "operational-event-enrollment:" + randomUUID();
        await tx`insert into booking_records(id,user_id,household_id,athlete_id,product_id,starts_at,ends_at,resources,status,participant_count,participants_verified) values(${bookingId},${athlete.user_id || userId},${athlete.household_id},${athlete.id},${e.id},${originalStart},${originalEnd},${JSON.stringify(["athlete:" + athlete.id])}::jsonb,'confirmed',1,true)`;
        await tx`insert into booking_participants(booking_id,athlete_id) values(${bookingId},${athlete.id})`;
      }
    } else if (!bookingId) throw Error("This player is not enrolled.");
    await replaceOperationalOccupancy(
      tx,
      {
        id: bookingId!,
        athlete_id: athlete.id,
        resources: existing?.resources || ["athlete:" + athlete.id],
      },
      new Date(s.startsAt),
      new Date(s.endsAt),
      v.action === "unenroll",
    );
    await tx`insert into operational_booking_changes(booking_id,revision,starts_at,ends_at,status,reason,updated_by,source_kind,source_key) values(${bookingId!},1,${s.startsAt},${s.endsAt},${v.action === "unenroll" ? "cancelled" : "confirmed"},${v.reason},${userId},'event-session',${s.sessionKey}) on conflict(booking_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,revision=operational_booking_changes.revision+1,updated_by=excluded.updated_by,updated_at=now()`;
  }
  await tx`insert into operational_event_enrollments(id,event_id,session_key,athlete_id,booking_id,status,revision,updated_by) values(${prior?.id || randomUUID()},${e.id},${s.sessionKey},${athlete.id},${bookingId!},${v.action === "unenroll" ? "cancelled" : "active"},1,${userId}) on conflict(event_id,session_key,athlete_id) do update set status=excluded.status,revision=operational_event_enrollments.revision+1,updated_by=excluded.updated_by,updated_at=now()`;
  await audit(tx, userId, "organization.events." + v.action, e.id, "allowed", {
    reason: v.reason,
  });
  return { ok: true };
}
/** Published unpriced listings never become Square offers or confer financial terms. */
export async function publicOperationalEvents(sql: Sql) {
  const ids = await sql<{
    id: string;
  }>`select id from operational_event_records where training_event_id is null and publication='open' order by updated_at desc`;
  return Promise.all(
    ids.map(async ({ id }) => {
      const e = (await operationalEvent(sql, id))!;
      return {
        id: e.id,
        name: e.name,
        description: e.description,
        type: e.type,
        sport: e.sport,
        location: e.location,
        sessions: (await allSessions(sql, e))
          .filter((s) => new Date(s.endsAt) > new Date())
          .map(publicOperationalSession),
      };
    }),
  );
}

export async function eventCoachChoices(tx: Sql) {
  return (await roster(tx)).map((c) => ({ id: c.id, name: c.name }));
}
