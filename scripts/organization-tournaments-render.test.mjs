import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

// Local component regression. The standalone Chromium companion verifies accessible names.
test("operational Finder team switching, protected controls, repeated saves and revoked reload", async () => {
  const directory = await mkdtemp("scripts/.render-component-tournaments-");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/coordinator" });
  const keys = ["window", "document", "HTMLElement", "FormData", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
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
  const workspace = {
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
  const calls = [];
  let denied = false,
    failSave = false,
    saveNotifications = 0,
    root;
  globalThis.__tournamentRender = {
    getOrganizationTournaments: async () => {
      if (denied) throw new Error("Operational access was revoked.");
      return structuredClone(workspace);
    },
    saveOrganizationTournamentSource: async ({ data }) => {
      calls.push(data);
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (failSave) throw new Error("Synthetic temporary save error.");
      Object.assign(
        workspace.catalog.find((event) => event.id === data.id),
        {
          sourceUrl: data.sourceUrl,
          sourceCheckedOn: data.sourceCheckedOn,
          distanceMiles: data.distanceMiles,
        },
      );
      workspace.revision++;
      return { revision: workspace.revision, changed: true };
    },
    getOrganizationTournamentReport: async () => {
      throw new Error("Synthetic export unavailable.");
    },
  };
  try {
    const outfile = resolve(directory, "component.mjs");
    await build({
      entryPoints: ["src/components/coordinator/organization-tournaments.tsx"],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [
        {
          name: "fixture-tournament-api",
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/coordinator\/organization-tournaments-api$/ }, () => ({
              path: "api",
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents:
                "export const {getOrganizationTournaments,getOrganizationTournamentReport,saveOrganizationTournamentSource}=globalThis.__tournamentRender;",
              loader: "js",
            }));
          },
        },
      ],
    });
    const { OrganizationTournamentFinder } = await import(pathToFileURL(outfile).href);
    const { act, createElement } = await import("react"),
      { createRoot } = await import("react-dom/client");
    const host = document.getElementById("root");
    root = createRoot(host);
    const control = (name) => {
      const node = host.querySelector(`[aria-label="${name}"]`);
      assert.ok(node, name);
      assert.ok(node.id);
      assert.ok(host.querySelector(`label[for="${node.id}"]`));
      return node;
    };
    const select = (name, value) =>
      act(async () => {
        const node = control(name);
        node.value = value;
        node.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
    const fill = (name, value) =>
      act(async () => {
        const node = control(name);
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(
          node,
          value,
        );
        node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    const click = (name) =>
      act(async () => {
        const node = [...host.querySelectorAll("button")].find(
          (button) => button.textContent === name,
        );
        assert.ok(node, name);
        node.click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    const submit = (times = 1) =>
      act(async () => {
        for (let i = 0; i < times; i++)
          host
            .querySelector("form")
            .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    const events = () =>
      [...host.querySelectorAll("article h3")].map((heading) => heading.textContent);
    await act(async () =>
      root.render(
        createElement(OrganizationTournamentFinder, {
          onSaved: () => {
            saveNotifications++;
          },
        }),
      ),
    );
    assert.deepEqual(events(), ["Synthetic Baseball Event", "Synthetic protected source"]);
    await select("Planning for", "soft");
    assert.deepEqual(events(), ["Synthetic Softball Event"]);
    assert.equal(control("Sport").value, "softball");
    assert.equal(control("Date range").value, "season");
    await fill("Maximum drive miles", "200");
    assert.deepEqual(events(), []);
    await click("Reset filters");
    assert.deepEqual(events(), ["Synthetic Softball Event"]);
    await fill("Search tournaments", "no match");
    assert.deepEqual(events(), []);
    await select("Planning for", "base");
    assert.equal(control("Search tournaments").value, "");
    await select("Date range", "custom");
    await fill("From date", "2030-05-20");
    await fill("Through date", "2030-05-10");
    assert.match(host.textContent, /end date must/);
    assert.deepEqual(events(), []);
    await click("Reset filters");
    assert.equal([...host.querySelectorAll("article button")].length, 1);
    await click("Edit source details");
    control("Public organizer URL").value = "https://www.usssa.com/baseball_events?payment=private";
    await submit();
    assert.equal(calls.length, 0);
    assert.match(host.textContent, /supported public/);
    await click("Cancel");
    assert.equal(host.querySelector("form"), null);
    await click("Edit source details");
    control("Approximate drive miles from Broken Arrow").value = "30";
    failSave = true;
    await submit();
    assert.equal(calls.length, 1);
    assert.match(host.textContent, /Synthetic temporary save error/);
    failSave = false;
    await submit(2);
    assert.equal(calls.length, 2);
    assert.equal(saveNotifications, 1);
    assert.equal(host.querySelector("form"), null);
    assert.match(host.textContent, /Approximately 30 drive miles/);
    assert.deepEqual(Object.keys(calls[1]).sort(), [
      "distanceMiles",
      "id",
      "revision",
      "sourceCheckedOn",
      "sourceUrl",
    ]);
    await click("Download results CSV");
    assert.match(host.textContent, /Synthetic export unavailable/);
    denied = true;
    await click("Reload tournaments");
    assert.match(host.textContent, /Operational access was revoked/);
    assert.equal(host.querySelectorAll("article").length, 0);
    assert.equal(host.querySelector('select[aria-label="Planning for"]'), null);
  } finally {
    if (root) {
      const { act } = await import("react");
      await act(async () => root.unmount());
    }
    delete globalThis.__tournamentRender;
    dom.window.close();
    for (const key of keys) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
});
