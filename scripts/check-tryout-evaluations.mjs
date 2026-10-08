// Full browser -> authenticated server function -> disposable database check.
// Never run with a database URL: synthetic users live only in this process.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import { hashPassword } from "better-auth/crypto";

for (const key of ["DATABASE_URL", "NETLIFY_DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  if (process.env[key]) throw new Error("This check requires a disposable local database.");
}
if (process.env.NETLIFY || process.env.NODE_ENV === "production")
  throw new Error("Local development only.");
process.env.VITE_AUTH_ENABLED = "true";
process.env.BETTER_AUTH_URL = "https://localhost:8082";
const origin = process.env.BETTER_AUTH_URL;
const shots = "/workspace/screenshots";
await mkdir(shots, { recursive: true });
const tls = await mkdtemp(join(tmpdir(), "prospects-tryout-"));
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(tls, "key.pem"),
    "-out",
    join(tls, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
  ],
  { stdio: "ignore" },
);
const server = await createServer({
  server: {
    host: "127.0.0.1",
    port: 8082,
    strictPort: true,
    https: {
      key: await readFile(join(tls, "key.pem")),
      cert: await readFile(join(tls, "cert.pem")),
    },
  },
});
let browser;
try {
  await server.listen();
  const { getSql } = await server.ssrLoadModule("/src/lib/db.ts");
  const sql = await getSql();
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
  const { emptyClub } = await server.ssrLoadModule("/src/lib/teams/seed.ts");
  const club = emptyClub();
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
  await sql`insert into club_requests(id,kind,payload) values('fixture-registration','tryout',${JSON.stringify({ player: "Tryout Test Player", age: "13U", sport: "Baseball" })}::jsonb)`;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...(process.env.TEST_CHROMIUM_PATH ? { executablePath: process.env.TEST_CHROMIUM_PATH } : {}),
  });
  const failures = [];
  async function signedIn(email, width = 390) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
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
  await page.getByRole("button", { name: "New evaluation", exact: true }).click();
  await page.getByLabel("Registration", { exact: true }).selectOption("fixture-registration");
  await page
    .getByRole("radio", { name: "Contact / barrel control: 4", exact: true })
    .locator("..")
    .click();
  await page
    .getByLabel("Best skill / possible role", { exact: true })
    .fill("Test evidence: tracks the ball well.");
  await page.getByLabel("Recommendation", { exact: true }).selectOption("callback");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved" }).waitFor();
  assert.equal(
    await page.locator("html").evaluate((el) => el.scrollWidth > el.clientWidth + 1),
    false,
    "mobile overflow",
  );
  await page.screenshot({ path: shots + "/prospects-tryout-form-mobile.png", fullPage: true });
  console.log("Draft saved on mobile");
  await page.reload();
  await page.getByRole("button").filter({ hasText: "Tryout Test Player" }).click();
  assert.equal(
    await page.getByRole("radio", { name: "Contact / barrel control: 4", exact: true }).isChecked(),
    true,
  );
  assert.equal(
    await page.getByLabel("Best skill / possible role", { exact: true }).inputValue(),
    "Test evidence: tracks the ball well.",
  );
  for (const name of [
    "Hitting approach / balance",
    "Fielding hands / feet",
    "Throw accuracy / transfer",
    "Athletic movement",
    "Baseball / softball knowledge",
    "Coachability / effort",
  ])
    await page
      .getByRole("radio", { name: name + ": 3", exact: true })
      .locator("..")
      .click();
  await page.getByRole("button", { name: "Submit evaluation", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Evaluation submitted" }).waitFor();
  console.log("Submitted after reload");
  const [stored] = await sql`select status,revision,evaluator_id from tryout_evaluations`;
  assert.deepEqual(stored, { status: "submitted", revision: 2, evaluator_id: "fixture-coach" });
  const owner = await signedIn("stevemccutcheon89@gmail.com", 1280);
  await owner.page.getByRole("button").filter({ hasText: "Tryout Test Player" }).waitFor();
  assert.match(await owner.page.locator("main").innerText(), /22 \/ 35/);
  await owner.page.screenshot({
    path: shots + "/prospects-tryout-owner-desktop.png",
    fullPage: true,
  });
  await owner.page.getByRole("button").filter({ hasText: "Tryout Test Player" }).click();
  assert.equal(
    await owner.page.getByLabel("Best skill / possible role", { exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await owner.page.getByRole("button", { name: "Save draft", exact: true }).count(),
    0,
  );
  const parent = await signedIn("parent@example.invalid");
  await parent.page.getByRole("alert").filter({ hasText: "Coach or owner access" }).waitFor();
  assert.doesNotMatch(await parent.page.locator("body").innerText(), /Tryout Test Player/);
  await context.close();
  await owner.context.close();
  await parent.context.close();
  assert.deepEqual(failures, []);
  console.log(
    "PASS mobile draft -> reload -> submit -> separate owner session -> parent denial; database attribution verified.",
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({ path: shots + "/prospects-tryout-failure.png", fullPage: true });
    console.error("Browser state:", (await page.locator("main").innerText()).slice(0, 2500));
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
  await (await globalThis.__pgliteInstance__)?.close();
  await rm(tls, { recursive: true, force: true });
}
