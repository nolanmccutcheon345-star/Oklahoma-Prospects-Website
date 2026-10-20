import { createHash } from "node:crypto";
import type { Sql } from "../db";
import { chicagoInstant } from "../scheduling";
type Session = { date: string; start: string; end: string };
export function operationalEventSessionKey(eventId: string, session: Session) {
  return createHash("sha256")
    .update(JSON.stringify([eventId, session.date, session.start, session.end]))
    .digest("hex");
}
export type OperationalEventSession = Session & {
  sessionKey: string;
  revision: number;
  originalDate: string;
  location: string;
  status: "confirmed" | "cancelled";
  startsAt: string;
  endsAt: string;
  updatedBy: string | null;
  reason: string;
};
export function localSession(start: string | Date, end: string | Date): Session {
  const parts = (value: string | Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value));
  const p = parts(start),
    q = parts(end),
    get = (list: Intl.DateTimeFormatPart[], type: string) =>
      list.find((x) => x.type === type)!.value;
  return {
    date: `${get(p, "year")}-${get(p, "month")}-${get(p, "day")}`,
    start: `${get(p, "hour")}:${get(p, "minute")}`,
    end: `${get(q, "hour")}:${get(q, "minute")}`,
  };
}
/** Original purchased tuples resolve old orders; added sessions are opt-in and never silently extend a purchase. */
export async function operationalEventSessions(
  sql: Sql,
  eventId: string,
  sessions: Session[],
  location: string,
  options: { includeAdditional?: boolean } = {},
): Promise<OperationalEventSession[]> {
  const rows = await sql<{
    session_key: string;
    starts_at: Date;
    ends_at: Date;
    location: string;
    status: "confirmed" | "cancelled";
    revision: number;
    updated_by: string;
    reason: string;
    is_additional: boolean;
    original_date: string;
    original_start: string;
    original_end: string;
  }>`select session_key,starts_at,ends_at,location,status,revision,updated_by,reason,is_additional,original_date,original_start,original_end from operational_event_sessions where event_id=${eventId}`;
  const choices = [
    ...sessions,
    ...(options.includeAdditional
      ? rows
          .filter((r) => r.is_additional)
          .map((r) => ({ date: r.original_date, start: r.original_start, end: r.original_end }))
      : []),
  ];
  return choices.map((s) => {
    const key = operationalEventSessionKey(eventId, s),
      saved = rows.find((r) => r.session_key === key),
      startsAt = (
        saved ? new Date(saved.starts_at) : chicagoInstant(s.date, s.start)
      ).toISOString(),
      endsAt = (saved ? new Date(saved.ends_at) : chicagoInstant(s.date, s.end)).toISOString();
    return {
      ...localSession(startsAt, endsAt),
      sessionKey: key,
      originalDate: s.date,
      revision: saved?.revision || 0,
      startsAt,
      endsAt,
      location: saved?.location || location,
      status: saved?.status || "confirmed",
      updatedBy: saved?.updated_by || null,
      reason: saved?.reason || "Original purchased schedule",
    };
  });
}
export async function replaceOperationalOccupancy(
  tx: Sql,
  booking: { id: string; resources: string[]; athlete_id: string | null },
  start: Date,
  end: Date,
  cancelled: boolean,
) {
  await tx`delete from booking_occupancy where booking_id=${booking.id}`;
  if (cancelled) return;
  const participants = await tx<{
    athlete_id: string;
  }>`select athlete_id from booking_participants where booking_id=${booking.id}`;
  const resources = [
    ...new Set([
      ...booking.resources,
      ...participants.map((p) => "athlete:" + p.athlete_id),
      ...(booking.athlete_id ? ["athlete:" + booking.athlete_id] : []),
    ]),
  ].sort();
  for (const resource of resources)
    for (let at = +start; at < +end; at += 300000) {
      const inserted =
        await tx`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${resource},${new Date(at).toISOString()},${booking.id}) on conflict do nothing returning booking_id`;
      if (!inserted.length)
        throw Error(
          "That time conflicts with another athlete, coach or space. No schedule change was saved.",
        );
    }
}
export function publicOperationalSession(s: OperationalEventSession) {
  return {
    sessionKey: s.sessionKey,
    revision: s.revision,
    originalDate: s.originalDate,
    date: s.date,
    start: s.start,
    end: s.end,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    location: s.location,
    status: s.status,
  };
}
export async function operationalEventSeatUsage(sql: Sql, eventId: string) {
  const withdrawn = await sql<{
    orderId: string;
    date: string;
  }>`select b.order_id as "orderId",to_char(b.starts_at at time zone 'America/Chicago','YYYY-MM-DD') as date from booking_records b join operational_booking_changes o on o.booking_id=b.id where b.product_id=${eventId} and b.order_id is not null and o.status='cancelled'`;
  const manual = await sql<{
    sessionKey: string;
    count: number;
  }>`select n.session_key as "sessionKey",count(*)::integer as count from operational_event_enrollments n join operational_booking_schedule b on b.id=n.booking_id where n.event_id=${eventId} and b.order_id is null and n.status='active' and b.status in ('confirmed','completed') group by n.session_key`;
  return { withdrawn, manual };
}
