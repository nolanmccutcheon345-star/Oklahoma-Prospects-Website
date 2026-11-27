import test from "node:test";
import assert from "node:assert/strict";
import { enrollmentFixture } from "./enrollment/test-fixture";
import { personFor, savePersonFor } from "./person.server";
import { publicPeopleFor } from "./person-public.server";

test("published instructor offerings survive missing hours without making the instructor bookable", async () => {
  const fixture = await enrollmentFixture();
  const { sql } = fixture;
  try {
    const initial = (await personFor(sql, "coach")).value;
    await savePersonFor(sql, "owner", {
      ...initial,
      profile: {
        ...initial.profile,
        name: "Synthetic softball instructor",
        bio: "Synthetic coaching profile",
        sports: ["softball"],
      },
      instructor: true,
      publishInstructor: true,
      offerings: [{ serviceId: "s2", profitSplit: 60 }],
      windows: [],
      reviewedSources: true,
    });
    const card = (await publicPeopleFor(sql)).find(
      (p) => p.name === "Synthetic softball instructor",
    )!;
    assert.equal(card.instructor, true);
    assert.equal(card.bookable, false);
    assert.deepEqual(card.serviceIds, []);
    assert.deepEqual(card.offeredServiceIds, ["s2"]);
    const current = (await personFor(sql, "coach")).value;
    await savePersonFor(sql, "owner", {
      ...current,
      windows: [{ weekday: "Mon", start: "17:00", end: "20:00" }],
    });
    const bookable = (await publicPeopleFor(sql)).find((p) => p.id === card.id)!;
    assert.equal(bookable.bookable, true);
    assert.deepEqual(bookable.serviceIds, ["s2"]);
    assert.deepEqual(bookable.offeredServiceIds, ["s2"]);
    const saved = (await personFor(sql, "coach")).value;
    await savePersonFor(sql, "owner", { ...saved, publishInstructor: false });
    const hidden = (await publicPeopleFor(sql)).find((p) => p.id === card.id);
    assert.deepEqual(hidden?.offeredServiceIds || [], []);
    assert.equal(hidden?.bookable || false, false);
  } finally {
    await fixture.db.close();
  }
});
