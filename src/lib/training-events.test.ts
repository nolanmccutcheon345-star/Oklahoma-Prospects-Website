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
import { trainingEventSchema, type TrainingEvent } from "./training-events-contracts";
import { fulfillSquarePayment, type SquareOrder } from "./commerce/square-payments.server";
import { applySquareRefundBalance } from "./commerce/square-refunds.server";
import { saveParentBookingCancellation } from "./commerce/family-cancellation.server";
import type { Square } from "square";

test("paid camps: ownership, staff conflicts, capacity, price changes, verified fulfillment, duplicate delivery and refunds", async () => {
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
      name: "Camp fixture",
      type: "camp",
      sport: "Both",
      description: "Two-day skills camp.",
      priceCents: 7533,
      location: "Facility",
      sessions: [
        { date: "2030-06-01", start: "09:00", end: "12:00" },
        { date: "2030-06-02", start: "09:00", end: "12:00" },
      ],
      coachIds: ["coach1"],
      capacity: 1,
      status: "published",
      policy: "Office-reviewed cancellation policy.",
    };
    await assert.rejects(saveTrainingEvent(sql, "parent", e, coaches), /Admin/);
    await assert.rejects(saveTrainingEvent(sql, "coach", e, coaches), /Admin/);
    e = await saveTrainingEvent(sql, "owner", e, coaches);
    const published = await listTrainingEvents(sql);
    assert.deepEqual(published[0].coaches, [{ id: "coach1", name: "Coach One" }]);
    assert.doesNotMatch(JSON.stringify(published), /coach-private/);
    assert.equal(
      (await sql`select id from booking_records where order_id is null and status='confirmed'`)
        .length,
      2,
    );
    await assert.rejects(
      saveTrainingEvent(sql, "owner", { ...e, id: randomUUID(), revision: 0 }, coaches),
      /already has/,
    );
    const req = (athleteId = "a") => ({
      eventId: e.id,
      athleteId,
      revision: e.revision,
      requestId: randomUUID(),
      consent: true as const,
    });
    await assert.rejects(prepareEventCheckout(sql, "other", req(), "sandbox"), /household/);
    await assert.rejects(prepareEventCheckout(sql, "player", req(), "sandbox"), /Player accounts/);
    const input = req();
    const checkout = await prepareEventCheckout(sql, "parent", input, "sandbox");
    assert.equal(checkout.totalCents, 7533);
    assert.equal(
      (await prepareEventCheckout(sql, "parent", input, "sandbox")).orderId,
      checkout.orderId,
    );
    await assert.rejects(prepareEventCheckout(sql, "parent", req("b"), "sandbox"), /full/);
    await assert.rejects(prepareEventCheckout(sql, "parent", req(), "sandbox"), /already exists/);
    let [order] =
      await sql<SquareOrder>`select * from commerce_orders where id=${checkout.orderId}`;
    await sql.transaction((tx) => validateEventPayment(tx, order, me));
    e = await saveTrainingEvent(sql, "owner", { ...e, priceCents: 8000 }, coaches);
    await assert.rejects(
      sql.transaction((tx) => validateEventPayment(tx, order, me)),
      /details changed/,
    );
    await sql`update commerce_orders set status='expired' where id=${order.id}`;
    const current = await prepareEventCheckout(sql, "parent", req(), "sandbox");
    await sql`update commerce_orders set square_customer_id='customer' where id=${current.orderId}`;
    const payment: Square.Payment = {
      id: "payment-one",
      referenceId: current.orderId,
      locationId: "loc",
      customerId: "customer",
      amountMoney: { amount: 8000n, currency: "USD" },
      totalMoney: { amount: 8000n, currency: "USD" },
      status: "COMPLETED",
      sourceType: "CARD",
      createdAt: new Date().toISOString(),
    };
    const config = { environment: "sandbox", locationId: "loc" };
    await sql.transaction((tx) =>
      fulfillSquarePayment(tx, { ...payment, status: "FAILED" }, config),
    );
    assert.equal((await sql`select * from training_event_registrations`).length, 0);
    await assert.rejects(
      sql.transaction((tx) =>
        fulfillSquarePayment(
          tx,
          { ...payment, amountMoney: { amount: 1n, currency: "USD" } },
          config,
        ),
      ),
      /verification/,
    );
    await sql.transaction((tx) => fulfillSquarePayment(tx, payment, config));
    await sql.transaction((tx) => fulfillSquarePayment(tx, payment, config));
    const registrations = await eventFamily(sql, "parent");
    assert.equal(registrations.registrations.length, 1);
    assert.equal(registrations.registrations[0].status, "confirmed");
    assert.equal((await eventFamily(sql, "other")).registrations.length, 0);
    const bookings = await sql<{
      id: string;
    }>`select id from booking_records where order_id=${current.orderId} and status='confirmed'`;
    assert.equal(bookings.length, 2);
    await assert.rejects(
      saveParentBookingCancellation(sql, bookings[0].id, current.orderId, "parent", me),
      /event policy/,
    );
    await assert.rejects(
      saveTrainingEvent(sql, "owner", { ...e, location: "Another place" }, coaches),
      /locked/,
    );
    await assert.rejects(
      prepareEventCheckout(sql, "parent", req(), "sandbox"),
      /already registered/,
    );
    await sql.transaction((tx) =>
      applySquareRefundBalance(
        tx,
        { ...payment, refundedMoney: { amount: 8000n, currency: "USD" } },
        config,
      ),
    );
    assert.equal((await eventFamily(sql, "parent")).registrations[0].status, "cancelled");
    assert.equal(
      (
        await sql`select id from booking_records where order_id=${current.orderId} and status='confirmed'`
      ).length,
      0,
    );
    // Late provider completion is reconciled/refunded, never enrolled.
    const late = await prepareEventCheckout(sql, "parent", req("b"), "sandbox");
    await sql`update commerce_orders set square_customer_id='customer',hold_until=now()-interval '1 minute' where id=${late.orderId}`;
    await sql.transaction((tx) =>
      fulfillSquarePayment(
        tx,
        { ...payment, id: "late-payment", referenceId: late.orderId },
        config,
      ),
    );
    assert.equal(
      (await sql`select * from training_event_registrations where status='confirmed'`).length,
      0,
    );
    const [lateOrder] = await sql<{
      status: string;
    }>`select status from commerce_orders where id=${late.orderId}`;
    assert.equal(lateOrder.status, "payment_review");
    assert.ok((await sql`select id from commerce_refunds where order_id=${late.orderId}`).length);
  } finally {
    await db.close();
  }
});
test("event dates and amounts validate before writes", () => {
  assert.equal(trainingEventSchema.safeParse({}).success, false);
});
