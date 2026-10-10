import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import {
  listTrainingEvents,
  saveTrainingEvent,
  prepareEventCheckout,
  validateEventPayment,
  eventFamily,
} from "./training-events.server";
import {
  campAgeError,
  eventTypes,
  campPurchase,
  trainingEventSchema,
  type TrainingEvent,
} from "./training-events-contracts";
import { fulfillSquarePayment, type SquareOrder } from "./commerce/square-payments.server";
import { applySquareRefundBalance } from "./commerce/square-refunds.server";
import { saveParentBookingCancellation } from "./commerce/family-cancellation.server";
import type { Square } from "square";

test("multi-day camp pricing, day-specific capacity, repeat disjoint registration, refunds and stale prices", async () => {
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
    let e: TrainingEvent = {
      id: randomUUID(),
      revision: 0,
      name: "MWF Camp",
      type: "camp",
      sport: "Both",
      description: "Monday Wednesday Friday skills.",
      priceCents: 12500,
      dayPriceCents: 5000,
      pricingMode: "both",
      location: "Facility",
      sessions: [
        { date: "2030-06-03", start: "13:00", end: "15:00" },
        { date: "2030-06-05", start: "13:00", end: "15:00" },
        { date: "2030-06-07", start: "14:00", end: "16:00" },
      ],
      coachIds: ["coach1"],
      capacity: 1,
      status: "published",
      policy: "Office cancellation policy.",
    };
    assert.equal(campPurchase(e).totalCents, 12500);
    assert.equal(
      campPurchase(e, { option: "days", dates: ["2030-06-03", "2030-06-07"] }).totalCents,
      10000,
    );
    assert.equal(
      campPurchase(e, { option: "days", dates: e.sessions.map((s) => s.date) }).totalCents,
      15000,
    );
    assert.throws(
      () => campPurchase(e, { option: "days", dates: ["2030-06-03", "2030-06-03"] }),
      /once/,
    );
    assert.throws(() => campPurchase(e, { option: "days", dates: ["2030-06-04"] }), /valid/);
    assert.throws(
      () =>
        campPurchase({ ...e, pricingMode: "package" }, { option: "days", dates: ["2030-06-03"] }),
      /available/,
    );
    assert.throws(
      () => campPurchase({ ...e, pricingMode: "days" }, { option: "package" }),
      /available/,
    );
    e = await saveTrainingEvent(sql, "owner", e, coaches);
    const req = (athleteId: string, dates: string[], option: "package" | "days" = "days") => ({
      eventId: e.id,
      revision: e.revision,
      athleteId,
      requestId: randomUUID(),
      consent: true as const,
      option,
      dates,
    });
    const mondayReq = req("a", ["2030-06-03"]);
    const monday = await prepareEventCheckout(sql, "parent", mondayReq, "sandbox");
    assert.equal(monday.totalCents, 5000);
    assert.equal(
      (await prepareEventCheckout(sql, "parent", mondayReq, "sandbox")).orderId,
      monday.orderId,
    );
    await assert.rejects(
      () => prepareEventCheckout(sql, "parent", { ...mondayReq, dates: ["2030-06-05"] }, "sandbox"),
      /changed/,
    );
    await assert.rejects(
      () => prepareEventCheckout(sql, "parent", req("b", ["2030-06-03"]), "sandbox"),
      /full/,
    );
    await assert.rejects(
      () => prepareEventCheckout(sql, "parent", req("a", ["2030-06-03"]), "sandbox"),
      /already exists/,
    );
    const wednesday = await prepareEventCheckout(
      sql,
      "parent",
      req("b", ["2030-06-05"]),
      "sandbox",
    );
    const friday = await prepareEventCheckout(sql, "parent", req("a", ["2030-06-07"]), "sandbox");
    const config = { environment: "sandbox", locationId: "loc" };
    const pay = async (orderId: string, cents: number) => {
      await sql`update commerce_orders set square_customer_id='customer' where id=${orderId}`;
      const payment: Square.Payment = {
        id: "payment-" + orderId,
        referenceId: orderId,
        locationId: "loc",
        customerId: "customer",
        amountMoney: { amount: BigInt(cents), currency: "USD" },
        totalMoney: { amount: BigInt(cents), currency: "USD" },
        status: "COMPLETED",
        sourceType: "CARD",
        createdAt: new Date().toISOString(),
      };
      await sql.transaction((tx) => fulfillSquarePayment(tx, payment, config));
      return payment;
    };
    const mondayPayment = await pay(monday.orderId, 5000);
    await sql.transaction((tx) => fulfillSquarePayment(tx, mondayPayment, config));
    await pay(wednesday.orderId, 5000);
    const fridayPayment = await pay(friday.orderId, 5000);
    assert.equal(
      (await sql`select id from training_event_registrations where status='confirmed'`).length,
      3,
    );
    assert.equal(
      (
        await sql`select id from booking_records where order_id=${monday.orderId} and status='confirmed'`
      ).length,
      1,
    );
    const family = await eventFamily(sql, "parent");
    assert.deepEqual(
      family.registrations.find((r) => r.orderId === friday.orderId)!.event.sessions,
      [e.sessions[2]],
    );
    const published = await listTrainingEvents(sql);
    assert.equal(published[0].remainingSeats, 0);
    assert.equal(
      published[0].availability.every((d) => d.remainingSeats === 0),
      true,
    );
    // Three registrations on different days fit a capacity of one per day.
    e = await saveTrainingEvent(
      sql,
      "owner",
      { ...e, description: "Updated camp description." },
      coaches,
    );
    await assert.rejects(
      () => prepareEventCheckout(sql, "parent", req("c", [], "package"), "sandbox"),
      /full/,
    );
    await assert.rejects(
      () => prepareEventCheckout(sql, "parent", req("a", ["2030-06-07"]), "sandbox"),
      /already registered/,
    );
    await sql.transaction((tx) =>
      applySquareRefundBalance(
        tx,
        { ...mondayPayment, refundedMoney: { amount: 5000n, currency: "USD" } },
        config,
      ),
    );
    assert.equal(
      (await listTrainingEvents(sql))[0].availability.find((d) => d.date === "2030-06-03")!
        .remainingSeats,
      1,
    );
    assert.equal(
      (await listTrainingEvents(sql))[0].availability.find((d) => d.date === "2030-06-07")!
        .remainingSeats,
      0,
    );
    const changed = await prepareEventCheckout(sql, "parent", req("c", ["2030-06-03"]), "sandbox");
    e = await saveTrainingEvent(sql, "owner", { ...e, dayPriceCents: 5500 }, coaches);
    const [stale] =
      await sql<SquareOrder>`select * from commerce_orders where id=${changed.orderId}`;
    await assert.rejects(
      () => sql.transaction((tx) => validateEventPayment(tx, stale, me)),
      /changed/,
    );
    await pay(changed.orderId, 5000);
    const [review] = await sql<{
      status: string;
    }>`select status from commerce_orders where id=${changed.orderId}`;
    assert.equal(review.status, "payment_review");
    assert.equal(
      (await sql`select id from training_event_registrations where order_id=${changed.orderId}`)
        .length,
      0,
    );
    // Refund only the Friday registration; other households' Wednesday booking stays intact.
    await sql.transaction((tx) =>
      applySquareRefundBalance(
        tx,
        { ...fridayPayment, refundedMoney: { amount: 5000n, currency: "USD" } },
        config,
      ),
    );
    assert.equal(
      (
        await sql`select id from booking_records where order_id=${wednesday.orderId} and status='confirmed'`
      ).length,
      1,
    );

    const otherCamp = await saveTrainingEvent(
      sql,
      "owner",
      {
        ...e,
        id: randomUUID(),
        revision: 0,
        capacity: 2,
        dayPriceCents: 5000,
        sessions: e.sessions.map((s) => ({ ...s, date: s.date.replace("06-", "07-") })),
      },
      coaches,
    );
    const full = await prepareEventCheckout(
      sql,
      "parent",
      {
        eventId: otherCamp.id,
        revision: otherCamp.revision,
        athleteId: "b",
        requestId: randomUUID(),
        consent: true,
        option: "package",
      },
      "sandbox",
    );
    const twoDays = await prepareEventCheckout(
      sql,
      "parent",
      {
        eventId: otherCamp.id,
        revision: otherCamp.revision,
        athleteId: "c",
        requestId: randomUUID(),
        consent: true,
        option: "days",
        dates: ["2030-07-03", "2030-07-07"],
      },
      "sandbox",
    );
    assert.equal(full.totalCents, 12500);
    assert.equal(twoDays.totalCents, 10000);
    await pay(full.orderId, 12500);
    await pay(twoDays.orderId, 10000);
    assert.equal(
      (
        await sql`select id from booking_records where order_id=${full.orderId} and status='confirmed'`
      ).length,
      3,
    );
    assert.equal(
      (
        await sql`select id from booking_records where order_id=${twoDays.orderId} and status='confirmed'`
      ).length,
      2,
    );

    const ageCamp = await saveTrainingEvent(
      sql,
      "owner",
      {
        ...e,
        id: randomUUID(),
        revision: 0,
        type: "skills-class",
        minAge: 8,
        maxAge: 12,
        capacity: 10,
        sessions: e.sessions.map((s) => ({ ...s, date: s.date.replace("06-", "08-") })),
      },
      coaches,
    );
    assert.equal(
      trainingEventSchema.safeParse({ ...ageCamp, minAge: 13, maxAge: 12 }).success,
      false,
    );
    const ageReq = (id: string) => ({
      eventId: ageCamp.id,
      revision: ageCamp.revision,
      athleteId: id,
      requestId: randomUUID(),
      consent: true as const,
      option: "package" as const,
    });
    await assert.rejects(
      () => prepareEventCheckout(sql, "parent", ageReq("a"), "sandbox"),
      /birthday/,
    );
    await sql`update club_athletes set birth_date='2018-08-03' where id='a'`;
    await sql`update club_athletes set birth_date='2017-08-03' where id='b'`;
    await sql`update club_athletes set birth_date='2023-08-03' where id='c'`;
    await assert.rejects(
      () => prepareEventCheckout(sql, "parent", ageReq("b"), "sandbox"),
      /not eligible/,
    );
    await assert.rejects(
      () => prepareEventCheckout(sql, "parent", ageReq("c"), "sandbox"),
      /not eligible/,
    );
    const eligible = await prepareEventCheckout(sql, "parent", ageReq("a"), "sandbox");
    const [ageOrder] =
      await sql<SquareOrder>`select * from commerce_orders where id=${eligible.orderId}`;
    assert.equal(ageOrder.snapshot.eventRegistration?.maxAge, 12);
    await sql`update club_athletes set birth_date='2017-08-03' where id='a'`;
    await assert.rejects(
      () => sql.transaction((tx) => validateEventPayment(tx, ageOrder, me)),
      /not eligible/,
    );
    await pay(eligible.orderId, 12500);
    const [ageReview] = await sql<{
      status: string;
    }>`select status from commerce_orders where id=${eligible.orderId}`;
    assert.equal(ageReview.status, "payment_review");
    const publicEvents = await listTrainingEvents(sql);
    assert.equal(JSON.stringify(publicEvents).includes("birthDate"), false);
  } finally {
    await db.close();
  }
});

test("event age boundaries and facility event types", () => {
  const e = {
    minAge: 8,
    maxAge: 12,
    sessions: [{ date: "2030-08-03", start: "13:00", end: "15:00" }],
  };
  assert.equal(campAgeError(e, "2018-08-03"), "");
  assert.equal(campAgeError(e, "2022-08-03"), "");
  assert.match(campAgeError(e, "2022-08-04"), /not eligible/);
  assert.match(campAgeError(e, "2017-08-03"), /not eligible/);
  assert.equal(campAgeError(e, "2017-08-04"), "");
  for (const birth of [null, "", "2020-02-30", "2040-01-01"])
    assert.match(campAgeError(e, birth), /birthday/);
  assert.equal(campAgeError({ ...e, minAge: undefined, maxAge: undefined }, null), "");
  assert.equal(campAgeError({ ...e, minAge: undefined }, "2025-01-01"), "");
  assert.equal(campAgeError({ ...e, maxAge: undefined }, "1990-01-01"), "");
  for (const type of Object.keys(eventTypes))
    assert.equal(trainingEventSchema.shape.type.safeParse(type).success, true);
});
