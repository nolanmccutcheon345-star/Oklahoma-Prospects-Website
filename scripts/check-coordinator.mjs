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
const shots = "artifacts/coordinator";
await mkdir(shots, { recursive: true });
let browser, socket;
try {
  socket = new PGLiteSocketServer({ db: h.db, host: "127.0.0.1", port: 0, maxConnections: 20 });
  await socket.start();
  process.env.DATABASE_URL = "postgresql://postgres@" + socket.getServerConn() + "/postgres";
  const handler = (await import("../.netlify/v1/functions/server.mjs")).default;
  const sql = h.sql;
  // PGlite has one backend, so avoid interleaving separate clients' wire portals.
  // Real database concurrency is covered separately; do not change app authorization.
  let requestQueue = Promise.resolve();
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
    ["fixture-coach", "coach@example.invalid", "parent"],
    ["fixture-zero", "zero@example.invalid", "parent"],
    ["fixture-owner", "stevemccutcheon89@gmail.com", "admin"],
    ["fixture-parent", "parent@example.invalid", "parent"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${email},${id},true,now(),now())`;
    await sql`insert into account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values(${id},${id},'credential',${id},${hashed},now(),now())`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${email},${id},${role},${"fam-" + id})`;
  }

  const club = h.api.emptyClub();
  club.teams = [
    {
      id: "fixture-team",
      name: "Prospects test team",
      age: "13U",
      sport: "softball",
      coachEmail: "another-coach@example.invalid",
      staff: [],
      roster: [],
    },
  ];
  await sql`insert into club_state(id,payload,rev) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1)`;
  await sql`insert into club_requests(id,kind,payload) values('fixture-registration','tryout',${JSON.stringify({ player: "Tryout Test Player", parent: "Synthetic Guardian", email: "family@example.invalid", phone: "555-0100", positions: "Pitcher", notes: "Synthetic test record", age: "13U", sport: "Baseball", season: "Spring 2099" })}::jsonb)`;
  await sql`update owner_grants set user_id='fixture-owner' where email='stevemccutcheon89@gmail.com'`;
  await sql`insert into coordinator_assignments(user_id,sport,coverage,permissions,updated_by) values('fixture-zero','softball','sport','{}','fixture-owner'),('fixture-coach','softball','sport',array['recruiting.read','rosters.read'],'fixture-owner')`;
  await sql`update club_requests set payload=payload||'{"sport":"Softball","preferredTeamId":"fixture-team"}'::jsonb where id='fixture-registration'`;
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
    await page.goto(origin + "/login?next=%2Fcoordinator");
    await sessionReady;
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(origin + "/coordinator", { waitUntil: "domcontentloaded" });
    console.log("Signed in:", email.split("@")[0]);
    return { context, page };
  }

  const zero = await signedIn("zero@example.invalid");
  await zero.page.getByText("No operational modules enabled", { exact: true }).waitFor();
  assert.equal(await zero.page.getByRole("button", { name: "Recruiting", exact: true }).count(), 0);
  await zero.page.screenshot({ path: shots + "/zero-mobile.png", fullPage: true });
  const coordinator = await signedIn("coach@example.invalid");
  await coordinator.page.goto(origin + "/account");
  await coordinator.page
    .getByRole("link", { name: "Coordinator Front Office", exact: true })
    .click();
  await coordinator.page.getByRole("button", { name: "Recruiting", exact: true }).click();
  await coordinator.page.getByText("Tryout Test Player · 13U", { exact: true }).waitFor();
  assert.equal(
    await coordinator.page.getByText("family@example.invalid", { exact: false }).count(),
    0,
  );
  assert.equal(
    await coordinator.page.getByRole("button", { name: "Add Note", exact: true }).count(),
    0,
  );
  await coordinator.page.screenshot({ path: shots + "/recruiting-mobile.png", fullPage: true });
  const parent = await signedIn("parent@example.invalid");
  await parent.page.goto(origin + "/account");
  await parent.page
    .getByRole("heading", { name: /fixture-parent/i })
    .first()
    .waitFor();
  assert.equal(
    await parent.page.getByRole("link", { name: "Coordinator Front Office", exact: true }).count(),
    0,
  );
  await parent.context.unrouteAll({ behavior: "wait" });
  await parent.context.close();
  const owner = await signedIn("stevemccutcheon89@gmail.com", 1280);
  owner.page.on("dialog", (d) => d.accept());
  await owner.page.goto(origin + "/office?section=staff");
  await owner.page.getByRole("heading", { name: "Staff Management", exact: true }).waitFor();
  await owner.page.screenshot({ path: shots + "/owner-before-selection.png", fullPage: true });
  await owner.page
    .getByLabel("Verified staff account", { exact: true })
    .selectOption("fixture-coach");
  await owner.page
    .getByRole("button", { name: "Revoke All Coordinator Permissions", exact: true })
    .click();
  await owner.page
    .getByText("Permissions saved. Server access has been updated.", { exact: true })
    .waitFor();
  await coordinator.page.reload();
  await coordinator.page.getByText("No operational modules enabled", { exact: true }).waitFor();
  assert.equal(
    (
      await sql`select cardinality(permissions) as n from coordinator_assignments where user_id='fixture-coach'`
    )[0].n,
    0,
  );
  await owner.page.screenshot({ path: shots + "/owner-desktop.png", fullPage: true });
  // The coordinator's active authenticated session still cannot use owner-only management.
  await coordinator.page.goto(origin + "/office?section=staff");
  await coordinator.page.getByText("Front office is for club owners.", { exact: true }).waitFor();
  assert.equal(failures.length, 0, failures.join("\n"));
  console.log(
    "PASS: zero-access landing, scoped recruiting, contact-field exclusion, owner revocation in an active session, and hidden owner-route denial.",
  );
} finally {
  for (const context of browser?.contexts() || []) await context.unrouteAll({ behavior: "wait" });
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
