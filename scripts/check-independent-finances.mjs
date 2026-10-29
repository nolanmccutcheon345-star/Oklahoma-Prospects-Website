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
  await config
    .getByLabel("What the initial deposit covers", { exact: true })
    .fill("PUBLIC-COVERAGE: uniforms and agreed coaching.\n• Team uniform package");
  await config
    .getByLabel("What monthly Prospects dues cover", { exact: true })
    .fill("Scheduled indoor team practice and Prospects program access.");
  await config
    .getByLabel("Costs the team must fund separately", { exact: true })
    .fill("Tournament entries and other independently arranged team expenses.");
  await config
    .getByLabel("Additional notes (optional)", { exact: true })
    .fill(
      "The coach will discuss fundraising with families. <script>window.untrustedFeeNote = true</script>",
    );
  await config.getByLabel("Initial deposit due", { exact: true }).fill("2098-01-01");
  await config.getByLabel("Initial deposit per player ($)", { exact: true }).fill("600");
  await config.getByLabel("Monthly Prospects dues per player ($)", { exact: true }).fill("149");
  await config
    .getByLabel("Initial deposit includes (admin note)", { exact: true })
    .fill("PRIVATE-ADMIN-NOTE: uniforms, coaching and travel");
  await config.getByLabel("Players used to price the deposit", { exact: true }).fill("10");
  await config.getByLabel("Expected players on the team", { exact: true }).fill("10");
  await config
    .getByLabel("Organization contribution per player in deposit ($)", { exact: true })
    .fill("100");
  await config.getByLabel("Uniform cost per player ($)", { exact: true }).fill("200");
  await config.getByLabel("Total Coaching pay — season ($)", { exact: true }).fill("3000");
  await config.getByLabel("Total Coach travel — season ($)", { exact: true }).fill("1000");
  await config.getByLabel("First monthly due date", { exact: true }).fill("2098-02-01");
  await config.getByLabel("Monthly billing day (1–31)", { exact: true }).fill("1");
  await config.getByLabel("Final billing date", { exact: true }).fill("2098-06-01");
  await config.getByLabel("Season end date", { exact: true }).fill("2098-06-26");
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
  const settings = page
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: "Admin · Prospects billing terms" }) })
    .first();
  await settings.getByLabel("Initial deposit per player ($)", { exact: true }).fill("700");
  const forecast = settings.getByRole("region", { name: "Admin budget forecast", exact: true });
  await forecast
    .getByRole("row", { name: /Initial deposit profit/ })
    .getByText("$1,000.00", { exact: true })
    .last()
    .waitFor();
  await forecast.getByTestId("calculated-deposit").filter({ hasText: "$700.00" }).waitFor();
  await settings.getByLabel("Expected players on the team", { exact: true }).fill("13");
  await forecast
    .getByRole("row", { name: /Initial deposit profit/ })
    .getByText("$2,500.00", { exact: true })
    .waitFor();
  assert.equal(
    await settings.getByLabel("Initial deposit per player ($)", { exact: true }).inputValue(),
    "700",
  );
  assert.equal(
    await settings.getByLabel("Uniform cost per player ($)", { exact: true }).inputValue(),
    "200",
  );
  await settings.getByLabel("Include Tournament fees in initial deposit", { exact: true }).check();
  await settings.getByLabel("Total Tournament fees — season ($)", { exact: true }).fill("500");
  await forecast.getByTestId("calculated-deposit").filter({ hasText: "$750.00" }).waitFor();
  await settings.getByRole("button", { name: "Use calculated deposit", exact: true }).click();
  assert.equal(
    await settings.getByLabel("Initial deposit per player ($)", { exact: true }).inputValue(),
    "750",
  );
  await settings
    .getByLabel("Include Tournament fees in initial deposit", { exact: true })
    .uncheck();
  await settings.getByRole("button", { name: "Use calculated deposit", exact: true }).click();
  assert.equal(
    await settings.getByLabel("Initial deposit per player ($)", { exact: true }).inputValue(),
    "700",
  );
  await settings.getByRole("button", { name: "Add another deposit expense", exact: true }).click();
  await settings.getByLabel("Total Other expense — season ($)", { exact: true }).fill("150");
  await forecast.getByTestId("calculated-deposit").filter({ hasText: "$715.00" }).waitFor();
  await settings.getByRole("button", { name: "Remove expense", exact: true }).click();
  await settings.getByLabel("Expected players on the team", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Save draft fees and admin budget", exact: true }).click();
  await page
    .getByText(
      "Draft fees and admin budget saved. Published terms and accepted agreements are unchanged.",
      { exact: true },
    )
    .waitFor();
  await page.reload();
  await page.getByText("Admin · Prospects billing terms", { exact: true }).click();
  assert.equal(
    await settings.getByLabel("Initial deposit per player ($)", { exact: true }).inputValue(),
    "700",
  );
  assert.equal(
    await settings.getByLabel("Players used to price the deposit", { exact: true }).inputValue(),
    "10",
  );
  await forecast
    .getByRole("row", { name: /Initial deposit profit/ })
    .getByText("$1,000.00", { exact: true })
    .last()
    .waitFor();
  await forecast.getByText("$1,490.00", { exact: true }).last().waitFor();
  await forecast.getByText("$8,450.00", { exact: true }).last().waitFor();
  assert.match(
    await settings.getByLabel("What the initial deposit covers", { exact: true }).inputValue(),
    /PUBLIC-COVERAGE/,
  );
  await settings.getByText("Preview parent explanation", { exact: true }).click();
  await settings
    .getByRole("region", { name: "Fee explanation for parents", exact: true })
    .getByText(/PUBLIC-COVERAGE/)
    .waitFor();
  const [savedDraft] = await h.sql`select payload from team_fee_plans where team_id='base'`;
  assert.equal(savedDraft.payload.budget.independent.uniformDeposit, 70000);
  assert.equal(savedDraft.payload.independentAdmin.planning.basisPlayers, 10);
  assert.equal(savedDraft.payload.published, undefined);
  await settings.getByLabel("Expected players on the team", { exact: true }).fill("13");
  await page.setViewportSize({ width: 375, height: 900 });
  await forecast.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const comparison = forecast.getByRole("region", { name: "Budget comparison", exact: true });
  assert.ok(await comparison.evaluate((el) => el.scrollWidth > el.clientWidth));
  await comparison.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const expectedProfit = forecast
    .getByRole("row", { name: /Initial deposit profit/ })
    .getByText("$2,500.00", { exact: true });
  assert.equal(await expectedProfit.evaluate((el) => getComputedStyle(el).whiteSpace), "nowrap");
  await expectedProfit.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shots + "/admin-planned-profit-mobile.png", fullPage: false });
  await page.setViewportSize({ width: 1280, height: 900 });
  await comparison.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await forecast.getByRole("table").screenshot({ path: shots + "/admin-planned-profit-table.png" });
  // Continue the existing per-player agreement/independent-ledger walkthrough.
  await settings.getByLabel("Initial deposit per player ($)", { exact: true }).fill("250");
  await settings.getByLabel("Monthly Prospects dues per player ($)", { exact: true }).fill("125");
  await settings.getByLabel("Players used to price the deposit", { exact: true }).fill("1");
  await settings.getByLabel("Expected players on the team", { exact: true }).fill("1");
  await settings
    .getByLabel("Organization contribution per player in deposit ($)", { exact: true })
    .fill("0");
  await settings.getByLabel("Uniform cost per player ($)", { exact: true }).fill("180");
  await settings.getByLabel("Total Coaching pay — season ($)", { exact: true }).fill("100");
  await settings.getByLabel("Total Coach travel — season ($)", { exact: true }).fill("50");
  await settings.getByLabel("First monthly due date", { exact: true }).fill("2098-01-31");
  await settings.getByLabel("Monthly billing day (1–31)", { exact: true }).fill("31");
  await settings.getByLabel("Final billing date", { exact: true }).fill("2098-04-30");
  await settings.getByLabel("Season end date", { exact: true }).fill("2098-04-30");
  await page.getByRole("button", { name: "Publish these Prospects terms", exact: true }).click();
  await page
    .getByText(
      "Prospects terms published. Families must accept and authorize collection separately.",
      { exact: true },
    )
    .waitFor();
  const [plan] = await h.sql`select payload from team_fee_plans where team_id='base'`;
  assert.equal(plan.payload.published.full, 75000);
  assert.equal(plan.payload.independentAdmin.planning.uniformPerPlayer, 18000);
  assert.equal((await h.sql`select id from team_collection_authorizations`).length, 0);
  assert.equal((await h.sql`select id from commerce_orders`).length, 0);
  // Split fields are isolated to a selected individual offer, never a team save.
  await page.getByText("Admin · Prospects billing terms", { exact: true }).click();
  await settings
    .getByText("Late enrollment, amendment or designated payer", { exact: true })
    .click();
  const individual = settings
    .locator("details")
    .filter({
      has: page
        .locator("summary")
        .filter({ hasText: "Late enrollment, amendment or designated payer" }),
    })
    .first();
  await individual.getByLabel("Player", { exact: true }).selectOption("base-player");
  await individual
    .getByLabel("Designated verified payer", { exact: true })
    .selectOption("guardian");
  await individual
    .getByLabel("Split this player's initial deposit into two payments", { exact: true })
    .check();
  await individual.getByLabel("First deposit payment ($)", { exact: true }).fill("125");
  await individual.getByLabel("First deposit payment due", { exact: true }).fill("2098-01-01");
  await individual.getByLabel("Second deposit payment due", { exact: true }).fill("2098-01-15");
  await individual
    .getByLabel("Reason and treatment of existing obligations", { exact: true })
    .fill("Owner-approved synthetic two-payment accommodation");
  await individual.getByText("Preview individual parent agreement", { exact: true }).click();
  assert.match(await individual.innerText(), /Initial deposit — payment 2 of 2/);
  await page.setViewportSize({ width: 375, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await individual.getByRole("button", { name: "Publish individual offer", exact: true }).click();
  await page
    .getByText(
      "Individual offer published. Acceptance and new autopay authorization are required.",
      { exact: true },
    )
    .waitFor();
  const [splitPlan] = await h.sql`select payload from team_fee_plans where team_id='base'`;
  assert.equal(splitPlan.payload.publishedBudget.independent.depositInstallments, undefined);
  assert.deepEqual(
    splitPlan.payload.players["base-player"].independent.offer.budget.independent.depositInstallments,
    [
      { amount: 12500, due: "2098-01-01" },
      { amount: 12500, due: "2098-01-15" },
    ],
  );
  assert.equal((await h.sql`select id from commerce_orders`).length, 0);
  // Restore a single-deposit individual offer for the unchanged legacy journey below.
  await page.getByText("Admin · Prospects billing terms", { exact: true }).click();
  await settings
    .getByText("Late enrollment, amendment or designated payer", { exact: true })
    .click();
  await individual.getByLabel("Player", { exact: true }).selectOption("base-player");
  await individual
    .getByLabel("Designated verified payer", { exact: true })
    .selectOption("guardian");
  assert.equal(
    await individual
      .getByLabel("Split this player's initial deposit into two payments", { exact: true })
      .isChecked(),
    false,
  );
  await individual
    .getByLabel("Reason and treatment of existing obligations", { exact: true })
    .fill("Restore synthetic legacy single-deposit offer before acceptance");
  await individual.getByRole("button", { name: "Publish individual offer", exact: true }).click();
  await page
    .getByText(
      "Individual offer published. Acceptance and new autopay authorization are required.",
      { exact: true },
    )
    .waitFor();
  const guardian = await signedIn("guardian", 375),
    family = guardian.page;
  await family.getByRole("heading", { name: "Payments to Prospects", exact: true }).waitFor();
  await family.getByRole("heading", { name: "Team-Managed Expenses", exact: true }).waitFor();
  await family
    .getByRole("region", { name: "Fee explanation for parents", exact: true })
    .getByText(/PUBLIC-COVERAGE/)
    .first()
    .waitFor();
  assert.equal(
    await family
      .getByRole("textbox", { name: "What the initial deposit covers", exact: true })
      .count(),
    0,
  );
  await family
    .getByRole("region", { name: "Fee explanation for parents", exact: true })
    .first()
    .screenshot({ path: shots + "/parent-fee-explanation-mobile.png" });
  assert.equal(
    await family
      .getByRole("region", { name: "Fee explanation for parents", exact: true })
      .first()
      .locator("script")
      .count(),
    0,
  );
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
  const downloaded = family.waitForEvent("download");
  await family.getByRole("button", { name: "Download accepted agreement", exact: true }).click();
  const file = await downloaded;
  const contents = await readFile(await file.path(), "utf8");
  assert.match(contents, /PUBLIC-COVERAGE/);
  assert.doesNotMatch(contents, /PRIVATE-ADMIN-NOTE|collectedMargin/);

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
  await page.getByText("Published agreements and verified collections", { exact: true }).click();
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
          "deposit 600 to 700 save and reload",
          "pricing baseline, expected roster, selected and custom expenses",
          "flat deposit and uniform unit cost through 13 players",
          "finite $750 per-player schedule",
          "individual split deposit preview and publication without changing team terms",
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
