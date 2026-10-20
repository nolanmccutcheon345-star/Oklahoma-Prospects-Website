// Full browser -> authenticated server function -> disposable database check.
// Never run with a database URL: synthetic users live only in this process.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { auditHarness } from "./audit-support.mjs";
import { chromium } from "playwright";
import { hashPassword } from "better-auth/crypto";
import { toJSONAsync } from "seroval";

for (const key of ["DATABASE_URL", "NETLIFY_DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  if (process.env[key]) throw new Error("This check requires a disposable local database.");
}
const h = await auditHarness();
const origin = h.base;
const shots = "artifacts/coordinator";
await mkdir(shots, { recursive: true });
let browser, socket;
let requestQueue = Promise.resolve();
const traces = new WeakMap();
const browserDiagnostics = [];
const financialCanaries = ["PRIVATE-FINANCE-CANARY-9137", "PRIVATE-BILLING-CANARY-8426"];
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
    traces.set(context, []);
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
      if (url.pathname.startsWith("/_serverFn/") || url.pathname.startsWith("/api/fundraising/")) {
        const requestHeaders = await req.allHeaders();
        traces.get(context).push({
          url: req.url(),
          method: req.method(),
          body: req.postData(),
          headers: Object.fromEntries(
            Object.entries(requestHeaders).filter(
              ([key]) =>
                ![
                  "cookie",
                  "authorization",
                  "host",
                  "content-length",
                  "connection",
                  "origin",
                  "referer",
                ].includes(key),
            ),
          ),
          response: body.toString("utf8"),
          status: response.status,
        });
      }
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
    ["fixture-org", "operations@example.invalid", "parent"],
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
      level: "AA",
      seasonLabel: "Spring 2099",
      seasonStart: "2099-01-01",
      seasonEnd: "2099-06-01",
      months: 6,
      headCoach: "Synthetic Coach",
      uniformPackageId: "",
      uniformDeadline: "",
      orgFee: 9137,
      coachMonthly: 8426,
      eventBudget: 7135,
      otherCosts: { insurance: 1, balls: 2, fields: 3, admin: 4, travel: 5 },
      teamCageHoursPerWeek: 0,
      playerCageHoursPerWeek: 0,
      record: { w: 0, l: 0, t: 0 },
      tournamentIds: [],
      practices: [],
      messages: [],
      announcements: [],
      attendance: {},
      pitchLog: [],
      closed: false,
      notes: financialCanaries[0],
    },
  ];
  club.teams.push({
    ...structuredClone(club.teams[0]),
    id: "fixture-baseball",
    name: "Baseball organization test",
    sport: "baseball",
  });
  club.catalog = [
    {
      id: "fixture-catalog",
      name: "Synthetic operational tournament",
      org: "Test organizer",
      city: "Tulsa",
      state: "OK",
      start: "2099-05-10",
      end: "2099-05-12",
      sport: "softball",
      type: "tournament",
      ages: ["13U"],
      levels: ["AA"],
      fee: 91378426,
      notes: financialCanaries[0],
      sourceUrl: "",
      distanceMiles: 12,
    },
  ];
  await sql`insert into club_state(id,payload,rev) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1)`;
  await sql`insert into club_requests(id,kind,payload) values('fixture-registration','tryout',${JSON.stringify({ player: "Tryout Test Player", parent: "Synthetic Guardian", email: "family@example.invalid", phone: "555-0100", positions: "Pitcher", notes: "Synthetic test record", age: "13U", sport: "Baseball", season: "Spring 2099" })}::jsonb)`;
  await sql`insert into club_athletes(id,name,household_email,profile) values('fixture-development','Synthetic operational athlete','family@example.invalid',${JSON.stringify({ sport: "softball", privateFinancial: financialCanaries[1] })}::jsonb)`;
  await sql`insert into training_events(id,payload,updated_by) values('fixture-public-event',${JSON.stringify({ id: "fixture-public-event", revision: 1, name: "Synthetic operational camp", description: "Published camp description", type: "camp", sport: "Softball", status: "published", location: "Test facility", sessions: [{ date: "2099-06-01", start: "09:00", end: "12:00" }], priceCents: 91378426, policy: financialCanaries[0], receipt_url: financialCanaries[1] })}::jsonb,'fixture-owner')`;
  await sql`insert into club_services(id,kind,name,price,purpose,detail,active) values('fixture-private-service','lesson',${financialCanaries[0]},91378426,${financialCanaries[1]},${financialCanaries[0]},false)`;
  await sql`update owner_grants set user_id='fixture-owner' where email='stevemccutcheon89@gmail.com'`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('fixture-org','active','fixture-owner')`;
  await sql`insert into finance_audit(actor_id,record_id,action,reason) values('fixture-owner','fixture-finance','test',${financialCanaries[0]})`;
  await sql`insert into club_requests(id,kind,payload) values('fixture-billing','refund-review',${JSON.stringify({ note: financialCanaries[1], amount: 91378426 })}::jsonb)`;
  await sql`insert into coordinator_assignments(user_id,sport,coverage,permissions,updated_by) values('fixture-zero','softball','sport','{}','fixture-owner'),('fixture-coach','softball','sport',array['recruiting.read','rosters.read'],'fixture-owner')`;
  await sql`update club_requests set payload=payload||'{"sport":"Softball","preferredTeamId":"fixture-team"}'::jsonb where id='fixture-registration'`;
  if (process.env.COORDINATOR_TRANSPORT_ONLY === "true") {
    // Real compiled HTTP authentication/server-function transport without a UI.
    // This mode is useful when Chromium itself cannot start in the executor.
    const manifest = await readFile("dist/server/server.js", "utf8");
    const ids = new Map(
      [
        ...manifest.matchAll(
          /"([a-f0-9]{64})":\s*\{\s*functionName: "([^"]+)_createServerFn_handler"/g,
        ),
      ].map((m) => [m[2], m[1]]),
    );
    async function login(email) {
      const response = await handler(
        new Request(origin + "/api/auth/sign-in/email", {
          method: "POST",
          headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" },
          body: JSON.stringify({ email, password }),
        }),
      );
      const text = await response.text();
      assert.equal(response.status, 200, `Synthetic login failed: ${text}`);
      const cookie = response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      assert.ok(cookie, "Real authentication must establish a session cookie");
      return cookie;
    }
    async function rpc(cookie, name, method = "GET", data) {
      assert.ok(ids.has(name), `Missing compiled function ${name}`);
      const payload = data === undefined ? undefined : JSON.stringify(await toJSONAsync({ data }));
      const response = await handler(
        new Request(
          origin +
            "/_serverFn/" +
            ids.get(name) +
            (method === "GET" && payload ? "?payload=" + encodeURIComponent(payload) : ""),
          {
            method,
            headers: {
              cookie,
              origin,
              "sec-fetch-site": "same-origin",
              "x-tsr-serverFn": "true",
              accept: "application/json",
              "content-type": "application/json",
            },
            ...(method === "POST" ? { body: payload } : {}),
          },
        ),
      );
      return { status: response.status, body: await response.text() };
    }
    const ownerCookie = await login("stevemccutcheon89@gmail.com");
    const orgCookie = await login("operations@example.invalid");
    const ownerFinance = await rpc(ownerCookie, "getFinance");
    assert.match(
      ownerFinance.body,
      /PRIVATE-FINANCE-CANARY-9137/,
      "Owner baseline must return private financial data",
    );
    const financeBefore =
      await sql`select (select jsonb_agg(to_jsonb(f)) from finance_records f) as records,(select jsonb_agg(to_jsonb(f)) from finance_state f) as state,(select jsonb_agg(to_jsonb(f)) from finance_audit f) as audit`;
    for (const name of [
      "getOrganizationWorkspace",
      "getOrganizationTournaments",
      "getOrganizationCatalog",
      "getOrganizationDevelopment",
      "getOrganizationPeople",
      "getOrganizationBookings",
      "getOrganizationEvents",
      "getOrganizationServices",
      "getOrganizationContent",
    ]) {
      const denied = await rpc(orgCookie, name);
      assert.match(denied.body, /not authorized|CoordinatorDenied|ACCESS_DENIED/i);
      for (const marker of [
        ...financialCanaries,
        "Prospects test team",
        "Synthetic operational athlete",
      ])
        assert.ok(!denied.body.includes(marker));
    }
    // The retained owner workflows still work; retired blanket grants never do.
    const workspace = await rpc(ownerCookie, "getOrganizationWorkspace");
    assert.match(workspace.body, /Prospects test team/);
    assert.match(workspace.body, /Baseball organization test/);
    for (const c of financialCanaries) assert.ok(!workspace.body.includes(c));
    for (const [name, marker] of [
      ["getOrganizationTournaments", "Synthetic operational tournament"],
      ["getOrganizationCatalog", "Synthetic operational camp"],
      ["getOrganizationDevelopment", "Synthetic operational athlete"],
    ]) {
      const result = await rpc(ownerCookie, name);
      assert.equal(result.status, 200, `${name} compiled read must succeed`);
      assert.ok(result.body.includes(marker), `${name} must return operational fixture`);
      for (const canary of financialCanaries) assert.ok(!result.body.includes(canary));
      assert.ok(!result.body.includes("91378426"), `${name} leaked private financial amount`);
    }
    for (const name of [
      "getOrganizationPeople",
      "getOrganizationBookings",
      "getOrganizationEvents",
      "getOrganizationServices",
      "getOrganizationContent",
    ]) {
      const result = await rpc(ownerCookie, name);
      assert.equal(result.status, 200, `${name} compiled read must succeed`);
      assert.doesNotMatch(result.body, /CoordinatorDenied|ACCESS_DENIED|"name":"Error"/);
      for (const canary of financialCanaries) assert.ok(!result.body.includes(canary));
      assert.ok(!result.body.includes("91378426"), `${name} leaked a financial amount`);
    }
    // The retired grant editor is no longer a client entry point. If the
    // compiler retains its transport, it must still reject non-owner calls.
    if (ids.has("getOrganizationAccessPreview")) {
      const grantPreview = await rpc(orgCookie, "getOrganizationAccessPreview", "POST", {
        userId: "fixture-org",
      });
      assert.match(grantPreview.body, /not authorized|CoordinatorDenied|ACCESS_DENIED/i);
    }
    for (const name of [
      "getFinance",
      "getMyFinance",
      "getProfile",
      "getFamilyBilling",
      "getCheckoutContext",
      "myShopOrders",
    ]) {
      const result = await rpc(orgCookie, name);
      assert.match(
        result.body,
        /not authorized|CoordinatorDenied|ACCESS_DENIED/i,
        `${name} must deny actual compiled request`,
      );
      for (const c of financialCanaries) assert.ok(!result.body.includes(c));
    }
    const financeWrite = await rpc(orgCookie, "changeFinance", "POST", { action: "refresh" });
    assert.match(financeWrite.body, /not authorized|CoordinatorDenied|ACCESS_DENIED/i);
    const edit = {
      revision: 1,
      teamId: "fixture-team",
      changes: { name: "Organization edited team" },
    };
    const deniedEdit = await rpc(orgCookie, "saveOrganizationTeam", "POST", edit);
    assert.match(deniedEdit.body, /not authorized|CoordinatorDenied|ACCESS_DENIED/i);
    const saved = await rpc(ownerCookie, "saveOrganizationTeam", "POST", edit);
    assert.doesNotMatch(saved.body, /not authorized|CoordinatorDenied|Error/);
    const [row] = await sql`select payload,rev from club_state where id='oklahoma-prospects'`;
    assert.equal(row.payload.teams[0].name, edit.changes.name);
    for (const key of ["orgFee", "coachMonthly", "eventBudget", "otherCosts", "notes"])
      assert.deepEqual(row.payload.teams[0][key], club.teams[0][key]);
    const captured = await h.api.financialBasis.previewFinancialBasisInitialization(
      sql,
      "fixture-owner",
    );
    await h.api.financialBasis.initializeFinancialBasisForOwner(sql, "fixture-owner", {
      ...captured,
      reason: "Synthetic operational financial preservation",
    });
    await h.api.financialContextFixture.applyFutureActiveSchemaForTest(sql);
    const pinnedBefore = await h.api.financialContext.withFinancialContext(
      sql,
      "fixture-owner",
      "owner",
      async (_tx, context) => structuredClone(context.basis),
    );
    const activeFinanceBefore = await rpc(ownerCookie, "getFinance");
    const activeEdit = await rpc(ownerCookie, "saveOrganizationTeam", "POST", {
      revision: row.rev,
      teamId: "fixture-team",
      changes: { seasonEnd: "2099-12-31", coachEmail: "operational-coach@example.invalid" },
    });
    assert.doesNotMatch(activeEdit.body, /not authorized|CoordinatorDenied|Error/);
    assert.deepEqual(
      await h.api.financialContext.withFinancialContext(
        sql,
        "fixture-owner",
        "owner",
        async (_tx, context) => structuredClone(context.basis),
      ),
      pinnedBefore,
    );
    assert.equal((await rpc(ownerCookie, "getFinance")).body, activeFinanceBefore.body);
    // Exercise the former-blanket transition through actual authenticated HTTP,
    // including the transport gate (domain-only tests cannot catch this boundary).
    const reset = await rpc(ownerCookie, "resetStaffCoordinatorAccess", "POST", {
      userId: "fixture-org",
      assignments: [],
      legacyRevision: 1,
      reason: "Owner reviewed withdrawal before explicit scoped access",
      confirmed: true,
    });
    assert.doesNotMatch(reset.body, /CoordinatorDenied|ACCESS_DENIED|"name":"Error"/);
    const assignment = {
      userId: "fixture-org",
      sport: "softball",
      revision: 0,
      status: "active",
      coverage: "teams",
      teamIds: [],
      permissions: [],
      confirm: true,
      independentRolesReviewed: true,
    };
    const assigned = await rpc(ownerCookie, "saveStaffRole", "POST", assignment);
    assert.doesNotMatch(assigned.body, /CoordinatorDenied|ACCESS_DENIED|"name":"Error"/);
    const scope = { sport: "softball", teamId: "fixture-team" };
    assert.match(
      (await rpc(orgCookie, "getCoordinatorRecruiting", "POST", scope)).body,
      /not authorized/i,
    );
    const granted = await rpc(ownerCookie, "saveStaffRole", "POST", {
      ...assignment,
      revision: 1,
      teamIds: ["fixture-team"],
      permissions: ["recruiting.read"],
    });
    assert.doesNotMatch(granted.body, /CoordinatorDenied|ACCESS_DENIED|"name":"Error"/);
    const scoped = await rpc(orgCookie, "getCoordinatorRecruiting", "POST", scope);
    assert.match(scoped.body, /Tryout Test Player/);
    assert.doesNotMatch(scoped.body, /family@example.invalid|555-0100/);
    assert.match(
      (
        await rpc(orgCookie, "getCoordinatorRecruiting", "POST", {
          sport: "baseball",
          teamId: "fixture-baseball",
        })
      ).body,
      /not authorized/i,
    );
    for (const name of ["getFinance", "getFamilyBilling", "getStaffRoles"])
      assert.match((await rpc(orgCookie, name)).body, /not authorized/i);
    const revoked = await rpc(ownerCookie, "saveStaffRole", "POST", {
      ...assignment,
      revision: 2,
      status: "suspended",
    });
    assert.doesNotMatch(revoked.body, /CoordinatorDenied|ACCESS_DENIED|"name":"Error"/);
    assert.match(
      (await rpc(orgCookie, "getCoordinatorRecruiting", "POST", scope)).body,
      /not authorized/i,
    );
    await sql`update organization_operational_access set status='suspended' where user_id='fixture-org'`;
    for (const [name, method, data] of [
      ["getOrganizationWorkspace", "GET"],
      ["getOrganizationTournaments", "GET"],
      ["getOrganizationCatalog", "GET"],
      ["getOrganizationDevelopment", "GET"],
      ...[
        "getOrganizationPeople",
        "getOrganizationBookings",
        "getOrganizationEvents",
        "getOrganizationServices",
        "getOrganizationContent",
      ].map((name) => [name, "GET"]),
      ["saveOrganizationTeam", "POST", { ...edit, revision: row.rev }],
      ["getFinance", "GET"],
    ]) {
      const result = await rpc(orgCookie, name, method, data);
      assert.match(
        result.body,
        /not authorized|CoordinatorDenied|ACCESS_DENIED/i,
        `Active session must lose ${name} after suspension`,
      );
    }
    assert.deepEqual(
      await sql`select (select jsonb_agg(to_jsonb(f)) from finance_records f) as records,(select jsonb_agg(to_jsonb(f)) from finance_state f) as state,(select jsonb_agg(to_jsonb(f)) from finance_audit f) as audit`,
      financeBefore,
    );
    console.log(
      "PASS TRANSPORT ONLY: real compiled login, owner finance baseline, owner two-sport projection/write, retired blanket-access denial, legacy/payment financial read/write denial, unchanged financial state, same-session suspension. UI NOT TESTED.",
    );
  } else {
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
      const recordDiagnostic = (kind, message) => {
        browserDiagnostics.push({
          actor: email.split("@")[0],
          kind,
          message: message.slice(0, 4000),
        });
        if (browserDiagnostics.length > 200) browserDiagnostics.shift();
      };
      page.on("console", (message) => recordDiagnostic(message.type(), message.text()));
      page.on("pageerror", (error) => recordDiagnostic("pageerror", error.message));
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
    assert.equal(
      await zero.page.getByRole("button", { name: "Recruiting", exact: true }).count(),
      0,
    );
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
      await parent.page
        .getByRole("link", { name: "Coordinator Front Office", exact: true })
        .count(),
      0,
    );
    // Keep this authenticated context alive until final cleanup: account prefetch
    // can still have queued routes after the visible parent assertion passes.
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

    // The ordinary parent accepts a generic invitation. This must not promote
    // their base role or grant even a single operational capability.
    await owner.page.getByRole("button", { name: "Coordinator Invitations", exact: true }).click();
    await owner.page.getByLabel("Invitation email", { exact: true }).fill("parent@example.invalid");
    await owner.page
      .getByRole("button", { name: "Create zero-permission invitation", exact: true })
      .click();
    await owner.page.getByText(/Invitation saved. Ask the recipient/).waitFor();
    await parent.page.goto(origin + "/invitations");
    await parent.page
      .getByRole("heading", { name: "Softball Coordinator invitation", exact: true })
      .waitFor();
    await parent.page.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await parent.page.getByText(/Invitation accepted. Open your account/).waitFor();
    await parent.page.goto(origin + "/coordinator");
    await parent.page.getByText("No operational modules enabled", { exact: true }).waitFor();
    const [invitedGrant] =
      await sql`select permissions,team_ids from coordinator_assignments where user_id='fixture-parent' and sport='softball'`;
    assert.deepEqual(invitedGrant, { permissions: [], team_ids: [] });
    assert.equal(
      (await sql`select role from profiles where user_id='fixture-parent'`)[0].role,
      "parent",
    );

    // Capture real, successfully authorized owner read requests, then replay the
    // exact compiled server-function transport with a restricted user's cookies.
    // This avoids relying on hidden buttons or guessed server-function hashes.
    await owner.page.goto(origin + "/office?section=finance");
    await owner.page.getByRole("heading", { name: "Finance", exact: true }).waitFor();
    await owner.page
      .getByRole("navigation", { name: "Finance sections", exact: true })
      .getByRole("button", { name: "Audit", exact: true })
      .click();
    await owner.page.waitForFunction(() =>
      document.body.innerText.includes("PRIVATE-FINANCE-CANARY-9137"),
    );
    const privilegedReads = traces
      .get(owner.context)
      .filter((t) => financialCanaries.some((c) => t.response.includes(c)));
    assert.ok(
      privilegedReads.length >= 2,
      "Owner must actually receive mixed club data and private finance before testing denial",
    );
    const financeBefore =
      await sql`select (select jsonb_agg(to_jsonb(f)) from finance_records f) as records,(select jsonb_agg(to_jsonb(f)) from finance_state f) as state,(select jsonb_agg(to_jsonb(f)) from finance_audit f) as audit`;
    const org = await signedIn("operations@example.invalid");
    // A persisted blanket grant is inert after retirement, even in an authenticated session.
    const retiredMessage =
      "An owner must withdraw your previous access and explicitly configure your coordinator permissions.";
    await org.page.getByText(retiredMessage, { exact: true }).waitFor();
    assert.equal(await org.page.getByLabel("Team workspace", { exact: true }).count(), 0);
    for (const marker of [
      "Baseball organization test",
      "Prospects test team",
      ...financialCanaries,
    ])
      assert.ok(!(await org.page.locator("body").innerText()).includes(marker));
    await org.page.goto(origin + "/account");
    await org.page.waitForURL(origin + "/coordinator");
    await org.page.getByText(retiredMessage, { exact: true }).waitFor();
    assert.deepEqual(
      (await sql`select payload from club_state where id='oklahoma-prospects'`)[0].payload.teams,
      club.teams,
    );
    const replay = async (request) =>
      org.page.evaluate(async ({ url, method, headers, body }) => {
        const response = await fetch(url, {
          method,
          headers,
          credentials: "same-origin",
          ...(method === "GET" || method === "HEAD" ? {} : { body }),
        });
        return { status: response.status, body: await response.text() };
      }, request);
    for (const request of new Map(privilegedReads.map((t) => [t.url, t])).values()) {
      const result = await replay(request);
      assert.match(
        result.body,
        /not authorized|CoordinatorDenied|ACCESS_DENIED/i,
        "Direct owner endpoint replay must be denied by the server",
      );
      for (const marker of financialCanaries) assert.ok(!result.body.includes(marker));
    }
    for (const path of ["/office?section=finance", "/family"]) {
      await org.page.goto(origin + path);
      await org.page.waitForLoadState("networkidle");
      assert.equal(
        await org.page.getByRole("heading", { name: "Finance", exact: true }).count(),
        0,
      );
    }
    for (const path of ["/api/fundraising/dashboard?scope=my", "/api/fundraising/export"]) {
      const result = await org.page.evaluate(async (path) => {
        const r = await fetch(path);
        return { status: r.status, body: await r.text() };
      }, path);
      assert.ok(
        result.status >= 400 || /not authorized|access|error/i.test(result.body),
        "Direct fundraising route must reject the financially restricted account",
      );
    }
    // Enable only a synthetic readiness configuration, with ALL outbound Node
    // fetches blocked. Disabled-ledger early rejection is tested separately.
    const readiness = {
      CONTEXT: "dev",
      SQUARE_ENVIRONMENT: "sandbox",
      SQUARE_CHECKOUT_SCOPE: "all",
      SQUARE_SANDBOX_APPLICATION_ID: "sandbox-offline-fixture",
      SQUARE_SANDBOX_LOCATION_ID: "offline-location",
      SQUARE_SANDBOX_MERCHANT_ID: "offline-merchant",
      SQUARE_SANDBOX_ACCESS_TOKEN: "offline-not-a-credential",
      SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY: "offline-signature",
      SQUARE_SANDBOX_WEBHOOK_URL: origin + "/api/square/webhook",
      APP_BASE_URL: origin,
      DEPLOY_PRIME_URL: origin,
      FUNDRAISING_PAYMENTS_ENABLED: "true",
      FUNDRAISING_LEDGER_ENABLED: "true",
    };
    const priorReadiness = Object.fromEntries(
      Object.keys(readiness).map((key) => [key, process.env[key]]),
    );
    const priorFetch = globalThis.fetch;
    Object.assign(process.env, readiness);
    let outboundAttempted = false;
    globalThis.fetch = async () => {
      outboundAttempted = true;
      throw new Error("Provider network is forbidden in this isolated check");
    };
    try {
      for (const path of ["/api/fundraising/checkout", "/api/fundraising/receipt"]) {
        const result = await org.page.evaluate(async (path) => {
          const r = await fetch(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: "e8bb9370-196c-4d51-b09f-956d281dc921" }),
          });
          return { status: r.status, body: await r.text() };
        }, path);
        assert.equal(
          result.status,
          403,
          "Ready fundraising checkout and receipt routes must enforce financial restriction",
        );
        assert.match(result.body, /not authorized/i);
      }
      assert.equal(outboundAttempted, false);
    } finally {
      globalThis.fetch = priorFetch;
      for (const [key, value] of Object.entries(priorReadiness)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    await org.page.goto(origin + "/coordinator");
    await org.page.getByText(retiredMessage, { exact: true }).waitFor();
    await org.page.screenshot({ path: shots + "/organization-mobile.png", fullPage: true });
    for (const trace of traces.get(org.context))
      for (const marker of financialCanaries)
        assert.ok(
          !trace.response.includes(marker),
          "Private financial canary leaked in an authenticated response",
        );

    // Explicit owner withdrawal and new granular grant, through compiled authenticated UI.
    await owner.page.goto(origin + "/office?section=staff");
    await owner.page
      .getByLabel("Verified staff account", { exact: true })
      .selectOption("fixture-org");
    await owner.page
      .locator("summary")
      .filter({ hasText: "Withdraw all coordinator access" })
      .click();
    await owner.page
      .getByLabel("Reason for withdrawing access", { exact: true })
      .fill("Owner reviewed retirement before scoped delegation");
    await owner.page
      .getByRole("button", { name: "Withdraw all coordinator access", exact: true })
      .click();
    await owner.page
      .getByText(
        "Coordinator access withdrawn. No operational permissions remain; financial restrictions are unchanged.",
        { exact: true },
      )
      .waitFor();
    await owner.page
      .getByRole("button", { name: "Assign Role With Zero Permissions", exact: true })
      .click();
    await owner.page
      .getByText("Permissions saved. Server access has been updated.", { exact: true })
      .waitFor();
    await org.page.goto(origin + "/coordinator");
    await org.page.getByText("No operational modules enabled", { exact: true }).waitFor();
    await owner.page.getByLabel("Coverage", { exact: true }).selectOption("sport");
    await owner.page
      .locator("summary")
      .filter({ hasText: /^recruiting \(/i })
      .click();
    await owner.page.getByLabel("View prospects and tryout registrations", { exact: true }).check();
    await owner.page.getByRole("button", { name: "Save Permissions", exact: true }).click();
    await owner.page
      .getByText("Permissions saved. Server access has been updated.", { exact: true })
      .waitFor();
    await org.page.reload();
    await org.page.getByRole("button", { name: "Recruiting", exact: true }).click();
    await org.page.getByText("Tryout Test Player · 13U", { exact: true }).waitFor();
    assert.deepEqual(
      (
        await sql`select permissions from coordinator_assignments where user_id='fixture-org' and sport='softball'`
      )[0].permissions,
      ["recruiting.read"],
    );
    const afterTransition = await replay(privilegedReads[0]);
    assert.match(afterTransition.body, /not authorized|CoordinatorDenied|ACCESS_DENIED/i);

    // Keep the same valid session: suspension must deny the very next mutation,
    // and removal of operations must never restore household financial access.
    await sql`update organization_operational_access set status='suspended',revision=revision+1 where user_id='fixture-org'`;
    const stillDenied = await replay(privilegedReads[0]);
    assert.match(stillDenied.body, /not authorized|CoordinatorDenied|ACCESS_DENIED/i);
    const [restricted] =
      await sql`select financial_restricted from organization_operational_access where user_id='fixture-org'`;
    assert.equal(restricted.financial_restricted, true);
    assert.deepEqual(
      await sql`select (select jsonb_agg(to_jsonb(f)) from finance_records f) as records,(select jsonb_agg(to_jsonb(f)) from finance_state f) as state,(select jsonb_agg(to_jsonb(f)) from finance_audit f) as audit`,
      financeBefore,
    );
    assert.equal(failures.length, 0, failures.join("\n"));
    console.log(
      "PASS: scoped coordinator regressions; persisted blanket grants denied; actual owner financial transport replay denied; canary-free responses; protected fields preserved; account redirect; sticky active-session suspension; unchanged finance records.",
    );
  }
} catch (error) {
  // Only synthetic fixtures run here. Do not dump request headers, cookies,
  // credentials, storage state, or full authenticated network responses.
  const diagnostics = { error: String(error), console: browserDiagnostics, pages: [] };
  for (const [index, page] of (
    browser?.contexts().flatMap((context) => context.pages()) || []
  ).entries()) {
    const entry = { index, url: page.url() };
    try {
      entry.body = (await page.locator("body").innerText({ timeout: 3000 })).slice(0, 30000);
    } catch (failure) {
      entry.bodyError = String(failure);
    }
    try {
      await page.screenshot({
        path: `${shots}/failure-${index}.png`,
        fullPage: true,
        timeout: 5000,
      });
    } catch (failure) {
      entry.screenshotError = String(failure);
    }
    diagnostics.pages.push(entry);
  }
  try {
    await writeFile(`${shots}/failure-diagnostics.json`, JSON.stringify(diagnostics, null, 2));
    console.error("Coordinator failure diagnostics:", JSON.stringify(diagnostics));
  } catch (failure) {
    console.error("Could not save coordinator failure diagnostics:", String(failure));
  }
  throw error;
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
