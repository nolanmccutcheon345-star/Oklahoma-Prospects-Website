// Full browser -> authenticated server function -> disposable database check.
// Never run with a database URL: synthetic users live only in this process.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { auditHarness } from "./audit-support.mjs";
import { chromium } from "playwright";
import { hashPassword } from "better-auth/crypto";

for (const key of ["DATABASE_URL", "NETLIFY_DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  if (process.env[key]) throw new Error("This check requires a disposable local database.");
}
const h = await auditHarness();
const origin = h.base;
const shots = "artifacts/tryout-center";
await mkdir(shots, { recursive: true });
let browser, socket;
try {
  socket = new PGLiteSocketServer({ db: h.db, host: "127.0.0.1", port: 0, maxConnections: 20 });
  await socket.start();
  process.env.DATABASE_URL = "postgresql://postgres@" + socket.getServerConn() + "/postgres";
  const handler = (await import("../.netlify/v1/functions/server.mjs")).default;
  const sql = h.sql;
  async function isolatedContext(options = {}) {
    const context = await browser.newContext(options);
    await context.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.origin !== origin) return route.abort();
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
          /* Dynamic routes use the real built application. */
        }
      const response = await handler(
        new Request(req.url(), {
          method: req.method(),
          headers: { ...(await req.allHeaders()), "x-nf-client-connection-ip": "192.0.2.92" },
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
    return context;
  }
  const password = randomUUID() + "Aa9!";
  const hashed = await hashPassword(password);
  for (const [id, email, role] of [
    ["fixture-coach", "coach@example.invalid", "coach"],
    ["fixture-owner", "stevemccutcheon89@gmail.com", "admin"],
    ["fixture-parent", "parent@example.invalid", "parent"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${email},${id},true,now(),now())`;
    await sql`insert into account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values(${id},${id},'credential',${id},${hashed},now(),now())`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${email},${id},${role},${"fam-" + id})`;
  }
  await sql`insert into club_staff(id,user_id,name,email,role,active) values('fixture-coach','fixture-coach','Fixture Coach','coach@example.invalid','coach',true)`;
  const club = h.api.emptyClub();
  club.teams = [
    {
      id: "fixture-team",
      name: "Prospects test team",
      age: "13U",
      sport: "baseball",
      coachEmail: "coach@example.invalid",
      staff: [],
      roster: [],
    },
  ];
  await sql`insert into club_state(id,payload,rev) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1)`;
  await sql`insert into club_requests(id,kind,payload) values('fixture-registration','tryout',${JSON.stringify({ player: "Tryout Test Player", parent: "Synthetic Guardian", email: "family@example.invalid", phone: "555-0100", positions: "Pitcher", notes: "Synthetic test record", age: "13U", sport: "Baseball", season: "Spring 2099" })}::jsonb)`;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...(process.env.TEST_CHROMIUM_PATH ? { executablePath: process.env.TEST_CHROMIUM_PATH } : {}),
  });
  const failures = [];
  async function signedIn(email, width = 390) {
    const context = await isolatedContext({
      viewport: { width, height: 844 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    page.on("pageerror", (e) => failures.push(e.message));
    // The SSR form is visible before React hydrates. Wait for the client's
    // initial session request before filling the controlled login inputs.
    const sessionReady = page.waitForResponse((r) => r.url().includes("/api/auth/get-session"));
    await page.goto(origin + "/login?next=%2Fevaluations");
    await sessionReady;
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(origin + "/evaluations", { waitUntil: "domcontentloaded" });
    console.log("Signed in:", email.split("@")[0]);
    return { context, page };
  }
  const { page, context } = await signedIn("coach@example.invalid");
  await page.goto(origin + "/registrations");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Open Tryout Test Player", exact: true }).click();
  console.log("Opened registration");
  await page.getByLabel("Primary coach", { exact: true }).selectOption("fixture-coach");
  await page.getByLabel("Follow-up status", { exact: true }).selectOption("contacted");
  await page
    .getByLabel("Internal follow-up note", { exact: true })
    .fill("Synthetic follow-up from phone");
  await page.getByRole("button", { name: "Save follow-up", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Follow-up saved" }).waitFor();
  console.log("Saved followup");
  await page.getByLabel("Communication type", { exact: true }).selectOption("call");
  await page
    .getByLabel("Message / contact notes", { exact: true })
    .fill("Synthetic guardian requested a callback");
  await page.getByRole("button", { name: "Save contact record", exact: true }).click();
  await page.getByText("Synthetic guardian requested a callback", { exact: true }).waitFor();
  console.log("Saved contact");
  await page.getByLabel("Appointment coach", { exact: true }).selectOption("fixture-coach");
  await page.getByLabel("Appointment date", { exact: true }).fill("2099-01-05");
  await page.getByLabel("Lane 1 · Mound", { exact: true }).check();
  await page.getByLabel("Appointment status", { exact: true }).selectOption("confirmed");
  await page.getByRole("button", { name: "Save appointment", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Appointment saved" }).waitFor();
  assert.equal((await sql`select * from booking_occupancy`).length, 24);
  await page.getByRole("button", { name: "Evaluate player / view results", exact: true }).click();
  await page.getByRole("button", { name: "New evaluation", exact: true }).click();
  assert.equal(
    await page.getByLabel("Registration", { exact: true }).inputValue(),
    "fixture-registration",
  );
  await page
    .getByRole("radio", { name: "Contact / barrel control: 4", exact: true })
    .locator("..")
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved" }).waitFor();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.locator("html").evaluate((el) => el.scrollWidth > el.clientWidth + 1),
      false,
      `overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: shots + "/coach-registration-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Back to registrations", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: shots + "/coach-list-mobile.png", fullPage: true });
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByText(/Tryout follow-up updated/).waitFor();
  const owner = await signedIn("stevemccutcheon89@gmail.com", 1280);
  await owner.page.goto(origin + "/registrations?registration=fixture-registration");
  await owner.page.getByText("Synthetic guardian requested a callback", { exact: true }).waitFor();
  await owner.page.screenshot({ path: shots + "/owner-registration.png", fullPage: true });
  const parent = await signedIn("parent@example.invalid");
  await parent.page.goto(origin + "/registrations");
  await parent.page.getByRole("heading", { name: "Access needed", exact: true }).waitFor();
  assert.equal(await parent.page.getByText("Tryout Test Player", { exact: true }).count(), 0);
  const anonymous = await isolatedContext({ ignoreHTTPSErrors: true });
  assert.equal((await anonymous.cookies()).length, 0, "anonymous context has no cookies");
  const guest = await anonymous.newPage();
  await guest.goto(origin + "/registrations");
  await guest.waitForURL(/login/);
  assert.deepEqual(failures, []);
  console.log(
    "PASS: mobile coach registration, shared notes, appointment occupancy, linked evaluation, owner view, parent/guest denial. No live data or messages.",
  );
  await context.close();
  await owner.context.close();
  await parent.context.close();
  await anonymous.close();
} catch (error) {
  if (browser) {
    for (const [i, c] of browser.contexts().entries()) {
      const p = c.pages()[0];
      if (p) {
        console.log(
          "FAIL PAGE",
          i,
          p.url(),
          await p
            .locator("body")
            .innerText()
            .catch(() => ""),
        );
        await p
          .screenshot({ path: shots + "/failure-" + i + ".png", fullPage: true })
          .catch(() => {});
      }
    }
  }
  throw error;
} finally {
  await browser?.close();
  if (socket) {
    const deadline = Date.now() + 15000;
    while (socket.getStats().activeConnections && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    await socket.stop();
  }
  delete process.env.DATABASE_URL;
  await h.close();
}
