import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { validatePayment } from "./payment-validation";

const row = { order_id: "fundraising-order", amount: 5000 };
const payment = {
  id: "payment",
  order_id: row.order_id,
  location_id: "prospects",
  amount_money: { amount: 5000, currency: "USD" },
  status: "COMPLETED",
};

test("only a matching completed Square payment can credit a sponsorship", () => {
  assert.deepEqual(validatePayment(payment, row, "prospects"), {
    status: "completed",
    refunded: 0,
  });
  for (const status of ["APPROVED", "PENDING", "unknown"])
    assert.equal(validatePayment({ ...payment, status }, row, "prospects").status, "pending");
  for (const status of ["FAILED", "CANCELED"])
    assert.equal(validatePayment({ ...payment, status }, row, "prospects").status, "failed");
  for (const patch of [
    { id: "" },
    { order_id: "another-order" },
    { location_id: "another-club" },
    { amount_money: { amount: 4999, currency: "USD" } },
    { amount_money: { amount: 5000, currency: "CAD" } },
  ])
    assert.throws(() => validatePayment({ ...payment, ...patch }, row, "prospects"));
});

test("partial and full refunds are bounded by the original sponsorship", () => {
  for (const amount of [0, 2500, 5000])
    assert.equal(
      validatePayment({ ...payment, refunded_money: { amount, currency: "USD" } }, row, "prospects")
        .refunded,
      amount,
    );
  for (const amount of [-1, 5001, 0.5, "bad"])
    assert.throws(() =>
      validatePayment(
        { ...payment, refunded_money: { amount, currency: "USD" } },
        row,
        "prospects",
      ),
    );
  assert.throws(() =>
    validatePayment(
      { ...payment, refunded_money: { amount: 100, currency: "CAD" } },
      row,
      "prospects",
    ),
  );
});

test("Postgres fundraising migration enforces ownership and unique payment attribution", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      'CREATE TABLE "user" (id text PRIMARY KEY); INSERT INTO "user" VALUES (\'parent\');',
    );
    await pg.exec(
      await readFile(
        new URL("../../../migrations/0027_player_fundraising.sql", import.meta.url),
        "utf8",
      ),
    );
    const insertPlayer =
      "INSERT INTO fundraising_players(id,owner_id,parent_email,name,team,goal,story,created) VALUES($1,$2,'parent@example.test','Test player','13U',100000,'Test','2026-09-21')";
    await assert.rejects(pg.query(insertPlayer, ["orphan", "missing-parent"]));
    await pg.query(insertPlayer, ["one", "parent"]);
    await pg.query(insertPlayer, ["two", "parent"]);
    const insertContribution =
      "INSERT INTO fundraising_contributions(id,player_id,donor,email,amount,status,refunded,payment_id,created) VALUES($1,$2,'Test donor','donor@example.test',$3,$4,$5,$6,'2026-09-21')";
    await pg.query(insertContribution, ["paid", "one", 5000, "completed", 1000, "square-payment"]);
    await assert.rejects(
      pg.query(insertContribution, ["duplicate", "two", 5000, "completed", 0, "square-payment"]),
    );
    await assert.rejects(
      pg.query(insertContribution, [
        "invalid-refund",
        "one",
        5000,
        "completed",
        5001,
        "other-payment",
      ]),
    );
    await pg.query(insertContribution, ["pending", "one", 10000, "pending", 0, null]);
    await pg.query(insertContribution, ["failed", "one", 20000, "failed", 0, null]);
    const result = await pg.query<{ raised: number }>(
      "SELECT SUM(CASE WHEN status='completed' THEN GREATEST(0,amount-refunded) ELSE 0 END)::integer AS raised FROM fundraising_contributions WHERE player_id='one'",
    );
    assert.equal(result.rows[0].raised, 4000);
    const defaults = await pg.query<{ approved: number; active: number }>(
      "SELECT approved,active FROM fundraising_players WHERE id='one'",
    );
    assert.deepEqual(defaults.rows[0], { approved: 0, active: 1 });
  } finally {
    await pg.close();
  }
});
