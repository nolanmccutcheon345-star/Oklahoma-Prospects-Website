import assert from "node:assert/strict";
import test from "node:test";
import { auditHarness } from "./audit-support.mjs";

test("a guest can browse published lesson openings without an athlete or a checkout session", async () => {
  const { api, sql, close } = await auditHarness();
  try {
    const coachId = "guest-fixture-coach";
    const productId = "s1";
    const email = "coach@audit.example.invalid";
    await sql`insert into club_staff(id,name,email,role,active) values('guest-staff','Test Coach',${email},'coach',true)`;
    await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('guest-staff',${productId},50)`;
    await sql`insert into service_resources(service_id,lane_ids) values(${productId},'["7"]'::jsonb) on conflict(service_id) do update set lane_ids=excluded.lane_ids`;
    const file = api.emptyDevelopment();
    file.coaches = [
      { id: coachId, name: "Test Coach", email, specialties: ["Pitching"], active: true },
    ];
    file.availability = [{ id: "window", coachId, weekday: "Sun-Sat", window: "16:00-17:15" }];
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)},0)`;

    const date = api.chicagoDate(new Date(Date.now() + 2 * 86400000));
    const input = { productId, coachId, date };
    const first = await api.publicLessonTimes(input);
    assert.deepEqual(Object.keys(first).sort(), ["nextAvailable", "slots"]);
    assert.ok(first.slots.some((slot) => slot.value === "16:00"));

    const start = api.chicagoInstant(date, "16:00");
    const end = new Date(+start + 75 * 60000);
    await sql`insert into booking_records(id,product_id,starts_at,ends_at,resources,status)
      values('guest-fixture-conflict','fixture',${start.toISOString()},${end.toISOString()},'["lane:7"]'::jsonb,'confirmed')`;
    await sql`insert into booking_occupancy(resource_id,slot_at,booking_id)
      values('lane:7',${start.toISOString()},'guest-fixture-conflict')`;
    assert.ok(!(await api.publicLessonTimes(input)).slots.some((slot) => slot.value === "16:00"));
    await assert.rejects(
      api.publicLessonTimes({ ...input, coachId: "unassigned" }),
      /not assigned/,
    );
    assert.deepEqual(await api.publicLessonTimes({ ...input, productId: "unpublished" }), {
      slots: [],
      nextAvailable: null,
    });
    assert.equal((await sql`select * from commerce_orders`).length, 0);
  } finally {
    await close();
  }
});
