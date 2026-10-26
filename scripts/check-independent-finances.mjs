// Real compiled application, authenticated browser sessions and an isolated synthetic database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { chromium } from "playwright";
import { hashPassword } from "better-auth/crypto";
import { enrollmentFixture } from "../src/lib/enrollment/test-fixture.ts";
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
  errors = [],
  sessions = [];
let socket,
  browser,
  queue = Promise.resolve();
const shots = "artifacts/independent-finances";
await mkdir(shots, { recursive: true });
try {
  const password = randomUUID() + "Aa9!",
    hashed = await hashPassword(password);
  for (const id of ["guardian", "coach", "coordinator", "owner", "stranger"])
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
    sessions.push({ id, page });
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/account?desk=team-finances");
    await page.getByRole("heading", { name: "Team finances", exact: true }).waitFor();
    return { context, page, bodies };
  }
  const owner = await signedIn("owner", 1280),
    page = owner.page;
  await page.getByText("Synthetic baseball · Funding model", { exact: true }).click();
  const config = page.locator("details").filter({
    has: page.locator("summary").filter({ hasText: "Synthetic baseball · Funding model" }),
  });
  await config.getByLabel("Initial deposit due", { exact: true }).fill("2098-01-01");
  await config
    .getByLabel("Initial deposit includes (admin note)", { exact: true })
    .fill("PRIVATE-ADMIN-NOTE: uniforms, coaching and travel");
  await config.getByLabel("Actual uniform cost — team season ($)", { exact: true }).fill("180");
  await config
    .getByLabel("Actual coaching pay cost — team season ($)", { exact: true })
    .fill("100");
  await config.getByLabel("Actual coach travel cost — team season ($)", { exact: true }).fill("50");
  await config.getByLabel("First monthly due date", { exact: true }).fill("2098-01-31");
  await config.getByLabel("Monthly billing day (1–31)", { exact: true }).fill("31");
  await config.getByLabel("Final billing date", { exact: true }).fill("2098-04-30");
  await config.getByLabel("Season end date", { exact: true }).fill("2098-04-30");
  await config
    .getByLabel("Prospects enrollment, withdrawal and refund terms")
    .fill(
      "Synthetic policy: uniforms already purchased or paid for are nonrefundable within the agreed deposit. Withdrawal stops future installments and automatic collection; existing balances remain due.",
    );
  await config
    .getByRole("button", { name: "Select Independently Funded Team and save draft" })
    .click();
  await page
    .getByText("Independent team draft saved. No charges or notices were created.", { exact: true })
    .waitFor();
  await page.getByText("Admin · Prospects billing terms", { exact: true }).click();
  await page.getByRole("button", { name: "Publish these Prospects terms", exact: true }).click();
  await page
    .getByText(
      "Prospects terms published. Families must accept and authorize collection separately.",
      { exact: true },
    )
    .waitFor();
  const [plan] = await h.sql`select payload from team_fee_plans where team_id='base'`;
  assert.equal(plan.payload.published.full, 75000);
  assert.equal(plan.payload.independentAdmin.uniforms, 18000);
  assert.equal((await h.sql`select id from team_collection_authorizations`).length, 0);
  assert.equal((await h.sql`select id from commerce_orders`).length, 0);
  const guardian = await signedIn("guardian", 375),
    family = guardian.page;
  await family.getByRole("heading", { name: "Payments to Prospects", exact: true }).waitFor();
  await family.getByRole("heading", { name: "Team-Managed Expenses", exact: true }).waitFor();
  await family.getByText("Review and accept Prospects terms", { exact: true }).click();
  assert.match(await family.locator("body").innerText(), /Initial deposit: \$250.00/);
  assert.equal(
    await family.getByLabel("Initial deposit includes (admin note)", { exact: true }).count(),
    0,
  );
  await family
    .getByLabel("Accepting guardian's full name", { exact: true })
    .fill("Synthetic Guardian");
  await family.getByLabel(/I accept this player's displayed Prospects terms/).check();
  await family.getByRole("button", { name: "Accept this player's agreement", exact: true }).click();
  await family
    .getByText("Terms accepted. Review and authorize automatic payment separately.", {
      exact: true,
    })
    .waitFor();
  assert.match(await family.locator("body").innerText(), /Outstanding: \$750.00/);
  assert.doesNotMatch(guardian.bodies.join("\n"), /PRIVATE-ADMIN-NOTE|collectedMargin/);
  assert.equal((await h.sql`select id from commerce_orders`).length, 0);
  assert.ok(
    await family.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "Family workspace must fit 375px",
  );
  await family.screenshot({ path: shots + "/family-mobile.png", fullPage: false });
  const coach = await signedIn("coach", 1280),
    staff = coach.page;
  await staff.getByText("Record team financial activity", { exact: true }).click();
  const form = staff.locator("form").filter({ has: staff.getByLabel("Activity", { exact: true }) });
  await form.getByLabel("Activity", { exact: true }).selectOption("obligation");
  await form.getByLabel("Amount ($)", { exact: true }).fill("300");
  await form.getByLabel("Category", { exact: true }).selectOption("tournaments");
  await form.getByLabel("Player", { exact: true }).selectOption("base-player");
  await form.getByLabel("Payment deadline", { exact: true }).fill("2098-02-01");
  await form
    .getByLabel("Purpose or correction reason", { exact: true })
    .fill("Synthetic tournament entry");
  await form.getByRole("button", { name: "Record player operating charge", exact: true }).click();
  await staff
    .getByText("Independent team entry recorded. The software did not move money.", { exact: true })
    .waitFor();
  await form.getByLabel("Activity", { exact: true }).selectOption("payment");
  await form.getByLabel("Amount ($)", { exact: true }).fill("100");
  await form.getByLabel("Verified payer", { exact: true }).selectOption("guardian");
  await form.getByLabel("External payment method", { exact: true }).fill("Synthetic team bank");
  await form
    .getByLabel("External receipt or transaction reference", { exact: true })
    .fill("SYNTHETIC-RECEIPT-100");
  await form
    .getByLabel("Purpose or correction reason", { exact: true })
    .fill("Synthetic independent payment");
  await form
    .getByRole("button", { name: "Record payment received externally", exact: true })
    .click();
  await staff
    .getByText("Independent team entry recorded. The software did not move money.", { exact: true })
    .waitFor();
  const entries = await h.sql`select id,payload from independent_team_entries`;
  const payment = entries.find((r) => r.payload.kind === "payment"),
    obligation = entries.find((r) => r.payload.kind === "obligation");
  await form.getByLabel("Activity", { exact: true }).selectOption("allocation");
  await form.getByLabel("Amount ($)", { exact: true }).fill("100");
  await form.getByLabel("Original received payment", { exact: true }).selectOption(payment.id);
  await form.getByLabel("Player obligation", { exact: true }).selectOption(obligation.id);
  await form
    .getByLabel("Purpose or correction reason", { exact: true })
    .fill("Allocate received funds once");
  await form
    .getByRole("button", { name: "Record allocate a received payment", exact: true })
    .click();
  await staff
    .getByText("Independent team entry recorded. The software did not move money.", { exact: true })
    .waitFor();
  await staff.getByText("Appoint a team financial manager", { exact: true }).click();
  await staff
    .getByLabel("Manager's verified account email", { exact: true })
    .fill("stranger@example.invalid");
  await staff.getByRole("button", { name: "Find verified account", exact: true }).click();
  await staff.getByText("Verified manager account found.", { exact: true }).waitFor();
  await staff.getByRole("button", { name: "Save these team permissions", exact: true }).click();
  await staff.getByText("Team financial permissions saved.", { exact: true }).waitFor();
  const manager = await signedIn("stranger", 375);
  await manager.page.getByRole("heading", { name: "Team-Managed Expenses", exact: true }).waitFor();
  assert.equal(
    await manager.page.getByRole("heading", { name: "Payments to Prospects", exact: true }).count(),
    0,
  );
  assert.equal(
    await manager.page.getByText("Appoint a team financial manager", { exact: true }).count(),
    0,
  );
  await page.reload();
  await page.getByRole("heading", { name: "Team-Managed Expenses", exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /owner access is read-only/);
  assert.equal(await page.getByText("Record team financial activity", { exact: true }).count(), 0);
  assert.match(await page.locator("body").innerText(), /Outstanding \$200.00/);
  await page.screenshot({ path: shots + "/owner-read-only.png", fullPage: false });
  await page.getByText("Admin · Prospects billing terms", { exact: true }).click();
  const adminReport = page.getByRole("region", {
    name: "Admin-only Prospects profit estimate",
    exact: true,
  });
  await adminReport.getByText("$420.00", { exact: true }).waitFor();
  await adminReport.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shots + "/admin-profit-worksheet.png", fullPage: false });
  assert.doesNotMatch(coach.bodies.join("\n"), /PRIVATE-ADMIN-NOTE|collectedMargin/);
  await staff.screenshot({ path: shots + "/coach-workspace.png", fullPage: false });
  assert.equal((await h.sql`select id from commerce_orders`).length, 0);
  assert.equal((await h.sql`select id from finance_records`).length, 0);
  assert.deepEqual(errors, []);
  await writeFile(
    shots + "/receipt.json",
    JSON.stringify(
      {
        passed: true,
        scope: "Compiled app with isolated synthetic data",
        checked: [
          "admin draft and publication",
          "finite $750 per-player schedule",
          "guardian acceptance without collection",
          "coach obligation/payment/allocation",
          "owner read-only UI",
          "manager isolation",
          "375px family layout",
        ],
        realPayments: false,
        realNotices: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "Independent financial workflow passed in the compiled application; no live payments or notices.",
  );
} catch (error) {
  // These pages contain only the synthetic fixture above, never customer records.
  for (const { id, page } of sessions) {
    if (page.isClosed()) continue;
    await page.screenshot({ path: `${shots}/failure-${id}.png`, fullPage: true }).catch(() => {});
    await writeFile(`${shots}/failure-${id}.txt`, await page.locator("body").innerText()).catch(
      () => {},
    );
  }
  console.error("Synthetic walkthrough failure:", error);
  console.error("Synthetic browser errors:", errors);
  throw error;
} finally {
  await queue.catch(() => {});
  for (const context of browser?.contexts() || [])
    await context.unrouteAll({ behavior: "ignoreErrors" });
  await browser?.close();
  if (socket) {
    // Match the existing enrollment walkthrough: let the compiled application's
    // idle pg clients drain before stopping their synthetic database server.
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
