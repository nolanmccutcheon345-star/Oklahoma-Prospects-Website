import { randomUUID } from "node:crypto";
import { operationalEvent } from "./coordinator/organization-events.server";
import {
  operationalEventSessions,
  operationalEventSessionKey,
  operationalEventSeatUsage,
  publicOperationalSession,
  localSession,
} from "./commerce/operational-schedule.server";
import type { Sql } from "./db";
import { lockFinancialExecution } from "./finance/execution.server";
import { resolveIdentity } from "./identity.server";
import { commerceIdentityFor } from "./commerce/access.server";
import { chicagoInstant } from "./scheduling";
import {
  trainingEventSchema,
  campPurchase,
  campAgeError,
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
  sessionKeys?: string[];
  minAge?: number;
  maxAge?: number;
  ageAsOf?: string;
  option?: "package" | "days";
  dates?: string[];
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
  const people = new Map<string, { id: string; name: string; email: string }>();
  for (const c of file.coaches)
    if (c.active && !blocked.has(c.email.trim().toLowerCase()))
      people.set(c.email.trim().toLowerCase(), {
        id: c.id,
        name: c.name,
        email: c.email.trim().toLowerCase(),
      });
  for (const t of club?.payload.teams || [])
    for (const c of [
      { name: t.headCoach, email: t.coachEmail },
      ...t.staff.filter((s) => /coach/i.test(s.role)),
    ]) {
      const email = c.email?.trim().toLowerCase();
      if (email && !blocked.has(email) && !people.has(email))
        people.set(email, { id: newCoachId(email), name: c.name, email });
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
  }>`select e.payload,e.revision from training_events e where e.payload->>'status' in ('published','closed') and not exists(select 1 from operational_event_records r where r.id=e.id and r.publication='archived') order by e.updated_at desc`;
  const coaches = await eventCoaches(sql);
  const registrations = await sql<{
    event_id: string;
    snapshot: Quote & { eventRegistration: EventSnapshot };
  }>`select r.event_id,o.snapshot from training_event_registrations r join commerce_orders o on o.id=r.order_id where r.status='confirmed'`;
  const projected = await Promise.all(
    events.map(async (r) => {
      const e = await operationalEvent(sql, r.payload.id);
      const sessions = await operationalEventSessions(
        sql,
        r.payload.id,
        r.payload.sessions,
        r.payload.location,
      );
      const all = await operationalEventSessions(
        sql,
        r.payload.id,
        r.payload.sessions,
        r.payload.location,
        { includeAdditional: true },
      );
      const usage = await operationalEventSeatUsage(sql, r.payload.id);
      const capacity = e?.capacity ?? r.payload.capacity;
      const availability = [...new Set(r.payload.sessions.map((s) => s.date))]
        .sort()
        .map((date) => {
          const selected = sessions.filter((s) => s.originalDate === date);
          return {
            date,
            remainingSeats: Math.max(
              0,
              capacity -
                registrations.filter(
                  (x) =>
                    x.event_id === r.payload.id &&
                    x.snapshot.eventRegistration.sessions.some((s) => s.date === date),
                ).length +
                usage.withdrawn.filter((x) => x.date === date).length -
                Math.max(
                  0,
                  ...selected.map(
                    (s) => usage.manual.find((x) => x.sessionKey === s.sessionKey)?.count || 0,
                  ),
                ),
            ),
            open:
              windows({ sessions: r.payload.sessions.filter((s) => s.date === date) })[0].start >
                new Date() &&
              selected.every((s) => s.status === "confirmed" && new Date(s.startsAt) > new Date()),
          };
        });
      const packageOpen = availability.every((d) => d.open && d.remainingSeats > 0),
        mode = r.payload.pricingMode || "package";
      return {
        ...r.payload,
        capacity,
        revision: r.revision,
        availability,
        packageOpen,
        operationalSessions: sessions.map(publicOperationalSession),
        additionalSessions: all
          .filter((s) => !sessions.some((o) => o.sessionKey === s.sessionKey))
          .map(publicOperationalSession),
        remainingSeats:
          mode === "package"
            ? Math.min(...availability.map((d) => d.remainingSeats))
            : Math.max(0, ...availability.filter((d) => d.open).map((d) => d.remainingSeats)),
        registrationOpen:
          r.payload.status === "published" &&
          (!e || e.publication === "open") &&
          (mode === "package"
            ? packageOpen
            : availability.some((d) => d.open && d.remainingSeats > 0)),
        coaches: coaches
          .filter((c) => (e?.coachIds || r.payload.coachIds).includes(c.id))
          .map(({ id, name }) => ({ id, name })),
      };
    }),
  );
  // Only originally public upcoming copy is eligible. Operational dates cannot publish historical/private copy.
  return projected
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
      sessions: TrainingEvent["sessions"];
    }>`select r.id,r.event_id,a.name as player,o.email,r.status,o.total_cents,r.order_id,o.snapshot->'eventRegistration'->'sessions' as sessions from training_event_registrations r join club_athletes a on a.id=r.athlete_id join commerce_orders o on o.id=r.order_id order by r.created_at desc`,
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
  if (
    e.status === "published" &&
    ((e.pricingMode || "package") === "package"
      ? windows(e)[0].start <= new Date()
      : windows(e).every((w) => w.start <= new Date()))
  )
    throw Error("Published registration must start in the future.");
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const [prior] = await tx<{
      payload: TrainingEvent;
      revision: number;
    }>`select payload,revision from training_events where id=${e.id} for update`;
    if ((prior?.revision || 0) !== e.revision)
      throw Error("Another admin changed this event. Reload before saving.");
    const regs = await tx<{
      sessions: TrainingEvent["sessions"];
    }>`select o.snapshot->'eventRegistration'->'sessions' as sessions from training_event_registrations r join commerce_orders o on o.id=r.order_id where r.event_id=${e.id} and r.status='confirmed'`;
    if (regs.length) {
      if (e.status === "draft" || e.status === "cancelled")
        throw Error(
          "Close registration and resolve registered players and refunds through Payments before cancelling this event.",
        );
      if (
        JSON.stringify(e.sessions.map(({ date, start, end }) => [date, start, end]).sort()) !==
          JSON.stringify(
            prior!.payload.sessions.map(({ date, start, end }) => [date, start, end]).sort(),
          ) ||
        e.location !== prior!.payload.location ||
        e.policy !== prior!.payload.policy
      )
        throw Error(
          "This event has registered players. Dates, location and accepted policy are locked; create a replacement event and arrange changes with families.",
        );
    }
    if (
      e.sessions.some(
        (s) =>
          e.capacity < regs.filter((r) => r.sessions.some((day) => day.date === s.date)).length,
      )
    )
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
      birthDate: string | null;
    }>`select id,name,birth_date::text as "birthDate" from club_athletes where household_id=any(${me.billingHouseholdIds}::text[]) order by name`,
    sql<{
      id: string;
      name: string;
      title: string;
      status: string;
      order_id: string;
      snapshot: Quote & { eventRegistration: EventSnapshot };
    }>`select r.id,a.name,o.snapshot->>'title' as title,r.status,r.order_id,o.snapshot from training_event_registrations r join club_athletes a on a.id=r.athlete_id join commerce_orders o on o.id=r.order_id where o.household_id=any(${me.billingHouseholdIds}::text[]) order by r.created_at desc`,
  ]);
  const manual = await sql<{
    event_id: string;
    name: string;
    starts_at: Date;
    ends_at: Date;
    status: string;
    session_key: string;
    checked_in_at: Date | null;
  }>`select n.event_id,a.name,b.starts_at,b.ends_at,b.status,n.session_key,b.checked_in_at from operational_event_enrollments n join operational_booking_schedule b on b.id=n.booking_id join club_athletes a on a.id=n.athlete_id where a.household_id=any(${me.billingHouseholdIds}::text[]) and b.order_id is null order by b.starts_at`;
  return {
    players,
    registrations: await Promise.all(
      registrations.map(async (r) => {
        const snapshot = r.snapshot.eventRegistration;
        const delivery = await operationalEventSessions(
          sql,
          snapshot.id,
          snapshot.sessions,
          snapshot.location,
        );
        const bookings = await sql<{
          original_start: Date;
          original_end: Date;
          starts_at: Date;
          ends_at: Date;
          status: string;
        }>`select original.starts_at as original_start,original.ends_at as original_end,b.starts_at,b.ends_at,b.status from operational_booking_schedule b join booking_records original on original.id=b.id where b.order_id=${r.order_id}`;
        return {
          id: r.id,
          player: r.name,
          title: r.title,
          status: r.status,
          orderId: r.order_id,
          event: snapshot,
          operationalSessions: delivery.map((s) => {
            const tuple = snapshot.sessions.find(
              (t) => operationalEventSessionKey(snapshot.id, t) === s.sessionKey,
            )!;
            const b = bookings.find(
              (b) =>
                +new Date(b.original_start) === +chicagoInstant(tuple.date, tuple.start) &&
                +new Date(b.original_end) === +chicagoInstant(tuple.date, tuple.end),
            );
            return publicOperationalSession(
              b
                ? {
                    ...s,
                    ...localSession(b.starts_at, b.ends_at),
                    startsAt: new Date(b.starts_at).toISOString(),
                    endsAt: new Date(b.ends_at).toISOString(),
                    status: b.status === "cancelled" ? "cancelled" : s.status,
                  }
                : s,
            );
          }),
        };
      }),
    ),
    operationalEnrollments: await Promise.all(
      manual.map(async (r) => {
        const e = await operationalEvent(sql, r.event_id);
        const session =
          e &&
          (
            await operationalEventSessions(sql, e.id, e.originalSessions, e.location, {
              includeAdditional: true,
            })
          ).find((s) => s.sessionKey === r.session_key);
        return {
          eventId: r.event_id,
          title: e?.name || "Event session",
          player: r.name,
          startsAt: new Date(r.starts_at).toISOString(),
          endsAt: new Date(r.ends_at).toISOString(),
          status: r.status,
          checkedInAt: r.checked_in_at ? new Date(r.checked_in_at).toISOString() : null,
          location: session?.location || "Location withheld",
        };
      }),
    ),
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
  choice: { option?: "package" | "days"; dates?: string[] } = {},
) {
  const [row] = await sql<{
    payload: TrainingEvent;
    revision: number;
  }>`select payload,revision from training_events where id=${id} for update`;
  if (!row || row.payload.status !== "published")
    throw Error("Registration is closed for this event.");
  const [player] = await sql<{
    birth_date: string | null;
  }>`select birth_date::text as birth_date from club_athletes where id=${athleteId}`;
  const ageError = campAgeError(row.payload, player?.birth_date);
  if (ageError) throw Error(ageError);
  const purchase = campPurchase(row.payload, choice);
  if (windows(purchase)[0].start <= new Date())
    throw Error("Registration is closed for the selected camp days.");
  const active = await sql<{
    order_id: string;
    athlete_id: string;
    sessions: TrainingEvent["sessions"];
  }>`select r.order_id,r.athlete_id,o.snapshot->'eventRegistration'->'sessions' as sessions from training_event_registrations r join commerce_orders o on o.id=r.order_id where r.event_id=${id} and r.status='confirmed'`;
  const pending = checkPending
    ? await sql<{
        athlete_id: string;
        sessions: TrainingEvent["sessions"];
      }>`select athlete_id,snapshot->'eventRegistration'->'sessions' as sessions from commerce_orders where kind='event' and product_id=${id} and id<>${orderId} and (status='pending' and hold_until>now() or exists(select 1 from square_payment_attempts a where a.order_id=commerce_orders.id and a.status in ('pending','unknown')))`
    : [];
  const overlaps = (r: { sessions: TrainingEvent["sessions"] }) =>
    r.sessions.some((s) => purchase.dates.includes(s.date));
  if (active.some((r) => r.athlete_id === athleteId && overlaps(r)))
    throw Error("This player is already registered for a selected day.");
  if (pending.some((r) => r.athlete_id === athleteId && overlaps(r)))
    throw Error(
      "Checkout already exists for this player and a selected day. Complete it or wait ten minutes.",
    );
  const delivery = await operationalEventSessions(sql, id, purchase.sessions, row.payload.location);
  const operational = await operationalEvent(sql, id);
  const operationalUsage = await operationalEventSeatUsage(sql, id);
  const usage = !orderId ? operationalUsage : null;
  const acceptedOperationalReservation =
    !!orderId &&
    ((operational?.revision || 0) > 0 ||
      delivery.some((s) => s.revision > 0) ||
      operationalUsage.withdrawn.length > 0 ||
      operationalUsage.manual.length > 0);
  if (!orderId && operational && operational.publication !== "open")
    throw Error("Registration is closed for this event.");
  if (
    !acceptedOperationalReservation &&
    purchase.dates.some((d) => {
      const paid = active.filter(
        (r) =>
          r.sessions.some((s) => s.date === d) &&
          !usage?.withdrawn.some((w) => w.orderId === r.order_id && w.date === d),
      ).length;
      const reserved = pending.filter((r) => r.sessions.some((s) => s.date === d)).length;
      const manual = Math.max(
        0,
        ...delivery
          .filter((s) => s.originalDate === d)
          .map((s) => usage?.manual.find((m) => m.sessionKey === s.sessionKey)?.count || 0),
      );
      return (
        paid + reserved + manual >=
        (!orderId ? (operational?.capacity ?? row.payload.capacity) : row.payload.capacity)
      );
    })
  )
    throw Error("This event is full on a selected day.");
  for (const session of delivery) {
    // Prepared order financial eligibility remains tied to its original tuple. Operational
    // changes only select delivery at fulfillment and cannot reject an accepted charge.
    if (orderId && session.revision > 0) continue;
    if (!orderId && (session.status !== "confirmed" || new Date(session.startsAt) <= new Date()))
      throw Error("Registration is closed for a selected camp day.");
    const occupied =
      await sql`select booking_id from booking_occupancy where resource_id=${"athlete:" + athleteId} and slot_at>=${session.startsAt} and slot_at<${session.endsAt} limit 1`;
    if (occupied.length) throw Error("This player has another booking during a selected camp day.");
  }
  return { ...row.payload, revision: row.revision, purchase };
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
    await lockFinancialExecution(tx);
    const [prior] = await tx<
      SquareOrder & { request_key: string }
    >`select * from commerce_orders where request_key=${input.requestId} for update`;
    if (prior) {
      if (
        prior.user_id !== userId ||
        prior.product_id !== input.eventId ||
        prior.athlete_id !== input.athleteId ||
        (prior.snapshot.eventRegistration?.option || "package") !== (input.option || "package") ||
        ((input.option || "package") === "days" &&
          JSON.stringify([...(input.dates || [])].sort()) !==
            JSON.stringify(prior.snapshot.eventRegistration?.dates))
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
    const e = await eventAvailable(tx, input.eventId, input.athleteId, "", true, input);
    if (e.revision !== input.revision)
      throw Error("Event details or price changed. Refresh and review before paying.");
    const id = randomUUID(),
      end = new Date(Date.now() + 600000);
    const quote: Quote & { eventRegistration: EventSnapshot; consentAt: string } = {
      productId: e.id,
      kind: "event",
      title: e.name,
      totalCents: e.purchase.totalCents,
      regularCents: e.purchase.totalCents,
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
      lines: [
        {
          label:
            e.name +
            (e.purchase.option === "package"
              ? " — full camp"
              : " — " + e.purchase.dates.join(", ")),
          cents: e.purchase.totalCents,
        },
      ],
      teamRate: false,
      needsSlot: false,
      consentAt: new Date().toISOString(),
      eventRegistration: {
        id: e.id,
        revision: e.revision,
        minAge: e.minAge,
        maxAge: e.maxAge,
        ageAsOf: e.sessions.map((s) => s.date).sort()[0],
        option: e.purchase.option,
        dates: e.purchase.dates,
        sessions: e.purchase.sessions,
        sessionKeys: e.purchase.sessions.map((s) => operationalEventSessionKey(e.id, s)),
        location: e.location,
        policy: e.policy,
      },
    };
    await tx`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment) values(${id},${input.requestId},${userId},${me.email},${input.athleteId},${e.id},'event',${JSON.stringify(quote)}::jsonb,${e.purchase.totalCents},${end.toISOString()},'square',${environment})`;
    return { orderId: id, totalCents: e.purchase.totalCents, holdUntil: end.toISOString() };
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
    true,
    order.snapshot.eventRegistration,
  );
  if (
    e.revision !== order.snapshot.eventRegistration.revision ||
    e.purchase.totalCents !== order.total_cents
  )
    throw Error(
      "Event details changed. No payment submitted. Refresh the event and start a new checkout after this session expires.",
    );
}
export async function fulfillEventPayment(sql: Sql, order: SquareOrder, environment: string) {
  await lockFinancialExecution(sql);
  let ok = order.status === "pending" && +new Date(order.hold_until) > Date.now();
  if (ok) {
    try {
      const e = await eventAvailable(
        sql,
        order.product_id!,
        order.athlete_id!,
        order.id,
        false,
        order.snapshot.eventRegistration,
      );
      ok =
        e.revision === order.snapshot.eventRegistration?.revision &&
        e.purchase.totalCents === order.total_cents;
    } catch {
      ok = false;
    }
  }
  if (ok) {
    await sql`update commerce_orders set status='paid',updated_at=now() where id=${order.id}`;
    const snapshot = order.snapshot.eventRegistration!;
    const delivery = await operationalEventSessions(
      sql,
      snapshot.id,
      snapshot.sessions,
      snapshot.location,
    );
    for (const session of snapshot.sessions) {
      const w = {
        start: chicagoInstant(session.date, session.start),
        end: chicagoInstant(session.date, session.end),
      };
      const id = await createPaidBooking(sql, {
        orderId: order.id,
        userId: order.user_id,
        athleteId: order.athlete_id,
        productId: order.product_id!,
        start: w.start,
        end: w.end,
        resources: ["athlete:" + order.athlete_id],
        operationalSession: delivery.find(
          (s) => s.sessionKey === operationalEventSessionKey(snapshot.id, session),
        ),
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
