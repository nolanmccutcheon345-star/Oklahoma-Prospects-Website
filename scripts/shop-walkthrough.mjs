// Real built application, disposable database and synthetic requests only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { chromium } from "playwright";
import { toJSONAsync } from "seroval";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { auditHarness } from "./audit-support.mjs";
const h = await auditHarness();
const output = "artifacts/shop";
await mkdir(output, { recursive: true });
let browser, socket;
const errors = [];
// PGlite's socket bridge shares prepared-statement state across virtual clients.
// Queue synthetic HTTP handling; this walkthrough verifies UI flows, while the
// PostgreSQL CI job separately exercises real concurrent transactions and locks.
let requestQueue = Promise.resolve();
function fixtureRequest(work) {
  const next = requestQueue.then(work);
  requestQueue = next.catch(() => {});
  return next;
}
try {
  socket = new PGLiteSocketServer({ db: h.db, host: "127.0.0.1", port: 0, maxConnections: 20 });
  await socket.start();
  process.env.DATABASE_URL = "postgresql://postgres@" + socket.getServerConn() + "/postgres";
  const handler = (await import("../.netlify/v1/functions/server.mjs")).default;
  browser = await chromium.launch({
    executablePath: process.env.LESSON_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--single-process", "--no-zygote"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && /\.(js|css|woff2)(\?|$)/.test(r.url()))
      errors.push(`Asset ${r.status()} ${new URL(r.url()).pathname}`);
  });
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin !== h.base) return route.abort();
    const root = resolve("dist/client"),
      path = resolve(root, "." + url.pathname);
    if (path.startsWith(root + "/"))
      try {
        const body = await readFile(path);
        return route.fulfill({
          body,
          contentType:
            {
              ".js": "application/javascript",
              ".css": "text/css",
              ".png": "image/png",
              ".jpg": "image/jpeg",
              ".webp": "image/webp",
              ".svg": "image/svg+xml",
              ".woff2": "font/woff2",
              ".ico": "image/x-icon",
            }[extname(path)] || "application/octet-stream",
        });
      } catch {
        /* Non-static paths are handled by the real application below. */
      }
    const response = await fixtureRequest(async () =>
      handler(
        new Request(req.url(), {
          method: req.method(),
          headers: { ...(await req.allHeaders()), "x-nf-client-connection-ip": "192.0.2.90" },
          ...(!["GET", "HEAD"].includes(req.method()) ? { body: req.postDataBuffer() } : {}),
        }),
      ),
    );
    const headers = Object.fromEntries(response.headers);
    if (response.headers.getSetCookie().length)
      headers["set-cookie"] = response.headers.getSetCookie().join("\n");
    return route.fulfill({
      status: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    });
  });

  async function assertPublicShop() {
    assert.equal(
      await page.getByRole("button", { name: "Shop owner controls", exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByRole("heading", { name: "Shop owner controls", exact: true }).count(),
      0,
    );
    assert.equal(
      await page
        .getByText("I approved the physical sample and production artwork", { exact: true })
        .count(),
      0,
    );
    assert.equal(await page.getByLabel("New product title", { exact: true }).count(), 0);
    assert.equal(await page.locator('a[href^="/merchandise/draft-"]').count(), 0);
  }
  await page.goto(h.base + "/merchandise");
  await page.getByRole("heading", { name: "Our first collection is taking shape." }).waitFor();
  await assertPublicShop();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `shop overflow ${width}`,
    );
    await page.screenshot({ path: output + `/lookbook-${width}.png`, fullPage: true });
  }
  const variants = [
    {
      id: 100,
      label: "Navy / M",
      priceCents: 5000,
      vendorCostCents: 2000,
      available: true,
      item: { variant_id: 200, files: [{ id: 300, type: "front" }], options: [] },
    },
    {
      id: 101,
      label: "Navy / L",
      priceCents: 5200,
      vendorCostCents: 2200,
      available: true,
      item: { variant_id: 201, files: [{ id: 300, type: "front" }], options: [] },
    },
  ];
  await h.sql`insert into shop_products(id,title,description,image_url,variants,size_guide,updated_by,published,sample_approved,provider,provider_product_id,pricing_mode) values('fixture-shop','SYNTHETIC Test Hoodie','Synthetic product for browser verification only.','/images/shop/starting-collection.jpg',${JSON.stringify(variants)}::jsonb,'Synthetic guide only.','fixture-owner',true,true,'printify','synthetic-product','default')`;
  await page.reload();
  await page.getByRole("heading", { name: "SYNTHETIC Test Hoodie", exact: true }).waitFor();
  await page.getByRole("link", { name: "View product details", exact: true }).click();
  await page.waitForURL(h.base + "/merchandise/fixture-shop");
  await page.getByRole("link", { name: "Back to the collection" }).waitFor();
  await assertPublicShop();
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "product detail reflows",
  );
  await page.getByLabel("Color / size", { exact: true }).selectOption("101");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("button", { name: "Bag (1)", exact: true }).click();
  await page.getByText("SYNTHETIC Test Hoodie · Navy / L", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: /^Pay / }).count(),
    0,
    "disabled shop cannot collect payment",
  );
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.reload();
  await page.getByRole("button", { name: "Bag (2)", exact: true }).click();
  assert.equal(await page.getByLabel("Quantity", { exact: true }).inputValue(), "2");
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `bag overflow ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: output + "/bag-mobile.png", fullPage: true });
  assert.equal(
    await page.getByRole("button", { name: "Shop owner controls", exact: true }).count(),
    0,
    "owner controls hidden from guests",
  );
  await page.getByRole("button", { name: "Remove SYNTHETIC Test Hoodie", exact: true }).click();
  await page.getByText("Your bag is empty.", { exact: true }).waitFor();
  const password = randomUUID() + "Aa9!",
    hashed = await hashPassword(password);
  await h.sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values('fixture-owner','shop-owner@example.invalid','SYNTHETIC Shop Owner',true,now(),now())`;
  await h.sql`insert into account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values('fixture-owner','fixture-owner','credential','fixture-owner',${hashed},now(),now())`;
  await h.sql`insert into profiles(user_id,email,name,role,family_id) values('fixture-owner','shop-owner@example.invalid','SYNTHETIC Shop Owner','admin','fixture-shop-family')`;
  await h.sql`insert into owner_grants(email,user_id) values('shop-owner@example.invalid','fixture-owner')`;
  await h.sql`insert into club_state(id,payload,rev) values('oklahoma-prospects',${JSON.stringify(h.api.emptyClub())}::jsonb,1)`;
  // Exercise the compiled HTTP boundary, not only the absence of a button.
  const manifest = await readFile("dist/server/server.js", "utf8");
  const ids = new Map(
    [
      ...manifest.matchAll(
        /"([a-f0-9]{64})":\s*\{\s*functionName: "([^"]+)_createServerFn_handler"/g,
      ),
    ].map((m) => [m[2], m[1]]),
  );
  async function rpc(cookie, name, method = "GET", data) {
    assert.ok(ids.has(name), `Missing compiled function ${name}`);
    const payload = data === undefined ? undefined : JSON.stringify(await toJSONAsync({ data }));
    return fixtureRequest(async () => {
      const r = await handler(
        new Request(h.base + "/_serverFn/" + ids.get(name), {
          method,
          headers: {
            cookie,
            origin: h.base,
            "sec-fetch-site": "same-origin",
            "x-tsr-serverFn": "true",
            accept: "application/json",
            "content-type": "application/json",
          },
          ...(method === "POST" ? { body: payload } : {}),
        }),
      );
      return { status: r.status, body: await r.text() };
    });
  }
  async function loginCookie(email) {
    const r = await handler(
      new Request(h.base + "/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          origin: h.base,
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ email, password }),
      }),
    );
    assert.equal(r.status, 200, await r.text());
    return r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }
  const deniedCookies = [""];
  for (const role of ["parent", "coach", "admin"]) {
    const id = "fixture-nonowner-" + role,
      email = id + "@example.invalid";
    await h.sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${email},${id},true,now(),now())`;
    await h.sql`insert into account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values(${id},${id},'credential',${id},${hashed},now(),now())`;
    await h.sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${email},${id},${role},${id})`;
    deniedCookies.push(await loginCookie(email));
  }
  for (const cookie of deniedCookies) {
    const denied = await rpc(cookie, "getShopOffice");
    assert.match(denied.body, /Sign in|Owner access required/);
    assert.doesNotMatch(denied.body, /vendorCostCents|default_markup_bps|SYNTHETIC Test Hoodie/);
    const mutation = await rpc(cookie, "createShopDraft", "POST", {
      title: "UNAUTHORIZED SHOP DRAFT",
    });
    assert.match(mutation.body, /Sign in|Owner access required/);
  }
  assert.equal(
    (await h.sql`select id from shop_products where title='UNAUTHORIZED SHOP DRAFT'`).length,
    0,
  );
  const ownerCookie = await loginCookie("shop-owner@example.invalid");
  assert.match((await rpc(ownerCookie, "getShopOffice")).body, /vendorCostCents/);
  const ready = page.waitForResponse((r) => r.url().includes("/api/auth/get-session"));
  await page.goto(h.base + "/login?next=%2Foffice%3Fsection%3Dshop");
  await ready;
  await page.getByLabel("Email", { exact: true }).fill("shop-owner@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(h.base + "/office?section=shop");
  await page.getByText("Fulfill Engine connection & launch", { exact: true }).waitFor();
  assert.equal(
    (
      await h.sql`select id from shop_products where id like 'launch-%' and not published and variants='[]'::jsonb`
    ).length,
    6,
  );
  await h.sql`delete from shop_products where id like 'launch-%'`;
  await page.reload();
  await page.getByRole("button", { name: "Save product", exact: true }).waitFor();
  await page.getByLabel("Description", { exact: true }).fill("SYNTHETIC owner saved description");
  await page.getByLabel("Stripe Tax product category code", { exact: true }).fill("txcd_00000000");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(
    (await h.sql`select description from shop_products where id='fixture-shop'`)[0].description,
    "SYNTHETIC owner saved description",
  );
  await page.getByLabel("Fulfill Engine product ID", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Import product", exact: true }).click();
  await page
    .getByText(
      "Fulfill Engine is not connected. Complete the Platform Connect account request first.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    (await h.sql`select id from shop_products`).length,
    1,
    "disconnected import creates no fake products",
  );
  await page.getByLabel("Fixed retail override Navy / M", { exact: true }).fill("32");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  await page.getByLabel("Default markup on vendor cost (%)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save store pricing", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  const [priced] = await h.sql`select variants from shop_products where id='fixture-shop'`;
  assert.equal(priced.variants[0].priceCents, 3200);
  assert.equal(priced.variants[1].priceCents, 4400);
  await page.getByLabel("New product title", { exact: true }).fill("SYNTHETIC Photo Draft");
  await page.getByRole("button", { name: "Create product draft", exact: true }).click();
  const draft = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "SYNTHETIC Photo Draft", exact: true }) });
  await draft.getByRole("heading", { name: "SYNTHETIC Photo Draft", exact: true }).waitFor();
  const source = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 800;
    const x = c.getContext("2d");
    x.fillStyle = "#0b223a";
    x.beginPath();
    x.moveTo(180, 120);
    x.lineTo(70, 200);
    x.lineTo(140, 310);
    x.lineTo(190, 280);
    x.lineTo(190, 650);
    x.lineTo(410, 650);
    x.lineTo(410, 280);
    x.lineTo(460, 310);
    x.lineTo(530, 200);
    x.lineTo(420, 120);
    x.closePath();
    x.fill();
    return c.toDataURL("image/png").split(",")[1];
  });
  await draft.getByLabel("Upload product photo", { exact: true }).setInputFiles({
    name: "synthetic-shirt.png",
    mimeType: "image/png",
    buffer: Buffer.from(source, "base64"),
  });
  await draft.getByRole("button", { name: "Use prepared photo", exact: true }).waitFor();
  await draft.getByRole("img", { name: "Prepared product photo preview", exact: true }).waitFor();
  assert.equal(
    await draft
      .getByRole("img", { name: "Prepared product photo preview", exact: true })
      .evaluate((img) => img.naturalWidth),
    1000,
  );
  await draft.getByRole("button", { name: "Use prepared photo", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  const [savedDraft] = await h.sql`select * from shop_products where title='SYNTHETIC Photo Draft'`;
  assert.equal(savedDraft.gallery.length, 1);
  assert.equal(savedDraft.image_approved, true);
  const privateImage = await handler(new Request(h.base + savedDraft.gallery[0].url));
  assert.equal(privateImage.status, 404, "draft product images stay private");
  // Customize navigation and publish a display-only product through the real owner UI.
  await page.getByLabel("Choice 1 in Collections", { exact: true }).fill("Headwear");
  await page.getByRole("button", { name: "Save shop collections & filters", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(
    (await h.sql`select navigation from shop_settings where id=1`)[0].navigation[0].options[0]
      .label,
    "Headwear",
  );
  // Match a new photo-only product: no description or separate Publish checkbox.
  await draft.getByLabel("Headwear", { exact: true }).check();
  await draft.getByLabel("Softball", { exact: true }).check();
  await draft.getByLabel("Youth", { exact: true }).check();
  await draft.getByLabel("Shop status", { exact: true }).selectOption("coming-soon");
  await draft.getByRole("button", { name: "Save product", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  const [previewProduct] = await h.sql`select * from shop_products where id=${savedDraft.id}`;
  assert.equal(previewProduct.coming_soon, true);
  assert.equal(previewProduct.published, true);
  assert.equal(previewProduct.sample_approved, false);
  assert.equal(previewProduct.variants.length, 0);
  assert.equal(
    (await handler(new Request(h.base + savedDraft.gallery[0].url))).status,
    200,
    "coming soon image is public",
  );
  await page.goto(h.base + "/merchandise");
  await page.getByRole("heading", { name: "Wear the colors.", exact: true }).waitFor();
  await assertPublicShop();
  await page.getByRole("button", { name: /^Headwear \(1\)$/ }).click();
  await page.getByLabel("Sport", { exact: true }).selectOption("softball");
  await page.getByLabel("Age group", { exact: true }).selectOption("youth");
  const previewCard = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "SYNTHETIC Photo Draft", exact: true }) });
  await previewCard.getByText("Coming soon · Not available to order", { exact: true }).waitFor();
  assert.equal(
    await previewCard.getByRole("button", { name: "Coming soon", exact: true }).isDisabled(),
    true,
  );
  assert.equal(await previewCard.getByLabel("Color / size", { exact: true }).count(), 0);
  assert.equal(
    await page.getByRole("heading", { name: "SYNTHETIC Test Hoodie", exact: true }).count(),
    0,
  );
  await page.getByLabel("Sport", { exact: true }).selectOption("baseball");
  await page
    .getByText("No products match these filters. Try another collection or clear the filters.", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  const publicHref = await previewCard
    .getByRole("link", { name: "View product details", exact: true })
    .getAttribute("href");
  assert.match(publicHref, /^\/merchandise\/product-[a-f0-9]{20}$/);
  // No product record was renamed merely to produce a safe public URL.
  assert.ok(savedDraft.id.startsWith("draft-"));
  for (const path of ["/merchandise/" + savedDraft.id, "/merchandise/not-published"]) {
    const r = await fixtureRequest(async () => {
      const response = await handler(new Request(h.base + path));
      return { status: response.status, body: await response.text() };
    });
    assert.equal(r.status, 404, path);
    assert.doesNotMatch(
      r.body,
      /SYNTHETIC Photo Draft|Shop owner controls|physical sample and production artwork/,
    );
  }
  await previewCard.getByRole("link", { name: "View product details", exact: true }).click();
  await page.getByText("Coming soon · Not available to order", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Coming soon", exact: true }).isDisabled(),
    true,
  );
  await assertPublicShop();
  assert.equal(
    await page.getByText(/Infinity|NaN/).count(),
    0,
    "preview without variants has no invalid price",
  );
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "coming soon detail reflow " + width,
    );
  }
  // Re-check the same public preview with no owner session.
  await page.context().clearCookies();
  await page.reload();
  await page.getByText("Coming soon · Not available to order", { exact: true }).waitFor();
  await assertPublicShop();
  await page.goBack();
  await page.goForward();
  await page.getByText("Coming soon · Not available to order", { exact: true }).waitFor();
  await assertPublicShop();
  await page.goto(h.base + "/office?section=shop");
  await page.waitForURL(/\/login/);
  assert.equal(
    await page.getByRole("heading", { name: "Shop owner controls", exact: true }).count(),
    0,
  );
  await page.getByLabel("Email", { exact: true }).fill("shop-owner@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(h.base + "/office?section=shop");
  await draft.getByRole("button", { name: "Remove product from shop", exact: true }).click();
  await draft.getByRole("button", { name: "Confirm archive", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(
    (await h.sql`select archived from shop_products where id=${savedDraft.id}`)[0].archived,
    true,
  );
  const archivedResponse = await fixtureRequest(async () => {
    const response = await handler(new Request(h.base + publicHref));
    await response.text();
    return response.status;
  });
  assert.equal(archivedResponse, 404, "archived product public alias is unavailable");
  await page.getByLabel("Show archived products", { exact: true }).check();
  await draft.getByRole("button", { name: "Restore as draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(
    (await h.sql`select published from shop_products where id=${savedDraft.id}`)[0].published,
    false,
  );
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "owner studio overflow " + width,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: output + "/owner-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS public routes contain no owner controls, raw draft routes return 404, guest/non-owner RPC denied, real owner Office Shop preserved; shop lookbook, variant/quantity/cart persistence, mobile reflow, guest privacy, owner CRUD/pricing, photo normalization/private images, product detail, custom collections, combined filters, coming-soon publication/images/detail and disabled-payment guard.",
  );
} catch (e) {
  if (browser)
    for (const context of browser.contexts())
      for (const page of context.pages())
        console.error(
          "Failure page:",
          await page
            .locator("body")
            .innerText()
            .catch(() => "Unavailable"),
        );
  console.error(e);
  throw e;
} finally {
  if (browser) await browser.close();
  if (socket) {
    const deadline = Date.now() + 15000;
    while (socket.getStats().activeConnections && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 100));
    await socket.stop();
  }
  delete process.env.DATABASE_URL;
  await h.close();
}
