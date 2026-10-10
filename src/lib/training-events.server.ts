import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import { commerceIdentityFor } from "./commerce/access.server";
import { chicagoInstant } from "./scheduling";
import {
  trainingEventSchema,
  eventCheckoutSchema,
  type TrainingEvent,
  type EventCheckout,
} from "./training-events-contracts";
import type { Quote } from "./commerce/contracts";
import type { SquareOrder } from "./commerce/square-payments.server";
import {
  holdWindow,
  createPaidBooking,
  queueExpiredCheckoutRefunds,
} from "./commerce/store.server";

export type EventSnapshot = {
  id: string;
  revision: number;
  sessions: TrainingEvent["sessions"];
  location: string;
  policy: string;
};
async function owner(sql: Sql, userId: string) {
  if ((await resolveIdentity(sql, userId)).role !== "admin") throw Error("Admin access required.");
}
export async function eventCoaches(sql: Sql) {
  const { readWorkingFile } = await import("./pd/desk-impl.server");
  const { newCoachId } = await import("./coach-id.server");
  const file = await readWorkingFile(sql);
  const [club] = await sql<{
    payload: import("./teams/types").ClubRecord;
  }>`select payload from club_state where id='oklahoma-prospects'`;
  const disabled = await sql<{
    email: string;
  }>`select lower(trim(email)) as email from "user" where "disabledAt" is not null`;
  const blocked = new Set([
    ...disabled.map((u) => u.email),
    ...file.coaches.filter((c) => !c.active).map((c) => c.email.trim().toLowerCase()),
  ]);
  const people = new Map<string, { id: string; name: string }>();
  for (const c of file.coaches)
    if (c.active && !blocked.has(c.email.trim().toLowerCase()))
      people.set(c.email.trim().toLowerCase(), { id: c.id, name: c.name });
  for (const t of club?.payload.teams || [])
    for (const c of [
      { name: t.headCoach, email: t.coachEmail },
      ...t.staff.filter((s) => /coach/i.test(s.role)),
    ]) {
      const email = c.email?.trim().toLowerCase();
      if (email && !blocked.has(email) && !people.has(email))
        people.set(email, { id: newCoachId(email), name: c.name });
    }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const windows = (e: Pick<TrainingEvent, "sessions">) =>
  e.sessions
    .map((s) => ({ start: chicagoInstant(s.date, s.start), end: chicagoInstant(s.date, s.end) }))
    .sort((a, b) => +a.start - +b.start);
export async function listTrainingEvents(sql: Sql) {
  const events = await sql<{
    payload: TrainingEvent;
    revision: number;
  }>`select payload,revision from training_events where payload->>'status' in ('published','closed') order by updated_at desc`;
  const coaches = await eventCoaches(sql);
  const counts = await sql<{
    event_id: string;
    count: number;
  }>`select event_id,count(*)::int as count from training_event_registrations where status='confirmed' group by event_id`;
  return events
    .map((r) => ({
      ...r.payload,
      revision: r.revision,
      remainingSeats: Math.max(
        0,
        r.payload.capacity - (counts.find((c) => c.event_id === r.payload.id)?.count || 0),
      ),
      registrationOpen:
        r.payload.status === "published" && windows(r.payload)[0].start > new Date(),
      coaches: coaches.filter((c) => r.payload.coachIds.includes(c.id)),
    }))
    .filter((e) => windows(e).some((w) => w.end > new Date()))
    .sort((a, b) => +windows(a)[0].start - +windows(b)[0].start);
}
export async function eventOffice(sql: Sql, userId: string) {
  await owner(sql, userId);
  const [events, registrations, coaches] = await Promise.all([
    sql<{
      payload: TrainingEvent;
      revision: number;
    }>`select payload,revision from training_events order by updated_at desc`,
    sql<{
      id: string;
      event_id: string;
      player: string;
      email: string;
      status: string;
      total_cents: number;
      order_id: string;
    }>`select r.id,r.event_id,a.name as player,o.email,r.status,o.total_cents,r.order_id from training_event_registrations r join club_athletes a on a.id=r.athlete_id join commerce_orders o on o.id=r.order_id order by r.created_at desc`,
    eventCoaches(sql),
  ]);
  return {
    events: events.map((r) => ({ ...r.payload, revision: r.revision })),
    registrations,
    coaches,
  };
}
export async function saveTrainingEvent(
  sql: Sql,
  userId: string,
  raw: TrainingEvent,
  availableCoaches?: { id: string; name: string }[],
) {
  await owner(sql, userId);
  const e = trainingEventSchema.parse(raw);
  const coaches = availableCoaches || (await eventCoaches(sql));
  if (e.coachIds.some((id) => !coaches.some((c) => c.id === id)))
    throw Error("Choose active coaches from the directory.");
  if (e.status === "published" && windows(e)[0].start <= new Date())
    throw Error("Published registration must start in the future.");
  return sql.transaction(async (tx) => {
    const [prior] = await tx<{
      payload: TrainingEvent;
      revision: number;
    }>`select payload,revision from training_events where id=${e.id} for update`;
    if ((prior?.revision || 0) !== e.revision)
      throw Error("Another admin changed this event. Reload before saving.");
    const regs =
      await tx`select id from training_event_registrations where event_id=${e.id} and status='confirmed'`;
    if (regs.length) {
      if (e.status === "draft" || e.status === "cancelled")
        throw Error(
          "Close registration and resolve registered players and refunds through Payments before cancelling this event.",
        );
      if (
        JSON.stringify(e.sessions) !== JSON.stringify(prior!.payload.sessions) ||
        e.location !== prior!.payload.location ||
        e.policy !== prior!.payload.policy
      )
        throw Error(
          "This event has registered players. Dates, location and accepted policy are locked; create a replacement event and arrange changes with families.",
        );
    }
    if (e.capacity < regs.length)
      throw Error("Capacity cannot be lower than confirmed registrations.");
    const old = await tx<{
      id: string;
    }>`select id from booking_records where product_id=${"training-event:" + e.id} and order_id is null for update`;
    await tx`delete from booking_occupancy where booking_id=any(${old.map((r) => r.id)}::text[])`;
    await tx`update booking_records set status='cancelled' where id=any(${old.map((r) => r.id)}::text[])`;
    if (e.status === "published" || e.status === "closed")
      for (const w of windows(e).filter((w) => w.end > new Date())) {
        const conflicts =
          await tx`select booking_id from booking_occupancy where resource_id=any(${e.coachIds.map((id) => "coach:" + id)}::text[]) and slot_at>=${w.start.toISOString()} and slot_at<${w.end.toISOString()} limit 1`;
        if (conflicts.length)
          throw Error("An assigned coach already has a booking or event at this time.");
        const id = await holdWindow(tx, {
          orderId: null,
          userId,
          athleteId: null,
          productId: "training-event:" + e.id,
          start: w.start,
          end: w.end,
          resources: e.coachIds.map((id) => "coach:" + id),
        });
        await tx`update booking_records set status='confirmed' where id=${id}`;
      }
    const payload = { ...e, revision: e.revision + 1 };
    if (prior)
      await tx`update training_events set payload=${JSON.stringify(payload)}::jsonb,revision=revision+1,updated_by=${userId},updated_at=now() where id=${e.id}`;
    else
      await tx`insert into training_events(id,payload,updated_by) values(${e.id},${JSON.stringify(payload)}::jsonb,${userId})`;
    await tx`insert into audit_events(actor_id,action,target_table,target_id,after_state) values(${userId},'save-training-event','training_events',${e.id},${JSON.stringify(payload)}::jsonb)`;
    return payload;
  });
}
export async function eventFamily(sql: Sql, userId: string) {
  const me = await commerceIdentityFor(sql, userId);
  const [players, registrations] = await Promise.all([
    sql<{
      id: string;
      name: string;
    }>`select id,name from club_athletes where household_id=any(${me.billingHouseholdIds}::text[]) order by name`,
    sql<{
      id: string;
      name: string;
      title: string;
      status: string;
      order_id: string;
      snapshot: Quote & { eventRegistration: EventSnapshot };
    }>`select r.id,a.name,o.snapshot->>'title' as title,r.status,r.order_id,o.snapshot from training_event_registrations r join club_athletes a on a.id=r.athlete_id join commerce_orders o on o.id=r.order_id where o.household_id=any(${me.billingHouseholdIds}::text[]) order by r.created_at desc`,
  ]);
  return {
    players,
    registrations: registrations.map((r) => ({
      id: r.id,
      player: r.name,
      title: r.title,
      status: r.status,
      orderId: r.order_id,
      event: r.snapshot.eventRegistration,
    })),
  };
}
async function authorizedPlayer(sql: Sql, userId: string, athleteId: string) {
  const me = await commerceIdentityFor(sql, userId);
  const [player] =
    await sql`select id from club_athletes where id=${athleteId} and household_id=any(${me.billingHouseholdIds}::text[])`;
  if (!player) throw Error("Choose a player linked to your household.");
  return me;
}
async function eventAvailable(
  sql: Sql,
  id: string,
  athleteId: string,
  orderId = "",
  checkPending = true,
) {
  const [row] = await sql<{
    payload: TrainingEvent;
    revision: number;
  }>`select payload,revision from training_events where id=${id} for update`;
  if (!row || row.payload.status !== "published" || windows(row.payload)[0].start <= new Date())
    throw Error("Registration is closed for this event.");
  const active = await sql<{
    athlete_id: string;
  }>`select athlete_id from training_event_registrations where event_id=${id} and status='confirmed'`;
  if (active.some((r) => r.athlete_id === athleteId))
    throw Error("This player is already registered.");
  const pending = checkPending
    ? await sql<{
        athlete_id: string;
      }>`select athlete_id from commerce_orders where kind='event' and product_id=${id} and id<>${orderId} and status='pending' and hold_until>now()`
    : [];
  if (pending.some((r) => r.athlete_id === athleteId))
    throw Error(
      "Checkout already exists for this player. Complete it or wait ten minutes before trying again.",
    );
  if (active.length + pending.length >= row.payload.capacity) throw Error("This event is full.");
  for (const w of windows(row.payload)) {
    const occupied =
      await sql`select booking_id from booking_occupancy where resource_id=${"athlete:" + athleteId} and slot_at>=${w.start.toISOString()} and slot_at<${w.end.toISOString()} limit 1`;
    if (occupied.length) throw Error("This player has another booking during the event.");
  }
  return { ...row.payload, revision: row.revision };
}
export async function prepareEventCheckout(
  sql: Sql,
  userId: string,
  raw: EventCheckout,
  environment: string,
) {
  const input = eventCheckoutSchema.parse(raw),
    me = await authorizedPlayer(sql, userId, input.athleteId);
  return sql.transaction(async (tx) => {
    const [prior] = await tx<
      SquareOrder & { request_key: string }
    >`select * from commerce_orders where request_key=${input.requestId} for update`;
    if (prior) {
      if (
        prior.user_id !== userId ||
        prior.product_id !== input.eventId ||
        prior.athlete_id !== input.athleteId
      )
        throw Error("Checkout request changed.");
      if (prior.status !== "pending" || +new Date(prior.hold_until) <= Date.now())
        throw Error("Checkout ended. Check your registration history.");
      return {
        orderId: prior.id,
        totalCents: prior.total_cents,
        holdUntil: new Date(prior.hold_until).toISOString(),
      };
    }
    const e = await eventAvailable(tx, input.eventId, input.athleteId);
    if (e.revision !== input.revision)
      throw Error("Event details or price changed. Refresh and review before paying.");
    const id = randomUUID(),
      end = new Date(Date.now() + 600000);
    const quote: Quote & { eventRegistration: EventSnapshot; consentAt: string } = {
      productId: e.id,
      kind: "event",
      title: e.name,
      totalCents: e.priceCents,
      regularCents: e.priceCents,
      setupCents: 0,
      recurring: false,
      assessment: false,
      duration: 0,
      sessionMinutes: 0,
      credits: 0,
      remote: 0,
      expiresDays: 365,
      discipline: e.sport,
      resources: [],
      lines: [{ label: e.name, cents: e.priceCents }],
      teamRate: false,
      needsSlot: false,
      consentAt: new Date().toISOString(),
      eventRegistration: {
        id: e.id,
        revision: e.revision,
        sessions: e.sessions,
        location: e.location,
        policy: e.policy,
      },
    };
    await tx`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment) values(${id},${input.requestId},${userId},${me.email},${input.athleteId},${e.id},'event',${JSON.stringify(quote)}::jsonb,${e.priceCents},${end.toISOString()},'square',${environment})`;
    return { orderId: id, totalCents: e.priceCents, holdUntil: end.toISOString() };
  });
}
export async function validateEventPayment(
  sql: Sql,
  order: SquareOrder,
  identity: { billingHouseholdIds: string[] },
) {
  if (!order.athlete_id || !order.snapshot.eventRegistration)
    throw Error("Event registration details missing.");
  const [player] =
    await sql`select id from club_athletes where id=${order.athlete_id} and household_id=any(${identity.billingHouseholdIds}::text[])`;
  if (!player) throw Error("Choose a player linked to your household.");
  const e = await eventAvailable(
    sql,
    order.snapshot.eventRegistration.id,
    order.athlete_id,
    order.id,
  );
  if (
    e.revision !== order.snapshot.eventRegistration.revision ||
    e.priceCents !== order.total_cents
  )
    throw Error(
      "Event details changed. No payment submitted. Refresh the event and start a new checkout after this session expires.",
    );
}
export async function fulfillEventPayment(sql: Sql, order: SquareOrder, environment: string) {
  let ok = order.status === "pending" && +new Date(order.hold_until) > Date.now();
  if (ok) {
    try {
      const e = await eventAvailable(sql, order.product_id!, order.athlete_id!, order.id, false);
      ok = e.revision === order.snapshot.eventRegistration?.revision;
    } catch {
      ok = false;
    }
  }
  if (ok) {
    await sql`update commerce_orders set status='paid',updated_at=now() where id=${order.id}`;
    for (const w of windows(order.snapshot.eventRegistration!)) {
      const id = await createPaidBooking(sql, {
        orderId: order.id,
        userId: order.user_id,
        athleteId: order.athlete_id,
        productId: order.product_id!,
        start: w.start,
        end: w.end,
        resources: ["athlete:" + order.athlete_id],
      });
      if (!id) {
        ok = false;
        break;
      }
    }
  }
  if (!ok) {
    await sql`delete from booking_occupancy where booking_id in(select id from booking_records where order_id=${order.id})`;
    await sql`update booking_records set status='cancelled' where order_id=${order.id}`;
    await sql`update commerce_orders set status='payment_review',updated_at=now() where id=${order.id}`;
    await queueExpiredCheckoutRefunds(sql, environment, order.id);
    await sql`insert into payment_notifications(id,order_id,kind) values(${"owner-review:" + order.id},${order.id},'owner-payment-review') on conflict do nothing`;
    return;
  }
  await sql`insert into training_event_registrations(id,event_id,athlete_id,user_id,order_id,status) values(${randomUUID()},${order.product_id!},${order.athlete_id!},${order.user_id},${order.id},'confirmed')`;
  await sql`insert into payment_notifications(id,order_id,kind) values(${"receipt:" + order.id},${order.id},'receipt') on conflict do nothing`;
}
