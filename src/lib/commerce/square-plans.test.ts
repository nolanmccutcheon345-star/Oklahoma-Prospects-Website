import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import type { SquareClient, Square } from "square";
import { PRICES } from "../pricing";
import { prepareMonthlyPlans, savedPlan, assertMonthlyPlan, MONTHLY_PLANS } from "./square-plans.server";

test("monthly setup verifies price, persists scoped mappings, retries without duplicating and isolates production setup", async () => {
  const db = new PGlite();
  await db.exec(
    "create table commerce_policy(id text primary key,value jsonb,updated_by text,updated_at timestamptz default now())",
  );
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await db.query(
        parts.reduce((out, part, i) => out + (i ? `$${i}` : "") + part, ""),
        values,
      )
    ).rows) as Sql;
  await db.exec("create table club_services(id text primary key,name text,price numeric,kind text,active boolean default true,sort_order int default 0)");
  for (const [i,p] of MONTHLY_PLANS.entries()) await db.query("insert into club_services(id,name,price,kind,sort_order) values($1,$2,$3,'membership',$4)",[p.id,p.name,PRICES[p.id]/100,i]);
  const c = { environment: "sandbox" as const, merchantId: "merchant", locationId: "location" };
  const objects = new Map<string, Square.CatalogObject>(),
    keys = new Map<string, string>();
  let creates = 0;
  const client = {
    locations: {
      get: async () => ({
        location: {
          merchantId: "merchant",
          status: "ACTIVE",
          currency: "USD",
          timezone: "America/Chicago",
          capabilities: ["CREDIT_CARD_PROCESSING"],
        },
      }),
    },
    catalog: {
      object: {
        upsert: async ({
          idempotencyKey,
          object,
        }: {
          idempotencyKey: string;
          object: Square.CatalogObject;
        }) => {
          let id = keys.get(idempotencyKey);
          if (!id) {
            id = `variation-${++creates}`;
            keys.set(idempotencyKey, id);
            assert.equal(object.type, "SUBSCRIPTION_PLAN");
            if (object.type === "SUBSCRIPTION_PLAN")
              objects.set(id, {
                ...object.subscriptionPlanData!.subscriptionPlanVariations![0],
                id,
              });
          }
          return { idMappings: [{ clientObjectId: "#monthly", objectId: id }] };
        },
        get: async ({ objectId }: { objectId: string }) => ({ object: objects.get(objectId) }),
      },
    },
  } as unknown as SquareClient;
  try {
    const result = await prepareMonthlyPlans(sql, client, c, "owner", () => undefined);
    assert.equal(result.filter((r) => r.ready).length, 8);
    assert.equal(creates, 8);
    assert.equal(await savedPlan(sql, c, "prospect"), "variation-1");
    assert.equal(await savedPlan(sql, { ...c, merchantId: "other" }, "prospect"), undefined);
    assert.equal(await savedPlan(sql, { ...c, environment: "production" }, "prospect"), undefined);
    await prepareMonthlyPlans(sql, client, c, "owner", () => undefined);
    assert.equal(creates, 8);
    const live = await prepareMonthlyPlans(
      sql,
      client,
      { ...c, environment: "production" },
      "owner",
      () => undefined,
    );
    assert.equal(live.filter((r) => r.ready).length, 8);
    assert.equal(creates, 16);
    assert.equal(
      await savedPlan(sql, { ...c, environment: "production" }, "prospect"),
      "variation-9",
    );
    assert.equal(await savedPlan(sql, c, "prospect"), "variation-1");
    // Provider success followed by missing local mapping recovers the same idempotent object.
    await db.exec("delete from commerce_policy");
    await prepareMonthlyPlans(sql, client, c, "owner", () => undefined);
    assert.equal(creates, 16);
    const p = objects.get("variation-1")!;
    assertMonthlyPlan(p, 8200);
    assert.throws(() => assertMonthlyPlan(p, 13900), /approved monthly price/);
    assert.throws(
      () => assertMonthlyPlan({ ...p, presentAtAllLocations: false }, 8200),
      /approved monthly price/,
    );
    assert.throws(
      () => assertMonthlyPlan({ ...p, isDeleted: true }, 8200),
      /approved monthly price/,
    );
    // An admin price edit creates a new variation; original plan remains unchanged.
    await db.exec("update club_services set price=99.25,name='Renamed pass' where id='prospect'");
    assert.equal(await savedPlan(sql,c,"prospect"),undefined);
    const changed=await prepareMonthlyPlans(sql,client,c,"owner",id=>id==="prospect"?"variation-1":undefined);
    assert.equal(changed[0].cents,9925);
    assert.equal(changed[0].ready,true);
    assert.equal(creates,17);
    assertMonthlyPlan(objects.get("variation-1"),8200);
    assertMonthlyPlan(objects.get(await savedPlan(sql,c,"prospect") as string),9925);
    await db.exec("update commerce_policy set value=jsonb_set(value,'{cents}','1')");
    assert.equal(await savedPlan(sql, c, "prospect"), undefined);
  } finally {
    await db.close();
  }
});
