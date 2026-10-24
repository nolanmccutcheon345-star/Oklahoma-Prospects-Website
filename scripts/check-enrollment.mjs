// Real compiled application, authenticated browser sessions and an isolated synthetic database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { chromium } from "playwright";
import { hashPassword } from "better-auth/crypto";
import { enrollmentFixture, preparePilot } from "../src/lib/enrollment/test-fixture.ts";
import { enrollmentCase } from "../src/lib/enrollment/enrollment.server.ts";
for (const name of [
  "DATABASE_URL",
  "NETLIFY_DATABASE_URL",
  "NETLIFY_DATABASE_URL_UNPOOLED",
  "SQUARE_PRODUCTION_ACCESS_TOKEN",
  "SQUARE_SANDBOX_ACCESS_TOKEN",
])
  if (process.env[name]) throw Error("Isolated enrollment check refuses " + name);
const h = await enrollmentFixture(),
  origin = "https://audit.example.invalid",
  errors = [];
let socket,
  browser,
  queue = Promise.resolve();
const shots = "artifacts/enrollment";
await mkdir(shots, { recursive: true });
try {
  await preparePilot(h.sql);
  for (const teamId of ["base", "soft"]) {
    await enrollmentCase(h.sql, "guardian", { teamId, playerId: teamId + "-player" });
    await h.sql`insert into team_activities(id,team_id,payload,updated_by) values(${randomUUID()},${teamId},${JSON.stringify({ kind: "practice", title: "Synthetic practice", date: "2026-01-01", startTime: "15:00", status: "scheduled" })}::jsonb,'owner')`;
  }
  const password = randomUUID() + "Aa9!",
    hashed = await hashPassword(password);
  for (const id of ["guardian", "coach", "coordinator"])
    await h.sql`insert into account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values(${id},${id},'credential',${id},${hashed},now(),now())`;
  await h.sql`update coordinator_assignments set permissions=array['enrollment.read','enrollment.manage'] where user_id='coordinator'`;
  socket = new PGLiteSocketServer({ db: h.db, host: "127.0.0.1", port: 0, maxConnections: 20 });
  await socket.start();
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://postgres@" + socket.getServerConn() + "/postgres",
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
    VITE_AUTH_ENABLED: "true",
  });
  const handler = (await import("../.netlify/v1/functions/server.mjs")).default;
  browser = await chromium.launch({
    executablePath: process.env.LESSON_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  async function signedIn(id, width) {
    const response = await handler(
      new Request(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ email: id + "@example.invalid", password }),
      }),
    );
    assert.equal(response.status, 200, await response.text());
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addCookies(
      response.headers.getSetCookie().map((c) => {
        const first = c.split(";")[0],
          i = first.indexOf("=");
        return { name: first.slice(0, i), value: first.slice(i + 1), url: origin };
      }),
    );
    const bodies = [];
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
          /* Dynamic routes use the compiled application. */
        }
      const task = queue.then(async () => {
        const response = await handler(
          new Request(req.url(), {
            method: req.method(),
            headers: { ...(await req.allHeaders()), "x-nf-client-connection-ip": "192.0.2.97" },
            ...(!["GET", "HEAD"].includes(req.method()) ? { body: req.postDataBuffer() } : {}),
          }),
        );
        return { response, body: Buffer.from(await response.arrayBuffer()) };
      });
      queue = task.then(
        () => {},
        () => {},
      );
      const { response, body } = await task;
      if (url.pathname.startsWith("/_serverFn/")) bodies.push(body.toString("utf8"));
      const headers = Object.fromEntries(response.headers);
      if (response.headers.getSetCookie().length)
        headers["set-cookie"] = response.headers.getSetCookie().join("\n");
      return route.fulfill({ status: response.status, headers, body });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/enrollment");
    await page.getByLabel("Athlete and season").waitFor();
    return { context, page, bodies };
  }
  const guardian = await signedIn("guardian", 375),
    p = guardian.page;
  for (const teamId of ["base", "soft"]) {
    await p.getByLabel("Athlete and season").selectOption(teamId + ":" + teamId + "-player");
    await p.getByRole("button", { name: "Sign this packet", exact: true }).waitFor();
    const form = p
      .locator("form")
      .filter({ has: p.getByRole("button", { name: "Sign this packet", exact: true }) });
    await form.getByLabel("Guardian’s full legal name").fill("Synthetic Guardian");
    for (const checkbox of await form.locator("input[type=checkbox]").all()) await checkbox.check();
    await form.getByRole("button", { name: "Sign this packet", exact: true }).click();
    await p.getByText("Saved.", { exact: true }).waitFor();
    assert.equal(
      (
        await h.sql`select s.id from enrollment_signatures s join enrollment_cases c on c.id=s.case_id where c.team_id=${teamId}`
      ).length,
      1,
    );
  }
  await p.getByText("2. Private emergency and medical information", { exact: true }).click();
  await p.getByLabel("Emergency contact name", { exact: true }).fill("Synthetic Emergency");
  await p.getByLabel("Emergency phone", { exact: true }).fill("555-010-1212");
  await p.getByLabel("Relevant medical alerts", { exact: true }).fill("PRIVATE-MEDICAL-CANARY");
  await p.getByLabel("This information is accurate and I will report changes.").check();
  await p.getByRole("button", { name: "Save private information", exact: true }).click();
  await p.getByText("Saved.", { exact: true }).waitFor();
  const absence = p
    .locator("details")
    .filter({ has: p.locator("summary").filter({ hasText: "Synthetic practice" }) });
  await absence.locator("summary").click();
  await absence.getByLabel(/^Availability/).selectOption("absent");
  await absence.getByLabel(/^Notice type/).selectOption("emergency");
  await absence.getByRole("button", { name: "Save availability", exact: true }).click();
  await p.getByText("Season progress saved.", { exact: true }).waitFor();
  // Confirm no media opt-in was needed to sign either packet.
  assert.equal((await h.sql`select case_id from enrollment_media`).length, 0);
  await p.locator("summary").filter({ hasText: "1. Review your handbook" }).click();
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "375px layout must fit",
  );
  await p.screenshot({ path: shots + "/guardian-mobile.png", fullPage: false });
  const coach = await signedIn("coach", 1280);
  await coach.page.getByLabel("Athlete and season").selectOption("base:base-player");
  await coach.page
    .getByRole("heading", { name: "Your season: first 30 days and beyond" })
    .waitFor();
  assert.equal(
    await coach.page.getByRole("button", { name: "Sign this packet", exact: true }).count(),
    0,
  );
  assert.equal(
    await coach.page
      .getByText("2. Private emergency and medical information", { exact: true })
      .count(),
    0,
  );
  assert.ok(!coach.bodies.join("").includes("PRIVATE-MEDICAL-CANARY"));
  const coordinator = await signedIn("coordinator", 390);
  await coordinator.page.getByLabel("Athlete and season").selectOption("soft:soft-player");
  await coordinator.page
    .getByRole("heading", { name: "Your season: first 30 days and beyond" })
    .waitFor();
  assert.equal(
    await coordinator.page.getByLabel("Athlete and season").locator("option").count(),
    2,
  );
  assert.equal(
    await coordinator.page
      .getByText("2. Private emergency and medical information", { exact: true })
      .count(),
    0,
  );
  assert.equal(
    await coordinator.page.getByText("Financial agreement:", { exact: false }).count(),
    0,
  );
  const attendance = coordinator.page
    .locator("details")
    .filter({ has: coordinator.page.locator("summary").filter({ hasText: "Synthetic practice" }) });
  await attendance.locator("summary").click();
  await attendance.getByRole("button", { name: "Acknowledge receipt", exact: true }).click();
  await coordinator.page.getByText("Season progress saved.", { exact: true }).waitFor();
  await attendance.getByLabel(/^Observed attendance/).selectOption("excused");
  await attendance.getByRole("button", { name: "Record attendance", exact: true }).click();
  await coordinator.page.getByText("Season progress saved.", { exact: true }).waitFor();
  assert.ok(!coordinator.bodies.join("").includes("PRIVATE-MEDICAL-CANARY"));
  assert.ok(!coordinator.bodies.join("").includes('"depositCents"'));
  await coordinator.page.locator("summary").filter({ hasText: "1. Review your handbook" }).click();
  assert.ok(
    await coordinator.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  );
  await coordinator.page.screenshot({ path: shots + "/coordinator-mobile.png", fullPage: false });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real compiled guardian signatures for baseball and softball, optional-media independence, medical privacy, assigned-coach scope, scoped coordinator attendance, mobile layouts. Synthetic payments only in domain tests; no live pilot certified.",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  for (const context of browser?.contexts() || [])
    for (const page of context.pages()) {
      await page.screenshot({ path: shots + "/failure.png", fullPage: true }).catch(() => {});
      await writeFile(shots + "/failure.html", await page.content()).catch(() => {});
    }
  throw error;
} finally {
  await queue.catch(() => {});
  for (const context of browser?.contexts() || [])
    await context.unrouteAll({ behavior: "ignoreErrors" });
  await browser?.close();
  if (socket) {
    const deadline = Date.now() + 15000;
    while (socket.getStats().activeConnections && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      socket.getStats().activeConnections,
      0,
      "Synthetic database clients must drain before closing",
    );
    await socket.stop();
  }
  await h.db.close();
}
