import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
test("event editor sends revision-bound operational settings and clears inaccessible data after a failed refresh", async () => {
  const dir = await mkdtemp("scripts/.render-events-");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid" });
  const keys = ["window", "document", "FormData", "IS_REACT_ACT_ENVIRONMENT"];
  const old = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let root;
  const calls = [];
  let revoked = false;
  const fixture = {
    events: [
      {
        id: "event",
        revision: 7,
        name: "Synthetic clinic",
        description: "Withheld original text",
        type: "clinic",
        sport: "Softball",
        location: "Test field",
        capacity: 20,
        coachIds: ["coach"],
        publication: "open",
        metadataEditable: false,
        sessions: [
          {
            sessionKey: "a".repeat(64),
            revision: 4,
            date: "2030-01-02",
            start: "10:00",
            end: "11:00",
            location: "Test field",
            status: "scheduled",
            additional: false,
            enrollments: [
              {
                athleteId: "athlete",
                name: "Synthetic Athlete",
                revision: 2,
                status: "enrolled",
                checkedIn: false,
              },
            ],
          },
        ],
      },
    ],
    coaches: [{ id: "coach", name: "Synthetic Coach" }],
    athletes: [{ id: "athlete", name: "Synthetic Athlete" }],
  };
  globalThis.__eventFixture = {
    get: async () => {
      if (revoked) throw Error("Operational access revoked");
      return fixture;
    },
    save: async (name, data) => {
      calls.push({ name, data });
      revoked = true;
      return { ok: true };
    },
  };
  try {
    const output = resolve(dir, "component.mjs");
    await build({
      entryPoints: ["src/components/coordinator/organization-events.tsx"],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [
        {
          name: "fixture",
          setup(b) {
            b.onResolve({ filter: /organization-events-api$/ }, () => ({
              path: "api",
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: `export const getOrganizationEvents=()=>globalThis.__eventFixture.get();${["createOperationalEvent", "saveOperationalEventSettings", "addOperationalEventSession", "saveOperationalEventEnrollment"].map((name) => `export const ${name}=({data})=>globalThis.__eventFixture.save('${name}',data);`).join("")}`,
            }));
          },
        },
      ],
    });
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { OrganizationEvents } = await import(pathToFileURL(output));
    root = createRoot(document.getElementById("root"));
    await React.act(async () => root.render(React.createElement(OrganizationEvents)));
    assert.match(document.body.textContent, /Synthetic clinic/);
    assert.doesNotMatch(document.body.textContent, /Withheld original text/);
    const settings = [...document.querySelectorAll("form")].find((f) =>
      f.textContent.includes("Save event settings"),
    );
    assert.equal(settings.querySelector("[name=name]"), null);
    settings.querySelector("[name=capacity]").value = "24";
    settings.querySelector("[name=reason]").value = "Operational attendance planning";
    await React.act(async () =>
      settings.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
    );
    assert.deepEqual(calls, [
      {
        name: "saveOperationalEventSettings",
        data: {
          eventId: "event",
          revision: 7,
          capacity: 24,
          coachIds: ["coach"],
          publication: "open",
          reason: "Operational attendance planning",
        },
      },
    ]);
    assert.match(document.body.textContent, /Operational access revoked/);
    assert.doesNotMatch(
      document.body.textContent,
      /Synthetic clinic|Synthetic Athlete|Synthetic Coach/,
    );
  } finally {
    if (root) {
      const { act } = await import("react");
      await act(async () => root.unmount());
    }
    dom.window.close();
    for (const k of keys) {
      if (old[k] === undefined) delete globalThis[k];
      else globalThis[k] = old[k];
    }
    delete globalThis.__eventFixture;
    await rm(dir, { recursive: true, force: true });
  }
});
