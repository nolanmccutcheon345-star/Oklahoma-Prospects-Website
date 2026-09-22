import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { db } from "./server";
import { syncContribution, syncPayment } from "./square";

test("a failed payment attempt cannot block a later verified payment or its refunds", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      'CREATE TABLE "user"(id text PRIMARY KEY); INSERT INTO "user" VALUES(\'parent\')',
    );
    await pg.exec(
      await readFile(
        new URL("../../../migrations/0027_player_fundraising.sql", import.meta.url),
        "utf8",
      ),
    );
    await pg.exec(
      "INSERT INTO fundraising_players(id,owner_id,parent_email,name,team,goal,story,created) VALUES('player','parent','parent@example.invalid','Test','13U',100000,'Test','2026-01-01'); INSERT INTO fundraising_contributions(id,player_id,donor,email,amount,order_id,created) VALUES('contribution','player','Test','test@example.invalid',5000,'order','2026-01-01')",
    );
    const database: typeof db = () => ({
      prepare(query: string) {
        let params: unknown[] = [];
        const stmt = {
          bind(...values: unknown[]) {
            params = values;
            return stmt;
          },
          async all<T = Record<string, unknown>>() {
            return { results: (await pg.query<T>(query, params)).rows };
          },
          async first<T = Record<string, unknown>>() {
            return (await stmt.all<T>()).results[0] ?? null;
          },
          async run() {
            await stmt.all();
          },
        };
        return stmt;
      },
    });
    let refunded = 0;
    const requests: string[] = [];
    const deps = {
      db: database,
      config: () => ({ SQUARE_LOCATION_ID: "location" }),
      square: async (path: string) => {
        requests.push(path);
        if (path === "/orders/order")
          return {
            order: {
              id: "order",
              reference_id: "contribution",
              location_id: "location",
              tenders: [{ payment_id: "success" }],
            },
          };
        const id = path.slice("/payments/".length);
        assert.ok(["failed", "success", "other"].includes(id));
        return {
          payment: {
            id,
            order_id: "order",
            location_id: "location",
            amount_money: { amount: 5000, currency: "USD" },
            status: id === "failed" ? "FAILED" : "COMPLETED",
            refunded_money: { amount: id === "success" ? refunded : 0, currency: "USD" },
          },
        };
      },
    };
    const row = async () =>
      (
        await pg.query<{ status: string; payment_id: string; refunded: number }>(
          "SELECT status,payment_id,refunded FROM fundraising_contributions WHERE id='contribution'",
        )
      ).rows[0];
    await syncPayment("failed", deps);
    assert.equal((await row()).status, "failed");
    // A later successful webhook must replace the failed attempt's identity.
    await syncPayment("success", deps);
    assert.deepEqual(await row(), { status: "completed", payment_id: "success", refunded: 0 });
    // Older failed events or a different successful payment cannot take attribution.
    await syncPayment("failed", deps);
    await syncPayment("other", deps);
    assert.equal((await row()).payment_id, "success");
    refunded = 5000;
    await syncPayment("success", deps);
    refunded = 0;
    await syncPayment("success", deps);
    assert.equal((await row()).refunded, 5000);
    // Missed successful webhook: receipt/office recovery must inspect the order too.
    await pg.exec(
      "UPDATE fundraising_contributions SET status='failed',payment_id='failed',refunded=0",
    );
    requests.length = 0;
    await syncContribution("contribution", deps);
    assert.ok(requests.includes("/orders/order"));
    assert.deepEqual(await row(), { status: "completed", payment_id: "success", refunded: 0 });
    const total = (
      await pg.query<{ raised: number }>(
        "SELECT SUM(CASE WHEN status='completed' THEN amount-refunded ELSE 0 END)::integer AS raised FROM fundraising_contributions",
      )
    ).rows[0].raised;
    assert.equal(total, 5000);
  } finally {
    await pg.close();
  }
});
