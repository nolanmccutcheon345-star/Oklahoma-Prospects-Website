import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { paymentReady, db } from "./server";
import { POST as checkout } from "./checkout";
import { reconcileContributions } from "./reconcile";

test("checkout fails closed when the fundraising ledger is disabled", async () => {
  const fixture = {
    CONTEXT: "production",
    SQUARE_DEPLOY_CONTEXT: "production",
    SQUARE_ENVIRONMENT: "production",
    SQUARE_CHECKOUT_SCOPE: "all",
    SQUARE_LIVE_ENABLED: "true",
    SQUARE_SANDBOX_VERIFIED: "true",
    SQUARE_PRODUCTION_APPLICATION_ID: "sq0idp-fixture",
    SQUARE_PRODUCTION_LOCATION_ID: "location",
    SQUARE_PRODUCTION_MERCHANT_ID: "merchant",
    SQUARE_PRODUCTION_ACCESS_TOKEN: "offline-fixture",
    SQUARE_PRODUCTION_WEBHOOK_SIGNATURE_KEY: "offline-signature",
    SQUARE_PRODUCTION_WEBHOOK_URL: "https://fixture.example.invalid/api/square/webhook",
    APP_BASE_URL: "https://fixture.example.invalid",
    FUNDRAISING_PAYMENTS_ENABLED: "true",
    FUNDRAISING_LEDGER_ENABLED: "true",
    FUNDRAISING_SANDBOX_VERIFIED: "true",
  };
  const previous = Object.fromEntries(Object.keys(fixture).map((key) => [key, process.env[key]]));
  Object.assign(process.env, fixture);
  try {
    assert.equal(paymentReady(), true);
    for (const key of [
      "FUNDRAISING_PAYMENTS_ENABLED",
      "FUNDRAISING_LEDGER_ENABLED",
      "FUNDRAISING_SANDBOX_VERIFIED",
    ]) {
      for (const value of [undefined, "false"]) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
        assert.equal(paymentReady(), false, `${key}=${value}`);
        // The real checkout handler must reject before any DB or Square operation.
        const response = await checkout(
          new Request("https://fixture.example.invalid/api/fundraising/checkout", {
            method: "POST",
            headers: {
              origin: "https://fixture.example.invalid",
              "content-type": "application/json",
            },
            body: "{}",
          }),
        );
        assert.equal(response.status, 503);
        assert.match((await response.json()).error, /Online sponsorships are not open yet/);
      }
      process.env[key] = "true";
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("reconciliation advances past unpaid and failing checkouts to later payments", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "CREATE TABLE fundraising_contributions(id text PRIMARY KEY,order_id text,created text,checked text,status text DEFAULT 'pending')",
    );
    await pg.exec(
      "INSERT INTO fundraising_contributions(id,order_id,created) SELECT 'old-'||lpad(i::text,2,'0'),'order-'||i,'2026-01-01T00:00:00.000Z' FROM generate_series(1,50) i; INSERT INTO fundraising_contributions(id,order_id,created) VALUES('new-payment','new-order','2026-01-02T00:00:00.000Z')",
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
    const seen: string[] = [];
    const sync = async (id: string) => {
      seen.push(id);
      if (id === "old-01") throw new Error("Square temporarily unavailable");
      // Unpaid hosted checkout has no tenders and cannot update payment status.
      return null;
    };
    const first = await reconcileContributions({ db: database, syncContribution: sync });
    assert.deepEqual(first, { checked: 49, errors: 1 });
    assert.equal(seen.includes("new-payment"), false);
    seen.length = 0;
    await reconcileContributions({ db: database, syncContribution: sync });
    assert.equal(seen[0], "new-payment");
    assert.equal(
      (
        await pg.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM fundraising_contributions WHERE checked IS NULL",
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await pg.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM fundraising_contributions WHERE status<>'pending'",
        )
      ).rows[0].count,
      0,
    );
  } finally {
    await pg.close();
  }
});
