import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
test("cutover never auto-previews or applies; blocked activation cannot post and capture requires exact explicit receipt", async () => {
  const dir = await mkdtemp("scripts/.render-cutover-");
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
  let root;
  const calls = [];
  let release;
  globalThis.__cutoverFixture = {
    preview: async (kind) => {
      calls.push(["preview", kind]);
      return kind === "activation"
        ? {
            readyForActivation: false,
            blockers: [{ detail: "Synthetic unresolved provider attempt" }],
          }
        : { sourceClubRevision: 12, sourceDigest: "a".repeat(64), teams: 2, agreements: 4 };
    },
    apply: async (kind, data) => {
      calls.push(["apply", kind, data]);
      await new Promise((r) => (release = r));
    },
  };
  try {
    const output = resolve(dir, "component.mjs");
    await build({
      entryPoints: ["src/components/finance/financial-cutover.tsx"],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [
        {
          name: "fixture",
          setup(b) {
            b.onResolve({ filter: /finance\/cutover-api$/ }, () => ({
              path: "api",
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: `export const getFinancialCapturePreview=()=>globalThis.__cutoverFixture.preview('capture');export const getFinancialRefreshPreview=()=>globalThis.__cutoverFixture.preview('refresh');export const getFinancialActivationPreview=()=>globalThis.__cutoverFixture.preview('activation');export const captureFinancialBasis=({data})=>globalThis.__cutoverFixture.apply('capture',data);export const refreshFinancialBasis=({data})=>globalThis.__cutoverFixture.apply('refresh',data);export const activateFinancialBasis=({data})=>globalThis.__cutoverFixture.apply('activation',data);`,
            }));
          },
        },
      ],
    });
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { FinancialCutover } = await import(pathToFileURL(output));
    root = createRoot(document.getElementById("root"));
    await React.act(async () => root.render(React.createElement(FinancialCutover)));
    assert.deepEqual(calls, []);
    let buttons = () => [...document.querySelectorAll("button")];
    await React.act(async () =>
      buttons()
        .find((b) => b.textContent === "Review activation")
        .click(),
    );
    assert.match(document.body.textContent, /Synthetic unresolved provider attempt/);
    assert.equal(
      buttons().find((b) => b.textContent === "Apply reviewed activation").disabled,
      true,
    );
    assert.equal(calls.filter((c) => c[0] === "apply").length, 0);
    await React.act(async () =>
      buttons()
        .find((b) => b.textContent === "Review initial capture")
        .click(),
    );
    await React.act(async () => {
      const t = document.querySelector("textarea");
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(
        t,
        "Preserve reviewed original commitments",
      );
      t.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      document.querySelector("input[type=checkbox]").click();
    });
    const apply = buttons().find((b) => b.textContent === "Apply reviewed capture");
    assert.equal(apply.disabled, false);
    await React.act(async () => {
      apply.click();
      apply.click();
    });
    assert.deepEqual(
      calls.filter((c) => c[0] === "apply"),
      [
        [
          "apply",
          "capture",
          {
            sourceClubRevision: 12,
            sourceDigest: "a".repeat(64),
            confirmed: true,
            reason: "Preserve reviewed original commitments",
          },
        ],
      ],
    );
    await React.act(async () => release());
    assert.equal(document.querySelector("textarea"), null);
    assert.equal(calls.filter((c) => c[0] === "apply" && c[1] === "activation").length, 0);
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
    delete globalThis.__cutoverFixture;
    await rm(dir, { recursive: true, force: true });
  }
});
