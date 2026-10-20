// Synthetic component interactions only. Server authorization is tested separately with PGlite.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

async function componentScript() {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {OrganizationTournamentFinder} from './src/components/coordinator/organization-tournaments'; globalThis.__root=createRoot(document.getElementById('root')); globalThis.__root.render(React.createElement(OrganizationTournamentFinder,{onSaved:()=>{globalThis.__savedNotifications++}}));`,
      resolveDir: process.cwd(),
      sourcefile: "synthetic-tournament-entry.tsx",
      loader: "tsx",
    },
    write: false,
    bundle: true,
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "synthetic-tournament-api",
        setup(b) {
          b.onResolve({ filter: /^@\/lib\/coordinator\/organization-tournaments-api$/ }, () => ({
            path: "tournament-api",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export const {getOrganizationTournaments,getOrganizationTournamentReport,saveOrganizationTournamentSource}=globalThis.__tournamentApi;",
            loader: "js",
          }));
        },
      },
    ],
  });
  return result.outputFiles[0].text;
}
async function setup(page, script) {
  await page.route("**/*", (route) => route.abort());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => {
    const base = {
      id: "base-event",
      name: "Synthetic Baseball Event",
      org: "Synthetic organizer",
      city: "Broken Arrow",
      state: "OK",
      start: "2030-05-10",
      end: "2030-05-12",
      sport: "baseball",
      type: "tournament",
      ages: ["14U"],
      levels: ["AAA"],
      sourceUrl: "https://www.usssa.com/baseball_events",
      sourceCheckedOn: "2026-10-01",
      distanceMiles: 10,
      sourceEditable: true,
    };
    globalThis.__workspace = {
      revision: 1,
      teams: [
        {
          id: "base",
          name: "Synthetic Baseball Team",
          sport: "baseball",
          age: "14U",
          level: "AAA",
          seasonStart: "2030-01-01",
          seasonEnd: "2030-12-31",
          tournamentIds: ["base-event"],
        },
        {
          id: "soft",
          name: "Synthetic Softball Team",
          sport: "softball",
          age: "14U",
          level: "Open",
          seasonStart: "2030-01-01",
          seasonEnd: "2030-12-31",
          tournamentIds: ["soft-event"],
        },
      ],
      catalog: [
        base,
        {
          ...base,
          id: "soft-event",
          name: "Synthetic Softball Event",
          sport: "softball",
          type: "showcase",
          levels: ["Open"],
          distanceMiles: 250,
        },
        {
          ...base,
          id: "protected-event",
          name: "Synthetic protected source",
          sourceUrl: "",
          sourceCheckedOn: "",
          sourceEditable: false,
        },
      ],
    };
    globalThis.__savedNotifications = 0;
    globalThis.__calls = [];
    globalThis.__deny = false;
    globalThis.__failSave = false;
    globalThis.__failExport = false;
    globalThis.__tournamentApi = {
      getOrganizationTournaments: async () => {
        if (globalThis.__deny) throw new Error("Operational access was revoked.");
        return structuredClone(globalThis.__workspace);
      },
      saveOrganizationTournamentSource: async ({ data }) => {
        globalThis.__calls.push({ kind: "save", data });
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (globalThis.__deny) throw new Error("Operational access was revoked.");
        if (globalThis.__failSave) throw new Error("Synthetic temporary save error.");
        Object.assign(
          globalThis.__workspace.catalog.find((event) => event.id === data.id),
          {
            sourceUrl: data.sourceUrl,
            sourceCheckedOn: data.sourceCheckedOn,
            distanceMiles: data.distanceMiles,
          },
        );
        globalThis.__workspace.revision++;
        return { revision: globalThis.__workspace.revision, changed: true };
      },
      getOrganizationTournamentReport: async ({ data }) => {
        globalThis.__calls.push({ kind: "export", data });
        if (globalThis.__deny) throw new Error("Operational access was revoked.");
        if (globalThis.__failExport) throw new Error("Synthetic export unavailable.");
        return {
          filename: "prospects-operational-tournaments.csv",
          contentType: "text/csv;charset=utf-8",
          body: '"Event"\r\n"Synthetic Softball Event"\r\n',
        };
      },
    };
  });
  await page.addScriptTag({ content: script });
  await page.getByLabel("Planning for", { exact: true }).waitFor();
}

test("Finder accessible controls switch both sports, reset filters, protect actions and handle save/export/revocation", async () => {
  const script = await componentScript();
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(process.env.TEST_CHROMIUM_PATH ? { executablePath: process.env.TEST_CHROMIUM_PATH } : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
    });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await setup(page, script);
    const headings = () => page.locator("article h3").allTextContents();
    assert.deepEqual(await headings(), ["Synthetic Baseball Event", "Synthetic protected source"]);
    // Exact label lookup uses Chromium's accessible-name implementation, including nested selects.
    await page.getByLabel("Planning for", { exact: true }).selectOption("soft");
    assert.deepEqual(await headings(), ["Synthetic Softball Event"]);
    assert.equal(await page.getByLabel("Sport", { exact: true }).inputValue(), "softball");
    assert.equal(await page.getByLabel("Date range", { exact: true }).inputValue(), "season");
    await page.getByLabel("State", { exact: true }).selectOption("OK");
    await page.getByLabel("Event type", { exact: true }).selectOption("showcase");
    await page.getByLabel("Maximum drive miles", { exact: true }).fill("200");
    assert.deepEqual(await headings(), []);
    await page.getByRole("button", { name: "Reset filters", exact: true }).click();
    assert.deepEqual(await headings(), ["Synthetic Softball Event"]);
    await page.getByLabel("Search tournaments", { exact: true }).fill("no match");
    assert.deepEqual(await headings(), []);
    await page.getByLabel("Planning for", { exact: true }).selectOption("base");
    assert.equal(await page.getByLabel("Search tournaments", { exact: true }).inputValue(), "");
    assert.deepEqual(await headings(), ["Synthetic Baseball Event", "Synthetic protected source"]);
    await page.getByLabel("Date range", { exact: true }).selectOption("custom");
    await page.getByLabel("From date", { exact: true }).fill("2030-05-20");
    await page.getByLabel("Through date", { exact: true }).fill("2030-05-10");
    assert.match(await page.getByRole("alert").innerText(), /end date/);
    assert.equal(
      await page.getByRole("button", { name: "Download results CSV", exact: true }).isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Reset filters", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: /Add.*schedule|Remove.*schedule|Add a real tournament/ })
        .count(),
      0,
    );
    const article = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", { name: "Synthetic Baseball Event", exact: true }),
      });
    await article.getByRole("button", { name: "Edit source details", exact: true }).click();
    await page
      .getByLabel("Public organizer URL", { exact: true })
      .fill("https://www.usssa.com/baseball_events?payment=private");
    await page.getByRole("button", { name: "Save source details", exact: true }).click();
    assert.match(await page.getByRole("alert").innerText(), /supported public/);
    assert.equal(await page.evaluate(() => globalThis.__calls.length), 0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator("form").count(), 0);
    await article.getByRole("button", { name: "Edit source details", exact: true }).click();
    await page.getByLabel("Approximate drive miles from Broken Arrow", { exact: true }).fill("30");
    await page.evaluate(() => {
      globalThis.__failSave = true;
    });
    await page.getByRole("button", { name: "Save source details", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Synthetic temporary save error" }).waitFor();
    assert.equal(await page.locator("form").count(), 1);
    await page.evaluate(() => {
      globalThis.__failSave = false;
      const form = document.querySelector("form");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await page.getByRole("status").filter({ hasText: "Source details saved" }).waitFor();
    assert.equal(
      await page.evaluate(() => globalThis.__calls.filter((call) => call.kind === "save").length),
      2,
    );
    assert.equal(await page.evaluate(() => globalThis.__savedNotifications), 1);
    assert.match(await article.innerText(), /Approximately 30 drive miles/);
    const payload = await page.evaluate(
      () => globalThis.__calls.filter((call) => call.kind === "save").at(-1).data,
    );
    assert.deepEqual(Object.keys(payload).sort(), [
      "distanceMiles",
      "id",
      "revision",
      "sourceCheckedOn",
      "sourceUrl",
    ]);
    await page.getByLabel("Planning for", { exact: true }).selectOption("soft");
    await page.evaluate(() => {
      globalThis.__failExport = true;
    });
    await page.getByRole("button", { name: "Download results CSV", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Synthetic export unavailable" }).waitFor();
    await page.evaluate(() => {
      globalThis.__failExport = false;
    });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download results CSV", exact: true }).click();
    assert.equal((await download).suggestedFilename(), "prospects-operational-tournaments.csv");
    assert.equal(
      await page.evaluate(
        () => globalThis.__calls.filter((call) => call.kind === "export").at(-1).data.teamId,
      ),
      "soft",
    );
    await page.evaluate(() => {
      globalThis.__deny = true;
    });
    await page.getByRole("button", { name: "Reload tournaments", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Operational access was revoked" }).waitFor();
    assert.equal(await page.locator("article").count(), 0);
    assert.equal(await page.getByLabel("Planning for", { exact: true }).count(), 0);
    assert.deepEqual(browserErrors, []);
  } finally {
    await browser.close();
  }
});
