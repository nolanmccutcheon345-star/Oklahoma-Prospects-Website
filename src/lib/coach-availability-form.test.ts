import test from "node:test";
import assert from "node:assert/strict";
import { coachAvailabilityFields, submittedCoachAvailability } from "./coach-availability-form";

test("saved availability survives reopening and an unchanged submission", () => {
  const fields = coachAvailabilityFields([{ id: "qa", coachId: "qa", weekday: "Fri", window: "16:00–18:00" }]);
  const friday = fields.find(field => field.weekday === "Fri")!;
  assert.deepEqual({ available: friday.available, start: friday.start, end: friday.end }, { available: true, start: "16:00", end: "18:00" });
  const form = new FormData();
  for (const field of fields) {
    if (field.available) form.set(field.id, "on");
    form.set(`${field.id}-start`, field.start);
    form.set(`${field.id}-end`, field.end);
  }
  assert.deepEqual(submittedCoachAvailability(form, fields), [{ weekday: "Fri", start: "16:00", end: "18:00" }]);
  form.delete(friday.id);
  assert.deepEqual(submittedCoachAvailability(form, fields), [], "deliberately unchecking a window removes it");
});

test("legacy day lists, wraparound ranges and split windows are preserved", () => {
  const rows = [
    { id: "a", coachId: "qa", weekday: "Tue / Thu", window: "5:00–6:00 PM" },
    { id: "b", coachId: "qa", weekday: "Thu", window: "19:00–20:00" },
    { id: "c", coachId: "qa", weekday: "Sun–Mon", window: "4:00 PM–8:00 PM" },
  ];
  const fields = coachAvailabilityFields(rows).filter(field => field.available);
  assert.deepEqual(fields.map(({ weekday, start, end }) => ({ weekday, start, end })), [
    { weekday: "Mon", start: "16:00", end: "20:00" },
    { weekday: "Tue", start: "17:00", end: "18:00" },
    { weekday: "Thu", start: "17:00", end: "18:00" },
    { weekday: "Thu", start: "19:00", end: "20:00" },
    { weekday: "Sun", start: "16:00", end: "20:00" },
  ]);
  assert.equal(new Set(fields.map(field => field.id)).size, fields.length);
  assert.throws(() => coachAvailabilityFields([{ id: "bad", coachId: "qa", weekday: "Fri", window: "unreadable" }]), /before replacing/);
});
