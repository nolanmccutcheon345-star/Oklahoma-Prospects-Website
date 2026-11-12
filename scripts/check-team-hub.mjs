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
  h.club.teams[0].headCoach = "";
  const campId = randomUUID();
  await h.sql`insert into training_events(id,payload,revision,updated_by) values(${campId},${JSON.stringify({ id: campId, revision: 1, name: "Synthetic academy camp", type: "camp", sport: "Both", description: "Synthetic fixture only", priceCents: 12000, dayPriceCents: 4500, pricingMode: "both", location: "Synthetic facility", sessions: [{ date: "2098-01-10", start: "09:00", end: "14:00" }], coachIds: [], capacity: 150, status: "published", policy: "Synthetic policy" })}::jsonb,1,'owner')`;
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
  for (const id of ["guardian", "coach", "stranger", "owner"])
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
  await p.getByText(/Coach to be announced/).waitFor();
  await p.getByRole("heading", { name: "Synthetic academy camp" }).waitFor();
  assert.equal(await p.getByRole("button", { name: "Post update", exact: true }).count(), 0);
  assert.equal(await p.getByRole("link", { name: "Coach workspace", exact: true }).count(), 0);
  await p.getByRole("link", { name: "Payments & family documents" }).waitFor();
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
  await p.getByRole("button", { name: "View camp details", exact: true }).waitFor();
  await p.getByRole("button", { name: "Got it, Coach", exact: true }).click();
  await p.getByRole("button", { name: "Acknowledged", exact: true }).waitFor();
  await p.reload();
  await p.getByRole("button", { name: "Acknowledged", exact: true }).waitFor();
  await p.getByRole("tab", { name: "Schedule", exact: true }).click();
  await p.getByRole("heading", { name: "Synthetic academy camp" }).waitFor();
  assert.equal(await p.getByRole("link", { name: "Manage schedule", exact: true }).count(), 0);
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
  // Owner-only soft removal through the real built UI. Never touch customer records.
  async function openConversation(page, playerId = "") {
    await page.goto(origin + "/team-hub");
    await page.getByRole("heading", { name: "The team bulletin", exact: true }).waitFor();
    await page.getByRole("tab", { name: "Messages", exact: true }).click();
    await page.getByLabel("Conversation", { exact: true }).selectOption(playerId);
  }
  const privateBody = "Synthetic private family question",
    teamBody = "Synthetic shared team message for removal";
  await openConversation(p);
  await p.getByLabel("Your message", { exact: true }).fill(teamBody);
  await p.getByRole("button", { name: "Send message", exact: true }).click();
  await p.getByText("Message saved in this conversation.", { exact: true }).waitFor();
  await p.getByText(teamBody, { exact: true }).waitFor();
  for (const reader of [p, coach.page]) {
    for (const playerId of ["", "base-player"]) {
      await openConversation(reader, playerId);
      await reader.getByText(playerId ? privateBody : teamBody, { exact: true }).waitFor();
      assert.equal(
        await reader.getByRole("button", { name: "Remove message", exact: true }).count(),
        0,
        "Parents and coaches cannot remove either kind of message",
      );
    }
  }
  const coachDesk = await coach.context.newPage();
  coachDesk.setDefaultTimeout(20000);
  coachDesk.on("pageerror", (e) => errors.push(e.message));
  async function openCoachChat() {
    await coachDesk.goto(origin + "/coach");
    await coachDesk
      .locator("summary")
      .filter({ hasText: /^Team chat$/ })
      .click();
  }
  await openCoachChat();
  await coachDesk.getByText(teamBody, { exact: true }).waitFor();
  assert.equal(
    await coachDesk.getByRole("button", { name: "Remove message", exact: true }).count(),
    0,
  );

  const owner = await signedIn("owner", 1280);
  async function removeThroughConfirmation(body, accept) {
    const dialogs = [];
    let finish;
    const done = new Promise((resolve) => {
      finish = resolve;
    });
    const handle = async (dialog) => {
      dialogs.push({ type: dialog.type(), message: dialog.message() });
      if (dialog.type() === "prompt") await dialog.accept("Synthetic duplicate message cleanup");
      else {
        if (accept) await dialog.accept();
        else await dialog.dismiss();
        finish();
      }
    };
    owner.page.on("dialog", handle);
    try {
      await owner.page
        .locator(".hub-message")
        .filter({ has: owner.page.getByText(body, { exact: true }) })
        .getByRole("button", { name: "Remove message", exact: true })
        .click();
      await done;
      assert.equal(dialogs.length, 2);
      assert.equal(dialogs[0].type, "prompt");
      assert.match(dialogs[0].message, /Reason/);
      assert.equal(dialogs[1].type, "confirm");
      assert.ok(
        dialogs[1].message.includes(`by guardian: “${body.slice(0, 120)}”`),
        "Confirmation names the exact author and excerpt",
      );
    } finally {
      owner.page.off("dialog", handle);
    }
  }
  for (const [channel, playerId, body, table] of [
    ["family", "base-player", privateBody, "team_hub_family_messages"],
    ["team", "", teamBody, "team_chat_messages"],
  ]) {
    await openConversation(owner.page, playerId);
    await owner.page.getByText(body, { exact: true }).waitFor();
    const [source] = await h.sql.query(`select id from ${table} where body=$1`, [body]);
    assert.ok(source);
    await removeThroughConfirmation(body, false);
    await owner.page.getByText(body, { exact: true }).waitFor();
    assert.equal(
      (
        await h.sql`select message_id from team_message_removals where channel=${channel} and message_id=${source.id}`
      ).length,
      0,
      "Cancelling confirmation leaves the message and audit unchanged",
    );
    await removeThroughConfirmation(body, true);
    await owner.page.getByText(body, { exact: true }).waitFor({ state: "detached" });
    for (const reader of [p, coach.page, owner.page]) {
      await openConversation(reader, playerId);
      await reader.getByText("Start the conversation.", { exact: true }).waitFor();
      assert.equal(await reader.getByText(body, { exact: true }).count(), 0);
    }
    const [receipt] =
      await h.sql`select actor_id,reason,author,excerpt,removed_at from team_message_removals where channel=${channel} and message_id=${source.id}`;
    assert.equal(receipt.actor_id, "owner");
    assert.equal(receipt.reason, "Synthetic duplicate message cleanup");
    assert.equal(receipt.author, "guardian");
    assert.equal(receipt.excerpt, body.slice(0, 120));
    assert.ok(receipt.removed_at);
    assert.equal(
      (await h.sql.query(`select id from ${table} where id=$1 and body=$2`, [source.id, body]))
        .length,
      1,
      "Original historical message is preserved",
    );
    const events =
      await h.sql`select actor_id,after_state from audit_events where action='message.remove' and target_id=${source.id}`;
    assert.equal(events.length, 1);
    assert.equal(events[0].actor_id, "owner");
    assert.equal(events[0].after_state.reason, receipt.reason);
    assert.equal(events[0].after_state.excerpt, undefined);
    assert.equal(events[0].after_state.body, undefined);
  }
  await openCoachChat();
  await coachDesk.getByText("No messages yet.", { exact: true }).waitFor();
  assert.equal(await coachDesk.getByText(teamBody, { exact: true }).count(), 0);
  assert.equal((await h.sql`select message_id from team_message_removals`).length, 2);
  const stranger = await signedIn("stranger", 390);
  await stranger.page.getByRole("link", { name: "Review invitations", exact: true }).waitFor();
  assert.doesNotMatch(
    await stranger.page.locator("main").innerText(),
    /Synthetic athlete|Synthetic private/,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Team Hub: mobile layout, real sign-in, persistent acknowledgments and family messages, attendance, coach updates, owner-only confirmed/cancelled team and family removal across Hub and Coach Desk, preserved audit/history, and unlinked-account guidance.",
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
