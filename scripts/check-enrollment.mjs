// Real compiled application, authenticated browser sessions and an isolated synthetic database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { chromium } from "playwright";
import { hashPassword } from "better-auth/crypto";
import { enrollmentFixture, prepareOrganization } from "../src/lib/enrollment/test-fixture.ts";
import { enrollmentCase } from "../src/lib/enrollment/enrollment.server.ts";
import { defaultBudget, pricingKeys, calculateFees } from "../src/lib/teams/fee-model.ts";
import { mutateFeePlan } from "../src/lib/teams/fee.server.ts";
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
  await prepareOrganization(h.sql);
  const inviteId = randomUUID();
  await h.sql`insert into club_invites(id,token_hash,email,role,family_id,team_id,invited_by,expires_at) values(${inviteId},${inviteId},'guardian@example.invalid','parent','home-guardian','base','owner',now()+interval '7 days')`;
  await mutateFeePlan(h.sql, "owner", {
    action: "publishIndependent",
    teamId: "base",
    revision: 0,
    confirmed: true,
    budget: {
      ...defaultBudget(),
      fundingModel: "independent",
      policy: "Synthetic payment, withdrawal and refund policy.",
      processingBps: 0,
      processingFixed: 0,
      parentExplanation: {
        initialDeposit: "PUBLIC: uniforms and coaching coverage.",
        monthlyDues: "Facility practice access.",
        teamExpenses: "Coach-arranged tournament entries.",
        additionalNotes: "",
      },
      independent: {
        seasonKey: randomUUID(),
        uniformDeposit: 70000,
        monthlyDues: 14900,
        uniformDue: "2098-01-01",
        firstDue: "2098-02-01",
        billingDay: 1,
        lastDue: "2098-06-01",
        seasonEnd: "2098-06-30",
        processingExplanation: "No processing fees.",
      },
    },
  });
  assert.equal((await h.sql`select * from fee_ready_notifications`).length, 1);
  for (const teamId of ["base", "soft"]) {
    await enrollmentCase(h.sql, "guardian", { teamId, playerId: teamId + "-player" });
    await h.sql`insert into team_activities(id,team_id,payload,updated_by) values(${randomUUID()},${teamId},${JSON.stringify({ kind: "practice", title: "Synthetic practice", date: "2026-01-01", startTime: "15:00", status: "scheduled" })}::jsonb,'owner')`;
  }
  const password = randomUUID() + "Aa9!",
    hashed = await hashPassword(password);
  for (const id of ["guardian", "coach", "coordinator", "owner"])
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
  await p
    .getByRole("heading", { name: "Complete your player’s enrollment", exact: true })
    .waitFor();
  await p.goto(origin + "/invitations");
  await p.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await p.getByRole("link", { name: "Open account and continue enrollment", exact: true }).click();
  await p
    .getByRole("heading", { name: "Complete your player’s enrollment", exact: true })
    .waitFor();
  await p.getByRole("link", { name: "Continue enrollment", exact: true }).first().click();
  await p.getByLabel("Athlete and season").waitFor();
  assert.equal(await p.getByLabel("Athlete and season").inputValue(), "base:base-player");
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.screenshot({ path: shots + "/parent-guide-mobile.png", fullPage: false });
  for (const teamId of ["base", "soft"]) {
    await p.getByLabel("Athlete and season").selectOption(teamId + ":" + teamId + "-player");
    const guide = p.locator('section[aria-labelledby="enrollment-guide-title"]');
    await guide.getByRole("link", { name: "Continue enrollment", exact: true }).waitFor();
    assert.equal(await guide.locator("article").count(), 1);
    assert.ok(
      (
        await guide
          .getByRole("link", { name: "Continue enrollment", exact: true })
          .getAttribute("href")
      ).includes(`playerId=${teamId}-player`),
      "The guide follows the selected athlete without showing the previous player's steps",
    );
    await p.getByRole("button", { name: "Sign this packet", exact: true }).waitFor();
    await p.getByRole("link", { name: "View memberships", exact: true }).waitFor();
    assert.match(await p.locator("body").innerText(), /full published price/);
    assert.equal(await p.getByLabel(/Individual Facility Access/i).count(), 0);
    const form = p
      .locator("form")
      .filter({ has: p.getByRole("button", { name: "Sign this packet", exact: true }) });
    await form.getByLabel("Guardian’s full legal name").fill("Synthetic Guardian");
    await form
      .getByLabel("Athlete’s name — entered for their acknowledgment")
      .fill("Synthetic athlete");
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
  await p.getByLabel("Athlete and season").selectOption("base:base-player");
  await p.getByText("Review and accept Prospects terms", { exact: true }).click();
  await p.getByLabel("Accepting guardian's full name", { exact: true }).fill("Synthetic Guardian");
  await p.getByLabel("I accept this player's displayed Prospects terms.", { exact: false }).check();
  await p.getByRole("button", { name: "Accept this player's agreement", exact: true }).click();
  await p
    .getByText("Terms accepted. Review and authorize automatic payment separately.", {
      exact: true,
    })
    .waitFor();
  await p.getByText("Pay Prospects securely", { exact: true }).click();
  assert.equal(await p.getByLabel("Payment amount ($)", { exact: true }).inputValue(), "700");
  await p.getByRole("button", { name: "Refresh progress", exact: true }).click();
  await p
    .getByText("Set up monthly automatic payments — Autopay unavailable", { exact: true })
    .waitFor();
  assert.equal((await h.sql`select * from square_payments`).length, 0);
  assert.equal((await h.sql`select * from team_collection_authorizations`).length, 0);
  await p.reload();
  await p
    .getByText("Review and accept your player's fee agreement — Complete", { exact: true })
    .waitFor();
  await p.getByLabel("Athlete and season").selectOption("soft:soft-player");
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
  const owner = await signedIn("owner", 1280);
  await owner.page
    .getByRole("heading", { name: "Parent enrollment progress", exact: true })
    .waitFor();
  await owner.page.getByLabel("Athlete and season").selectOption("base:base-player");
  await owner.page
    .getByText("Parent fee emails — delivery and catch-up preview", { exact: true })
    .click();
  await owner.page
    .getByRole("button", { name: "Load / refresh email preview and delivery status", exact: true })
    .click();
  await owner.page.getByText("Recent delivery records", { exact: true }).waitFor();
  assert.equal(
    (await h.sql`select * from fee_ready_notifications where provider_message_id is not null`)
      .length,
    0,
  );
  await owner.page.getByText("Organization enrollment controls", { exact: true }).click();
  const controls = owner.page.locator("details").filter({
    has: owner.page.locator("summary").filter({ hasText: "Organization enrollment controls" }),
  });
  const openTeams = controls.locator('input[name="open"]');
  assert.equal(await openTeams.count(), 2);
  assert.equal(await openTeams.first().isChecked(), true);
  await owner.page
    .getByRole("button", { name: "Pause organization signatures", exact: true })
    .click();
  await owner.page.getByText("Saved.", { exact: true }).waitFor();
  await owner.page
    .getByRole("button", { name: "Enable organization enrollment", exact: true })
    .click();
  await owner.page.getByText("Saved.", { exact: true }).waitFor();
  await owner.page
    .getByRole("button", { name: "Pause organization signatures", exact: true })
    .waitFor();
  assert.equal(
    await openTeams.first().isChecked(),
    true,
    "Team checkbox reflects the resumed signature setting",
  );
  // Exercise the organization-managed publication path against the compiled server,
  // alongside the existing independent-family acceptance workflow above.
  const organizationBudget = {
    ...defaultBudget(),
    poEnabled: false,
    start: "2098-02-01",
    end: "2098-06-25",
    baseline: 10,
    billableMonthsOverride: 6,
    billableMonthsReason: "Synthetic owner-reviewed six-month billing term.",
    membershipMonthly: 10000,
    fullOrg: 50000,
    tournamentEstimate: 650000,
    uniformEstimate: 25000,
    costs: [{ id: "fixed", name: "Synthetic season coaching and travel", cents: 893000 }],
    contingencyBps: 1250,
    processingBps: 300,
    processingFixed: 0,
    roundTo: 2500,
    pricingInheritance: { version: 1, overrides: [...pricingKeys] },
    eventPaymentSchedule: undefined,
    paymentSchedule: {
      mode: "percent",
      rows: [
        { full: 7000, po: 7000, due: "" },
        { full: 1500, po: 1500, due: "2098-01-05" },
        { full: 1500, po: 1500, due: "" },
      ],
    },
    deadlineOverride: "2098-01-25",
    policy: "Synthetic reviewed payment and refund terms.",
    reinstatement: "Synthetic owner review after all enrollment requirements.",
    parentExplanation: {
      initialDeposit: "Upfront uniforms and tournament commitments.",
      monthlyDues: "Included facility and program services.",
      teamExpenses: "Personal equipment and gate admission are separate.",
      additionalNotes: "",
    },
    readiness: {
      schedule: true,
      gas: true,
      hotels: true,
      other: true,
      processing: true,
      noUniform: false,
    },
  };
  await mutateFeePlan(h.sql, "owner", {
    action: "save",
    teamId: "soft",
    revision: 0,
    budget: organizationBudget,
    uniforms: [],
    expenses: [],
  });
  await owner.page.goto(origin + "/account?desk=team-finances");
  await owner.page.getByLabel("Team", { exact: true }).selectOption("soft");
  await owner.page.getByLabel("Organization fee per full player ($)", { exact: true }).fill("600");
  await owner.page.getByRole("button", { name: "Save draft & expenses", exact: true }).click();
  await owner.page
    .getByText("Draft saved. Publish after reviewing the fee and policy.", { exact: true })
    .waitFor();
  assert.equal(
    (await h.sql`select payload from team_fee_plans where team_id='soft'`)[0].payload.published,
    undefined,
  );
  await owner.page.reload();
  await owner.page.getByLabel("Team", { exact: true }).selectOption("soft");
  assert.equal(
    await owner.page
      .getByLabel("Organization fee per full player ($)", { exact: true })
      .inputValue(),
    "600",
  );
  await owner.page.getByRole("button", { name: "Review & publish fees", exact: true }).click();
  const reviewed = owner.page.locator('[aria-label="Player obligations to publish"]');
  await reviewed.waitFor();
  const expectedTotal = calculateFees({ ...organizationBudget, fullOrg: 60000 }).full;
  assert.ok(
    (await reviewed.innerText()).includes(
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
        expectedTotal / 100,
      ),
    ),
  );
  await owner.page.screenshot({ path: shots + "/publication-review-desktop.png", fullPage: false });
  owner.page.once("dialog", (dialog) => dialog.accept());
  await owner.page
    .getByRole("button", { name: "Save & publish approved fees", exact: true })
    .click();
  await owner.page.getByText(/^Fees published\./).waitFor();
  const published = (await h.sql`select payload from team_fee_plans where team_id='soft'`)[0]
    .payload;
  assert.equal(published.published.full, expectedTotal);
  assert.deepEqual(
    published.published.schedules.full.map((r) => r.amount),
    [
      Math.round(expectedTotal * 0.7),
      Math.round(expectedTotal * 0.15),
      Math.round(expectedTotal * 0.15),
    ],
  );
  assert.equal((await h.sql`select * from square_payments`).length, 0);
  assert.equal((await h.sql`select * from team_collection_authorizations`).length, 0);
  await owner.page.setViewportSize({ width: 375, height: 900 });
  await owner.page.getByRole("button", { name: "Review & publish fees", exact: true }).click();
  await reviewed.scrollIntoViewIfNeeded();
  assert.ok(
    await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  );
  await owner.page.screenshot({ path: shots + "/publication-review-mobile.png", fullPage: false });
  // Both funding models expose scoped invitations without granting financial writes.
  await coach.page.goto(origin + "/account?desk=team-finances");
  await coach.page.getByText("Team invitations", { exact: true }).click();
  await coach.page
    .getByRole("button", { name: "Refresh invitation status", exact: true })
    .waitFor();
  assert.equal(
    await coach.page.getByRole("button", { name: "Review & publish fees", exact: true }).count(),
    0,
  );
  assert.ok(!coach.bodies.join("").includes("PRIVATE-MEDICAL-CANARY"));
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
