import type { Sql } from "./db";
import { THANKSGIVING_CAMP, thanksgivingEventMatches } from "./thanksgiving-camp";
import { resolveIdentity } from "./identity.server";
import { eventCoaches, listTrainingEvents, saveTrainingEvent } from "./training-events.server";

export async function getThanksgivingEvents(sql: Sql) {
  const events = (await listTrainingEvents(sql)).filter(thanksgivingEventMatches);
  // Availability is conservative: every held or paid seat across both age groups
  // counts toward the shared 150-player limit. No registration records are returned.
  const ids = THANKSGIVING_CAMP.groups.map((g) => g.id);
  const used = await sql<{ date: string; count: number }>`
    select date,count(*)::int as count from (
      select distinct o.id,s->>'date' as date from commerce_orders o
      cross join lateral jsonb_array_elements(o.snapshot->'eventRegistration'->'sessions') s
      where o.product_id=any(${ids}::text[]) and (
        exists(select 1 from training_event_registrations r where r.order_id=o.id and r.status='confirmed')
        or (o.status='pending' and o.hold_until>now())
        or exists(select 1 from square_payment_attempts a where a.order_id=o.id and a.status in ('pending','unknown')))
      union all
      select n.id,(b.starts_at at time zone 'America/Chicago')::date::text from operational_event_enrollments n
      join operational_booking_schedule b on b.id=n.booking_id where n.event_id=any(${ids}::text[]) and n.status='active' and b.status='confirmed' and b.order_id is null
    ) seats group by date`;
  return events.map((e) => {
    const availability = e.availability.map((d) => ({
      ...d,
      remainingSeats: Math.min(
        d.remainingSeats,
        Math.max(0, THANKSGIVING_CAMP.capacity - (used.find((u) => u.date === d.date)?.count || 0)),
      ),
    }));
    return {
      ...e,
      availability,
      packageOpen: availability.every((d) => d.open && d.remainingSeats > 0),
      remainingSeats: Math.max(
        0,
        ...availability.filter((d) => d.open).map((d) => d.remainingSeats),
      ),
      registrationOpen:
        e.registrationOpen && availability.some((d) => d.open && d.remainingSeats > 0),
    };
  });
}

/** Explicit owner action only. Idempotent, never overwrites an existing event. */
export async function createThanksgivingDraftsFor(sql: Sql, userId: string) {
  if ((await resolveIdentity(sql, userId)).role !== "admin") throw Error("Admin access required.");
  const coaches = await eventCoaches(sql);
  const coachIds = THANKSGIVING_CAMP.coaches.map((name) => {
    const matches = coaches.filter((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (matches.length !== 1)
      throw Error(`Confirm one active coach directory entry for ${name} before creating the camp.`);
    return matches[0].id;
  });
  for (const group of THANKSGIVING_CAMP.groups) {
    const existing = await sql`select id from training_events where id=${group.id}`;
    if (existing.length) continue;
    await saveTrainingEvent(
      sql,
      userId,
      {
        id: group.id,
        revision: 0,
        name: `${THANKSGIVING_CAMP.title} — Ages ${group.label}`,
        type: "camp",
        sport: "Both",
        minAge: group.minAge,
        maxAge: group.maxAge,
        description:
          "Baseball and softball: hitting, fielding, pitching, baserunning and games with Steve McCutcheon, Nolan McCutcheon and Billy Ramey.",
        priceCents: THANKSGIVING_CAMP.packagePriceCents,
        pricingMode: "both",
        dayPriceCents: THANKSGIVING_CAMP.dayPriceCents,
        location: THANKSGIVING_CAMP.location,
        sessions: THANKSGIVING_CAMP.dates.map((date) => ({
          date,
          start: group.start,
          end: group.end,
        })),
        coachIds,
        capacity: THANKSGIVING_CAMP.capacity,
        status: "draft",
        policy:
          "Full refund with at least 24 hours’ cancellation notice before the start of the first day selected in this registration. After that, no refund.",
      },
      coaches,
    );
  }
  return { created: true };
}
