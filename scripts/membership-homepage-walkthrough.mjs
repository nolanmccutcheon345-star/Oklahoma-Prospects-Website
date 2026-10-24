// Real built application, disposable database and synthetic requests only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { auditHarness } from "./audit-support.mjs";
const h = await auditHarness();
const output = "artifacts/membership";
await mkdir(output, { recursive: true });
let browser, socket, page;
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
  page = await browser.newPage();
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

  const password = randomUUID() + "Fixture!";
  const signup = await h.api.handleAuthRequest(
    new Request(h.base + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: h.base, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Synthetic Website Owner",
        email: "website-owner@audit.example.invalid",
        password,
      }),
    }),
  );
  assert.equal(signup.status, 200);
  const owner = (await signup.json()).user.id;
  await h.sql`update "user" set "emailVerified"=true where id=${owner}`;
  await h.sql`insert into profiles(user_id,email,name,role) values(${owner},'website-owner@audit.example.invalid','Synthetic Website Owner','admin') on conflict(user_id) do update set role='admin'`;
  await h.sql`insert into owner_grants(email,user_id) values('website-owner@audit.example.invalid',${owner})`;
  const club = h.api.emptyClub();
  club._demo = false;
  club._rev = 1;
  await h.sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  await h.sql`insert into "user"(id,name,email,"emailVerified") values('website-coach','Synthetic Featured Coach','website-coach@audit.example.invalid',true)`;
  await h.sql`insert into person_profiles(user_id,publish_coach,profile) values('website-coach',true,'{"name":"Synthetic Featured Coach","photo":"","bio":"Synthetic coaching biography for isolated testing.","sports":["softball"],"specialties":[],"ages":"","approach":"","achievements":"","welcome":""}'::jsonb)`;
  const originalPrices = await h.sql`select id,price,credits from club_services order by id`;
  for (const width of [375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const response = await page.goto(h.base + "/memberships");
    const html = await response.text();
    assert.match(html, /Prospect/);
    assert.match(html, /All-Star/);
    assert.match(html, /Elite Family/);
    assert.match(html, /included hour/, "membership comparison exists in server-rendered HTML");
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator(".pricing-card").count(), 3);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `membership overflow ${width}`,
    );
    assert.equal(await page.locator('a[href*="team-player"]').count(), 0);
    await page.screenshot({ path: `${output}/memberships-${width}.png`, fullPage: true });
    await page.goto(h.base + "/");
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator(".pricing-card").count(), 6);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `homepage overflow ${width}`,
    );
    await page.screenshot({ path: `${output}/homepage-${width}.png`, fullPage: true });
  }
  await page.goto(h.base + "/login?next=%2Foffice%3Fsection%3Dservices");
  await page.getByLabel("Email", { exact: true }).fill("website-owner@audit.example.invalid");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/office?section=services");
  await page.getByRole("button", { name: "Add service", exact: true }).waitFor();
  const planRow = page
    .locator("li")
    .filter({ has: page.locator("p").filter({ hasText: /^Prospect$/ }) });
  await planRow.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("region", { name: "Membership Presentation & Pricing" });
  await editor.getByLabel("Badge", { exact: true }).fill("Synthetic badge");
  await editor.getByLabel("Show calculated savings", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  assert.deepEqual(
    await h.sql`select id,price,credits from club_services order by id`,
    originalPrices,
    "presentation save preserves authoritative prices and credits",
  );
  const homepage = page.getByRole("region", { name: "Homepage settings" });
  await homepage
    .getByLabel("Coach 1", { exact: true })
    .selectOption({ label: "Synthetic Featured Coach" });
  await homepage.getByRole("button", { name: "Save featured coaches", exact: true }).click();
  await homepage.getByText("Featured coaches saved.", { exact: true }).waitFor();
  await homepage.getByRole("button", { name: "Add testimonial", exact: true }).click();
  await homepage
    .getByLabel("Quote", { exact: true })
    .fill("Synthetic test quote, never a real customer testimonial.");
  await homepage.getByLabel("Public attribution", { exact: true }).fill("Synthetic Guardian");
  await homepage
    .getByLabel("Private consent reference / note", { exact: true })
    .fill("Isolated consent fixture only.");
  await homepage.getByLabel(/I verified permission for this exact quote/).check();
  await homepage.getByLabel("Publication status", { exact: true }).selectOption("published");
  await homepage.getByRole("button", { name: "Save testimonial", exact: true }).click();
  await homepage.getByText("Testimonial saved.", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.getByRole("navigation", { name: "Front Office mobile", exact: true }).isVisible(),
    true,
    "staff navigation is preserved",
  );
  assert.equal(
    await page.locator(".site-header").getByRole("button", { name: "Menu", exact: true }).count(),
    0,
    "public hamburger does not replace staff navigation",
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    "owner editor mobile overflow",
  );
  await page.screenshot({ path: output + "/homepage-editor-mobile.png", fullPage: true });
  await page.goto(h.base + "/");
  await page
    .getByRole("region", { name: "Facility and safety", exact: true })
    .getByRole("img", { name: "Indoor training lanes at Prospects Sports Facility", exact: true })
    .waitFor();
  await page
    .getByRole("region", { name: "Featured coaches" })
    .getByText("Synthetic Featured Coach", { exact: true })
    .waitFor();
  await page
    .getByRole("region", { name: "Family testimonials" })
    .getByText("Synthetic Guardian", { exact: true })
    .waitFor();
  await page.screenshot({ path: output + "/homepage-published-fixture.png", fullPage: true });
  await page.goto(h.base + "/office?section=services");
  await page.getByRole("button", { name: "Edit testimonial", exact: true }).click();
  await page.getByLabel(/I verified permission for this exact quote/).uncheck();
  await page.getByRole("button", { name: "Save testimonial", exact: true }).click();
  await page.getByText("Testimonial saved.", { exact: true }).waitFor();
  await page.goto(h.base + "/");
  await page.waitForLoadState("networkidle");
  assert.equal(
    await page.getByRole("region", { name: "Family testimonials" }).count(),
    0,
    "consent withdrawal removes public content",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS membership/homepage: SSR prices, five responsive widths, owner edits, unchanged pricing, profile selection, consent publication and withdrawal.",
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: output + "/failure.png", fullPage: true }).catch(() => {});
    console.error(
      await page
        .locator("body")
        .innerText()
        .catch(() => "Page unavailable"),
    );
  }
  throw error;
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
