import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
test("owner access review requires explicit preview and confirmed exact receipt; duplicate apply is blocked", async () => {
  const dir = await mkdtemp("scripts/.render-access-");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid" });
  const old = {
    window: globalThis.window,
    document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const calls = [];
  let release;
  globalThis.__accessFixture = {
    preview: async (data) => {
      calls.push(["preview", data]);
      return {
        userId: "existing",
        name: "Synthetic Staff",
        email: "staff@example.invalid",
        revision: 3,
        currentStatus: "none",
        release: "a".repeat(40),
        basisVersion: 7,
        reviewDigest: "b".repeat(64),
        ready: true,
        blockers: [],
        scope: ["All teams"],
        exclusions: ["All financial access"],
      };
    },
    apply: async (data) => {
      calls.push(["apply", data]);
      await new Promise((r) => {
        release = r;
      });
    },
  };
  let root;
  try {
    const output = resolve(dir, "component.mjs");
    await build({
      entryPoints: ["src/components/coordinator/organization-access.tsx"],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [
        {
          name: "fixture",
          setup(b) {
            b.onResolve({ filter: /organization-access-api$/ }, () => ({
              path: "api",
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents:
                "export const getOrganizationAccessPreview=({data})=>globalThis.__accessFixture.preview(data);export const grantOrganizationAccess=({data})=>globalThis.__accessFixture.apply(data);",
            }));
          },
        },
      ],
    });
    const { OrganizationAccess } = await import(pathToFileURL(output));
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    root = createRoot(document.getElementById("root"));
    await React.act(async () =>
      root.render(
        React.createElement(OrganizationAccess, {
          accounts: [{ id: "existing", name: "Synthetic Staff", email: "staff@example.invalid" }],
        }),
      ),
    );
    assert.equal(calls.length, 0);
    const select = document.querySelector("select");
    await React.act(async () => {
      select.value = "existing";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await React.act(async () => document.querySelector("button").click());
    assert.deepEqual(calls, [["preview", { userId: "existing" }]]);
    let grant = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Grant reviewed"),
    );
    assert.equal(grant.disabled, true);
    await React.act(async () => {
      const textarea = document.querySelector("textarea");
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(
        textarea,
        "Approved operational responsibilities",
      );
      textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      textarea.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      document.querySelector("input[type=checkbox]").click();
    });
    // React's text event wiring is initialized by react-dom against this synthetic DOM.
    grant = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Grant reviewed"),
    );
    assert.equal(grant.disabled, false);
    await React.act(async () => {
      grant.click();
      grant.click();
    });
    assert.equal(calls.filter((c) => c[0] === "apply").length, 1);
    assert.deepEqual(calls[1][1], {
      userId: "existing",
      reviewDigest: "b".repeat(64),
      expectedRelease: "a".repeat(40),
      expectedBasisVersion: 7,
      expectedRevision: 3,
      confirmed: true,
      reason: "Approved operational responsibilities",
    });
    await React.act(async () => release());
    assert.equal(document.querySelector("textarea"), null);
  } finally {
    if (root) {
      const { act } = await import("react");
      await act(async () => root.unmount());
    }
    dom.window.close();
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
    delete globalThis.__accessFixture;
    await rm(dir, { recursive: true, force: true });
  }
});
