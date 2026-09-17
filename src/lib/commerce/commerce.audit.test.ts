import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { checkoutInput, calculateQuote, type Product, type CheckoutInput } from "./contracts";
import { PRICES, refundCents } from "../pricing";
import { slotsFor, chicagoInstant } from "../scheduling";
import { coachAvailable } from "./availability";
import { holdWindow } from "./store.server";
import type { Sql } from "../db";

const request = (extra: Partial<CheckoutInput> = {}): CheckoutInput => ({
  requestId: randomUUID(),
  productId: "s1",
  kind: "lesson",
  email: "test@example.com",
  name: "Test Parent",
  household: true,
  consent: true,
  athleteCount: 1,
  laneIds: [],
  ...extra,
});
const product = (id: keyof typeof PRICES, kind: string): Product => ({
  id,
  kind,
  name: id,
  price: PRICES[id] / 100,
  minutes: id === "s1" ? 75 : 60,
  credits: 4,
  remote: 0,
  expires_days: 120,
  hours: 0,
  discipline: "Pitching",
  active: true,
});

test("all approved products use independently specified base prices", () => {
  const expected = {
    prospect: 7900,
    "all-star": 13900,
    "elite-family": 19900,
    m1: 22900,
    m2: 38900,
    m3: 44900,
    m4: 15900,
    m5: 17900,
    p1: 22000,
    p2: 37000,
    p3: 72000,
    s1: 14900,
    s2: 6000,
    s3: 10000,
    s4: 12900,
    s5: 4500,
    s6: 15900,
    s7: 6000,
    s8: 10000,
    s9: 15000,
    s10: 6000,
    s11: 10000,
    s12: 10000,
  };
  for (const [key, cents] of Object.entries(expected)) {
    const id = key as keyof typeof PRICES;
    const kind = id.startsWith("m")
      ? "membership"
      : id.startsWith("p") && id !== "prospect"
        ? "package"
        : id.startsWith("s")
          ? "lesson"
          : "cage-plan";
    const quote = calculateQuote(
      request({ productId: id, kind }),
      product(id, kind.replace("-", "_")),
      true,
    );
    assert.equal(quote.totalCents, cents, id);
  }
});

test("all ordinary lessons and packages are locked until assessment completion; assessments never get fees", () => {
  for (const id of ["s2", "s3", "s5", "s7", "s8", "s10", "s11", "s12", "p1", "p2", "p3"] as const) {
    const kind = id.startsWith("p") ? "package" : "lesson";
    assert.throws(
      () => calculateQuote(request({ productId: id, kind }), product(id, kind), false),
      /Complete your assessment/,
    );
    assert.equal(
      calculateQuote(request({ productId: id, kind }), product(id, kind), true).setupCents,
      0,
    );
  }
  for (const id of ["s1", "s4", "s9"] as const)
    assert.equal(
      calculateQuote(request({ productId: id }), product(id, "lesson"), false).totalCents,
      PRICES[id],
    );
  for (const id of ["m1", "m2", "m3", "m4", "m5"] as const) {
    const quote = calculateQuote(
      request({ productId: id, kind: "membership" }),
      product(id, "membership"),
      false,
    );
    assert.equal(quote.totalCents, PRICES[id] + 5000);
    assert.equal(quote.regularCents, PRICES[id]);
  }
});
test("checkout rejects price, assessment, total and fee tampering", () => {
  for (const field of ["price", "total", "assessed", "hasAssessment", "fee", "role", "userId"])
    assert.throws(() =>
      checkoutInput.parse({ ...request(), [field]: field === "assessed" ? '"0"' : 0 }),
    );
  assert.throws(
    () =>
      calculateQuote(
        request({ productId: "m1", kind: "membership", consent: false }),
        product("m1", "membership"),
        false,
      ),
    /renewal/,
  );
});
test("team rate at three athletes or spaces; fielding cents and duplicate lanes", () => {
  const rates = [product("individual", "cage"), product("team", "cage"), product("field", "cage")];
  const base = request({ kind: "cage", productId: "individual", duration: 30, laneIds: ["3-4"] });
  assert.equal(calculateQuote(base, rates[0], false, rates).totalCents, 3750);
  assert.equal(
    calculateQuote({ ...base, laneIds: ["1", "1"] }, rates[0], false, rates).totalCents,
    2500,
  );
  const team = calculateQuote(
    { ...base, duration: 60, laneIds: ["1", "2", "5"] },
    rates[0],
    false,
    rates,
  );
  assert.equal(team.totalCents, 18000);
  assert.equal(team.teamRate, true);
  assert.equal(
    calculateQuote(
      { ...base, duration: 60, laneIds: ["1"], athleteCount: 3 },
      rates[0],
      false,
      rates,
    ).totalCents,
    6000,
  );
  assert.throws(
    () =>
      calculateQuote(
        request({ kind: "cage-plan", productId: "prospect", athleteCount: 3 }),
        product("prospect", "cage_plan"),
        true,
      ),
    /household/,
  );
});
test("hours, weekends, duration, impossible/past dates and passed same-day slots", () => {
  const now = new Date("2026-09-15T21:10:00Z");
  assert.equal(slotsFor("2026-09-15", 75, now)[0].value, "16:30");
  assert.equal(slotsFor("2026-09-15", 75, now).at(-1)?.value, "18:30");
  assert.equal(slotsFor("2026-09-19", 180, now)[0].value, "13:00");
  assert.equal(slotsFor("2026-09-19", 180, now).at(-1)?.value, "17:00");
  for (const day of ["2026-09-14", "2026-02-30", "2026-13-01", "bad"])
    assert.deepEqual(slotsFor(day, 60, now), []);
  for (const duration of [0, -30, 181, Infinity, 60.5])
    assert.deepEqual(slotsFor("2026-09-19", duration, now), []);
  assert.equal(chicagoInstant("2026-07-01", "16:00").toISOString(), "2026-07-01T21:00:00.000Z");
  assert.equal(chicagoInstant("2026-12-01", "16:00").toISOString(), "2026-12-01T22:00:00.000Z");
});
test("coach windows cover the whole assessment", () => {
  const availability = [{ id: "a", coachId: "c", weekday: "Tue / Thu", window: "5:00–8:00 PM" }];
  assert.equal(coachAvailable(availability, "c", "2026-09-15", "16:00", 75), false);
  assert.equal(coachAvailable(availability, "c", "2026-09-15", "19:00", 75), false);
  assert.equal(coachAvailable(availability, "c", "2026-09-15", "18:30", 75), true);
  assert.equal(coachAvailable(availability, "other", "2026-09-15", "18:30", 75), false);
});
test("refunds at the exact 48/24-hour boundaries use integer cents", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  for (const [hours, expected] of [
    [48, 10001],
    [47.99, 5001],
    [24, 5001],
    [23.99, 0],
    [-1, 0],
  ])
    assert.equal(refundCents(10001, new Date(+now + hours * 3600000), now), expected);
});

test("real PostgreSQL constraints prevent overlapping and partially acquired multi-lane windows", async () => {
  const db = new PGlite();
  try {
    const names = (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort();
    for (const name of names) await db.exec(await readFile(`migrations/${name}`, "utf8"));
    const wrap = (client: {
      query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
    }): Sql => {
      const fn = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
        (
          await client.query(
            parts.reduce((out, part, i) => out + (i ? `$${i}` : "") + part, ""),
            values,
          )
        ).rows) as Sql;
      fn.query = (async (sql: string, values: unknown[] = []) =>
        (await client.query(sql, values)).rows) as Sql["query"];
      fn.transaction = (work) => db.transaction((tx) => work(wrap(tx)));
      return fn;
    };
    const sql = wrap(db);
    const start = new Date("2026-09-16T21:00:00Z"),
      end = new Date("2026-09-16T22:15:00Z");
    const input = {
      orderId: null,
      userId: null,
      athleteId: null,
      productId: "s1",
      start,
      end,
      resources: ["coach:c", "lane:1"],
    };
    const results = await Promise.allSettled([
      sql.transaction((tx) => holdWindow(tx, input)),
      sql.transaction((tx) => holdWindow(tx, input)),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const [count] = await sql<{ n: number }>`select count(*)::int as n from booking_occupancy`;
    assert.equal(count.n, 30); // two resources × fifteen cells, a full 75 minutes
    await assert.rejects(
      sql.transaction((tx) => holdWindow(tx, { ...input, resources: ["lane:0", "lane:1"] })),
    );
    assert.equal(
      (await sql`select * from booking_occupancy where resource_id = 'lane:0'`).length,
      0,
    );
    await sql.transaction((tx) =>
      holdWindow(tx, { ...input, start: end, end: new Date(+end + 1800000) }),
    );
    assert.equal((await sql`select * from booking_records`).length, 2);
  } finally {
    await db.close();
  }
});
