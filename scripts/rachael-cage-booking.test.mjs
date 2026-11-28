import assert from "node:assert/strict";
import test from "node:test";
import { auditHarness } from "./audit-support.mjs";

test("a simulated paid Rachael booking occupies the coach and one cage for 60 minutes", async () => {
  const { api, db, sql, close } = await auditHarness();
  const coachId = "c-d5ae129775a2e0118a85541172a72fd5";
  const productId = "rachael-cage-60";
  try {
    const [service] = await sql`select active from club_services where id=${productId}`;
    assert.equal(service.active, false);
    await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt")
      values('parent','Test Parent','parent@audit.example.invalid',true,now(),now())`;
    await sql`insert into profiles(user_id,name,email,role,family_id)
      values('parent','Test Parent','parent@audit.example.invalid','parent','family')`;
    await sql`insert into club_households(id,primary_email)
      values('family','parent@audit.example.invalid')`;
    await sql`insert into club_athletes(id,user_id,household_id,household_email,name,birth_date,profile)
      values('athlete','parent','family','parent@audit.example.invalid','Test Athlete','2014-03-01','{"sport":"softball"}'::jsonb)`;
    const input = {
      productId,
      kind: "lesson",
      coachId,
      athleteId: "athlete",
      consent: true,
      athleteCount: 1,
    };
    await assert.rejects(api.quoteForRequest(input, false, "parent"), /product is unavailable/);

    // Activate the offering only in this disposable test database.
    await sql`update club_services set active=true where id=${productId}`;
    await sql`insert into club_staff(id,name,email,role,active)
      values('staff','Test Coach','coach@audit.example.invalid','coach',true)`;
    await sql`insert into club_staff_services(staff_id,service_id,profit_split)
      values('staff',${productId},0)`;
    const file = api.emptyDevelopment();
    file.coaches = [
      {
        id: coachId,
        name: "Test Coach",
        email: "coach@audit.example.invalid",
        active: true,
        specialties: ["Pitching"],
      },
    ];
    file.availability = [{ id: "test-window", coachId, weekday: "Sun-Sat", window: "16:00-17:00" }];
    await sql`insert into pd_working_file(id,payload,revision)
      values('club',${JSON.stringify(file)},0)`;
    await assert.rejects(api.quoteForRequest(input, false, "parent"), /space is assigned/);
    await sql`insert into service_resources(service_id,lane_ids) values(${productId},'["7"]'::jsonb)`;

    const { quote } = await api.quoteForRequest(input, false, "parent");
    assert.equal(quote.totalCents, 3500);
    assert.equal(quote.duration, 60);
    assert.equal(quote.assessment, false);
    assert.deepEqual(quote.resources, [`coach:${coachId}`, "lane:7", "athlete:athlete"]);
    const date = api.chicagoDate(new Date(Date.now() + 2 * 86400000));
    const availability = await api.availableSlots({ ...input, date }, "parent");
    assert.deepEqual(
      availability.slots.map((slot) => slot.value),
      ["16:00"],
    );
    const { start, end } = api.validateWindow(date, "16:00", quote.duration);
    for (const orderId of ["paid-fixture", "conflict-fixture"]) {
      await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,status)
        values(${orderId},${orderId},'parent','parent@audit.example.invalid','athlete',${productId},'lesson',${JSON.stringify(quote)}::jsonb,${quote.totalCents},'paid')`;
    }
    const booking = {
      userId: "parent",
      athleteId: "athlete",
      coachId,
      productId,
      start,
      end,
      resources: quote.resources,
    };
    const bookingId = await sql.transaction((tx) =>
      api.createPaidBooking(tx, { ...booking, orderId: "paid-fixture" }),
    );
    assert.ok(bookingId);
    assert.deepEqual(
      (
        await db.query(
          `select resource_id, count(*)::int as slots
      from booking_occupancy where booking_id=$1 group by resource_id order by resource_id`,
          [bookingId],
        )
      ).rows,
      [
        { resource_id: "athlete:athlete", slots: 12 },
        { resource_id: `coach:${coachId}`, slots: 12 },
        { resource_id: "lane:7", slots: 12 },
      ],
    );
    assert.equal(
      await sql.transaction((tx) =>
        api.createPaidBooking(tx, { ...booking, orderId: "conflict-fixture" }),
      ),
      null,
    );
    assert.equal((await sql`select id from booking_records`).length, 1);
    assert.deepEqual((await api.availableSlots({ ...input, date }, "parent")).slots, []);

    // Complete an earlier synthetic booking through the same guided-lesson service.
    const past = api.validateWindow("2026-01-12", "16:00", 60, new Date("2026-01-11"));
    await sql`insert into booking_records(id,order_id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,status)
      values('past-booking','conflict-fixture','parent','athlete',${coachId},${productId},${past.start.toISOString()},${past.end.toISOString()},${JSON.stringify(quote.resources)}::jsonb,'confirmed')`;
    await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt")
      values('coach','Test Coach','coach@audit.example.invalid',true,now(),now())`;
    await sql`insert into profiles(user_id,name,email,role) values('coach','Test Coach','coach@audit.example.invalid','coach')`;
    const instructor = await api.clubIdentity("coach");
    const result = await sql.transaction((tx) =>
      api.completeSessionInTransaction(
        tx,
        instructor,
        file,
        "past-booking",
        "Completed the session.",
        "Pitching",
      ),
    );
    assert.deepEqual(result, { ok: true, assessmentCompleted: false });
    assert.equal((await sql`select * from contractor_earnings`).length, 0);
  } finally {
    await close();
  }
});
