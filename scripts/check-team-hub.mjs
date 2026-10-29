// Real built application with synthetic credentials and an isolated database only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { chromium } from "playwright";
import { hashPassword } from "better-auth/crypto";
import { enrollmentFixture } from "../src/lib/enrollment/test-fixture.ts";
import { writeHub } from "../src/lib/team-hub/server.ts";
for (const name of [
  "DATABASE_URL",
  "NETLIFY_DATABASE_URL",
  "NETLIFY_DATABASE_URL_UNPOOLED",
  "SQUARE_PRODUCTION_ACCESS_TOKEN",
  "SQUARE_SANDBOX_ACCESS_TOKEN",
])
  if (process.env[name]) throw Error("Isolated Team Hub check refuses " + name);
const h = await enrollmentFixture(),
  origin = "https://audit.example.invalid",
  errors = [];
let socket,
  browser,
  queue = Promise.resolve();
const shots = "artifacts/team-hub";
await mkdir(shots, { recursive: true });
try {
  h.club.teams[0].announcements = [];
  h.club.teams[0].practices = [
    {
      id: "practice",
      date: "2098-01-15",
      time: "18:00",
      where: "Synthetic Indoor",
      cageHours: 0,
      status: "on",
    },
  ];
  await h.sql`update club_state set payload=${JSON.stringify(h.club)}::jsonb where id='oklahoma-prospects'`;
  await writeHub(h.sql, "coach", {
    kind: "post",
    teamId: "base",
    requestId: randomUUID(),
    title: "Synthetic practice notice",
    body: "Bring your glove and water.",
    urgent: true,
  });
  const password = randomUUID() + "Aa9!",
    hashed = await hashPassword(password);
  for (const id of ["guardian", "coach", "stranger"])
    await h.sql`insert into account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values(${id},${id},'credential',${id},${hashed},now(),now())`;
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
                ".jpeg": "image/jpeg",
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
    await page.goto(origin + "/team-hub");
    await page
      .getByRole("heading", {
        name: id === "stranger" ? "Welcome to Prospects" : "The team bulletin",
        exact: true,
      })
      .waitFor();
    return { context, page, bodies };
  }

  const guardian = await signedIn("guardian", 390),
    p = guardian.page;
  for (const width of [320, 390, 1280]) {
    await p.setViewportSize({ width, height: 900 });
    await p.screenshot({ path: shots + "/parent-" + width + ".png", fullPage: false });
    assert.ok(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      "No page overflow at " + width,
    );
    assert.ok(
      await p.getByRole("tablist").evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      "Navigation fits at " + width,
    );
  }
  await p.getByRole("button", { name: "Got it, Coach", exact: true }).click();
  await p.getByRole("button", { name: "Acknowledged", exact: true }).waitFor();
  await p.reload();
  await p.getByRole("button", { name: "Acknowledged", exact: true }).waitFor();
  await p.getByRole("tab", { name: "Schedule", exact: true }).click();
  await p.getByLabel("Synthetic athlete attendance for Team practice").selectOption("going");
  await p.getByText("Attendance reply saved.", { exact: true }).waitFor();
  await p.getByRole("tab", { name: "Messages", exact: true }).click();
  await p.getByLabel("Conversation", { exact: true }).selectOption("base-player");
  await p.getByLabel("Your message", { exact: true }).fill("Synthetic private family question");
  await p.getByRole("button", { name: "Send message", exact: true }).click();
  await p.getByText("Message saved in this conversation.", { exact: true }).waitFor();
  await p.reload();
  await p.getByRole("tab", { name: /Messages/ }).click();
  await p.getByLabel("Conversation", { exact: true }).selectOption("base-player");
  await p.getByText("Synthetic private family question", { exact: true }).waitFor();
  const coach = await signedIn("coach", 1280);
  await coach.page.getByRole("tab", { name: "Messages", exact: true }).click();
  await coach.page.getByLabel("Conversation", { exact: true }).selectOption("base-player");
  await coach.page.getByText("Synthetic private family question", { exact: true }).waitFor();
  await coach.page.getByRole("tab", { name: /Updates/ }).click();
  await coach.page.getByRole("button", { name: "Post update", exact: true }).click();
  await coach.page.getByLabel("Headline", { exact: true }).fill("Synthetic coach follow-up");
  await coach.page.getByLabel("Update", { exact: true }).fill("Practice is confirmed.");
  await coach.page.getByRole("button", { name: "Publish team update", exact: true }).click();
  await coach.page
    .getByRole("heading", { name: "Synthetic coach follow-up", exact: true })
    .waitFor();
  await p.reload();
  await p.getByRole("heading", { name: "Synthetic coach follow-up", exact: true }).waitFor();
  const stranger = await signedIn("stranger", 390);
  await stranger.page.getByRole("link", { name: "Review invitations", exact: true }).waitFor();
  assert.doesNotMatch(
    await stranger.page.locator("main").innerText(),
    /Synthetic athlete|Synthetic private/,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Team Hub: mobile layout, real sign-in, persistent acknowledgments and family messages, attendance, coach updates, and unlinked-account guidance.",
  );
} catch (error) {
  console.error(error);
  for (const [index, context] of (browser?.contexts() || []).entries())
    for (const page of context.pages())
      await page
        .screenshot({ path: shots + "/failure-" + index + ".png", fullPage: true })
        .catch(() => {});
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
