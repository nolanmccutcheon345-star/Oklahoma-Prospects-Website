import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

test("shared public catalog keeps prices and rejects stale checkout results after timeout and retry", async (t) => {
  const temp = await mkdtemp("scripts/.audit-ui-");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://audit.example.invalid" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const state = { reads: 0, checks: [] };
  globalThis.__catalogRecovery = state;
  let root;
  try {
    const outfile = temp + "/catalog.mjs";
    await build({
      stdin: {
        contents: `import {createElement} from 'react';import {CatalogProvider,useLiveCatalog} from './src/lib/use-catalog';function Reader(){const c=useLiveCatalog();return createElement('button',{onClick:c.retry,'data-status':c.status,'data-checkout':c.checkoutStatus,'data-enabled':Boolean(c.purchaseAvailability?.scope==='all')},JSON.stringify(c.cages));}export const App=()=>createElement(CatalogProvider,{initial:{catalog:{cages:[{id:'individual',price:40}]},failed:false}},createElement(Reader),createElement(Reader));`,
        resolveDir: process.cwd(),
        loader: "tsx",
      },
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [
        {
          name: "catalog-network",
          setup(b) {
            b.onResolve({ filter: /\/ops$/ }, () => ({ path: "ops", namespace: "fixture" }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: `export const buildPublicCatalog=rows=>({cages:rows});export const getServices=async()=>{globalThis.__catalogRecovery.reads++;return [{id:'individual',price:40}];};export const getPurchaseAvailability=()=>new Promise(resolve=>globalThis.__catalogRecovery.checks.push(resolve));`,
              loader: "js",
            }));
          },
        },
      ],
    });
    const { act, createElement } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { App } = await import(pathToFileURL(process.cwd() + "/" + outfile));
    root = createRoot(document.getElementById("root"));
    t.mock.timers.enable({ apis: ["setTimeout"] });
    await act(async () => root.render(createElement(App)));
    assert.equal(state.reads, 0, "SSR catalog is reused");
    assert.equal(state.checks.length, 1, "nested consumers share a checkout request");
    await act(async () => t.mock.timers.tick(12001));
    const button = document.querySelector("button");
    assert.equal(button.dataset.status, "ready");
    assert.equal(button.dataset.checkout, "error");
    assert.match(button.textContent, /40/, "prices survive checkout failure");
    assert.equal(button.dataset.enabled, "false");
    await act(async () => button.click());
    assert.equal(state.checks.length, 2);
    await act(async () => state.checks[0]({ scope: "all" }));
    assert.equal(
      button.dataset.enabled,
      "false",
      "late timed-out readiness cannot unlock checkout",
    );
    await act(async () => state.checks[1]({ scope: "all" }));
    assert.equal(button.dataset.checkout, "ready");
    assert.equal(button.dataset.enabled, "true");
    await act(async () => root.unmount());
    root = null;
  } finally {
    t.mock.timers.reset();
    if (root) {
      const { act } = await import("react");
      await act(async () => root.unmount());
    }
    dom.window.close();
    Object.assign(globalThis, {
      window: previous.window,
      document: previous.document,
      IS_REACT_ACT_ENVIRONMENT: previous.act,
    });
    delete globalThis.__catalogRecovery;
    await rm(temp, { recursive: true, force: true });
  }
});
