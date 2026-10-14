import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { shopCheckoutSchema, selectedLines, dollarsToCents } from "./contracts";
import {
  createShopQuote,
  publicShop,
  shopOrders,
  publishProduct,
  shopReadiness,
} from "./store.server";
import { processShopOrders } from "./fulfillment.server";
import { ProviderError, parseProduct, retailTax, type Provider } from "./provider.server";
import { fulfillSquarePayment } from "../commerce/square-payments.server";
async function fixture() {
  const db = new PGlite();
  const wrap = (q: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await q(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (text: string, values: unknown[] = []) =>
      (await q(text, values)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  const sql = wrap(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["coach", "coach"],
    ["other", "coach"],
    ["inactive", "coach"],
    ["parent", "parent"],
    ["player", "player"],
    ["fake", "admin"],
    ["coordinator", "parent"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"fam-" + id})`;
    if (role === "coach")
      await sql`insert into club_staff(id,user_id,name,email,role,active) values(${id},${id},${id},${id + "@example.invalid"},'coach',${id !== "inactive"})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  await sql`insert into registration_readers(user_id,email,active,granted_by,can_manage_tryouts) values('coordinator','coordinator@example.invalid',true,'owner',true)`;
  return { sql, db };
}

const variant = {
  id: 100,
  label: "Navy / M",
  priceCents: 5000,
  available: true,
  item: { variant_id: 200, files: [{ id: 300, type: "front" }], options: [] },
};
async function seed(sql: Sql) {
  await sql`insert into shop_products(id,title,image_url,variants,published,sample_approved,size_guide,updated_by) values('shirt','SYNTHETIC Shirt','https://example.invalid/shirt.jpg',${JSON.stringify([variant])}::jsonb,true,true,'Synthetic size guide','owner')`;
}
const request = () =>
  shopCheckoutSchema.parse({
    requestId: randomUUID(),
    cart: [{ productId: "shirt", variantId: 100, quantity: 2 }],
    address: {
      name: "Synthetic Parent",
      address1: "123 Test St",
      city: "Tulsa",
      state_code: "OK",
      country_code: "US",
      zip: "74101",
    },
    consent: true,
  });
const deps = {
  environment: "production",
  provider: (async () => ({
    costs: { currency: "USD", total: "45.00", shipping: "5.00" },
  })) as Provider,
  tax: async () => ({
    cents: 875,
    evidence: {
      provider: "Stripe Tax",
      calculationId: "taxcalc_synthetic",
      calculatedAt: "2099-01-01",
    },
  }),
};
async function paid(sql: Sql) {
  await seed(sql);
  const q = await createShopQuote(sql, "parent", request(), deps);
  await sql`update commerce_orders set square_customer_id='synthetic-customer' where id=${q.orderId}`;
  const payment = {
    id: randomUUID(),
    referenceId: q.orderId,
    locationId: "location",
    customerId: "synthetic-customer",
    amountMoney: { amount: BigInt(q.quote.totalCents), currency: "USD" as const },
    totalMoney: { amount: BigInt(q.quote.totalCents), currency: "USD" as const },
    sourceType: "CARD",
    status: "COMPLETED",
    createdAt: new Date().toISOString(),
  };
  await sql.transaction((tx) =>
    fulfillSquarePayment(tx, payment, { environment: "production", locationId: "location" }),
  );
  return { q, payment };
}
test("shop: authoritative totals, repeat request, access boundaries and existing payment ledger", async () => {
  const { db, sql } = await fixture();
  try {
    await seed(sql);
    const input = request();
    const q = await createShopQuote(sql, "parent", input, deps);
    assert.equal(q.quote.totalCents, 11375);
    assert.equal((await createShopQuote(sql, "parent", input, deps)).orderId, q.orderId);
    await assert.rejects(
      () =>
        createShopQuote(
          sql,
          "parent",
          { ...input, cart: [{ ...input.cart[0], quantity: 3 }] },
          deps,
        ),
      /does not match/,
    );
    await assert.rejects(() => createShopQuote(sql, "player", request(), deps), /Player accounts/);
    assert.equal((await shopOrders(sql, "other")).length, 0);
    await assert.rejects(() => shopOrders(sql, "other", true), /Owner/);
    assert.equal((await shopOrders(sql, "owner", true)).length, 1);
    const pub = await publicShop(sql);
    assert.equal(pub.checkout, false);
    assert.ok(!("item" in pub.products[0].variants[0]));
    assert.equal((await sql`select * from booking_records`).length, 0);
    await assert.rejects(
      () =>
        publishProduct(sql, "coach", {
          id: "shirt",
          revision: 1,
          description: "test",
          sizeGuide: "guide",
          teamLabel: "",
          category: "Shirts",
          taxCode: "txcd_00000000",
          sampleApproved: true,
          published: true,
        }),
      /Owner/,
    );
    await assert.rejects(
      () =>
        publishProduct(sql, "owner", {
          id: "shirt",
          revision: 1,
          description: "test",
          sizeGuide: "guide",
          teamLabel: "",
          category: "Shirts",
          taxCode: "txcd_00000000",
          sampleApproved: false,
          published: true,
        }),
      /sample/,
    );
    assert.throws(() => shopCheckoutSchema.parse({ ...input, totalCents: 1 }));
    assert.throws(() =>
      shopCheckoutSchema.parse({ ...input, cart: [input.cart[0], input.cart[0]] }),
    );
    await assert.rejects(
      () =>
        createShopQuote(sql, "parent", request(), {
          ...deps,
          provider: (async () => ({
            costs: { currency: "USD", total: "150.00", shipping: "5.00" },
          })) as Provider,
        }),
      /price review/,
    );
  } finally {
    await db.close();
  }
});
test("shop fulfillment: payment proof, duplicate events, draft recovery, cost guard and tracking", async () => {
  const { db, sql } = await fixture();
  try {
    const { q, payment } = await paid(sql);
    await sql.transaction((tx) =>
      fulfillSquarePayment(tx, payment, { environment: "production", locationId: "location" }),
    );
    assert.equal((await sql`select * from square_payments`).length, 1);
    assert.equal((await sql`select * from shop_order_details where status='queued'`).length, 1);
    let created = 0,
      confirmed = 0;
    let remote: Record<string, unknown> | undefined;
    const provider = (async (path: string, body?: Record<string, unknown>) => {
      if (path.startsWith("/orders/@")) {
        if (!remote) throw new ProviderError(404);
        return remote;
      }
      if (path === "/orders") {
        created++;
        remote = {
          id: 123,
          external_id: body!.external_id,
          status: "draft",
          costs: { currency: "USD", total: "45.00" },
        };
        throw new Error("Synthetic timeout AFTER vendor persisted draft");
      }
      if (path.endsWith("/confirm")) {
        confirmed++;
        remote = { ...remote, status: "pending" };
        return remote;
      }
      throw Error("Unexpected path");
    }) as Provider;
    await processShopOrders(sql, provider);
    await sql`update shop_order_details set next_attempt_at=now()`;
    await processShopOrders(sql, provider);
    assert.equal(created, 1);
    assert.equal(confirmed, 1);
    assert.equal((await sql`select status from shop_order_details`)[0].status, "submitted");
    remote = {
      ...remote,
      status: "fulfilled",
      shipments: [
        {
          id: 1,
          carrier: "Test carrier",
          tracking_number: "SYNTHETIC-TRACKING",
          tracking_url: "https://example.invalid/tracking",
        },
      ],
    };
    await sql`update shop_order_details set next_attempt_at=now()`;
    await processShopOrders(sql, provider);
    assert.equal((await shopOrders(sql, "parent"))[0].fulfillment_status, "shipped");
    assert.equal((await shopOrders(sql, "parent"))[0].shipments.length, 1);
    assert.equal((await sql`select * from booking_records`).length, 0);
    assert.ok(q.orderId);
  } finally {
    await db.close();
  }
});
test("shop: no fulfillment of unpaid/refunded orders; increased vendor cost never auto-confirmed", async () => {
  const { db, sql } = await fixture();
  try {
    const { q, payment } = await paid(sql);
    let confirmed = 0;
    const p = (async (path: string) => {
      if (path.endsWith("/confirm")) confirmed++;
      return {
        id: 99,
        external_id: q.orderId.replaceAll("-", ""),
        status: "draft",
        costs: { currency: "USD", total: "60.00" },
      };
    }) as Provider;
    await processShopOrders(sql, p);
    assert.equal(confirmed, 0);
    assert.equal((await sql`select status from shop_order_details`)[0].status, "review");
    await sql`update shop_order_details set status='queued',next_attempt_at=now()`;
    await sql.transaction((tx) =>
      fulfillSquarePayment(
        tx,
        { ...payment, refundedMoney: { amount: 100n, currency: "USD" } },
        { environment: "production", locationId: "location" },
      ),
    );
    assert.equal((await sql`select status from shop_order_details`)[0].status, "review");
    assert.equal((await processShopOrders(sql, p)).processed, 0);
    assert.equal(confirmed, 0);
  } finally {
    await db.close();
  }
});
test("shop configuration and product import reject incomplete manufacturing assets", () => {
  assert.equal(
    shopReadiness({ CONTEXT: "deploy-preview", MERCH_LIVE_ACCEPTED: "true" }).accepted,
    false,
  );
  assert.throws(() => dollarsToCents("NaN"));
  assert.throws(() => dollarsToCents("-1"));
  assert.throws(
    () =>
      parseProduct({
        sync_product: { id: 1, name: "test", thumbnail_url: "https://example.invalid/x" },
        sync_variants: [
          { id: 1, synced: true, currency: "USD", retail_price: "30.00", variant_id: 2, files: [] },
        ],
      }),
    /production files/,
  );
  assert.throws(
    () => selectedLines([], [{ productId: "x", variantId: 1, quantity: 1 }]),
    /no longer available/,
  );
});

test("retail tax: exclusive USD calculation, quantity, shipping and invalid provider results", async () => {
  const env = {
    SHOP_STRIPE_TAX_SECRET_KEY: "sk_live_SYNTHETIC_NOT_A_CREDENTIAL",
    SHOP_TAX_CONFIGURED: "true",
  };
  const items = [{ id: "fixture", quantity: 2, priceCents: 5000, taxCode: "txcd_00000000" }];
  const result = {
    id: "taxcalc_synthetic",
    currency: "usd",
    livemode: true,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    tax_amount_exclusive: 875,
    tax_amount_inclusive: 0,
    amount_total: 11375,
  };
  let calls = 0;
  const send: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.stripe.com/v1/tax/calculations");
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get("line_items[0][amount]"), "10000");
    assert.equal(body.get("line_items[0][quantity]"), "2");
    assert.equal(body.get("shipping_cost[amount]"), "500");
    return Response.json(result);
  };
  assert.equal((await retailTax(request().address, items, 500, env, send)).cents, 875);
  assert.equal(calls, 1);
  for (const patch of [
    { livemode: false },
    { currency: "cad" },
    { amount_total: 1 },
    { tax_amount_exclusive: -1 },
    { expires_at: 0 },
  ])
    await assert.rejects(
      () =>
        retailTax(request().address, items, 500, env, async () =>
          Response.json({ ...result, ...patch }),
        ),
      /verified/,
    );
  await assert.rejects(
    () =>
      retailTax(
        request().address,
        items,
        500,
        { ...env, SHOP_STRIPE_TAX_SECRET_KEY: "sk_test_synthetic" },
        send,
      ),
    /not ready/,
  );
  await assert.rejects(
    () => retailTax(request().address, [{ ...items[0], taxCode: "" }], 500, env, send),
    /category/,
  );
  assert.equal(calls, 1);
});

test("product import preserves approved placement and file options and rejects partial artwork", () => {
  const file = {
    id: 300,
    type: "front",
    status: "ok",
    position: { area_width: 1800, area_height: 2400, width: 900, height: 900, top: 100, left: 300 },
    options: [{ id: "template_type", value: "native" }],
  };
  const raw = {
    sync_product: { id: 1, name: "Synthetic", thumbnail_url: "https://example.invalid/mockup" },
    sync_variants: [
      {
        id: 100,
        name: "M",
        synced: true,
        currency: "USD",
        retail_price: "30.00",
        variant_id: 200,
        files: [file],
      },
    ],
  };
  const imported = parseProduct(raw).variants[0].item.files[0];
  assert.deepEqual(imported.position, file.position);
  assert.deepEqual(imported.options, file.options);
  raw.sync_variants[0].files.push({ ...file, id: 301, type: "sleeve_left", status: "waiting" });
  assert.throws(() => parseProduct(raw), /production files/);
});
