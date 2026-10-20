import type { Sql } from "../db";
import { audit, requireOrganizationOperations, secured } from "./access.server";
import {
  financialSourceModeInTransaction,
  lockFinancialExecution,
} from "../finance/context.server";
import { chicagoInstant, validateWindow, validDate } from "../scheduling";
import {
  operationalEventSessions,
  operationalEventSessionKey,
  replaceOperationalOccupancy,
  publicOperationalSession,
} from "../commerce/operational-schedule.server";
import { enforceVisitWaivers } from "../commerce/waivers.server";
import { operationalEvent } from "./organization-events.server";
import {
  organizationBookingOperationInput,
  organizationEventSessionOperationInput,
  type OrganizationBookingOperation,
  type OrganizationEventSessionOperation,
  type OrganizationBookingSchedule,
} from "./organization-bookings-contracts";
type Booking = {
  id: string;
  order_id: string | null;
  household_id: string | null;
  product_id: string;
  coach_id: string | null;
  athlete_id: string | null;
  resources: string[];
  starts_at: Date;
  ends_at: Date;
  status: string;
  checked_in_at: Date | null;
  participant_count: number;
  participants_verified: boolean;
  operational_revision: number;
};
async function independent(tx: Sql) {
  if ((await financialSourceModeInTransaction(tx)) !== "basis")
    throw Error("Independent paid schedule changes require the reviewed financial cutover.");
}
async function booking(tx: Sql, id: string) {
  const [original] = await tx<{
    id: string;
    order_id: string | null;
    status: string;
  }>`select id,order_id,status from booking_records where id=${id} for update`;
  if (!original || !original.order_id) throw Error("Choose a customer booking from this schedule.");
  if (!["confirmed", "completed"].includes(original.status))
    throw Error("This booking is no longer available for operational changes.");
  const [row] =
    await tx<Booking>`select id,order_id,household_id,product_id,coach_id,athlete_id,resources,starts_at,ends_at,status,checked_in_at,participant_count,participants_verified,operational_revision from operational_booking_schedule where id=${id}`;
  return row;
}
async function writeOverlay(
  tx: Sql,
  b: Booking,
  change: {
    startsAt: Date;
    endsAt: Date;
    status: string;
    checkedInAt: Date | null;
    reason: string;
    userId: string;
    sourceKind?: string;
    sourceKey?: string;
  },
) {
  await tx`insert into operational_booking_changes(booking_id,revision,starts_at,ends_at,status,checked_in_at,reason,updated_by,source_kind,source_key) values(${b.id},${b.operational_revision + 1},${change.startsAt.toISOString()},${change.endsAt.toISOString()},${change.status},${change.checkedInAt?.toISOString() || null},${change.reason},${change.userId},${change.sourceKind || "operator"},${change.sourceKey || null}) on conflict(booking_id) do update set revision=excluded.revision,starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,checked_in_at=excluded.checked_in_at,reason=excluded.reason,updated_by=excluded.updated_by,source_kind=excluded.source_kind,source_key=excluded.source_key,updated_at=now()`;
}
export async function organizationBookings(
  sql: Sql,
  userId: string,
): Promise<OrganizationBookingSchedule> {
  return secured(
    sql,
    userId,
    "organization.bookings.read",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      const canAdjust = (await financialSourceModeInTransaction(tx)) === "basis";
      const rows = await tx<
        Booking & { title: string; player: string | null; event_id: string | null }
      >`select b.id,b.order_id,b.household_id,b.product_id,b.coach_id,b.athlete_id,b.resources,b.starts_at,b.ends_at,b.status,b.checked_in_at,b.participant_count,b.participants_verified,b.operational_revision,coalesce(s.name,case when e.id is not null then 'Event session' else b.product_id end) as title,a.name as player,e.id as event_id from operational_booking_schedule b left join club_services s on s.id=b.product_id left join club_athletes a on a.id=b.athlete_id left join training_events e on e.id=b.product_id where b.order_id is not null and b.starts_at>now()-interval '30 days' order by b.starts_at,b.id limit 300`;
      const ids = await tx<{
        id: string;
      }>`select id from operational_event_records order by updated_at desc limit 100`;
      const events = await Promise.all(
        ids.map(async ({ id }) => {
          const e = (await operationalEvent(tx, id))!,
            paid = !!(
              await tx`select id from commerce_orders where kind='event' and product_id=${id} limit 1`
            ).length;
          return {
            id: e.id,
            name: e.name,
            editable: canAdjust || !paid,
            sessions: (
              await operationalEventSessions(tx, e.id, e.originalSessions, e.location, {
                includeAdditional: true,
              })
            ).map(publicOperationalSession),
          };
        }),
      );
      return {
        canAdjust,
        bookings: rows.map((b) => ({
          id: b.id,
          revision: b.operational_revision,
          title: b.title,
          player: b.player || "Participant not listed",
          coach: b.coach_id || "Not assigned",
          startsAt: new Date(b.starts_at).toISOString(),
          endsAt: new Date(b.ends_at).toISOString(),
          status: b.status,
          checkedInAt: b.checked_in_at ? new Date(b.checked_in_at).toISOString() : null,
          eventId: b.event_id,
          editable: canAdjust && ["confirmed", "cancelled"].includes(b.status),
        })),
        events,
      };
    },
    lockFinancialExecution,
  );
}
export async function saveOrganizationBookingOperation(
  sql: Sql,
  userId: string,
  raw: OrganizationBookingOperation,
) {
  const input = organizationBookingOperationInput.parse(raw);
  return secured(
    sql,
    userId,
    "organization.bookings.change",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      await independent(tx);
      const b = await booking(tx, input.bookingId);
      if (
        b.operational_revision !== input.revision ||
        new Date(b.starts_at).toISOString() !== input.expectedStartsAt ||
        new Date(b.ends_at).toISOString() !== input.expectedEndsAt
      )
        throw Error("This schedule changed. Reload before saving.");
      const [event] = await tx`select id from training_events where id=${b.product_id}`;
      if (event && input.action !== "check-in")
        throw Error("Change a camp session for the whole group in the event schedule.");
      const [guided] = await tx`select id from guided_lesson_sessions where booking_id=${b.id}`;
      if (guided && input.action !== "check-in")
        throw Error(
          "This lesson has guided work. Resolve that session with its instructor before changing its schedule.",
        );
      let start = new Date(b.starts_at),
        end = new Date(b.ends_at),
        status = b.status,
        checked = b.checked_in_at ? new Date(b.checked_in_at) : null;
      if (input.action === "check-in") {
        if (status !== "confirmed") throw Error("Only a scheduled booking can be checked in.");
        await enforceVisitWaivers(tx, b);
        if (checked) return { ok: true, revision: b.operational_revision };
        checked = new Date();
      } else {
        if (checked || status === "completed" || start <= new Date())
          throw Error("Change a future booking that has not checked in.");
        if (input.action === "reschedule") {
          const { currentMoveAvailability } = await import("../commerce/reschedule-fee.server");
          if (
            !(await currentMoveAvailability(
              { ...b, order_id: b.order_id! },
              input.date!,
              input.time!,
              (+end - +start) / 60000,
              tx,
            ))
          )
            throw Error("The assigned instructor is not available for the new session.");
          const window = validateWindow(input.date!, input.time!, (+end - +start) / 60000);
          start = window.start;
          end = window.end;
          status = "confirmed";
        } else status = input.action === "cancel" ? "cancelled" : "confirmed";
        await replaceOperationalOccupancy(tx, b, start, end, status === "cancelled");
      }
      await writeOverlay(tx, b, {
        startsAt: start,
        endsAt: end,
        status,
        checkedInAt: checked,
        reason: input.reason,
        userId,
      });
      await audit(tx, userId, "organization.bookings." + input.action, b.id, "allowed", {
        revision: b.operational_revision + 1,
      });
      return { ok: true, revision: b.operational_revision + 1 };
    },
    lockFinancialExecution,
  );
}
export async function saveOrganizationEventSessionOperation(
  sql: Sql,
  userId: string,
  raw: OrganizationEventSessionOperation,
) {
  const input = organizationEventSessionOperationInput.parse(raw);
  return secured(
    sql,
    userId,
    "organization.event-session.change",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      await tx`select id from operational_event_records where id=${input.eventId} for update`;
      const event = await operationalEvent(tx, input.eventId);
      if (!event) throw Error("Choose an existing operational event.");
      const added = await tx<{
        date: string;
        start: string;
        end: string;
      }>`select original_date as date,original_start as start,original_end as end from operational_event_sessions where event_id=${event.id} and is_additional`;
      const original = [...event.originalSessions, ...added].find(
        (s) => operationalEventSessionKey(input.eventId, s) === input.sessionKey,
      );
      if (!original) throw Error("The original event session is unavailable.");
      const [financial] =
        await tx`select id from commerce_orders where kind='event' and product_id=${input.eventId} limit 1`;
      if (financial) await independent(tx);
      const sessions = await operationalEventSessions(
          tx,
          input.eventId,
          event.originalSessions,
          event.location,
          { includeAdditional: true },
        ),
        current = sessions.find((s) => s.sessionKey === input.sessionKey)!;
      if (current.revision !== input.revision)
        throw Error("This event schedule changed. Reload before saving.");
      let start = new Date(current.startsAt),
        end = new Date(current.endsAt),
        location = current.location;
      const status = input.action === "cancel" ? "cancelled" : "confirmed";
      if (start <= new Date()) throw Error("Only a future event session can be changed.");
      if (input.action === "reschedule") {
        if (!validDate(input.date!) || input.end! <= input.start!)
          throw Error("Use a valid event date and time window.");
        start = chicagoInstant(input.date!, input.start!);
        end = chicagoInstant(input.date!, input.end!);
        location = input.location!;
        if (start <= new Date()) throw Error("Use a future event session.");
      }
      if (
        status === "confirmed" &&
        sessions.some(
          (s) =>
            s.sessionKey !== input.sessionKey &&
            s.status === "confirmed" &&
            +new Date(s.startsAt) < +end &&
            +new Date(s.endsAt) > +start,
        )
      )
        throw Error("Sessions in the same event cannot overlap.");
      const rows =
        await tx<Booking>`select b.id,b.order_id,b.household_id,b.product_id,b.coach_id,b.athlete_id,coalesce(o.resources,b.resources) as resources,b.starts_at,b.ends_at,b.status,coalesce(o.checked_in_at,b.checked_in_at) as checked_in_at,b.participant_count,b.participants_verified,coalesce(o.revision,0) as operational_revision from booking_records b left join operational_booking_changes o on o.booking_id=b.id where b.product_id=any(${[input.eventId, "training-event:" + input.eventId]}::text[]) and ((b.starts_at=${chicagoInstant(original.date, original.start).toISOString()} and b.ends_at=${chicagoInstant(original.date, original.end).toISOString()}) or b.id=${"operational-event-staff:" + input.sessionKey} or exists(select 1 from operational_event_enrollments n where n.booking_id=b.id and n.event_id=${input.eventId} and n.session_key=${input.sessionKey})) and b.status='confirmed' order by b.id for update of b`;
      if (status === "confirmed") {
        const pending = await tx<{
          athlete_id: string;
        }>`select distinct o.athlete_id from commerce_orders o cross join lateral jsonb_array_elements(coalesce(o.snapshot->'eventRegistration'->'sessions','[]'::jsonb)) s where o.kind='event' and o.product_id=${input.eventId} and ((o.status in ('pending','pending_fee') and o.hold_until>now()) or exists(select 1 from square_payment_attempts a where a.order_id=o.id and a.status in ('pending','unknown'))) and s->>'date'=${original.date} and s->>'start'=${original.start} and s->>'end'=${original.end}`;
        const conflict =
          await tx`select booking_id from booking_occupancy where resource_id=any(${pending.map((p) => "athlete:" + p.athlete_id)}::text[]) and slot_at>=${start.toISOString()} and slot_at<${end.toISOString()} and not(booking_id=any(${rows.map((b) => b.id)}::text[])) limit 1`;
        if (conflict.length)
          throw Error(
            "A player with an existing checkout has a conflicting session. No schedule change was saved.",
          );
      }
      if (
        rows.some((b) => b.checked_in_at) ||
        (
          await tx`select booking_id from operational_booking_changes where booking_id=any(${rows.map((b) => b.id)}::text[]) and checked_in_at is not null`
        ).length
      )
        throw Error(
          "A participant has checked in. Resolve the active session with the instructor first.",
        );
      await tx`delete from booking_occupancy where booking_id=any(${rows.map((b) => b.id)}::text[])`;
      for (const b of rows) {
        const [withdrawn] =
          await tx`select id from operational_event_enrollments where booking_id=${b.id} and status='cancelled'`;
        const deliveryStatus = withdrawn ? "cancelled" : status;
        await replaceOperationalOccupancy(tx, b, start, end, deliveryStatus === "cancelled");
        await writeOverlay(tx, b, {
          startsAt: start,
          endsAt: end,
          status: deliveryStatus,
          checkedInAt: null,
          reason: input.reason,
          userId,
          sourceKind: "event-session",
          sourceKey: input.sessionKey,
        });
      }
      await tx`insert into operational_event_sessions(event_id,session_key,original_date,original_start,original_end,starts_at,ends_at,location,status,revision,reason,updated_by) values(${input.eventId},${input.sessionKey},${original.date},${original.start},${original.end},${start.toISOString()},${end.toISOString()},${location},${status},${current.revision + 1},${input.reason},${userId}) on conflict(event_id,session_key) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,location=excluded.location,status=excluded.status,revision=excluded.revision,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now()`;
      await audit(
        tx,
        userId,
        "organization.event-session." + input.action,
        input.eventId,
        "allowed",
        { sessionKey: input.sessionKey, revision: current.revision + 1 },
      );
      return { ok: true, revision: current.revision + 1 };
    },
    lockFinancialExecution,
  );
}
