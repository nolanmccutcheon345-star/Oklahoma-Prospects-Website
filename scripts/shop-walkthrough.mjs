// Real built application, disposable database and synthetic requests only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { chromium } from "playwright";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { auditHarness } from "./audit-support.mjs";
const h = await auditHarness();
const output = "artifacts/shop";
await mkdir(output, { recursive: true });
let browser, socket;
const errors = [];
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
    const response = await handler(
      new Request(req.url(), {
        method: req.method(),
        headers: { ...(await req.allHeaders()), "x-nf-client-connection-ip": "192.0.2.90" },
        ...(!["GET", "HEAD"].includes(req.method()) ? { body: req.postDataBuffer() } : {}),
      }),
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

  await page.goto(h.base + "/merchandise");
  await page.getByRole("heading", { name: "Our first collection is taking shape." }).waitFor();
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
      available: true,
      item: { variant_id: 200, files: [{ id: 300, type: "front" }], options: [] },
    },
    {
      id: 101,
      label: "Navy / L",
      priceCents: 5200,
      available: true,
      item: { variant_id: 201, files: [{ id: 300, type: "front" }], options: [] },
    },
  ];
  await h.sql`insert into shop_products(id,title,description,image_url,variants,size_guide,updated_by,published,sample_approved) values('fixture-shop','SYNTHETIC Test Hoodie','Synthetic product for browser verification only.','/images/shop/starting-collection.jpg',${JSON.stringify(variants)}::jsonb,'Synthetic guide only.','fixture-owner',true,true)`;
  await page.reload();
  await page.getByRole("heading", { name: "SYNTHETIC Test Hoodie", exact: true }).waitFor();
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
  const ready = page.waitForResponse((r) => r.url().includes("/api/auth/get-session"));
  await page.goto(h.base + "/login?next=%2Fmerchandise");
  await ready;
  await page.getByLabel("Email", { exact: true }).fill("shop-owner@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(h.base + "/merchandise");
  await page.getByRole("button", { name: "Shop owner controls", exact: true }).click();
  await page.getByRole("button", { name: "Save product", exact: true }).waitFor();
  await page.getByLabel("Description", { exact: true }).fill("SYNTHETIC owner saved description");
  await page.getByLabel("Stripe Tax product category code", { exact: true }).fill("txcd_00000000");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(
    (await h.sql`select description from shop_products where id='fixture-shop'`)[0].description,
    "SYNTHETIC owner saved description",
  );
  await page.getByLabel("Printful sync product ID", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Import product", exact: true }).click();
  await page.getByText("Fulfillment is not connected.", { exact: true }).waitFor();
  assert.equal(
    (await h.sql`select id from shop_products`).length,
    1,
    "disconnected import creates no fake products",
  );
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "owner controls reflow",
  );
  await page.screenshot({ path: output + "/owner-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS shop lookbook, variant/quantity/cart persistence, mobile reflow, guest privacy, owner save/import forms and disabled-payment guard.",
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
