// Real built application, disposable database and synthetic requests only.
import assert from "node:assert/strict";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { auditHarness } from "./audit-support.mjs";
const h = await auditHarness();
const output = "artifacts/journal";
await mkdir(output, { recursive: true });
let browser, socket, page;
const errors = [];
// PGlite's socket bridge shares prepared-statement state across virtual clients.
// Queue synthetic HTTP handling; this walkthrough verifies UI flows, while the
// PostgreSQL CI job separately exercises real concurrent transactions and locks.
let requestQueue = Promise.resolve();
function fixtureRequest(work) {
  const next = requestQueue.then(work);
  requestQueue = next.catch(() => {});
  return next;
}
try {
  socket = new PGLiteSocketServer({ db: h.db, host: "127.0.0.1", port: 0, maxConnections: 20 });
  await socket.start();
  process.env.DATABASE_URL = "postgresql://postgres@" + socket.getServerConn() + "/postgres";
  const handler = (await import("../.netlify/v1/functions/server.mjs")).default;
  browser = await chromium.launch({
    executablePath: process.env.LESSON_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--single-process", "--no-zygote"],
  });
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && /\.(js|css|woff2)(\?|$)/.test(r.url()))
      errors.push(`Asset ${r.status()} ${new URL(r.url()).pathname}`);
  });
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin !== h.base) return route.abort();
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
        /* Non-static paths are handled by the real application below. */
      }
    const response = await fixtureRequest(async () =>
      handler(
        new Request(req.url(), {
          method: req.method(),
          headers: { ...(await req.allHeaders()), "x-nf-client-connection-ip": "192.0.2.90" },
          ...(!["GET", "HEAD"].includes(req.method()) ? { body: req.postDataBuffer() } : {}),
        }),
      ),
    );
    if (url.pathname.startsWith("/articles"))
      console.log(
        "Journal HTTP",
        url.pathname,
        response.status,
        response.headers.get("location") || "",
      );
    const headers = Object.fromEntries(response.headers);
    if (response.headers.getSetCookie().length)
      headers["set-cookie"] = response.headers.getSetCookie().join("\n");
    return route.fulfill({
      status: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    });
  });

  const password = randomUUID() + "Fixture!";
  const signup = await h.api.handleAuthRequest(
    new Request(h.base + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: h.base, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Synthetic Website Owner",
        email: "website-owner@audit.example.invalid",
        password,
      }),
    }),
  );
  assert.equal(signup.status, 200);
  const owner = (await signup.json()).user.id;
  await h.sql`update "user" set "emailVerified"=true where id=${owner}`;
  await h.sql`insert into profiles(user_id,email,name,role) values(${owner},'website-owner@audit.example.invalid','Synthetic Website Owner','admin') on conflict(user_id) do update set role='admin'`;
  await h.sql`insert into owner_grants(email,user_id) values('website-owner@audit.example.invalid',${owner})`;
  const club = h.api.emptyClub();
  club._demo = false;
  club._rev = 1;
  await h.sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  await h.sql`insert into "user"(id,name,email,"emailVerified") values('website-coach','Synthetic Featured Coach','website-coach@audit.example.invalid',true)`;
  await h.sql`insert into person_profiles(user_id,publish_coach,profile) values('website-coach',true,'{"name":"Synthetic Featured Coach","photo":"","bio":"Synthetic coaching biography for isolated testing.","sports":["softball"],"specialties":[],"ages":"","approach":"","achievements":"","welcome":""}'::jsonb)`;

  const originalPrices = await h.sql`select id,price,credits from club_services order by id`;
  await page.goto(h.base + "/articles");
  await page.getByRole("heading", { name: "Stories are on the way" }).waitFor();
  assert.equal((await h.sql`select * from journal_publications`).length, 0);
  await page.goto(h.base + "/login?next=%2Foffice%2Fjournal");
  await page.getByLabel("Email", { exact: true }).fill("website-owner@audit.example.invalid");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/office/journal");
  await page.getByRole("button", { name: "New article", exact: true }).click();
  await page.getByLabel("Headline", { exact: true }).fill("Synthetic Journal lifecycle");
  await page
    .getByLabel("Excerpt", { exact: true })
    .fill("A synthetic article for the isolated release walkthrough.");
  await page.getByLabel("Sport", { exact: true }).last().selectOption("softball");
  await page
    .getByLabel("Author (published staff profile)", { exact: true })
    .selectOption({ label: "Synthetic Featured Coach" });
  await page.getByLabel("Softball", { exact: true }).check();
  await page.getByRole("button", { name: "Add paragraph", exact: true }).click();
  await page
    .getByLabel("Text", { exact: true })
    .fill("Synthetic published article body. **Verified fixture** with [current booking](/book).");
  await page
    .getByLabel(
      "Names, claims, dates, quotes and cited guidance have been checked by an authorized human reviewer.",
    )
    .check();
  await page
    .getByLabel("We have publication rights for the text and every image or video reference.")
    .check();
  await page.getByText("Search and social presentation", { exact: true }).click();
  await page.getByLabel("Article URL slug", { exact: true }).fill("synthetic-journal-lifecycle");
  await page.getByLabel("SEO title", { exact: true }).fill("Synthetic Journal SEO title");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByText("Saved. Any previous approval applies only to the earlier version.", { exact: true })
    .waitFor();
  const [article] =
    await h.sql`select id::text,revision from journal_articles where document->>'slug'='synthetic-journal-lifecycle'`;
  assert.ok(article);
  const hidden = await fixtureRequest(() =>
    handler(new Request(h.base + "/articles/synthetic-journal-lifecycle")),
  );
  assert.equal(hidden.status, 404, "draft public URL is a genuine 404");
  await page.getByLabel("Public image credit", { exact: true }).fill("Synthetic release fixture");
  await page
    .getByLabel("Private rights or license record", { exact: true })
    .fill("Generated test image; not a customer photograph.");
  const png = await sharp({
    create: { width: 640, height: 360, channels: 3, background: "#A9D8F3" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Upload image", { exact: true })
    .setInputFiles({ name: "synthetic-image.png", mimeType: "image/png", buffer: png });
  await page
    .getByText("Image uploaded. Select it as a hero or body image.", { exact: true })
    .waitFor();
  const [media] = await h.sql`select id::text from journal_media where article_id=${article.id}`;
  const privateImage = await fixtureRequest(() =>
    handler(new Request(h.base + "/api/journal/images/" + media.id)),
  );
  assert.equal(privateImage.status, 404, "private image cannot be fetched anonymously");
  await page.getByLabel("Hero image", { exact: true }).selectOption(media.id);
  await page
    .getByLabel("Hero alternative text", { exact: true })
    .fill("Synthetic blue rectangle for isolated testing");
  await page.getByText("Featured placement", { exact: true }).click();
  await page.getByLabel("Feature on homepage", { exact: true }).check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByText("Saved. Any previous approval applies only to the earlier version.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Private preview", exact: true }).click();
  await page.getByText("Private preview · Not a published article", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Preview mobile", exact: true }).click();
  await page.screenshot({ path: output + "/private-preview.png", fullPage: true });
  await page.getByRole("button", { name: "Back to editor", exact: true }).click();
  await page.getByRole("button", { name: "Submit for review", exact: true }).click();
  await page.getByText("Article submit completed.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Approve exact revision", exact: true }).click();
  await page.getByText("Article approve completed.", { exact: true }).waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Publish approved article", exact: true }).click();
  await page.getByText("Article publish completed.", { exact: true }).waitFor();
  for (const width of [375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const response = await page.goto(h.base + "/articles/synthetic-journal-lifecycle");
    assert.equal(response.status(), 200);
    const html = await response.text();
    assert.match(html, /Synthetic published article body/, "article body is SSR");
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /Synthetic Journal SEO title/);
    assert.match(html, /https:\/\/prospectssports.club\/articles\/synthetic-journal-lifecycle/);
    assert.doesNotMatch(
      html,
      /Generated test image; not a customer photograph/,
      "rights evidence is private",
    );
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `article overflow ${width}`,
    );
    await page.screenshot({ path: output + `/article-${width}.png`, fullPage: true });
    await page.goto(h.base + "/articles");
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `newsroom overflow ${width}`,
    );
    await page.screenshot({ path: output + `/newsroom-${width}.png`, fullPage: true });
  }
  const sitemap = await fixtureRequest(() => handler(new Request(h.base + "/sitemap.xml")));
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.match(xml, /\/articles\/synthetic-journal-lifecycle/);
  assert.match(xml, /\/memberships/);
  assert.doesNotMatch(xml, /complete-guide-to-indoor/, "unpublished launch drafts are not indexed");
  await page.goto(h.base + "/");
  await page.getByRole("heading", { name: "From the Prospects Journal" }).waitFor();
  await page.goto(h.base + "/office/journal");
  await page.getByRole("button", { name: "Synthetic Journal lifecycle", exact: true }).click();
  await page.getByLabel("Headline", { exact: true }).waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await page.getByText("Article unpublish completed.", { exact: true }).waitFor();
  assert.equal(
    (
      await fixtureRequest(() =>
        handler(new Request(h.base + "/articles/synthetic-journal-lifecycle")),
      )
    ).status,
    404,
  );
  assert.equal(
    (await fixtureRequest(() => handler(new Request(h.base + "/api/journal/images/" + media.id))))
      .status,
    404,
  );
  assert.deepEqual(
    await h.sql`select id,price,credits from club_services order by id`,
    originalPrices,
    "editorial publishing never changes billing",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Journal: real authenticated editor → image upload → private preview → review → approval → publication → SSR/SEO/sitemap/five widths → withdrawal. Existing prices unchanged.",
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: output + "/failure.png", fullPage: true }).catch(() => {});
    console.error(
      await page
        .locator("body")
        .innerText()
        .catch(() => "Page unavailable"),
    );
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (socket) {
    const deadline = Date.now() + 15000;
    while (socket.getStats().activeConnections && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 100));
    await socket.stop();
  }
  delete process.env.DATABASE_URL;
  await h.close();
}
