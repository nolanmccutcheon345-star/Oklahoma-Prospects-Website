// Full browser -> authenticated server function -> disposable database check.
// Never run with a database URL: synthetic users live only in this process.
import assert from "node:assert/strict";
import { sampleClub } from "../src/lib/teams/seed.ts";
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
const shots = "artifacts/tournament-finder";
await mkdir(shots, { recursive: true });
let browser, socket;
let requestQueue = Promise.resolve();
try {
  socket = new PGLiteSocketServer({ db: h.db, host: "127.0.0.1", port: 0, maxConnections: 20 });
  await socket.start();
  process.env.DATABASE_URL = "postgresql://postgres@" + socket.getServerConn() + "/postgres";
  const handler = (await import("../.netlify/v1/functions/server.mjs")).default;
  const sql = h.sql;
  // PGlite has one backend, so avoid interleaving separate clients' wire portals.
  // Real database concurrency is covered separately; do not change app authorization.
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
      const responseTask = requestQueue.then(async () => {
        const response = await handler(
          new Request(req.url(), {
            method: req.method(),
            headers: { ...(await req.allHeaders()), "x-nf-client-connection-ip": "192.0.2.92" },
            ...(!["GET", "HEAD"].includes(req.method()) ? { body: req.postDataBuffer() } : {}),
          }),
        );
        // Consume streamed output before releasing the isolated backend.
        const body = Buffer.from(await response.arrayBuffer());
        return { response, body };
      });
      requestQueue = responseTask.then(
        () => undefined,
        () => undefined,
      );
      const { response, body } = await responseTask;
      const headers = Object.fromEntries(response.headers);
      if (response.headers.getSetCookie().length)
        headers["set-cookie"] = response.headers.getSetCookie().join("\n");
      return route.fulfill({
        status: response.status,
        headers,
        body,
      });
    });
    return context;
  }

  const password = randomUUID() + "Aa9!";
  const hashed = await hashPassword(password);
  for (const [id, email, role] of [
    ["finder-coach", "coach@example.invalid", "parent"],
    ["finder-owner", "stevemccutcheon89@gmail.com", "admin"],
    ["finder-parent", "parent@example.invalid", "parent"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${email},${id},true,now(),now())`;
    await sql`insert into account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values(${id},${id},'credential',${id},${hashed},now(),now())`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${email},${id},${role},${"fam-" + id})`;
  }
  await sql`update owner_grants set user_id='finder-owner' where email='stevemccutcheon89@gmail.com'`;
  const club = sampleClub();
  const team = {
    ...club.teams[0],
    id: "finder-team",
    name: "Prospects 13U · Preview",
    sport: "baseball",
    age: "13U",
    level: "Open",
    coachEmail: "coach@example.invalid",
    headCoach: "Preview Coach",
    roster: [],
    staff: [],
    practices: [],
    tournamentIds: [],
    pitchLog: [],
    announcements: [],
    messages: [],
    attendance: {},
    seasonStart: "2027-03-01",
    seasonEnd: "2027-07-31",
  };
  club.teams = [
    team,
    {
      ...team,
      id: "other-team",
      name: "Prospects 14U · Preview",
      age: "14U",
      coachEmail: "other@example.invalid",
    },
  ];
  club.catalog = [
    {
      id: "fixture-local",
      org: "Demo organizer",
      name: "Sample Spring Classic",
      city: "Broken Arrow",
      state: "OK",
      start: "2027-03-20",
      end: "2027-03-21",
      ages: ["13U"],
      levels: ["Open"],
      fee: 450,
      sport: "baseball",
      type: "tournament",
      stayToPlay: false,
      verifiedOn: "",
      distanceMiles: 8,
    },
    {
      id: "fixture-travel",
      org: "Demo organizer",
      name: "Sample Regional Weekend",
      city: "Dallas",
      state: "TX",
      start: "2027-04-10",
      end: "2027-04-11",
      ages: ["13U"],
      levels: ["AAA", "Open"],
      fee: 675,
      sport: "baseball",
      type: "tournament",
      stayToPlay: true,
      verifiedOn: "",
      distanceMiles: 260,
    },
    {
      id: "fixture-softball",
      org: "Demo organizer",
      name: "Sample Fastpitch Open",
      city: "Tulsa",
      state: "OK",
      start: "2027-05-01",
      end: "2027-05-02",
      ages: ["14U"],
      levels: ["Open"],
      fee: 350,
      sport: "softball",
      type: "tournament",
      stayToPlay: false,
      verifiedOn: "",
    },
  ];
  club._demo = false;
  club._rev = 1;
  club.notifications = [];
  club.audit = [];
  club.leads = [];
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...(process.env.TEST_CHROMIUM_PATH ? { executablePath: process.env.TEST_CHROMIUM_PATH } : {}),
  });
  const failures = [];
  async function signedIn(email, next, width = 390) {
    const context = await isolatedContext({
      viewport: { width, height: 844 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);
    page.on("pageerror", (error) => failures.push(error.message));
    const sessionReady = page.waitForResponse((r) => r.url().includes("/api/auth/get-session"));
    await page.goto(origin + "/login?next=" + encodeURIComponent(next));
    await sessionReady;
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(origin + next, { waitUntil: "domcontentloaded" });
    return { context, page };
  }
  const coach = await signedIn("coach@example.invalid", "/coach");
  const finder = coach.page.locator("[data-tournament-finder]");
  await finder.getByRole("heading", { name: "Sample Spring Classic", exact: true }).waitFor();
  assert.equal(await finder.locator("[data-tournament]").count(), 2);
  assert.equal(
    await finder.getByRole("button", { name: "Add tournament record", exact: true }).count(),
    0,
  );
  assert.equal(await coach.page.getByText("Prospects 14U · Preview", { exact: true }).count(), 0);
  await finder.screenshot({ path: shots + "/coach-mobile.png" });
  assert.ok(
    await coach.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "Mobile layout overflow",
  );
  await finder.getByRole("button", { name: "Advanced filters", exact: false }).click();
  await finder.getByLabel("Maximum drive miles", { exact: true }).selectOption("50");
  assert.equal(await finder.locator("[data-tournament]").count(), 1);
  await finder.getByRole("button", { name: "Reset filters", exact: true }).click();
  const local = finder.locator('[data-tournament="fixture-local"]');
  await local.getByRole("button", { name: "Add to team schedule", exact: true }).click();
  await local.getByRole("button", { name: "Remove from schedule", exact: true }).waitFor();
  const [stored] = await sql`select payload from club_state where id='oklahoma-prospects'`;
  assert.deepEqual(stored.payload.teams[0].tournamentIds, ["fixture-local"]);
  assert.deepEqual(stored.payload.teams[1].tournamentIds, []);
  assert.equal(stored.payload.notifications.length, 0);
  await coach.page.reload();
  await coach.page
    .locator('[data-tournament="fixture-local"]')
    .getByRole("button", { name: "Remove from schedule", exact: true })
    .waitFor();
  console.log(
    "PASS coach filters, own-team save, no notifications, persisted reload, mobile overflow.",
  );
  const owner = await signedIn("stevemccutcheon89@gmail.com", "/office?section=tournaments", 1280);
  owner.page.on("dialog", (dialog) => dialog.accept());
  const office = owner.page.locator("[data-tournament-finder]");
  await office.getByRole("button", { name: "Add tournament record", exact: true }).waitFor();
  await office.screenshot({ path: shots + "/office-desktop.png" });
  await office
    .locator('[data-tournament="fixture-local"]')
    .getByRole("button", { name: "Edit record", exact: true })
    .click();
  await office.getByRole("heading", { name: "Edit tournament record", exact: true }).waitFor();
  assert.equal(await office.getByLabel("Entry fee (USD)", { exact: true }).isDisabled(), true);
  assert.equal(
    await office
      .getByRole("heading", { name: "Edit tournament record", exact: true })
      .evaluate((el) => document.activeElement === el),
    true,
  );
  await office.getByRole("button", { name: "Cancel", exact: true }).click();
  await office.getByRole("button", { name: "Add tournament record", exact: true }).click();
  await office.getByLabel("Tournament name", { exact: true }).fill("Manual demo event");
  await office.getByLabel("Organizer", { exact: true }).fill("Demo organizer");
  await office.getByLabel("City", { exact: true }).fill("Tulsa");
  await office.getByLabel("State abbreviation", { exact: true }).fill("OK");
  await office.getByLabel("Start date", { exact: true }).fill("2027-06-01");
  await office.getByLabel("End date", { exact: true }).fill("2027-06-02");
  await office.getByLabel("Ages (comma separated)", { exact: true }).fill("13U");
  await office.getByLabel("Divisions (comma separated)", { exact: true }).fill("Open");
  await office.getByLabel("Entry fee (USD)", { exact: true }).fill("400");
  await office.getByRole("button", { name: "Save tournament record", exact: true }).click();
  await office.getByRole("heading", { name: "Manual demo event", exact: true }).waitFor();
  await owner.page.reload();
  await owner.page.getByRole("heading", { name: "Manual demo event", exact: true }).waitFor();
  await owner.page.getByRole("button", { name: "Dashboard", exact: true }).first().click();
  await owner.page.waitForURL(/section=dashboard/);
  await owner.page.goBack();
  await owner.page.locator("[data-tournament-finder]").waitFor();
  console.log(
    "PASS owner manual record save/reload, protected scheduled costs, editor focus/cancel, Back navigation.",
  );
  const parent = await signedIn("parent@example.invalid", "/coach");
  await parent.page
    .getByRole("heading", { name: "Coach desk is for staff.", exact: true })
    .waitFor();
  assert.equal(await parent.page.locator("[data-tournament-finder]").count(), 0);
  await parent.page.goto(origin + "/office?section=tournaments");
  await parent.page.getByText("Front office is for club owners.", { exact: true }).waitFor();
  assert.equal(await parent.page.locator("[data-tournament-finder]").count(), 0);
  assert.deepEqual(failures, []);
  console.log(
    "PASS parent denied both staff routes; zero application page errors. Screenshots contain synthetic records only.",
  );
} finally {
  await requestQueue;
  // Assertions have completed. Ignore only route cancellation during teardown;
  // application errors and failed assertions still fail the walkthrough.
  for (const context of browser?.contexts() || [])
    await context.unrouteAll({ behavior: "ignoreErrors" });
  await browser?.close();
  if (socket) {
    // Match the other authenticated walkthroughs: let pg pools release idle
    // connections before closing the disposable database socket.
    const deadline = Date.now() + 15000;
    while (socket.getStats().activeConnections && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      socket.getStats().activeConnections,
      0,
      "Database clients did not drain during test cleanup",
    );
    await socket.stop();
  }
  delete process.env.DATABASE_URL;
  await h.close();
}
