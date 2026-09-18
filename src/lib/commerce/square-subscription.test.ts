import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Square, SquareClient } from "square";
import type { Sql } from "../db";
import { syncSquareSubscription } from "./square-webhook.server";

test("subscription sync preserves scheduled actions and rejects stale or mismatched state", async (t) => {
  const db = new PGlite();
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + file, "utf8"));
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await db.query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment) values('order','order','parent','fixture@example.invalid','prospect','cage-plan','{}',7900,'paid','square','sandbox')`;
    await sql`insert into club_subscriptions(id,order_id,user_id,product_id,customer_id,status,amount_cents,payment_provider,provider_version) values('subscription','order','parent','prospect','customer','active',7900,'square',1)`;
    const config = { environment: "sandbox", locationId: "location" };
    const base: Square.Subscription = {
      id: "subscription",
      customerId: "customer",
      locationId: "location",
      status: "ACTIVE",
      version: 1n,
    };
    let response: Square.Subscription = base;
    let requestedActions = false;
    const client = {
      subscriptions: {
        get: async (request: { subscriptionId: string; include?: string }) => {
          assert.equal(request.subscriptionId, "subscription");
          requestedActions = request.include === "actions";
          // Square only returns scheduled actions when the caller includes them.
          return {
            subscription: { ...response, actions: requestedActions ? response.actions : undefined },
          };
        },
      },
    } as unknown as SquareClient;
    const deps = { sql, client, config };
    const current = async () =>
      (
        await sql<{
          status: string;
          version: string;
          cancel: boolean;
          action: string | null;
          date: string | null;
        }>`select status,provider_version::text as version,cancel_at_period_end as cancel,scheduled_action as action,action_effective_date::text as date from club_subscriptions where id='subscription'`
      )[0];

    await t.test("scheduled pause and resume dates are retrieved from Square", async () => {
      response = {
        ...base,
        actions: [
          { id: "pause", type: "PAUSE", effectiveDate: "2027-10-18" },
          { id: "resume", type: "RESUME", effectiveDate: "2027-11-18" },
        ],
      };
      await syncSquareSubscription("subscription", deps);
      assert.equal(requestedActions, true);
      assert.deepEqual(await current(), {
        status: "active",
        version: "1",
        cancel: false,
        action: "PAUSE",
        date: "2027-10-18",
      });
    });
    await t.test("same-version refresh can clear a removed scheduled action", async () => {
      response = { ...base, actions: [] };
      await syncSquareSubscription("subscription", deps);
      assert.equal((await current()).action, null);
      assert.equal((await current()).date, null);
    });
    await t.test(
      "a newer cancellation is preserved when an older response arrives later",
      async () => {
        let finishOld!: (value: { subscription: Square.Subscription }) => void;
        let started!: () => void;
        const oldStarted = new Promise<void>((resolve) => {
          started = resolve;
        });
        const oldResult = new Promise<{ subscription: Square.Subscription }>((resolve) => {
          finishOld = resolve;
        });
        const delayed = {
          subscriptions: {
            get: async () => {
              started();
              return oldResult;
            },
          },
        } as unknown as SquareClient;
        const oldSync = syncSquareSubscription("subscription", { ...deps, client: delayed });
        await oldStarted;
        response = {
          ...base,
          version: 3n,
          canceledDate: "2027-10-18",
          actions: [{ id: "cancel", type: "CANCEL", effectiveDate: "2027-10-18" }],
        };
        try {
          await syncSquareSubscription("subscription", deps);
        } finally {
          finishOld({ subscription: { ...base, version: 2n, status: "PAUSED", actions: [] } });
          await oldSync;
        }
        assert.deepEqual(await current(), {
          status: "active",
          version: "3",
          cancel: true,
          action: "CANCEL",
          date: "2027-10-18",
        });
      },
    );
    await t.test(
      "duplicate current versions are safe and later versions still advance",
      async () => {
        await syncSquareSubscription("subscription", deps);
        response = { ...base, version: 4n, status: "CANCELED", canceledDate: "2027-10-18" };
        await syncSquareSubscription("subscription", deps);
        assert.equal((await current()).status, "canceled");
        assert.equal((await current()).version, "4");
      },
    );
    await t.test(
      "wrong subscription, customer, location, or environment cannot change local state",
      async () => {
        const before = await current();
        for (const patch of [{ id: "other" }, { customerId: "other" }, { locationId: "other" }]) {
          response = { ...base, version: 5n, ...patch };
          await assert.rejects(
            syncSquareSubscription("subscription", deps),
            /verification|mismatch/,
          );
          assert.deepEqual(await current(), before);
        }
        response = { ...base, version: 5n };
        await assert.rejects(
          syncSquareSubscription("subscription", {
            ...deps,
            config: { ...config, environment: "production" },
          }),
          /environment mismatch/,
        );
        assert.deepEqual(await current(), before);
      },
    );
    await t.test(
      "incomplete provider response does not reset a confirmed state to pending",
      async () => {
        const before = await current();
        for (const patch of [{ version: undefined }, { status: undefined }]) {
          response = { ...base, version: 5n, ...patch };
          await assert.rejects(syncSquareSubscription("subscription", deps), /incomplete/);
          assert.deepEqual(await current(), before);
        }
      },
    );
  } finally {
    await db.close();
  }
});
