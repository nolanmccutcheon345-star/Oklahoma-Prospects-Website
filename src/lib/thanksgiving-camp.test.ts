import { chicagoInstant } from "./scheduling";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import {
  saveTrainingEvent,
  prepareEventCheckout,
  eventFamily,
  eventOffice,
} from "./training-events.server";
import { campPurchase, type TrainingEvent } from "./training-events-contracts";
import { fulfillSquarePayment, type SquareOrder } from "./commerce/square-payments.server";
import type { Square } from "square";

import { THANKSGIVING_CAMP, thanksgivingDetailsSchema } from "./thanksgiving-camp";
import { getThanksgivingEvents } from "./thanksgiving-camp.server";

test("Thanksgiving camp payment, capacity, retry and privacy invariants", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-01T12:00:00Z") });
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const s = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      (
        await query(
          p.reduce((a, x, i) => a + (i ? "$" + i : "") + x, ""),
          v,
        )
      ).rows) as Sql;
    s.query = (async (t: string, v: unknown[] = []) => (await query(t, v)).rows) as Sql["query"];
    s.transaction = (fn) => db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
    return s;
  };
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + file, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const [id, role] of [
      ["owner", "admin"],
      ["parent", "parent"],
      ["other", "parent"],
      ["player", "player"],
      ["coach", "coach"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@test.invalid"},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@test.invalid"},${id},${role},${"fam-" + id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@test.invalid','owner')`;
    const me = await resolveIdentity(sql, "parent");
    for (const id of ["a", "b", "c"])
      await sql`insert into club_athletes(id,user_id,household_email,name,household_id) values(${id},'parent','parent@test.invalid',${"Player " + id},${me.billingHouseholdIds[0]})`;
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify({ coaches: [{ id: "coach1", name: "Coach One", email: "coach-private@example.invalid", specialties: [], active: true }] })},1)`;
    const coaches = [{ id: "coach1", name: "Coach One" }];
    await sql`update club_athletes set birth_date='2018-01-01'`;

    const group = THANKSGIVING_CAMP.groups[0];
    let e: TrainingEvent = {
      id: group.id,
      revision: 0,
      name: "Synthetic Thanksgiving Camp",
      type: "camp",
      sport: "Both",
      description: "Synthetic camp description.",
      minAge: group.minAge,
      maxAge: group.maxAge,
      priceCents: 12000,
      dayPriceCents: 4500,
      pricingMode: "both",
      location: THANKSGIVING_CAMP.location,
      sessions: THANKSGIVING_CAMP.dates.map((date) => ({
        date,
        start: group.start,
        end: group.end,
      })),
      coachIds: ["coach1"],
      capacity: 150,
      status: "published",
      policy:
        "Full refund with at least 24 hours notice before the first selected session. Otherwise no refund.",
    };
    e = await saveTrainingEvent(sql, "owner", e, coaches);
    const details = thanksgivingDetailsSchema.parse({
      parentName: "Private parent",
      parentPhone: "9185550101",
      sport: "Softball",
      ageGroup: "6-9U",
    });
    const req = (athleteId = "a") => ({
      eventId: e.id,
      athleteId,
      revision: e.revision,
      requestId: randomUUID(),
      consent: true as const,
      thanksgivingDetails: details,
    });
    await assert.rejects(
      prepareEventCheckout(sql, "parent", { ...req(), thanksgivingDetails: undefined }, "sandbox"),
      /parent contact/,
    );
    await assert.rejects(prepareEventCheckout(sql, "other", req(), "sandbox"), /household/);
    await assert.rejects(eventOffice(sql, "parent"), /Admin/);
    await sql`update club_athletes set birth_date='2010-01-01' where id='c'`;
    await assert.rejects(
      prepareEventCheckout(sql, "parent", req("c"), "sandbox"),
      /age|older|years/i,
    );
    const input = req();
    const checkout = await prepareEventCheckout(sql, "parent", input, "sandbox");
    assert.equal(checkout.totalCents, 12000);
    assert.equal(
      (await prepareEventCheckout(sql, "parent", input, "sandbox")).orderId,
      checkout.orderId,
    );
    await assert.rejects(
      prepareEventCheckout(
        sql,
        "parent",
        { ...input, thanksgivingDetails: { ...details, parentPhone: "9185550102" } },
        "sandbox",
      ),
      /match|request|different/i,
    );
    const [order] =
      await sql<SquareOrder>`select * from commerce_orders where id=${checkout.orderId}`;
    assert.deepEqual(order.snapshot.eventRegistration?.sessions, e.sessions);
    assert.equal(order.snapshot.eventRegistration?.policy, e.policy);
    await sql`update commerce_orders set square_customer_id='customer' where id=${checkout.orderId}`;
    const payment: Square.Payment = {
      id: "thanksgiving-payment",
      referenceId: checkout.orderId,
      locationId: "loc",
      customerId: "customer",
      amountMoney: { amount: 12000n, currency: "USD" },
      totalMoney: { amount: 12000n, currency: "USD" },
      status: "COMPLETED",
      sourceType: "CARD",
      createdAt: new Date().toISOString(),
    };
    const config = { environment: "sandbox", locationId: "loc" };
    await sql.transaction((tx) =>
      fulfillSquarePayment(tx, { ...payment, status: "FAILED" }, config),
    );
    assert.equal((await sql`select * from training_event_registrations`).length, 0);
    await sql.transaction((tx) => fulfillSquarePayment(tx, payment, config));
    await sql.transaction((tx) => fulfillSquarePayment(tx, payment, config));
    assert.equal((await eventFamily(sql, "parent")).registrations.length, 1);
    assert.equal((await eventFamily(sql, "other")).registrations.length, 0);
    const office = await eventOffice(sql, "owner");
    assert.deepEqual(office.registrations[0].thanksgiving_details, details);
    assert.equal(
      (
        await sql`select id from payment_notifications where order_id=${checkout.orderId} and kind='thanksgiving-registration'`
      ).length,
      1,
    );
    const publicEvents = await getThanksgivingEvents(sql);
    assert.doesNotMatch(
      JSON.stringify(publicEvents),
      /Private parent|9185550101|parent@test.invalid|Player a/,
    );
    // Hold the other group's seats to prove the shared limit applies across groups.
    const otherGroup = THANKSGIVING_CAMP.groups[1];
    await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,payment_provider,payment_environment,status,hold_until)
      select 'capacity-'||i,'capacity-'||i,'fixture@example.invalid',${otherGroup.id},'event',${JSON.stringify({ eventRegistration: { sessions: [{ date: THANKSGIVING_CAMP.dates[0], start: otherGroup.start, end: otherGroup.end }] } })}::jsonb,4500,'square','sandbox','pending',now()+interval '10 minutes' from generate_series(1,149) i`;
    const dayInput = { ...req("b"), option: "days" as const, dates: [THANKSGIVING_CAMP.dates[0]] };
    await assert.rejects(prepareEventCheckout(sql, "parent", dayInput, "sandbox"), /full/);
    const dayCheckout = await prepareEventCheckout(
      sql,
      "parent",
      { ...dayInput, requestId: randomUUID(), dates: [THANKSGIVING_CAMP.dates[1]] },
      "sandbox",
    );
    assert.equal(dayCheckout.totalCents, 4500);
    assert.equal((await getThanksgivingEvents(sql))[0].availability[0].remainingSeats, 0);
  } finally {
    await db.close();
  }
});

test("Thanksgiving pricing and Central Time refund deadlines match selected sessions", () => {
  for (const group of THANKSGIVING_CAMP.groups) {
    const event = {
      id: group.id,
      pricingMode: "both",
      priceCents: 12000,
      dayPriceCents: 4500,
      sessions: THANKSGIVING_CAMP.dates.map((date) => ({
        date,
        start: group.start,
        end: group.end,
      })),
    } as TrainingEvent;
    assert.equal(
      campPurchase(event, { option: "days", dates: [...THANKSGIVING_CAMP.dates] }).totalCents,
      12000,
    );
    assert.equal(
      campPurchase(event, { option: "days", dates: THANKSGIVING_CAMP.dates.slice(0, 2) })
        .totalCents,
      9000,
    );
    assert.equal(
      campPurchase(event, { option: "days", dates: [THANKSGIVING_CAMP.dates[2]] }).totalCents,
      4500,
    );
    const purchase =
      group.value === "6-9U"
        ? campPurchase(event)
        : campPurchase(event, { option: "days", dates: ["2026-11-25"] });
    const deadline = new Date(
      Math.min(...purchase.sessions.map((s) => +chicagoInstant(s.date, s.start))) -
        24 * 60 * 60 * 1000,
    );
    assert.equal(
      deadline.toISOString(),
      group.value === "6-9U" ? "2026-11-22T15:00:00.000Z" : "2026-11-24T19:00:00.000Z",
    );
    assert.equal(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        weekday: "long",
        hour: "numeric",
        minute: "2-digit",
      }).format(deadline),
      group.value === "6-9U" ? "Sunday 9:00 AM" : "Tuesday 1:00 PM",
    );
  }
});
