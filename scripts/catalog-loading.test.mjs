import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
test("catalog distinguishes pending, failure and empty success; retry ignores stale responses", async () => {
  const temp = await mkdtemp("scripts/.catalog-loading-");
  let root, dom, current;
  const prior = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.__catalogLoads = [];
  try {
    const out = temp + "/hook.mjs";
    await build({
      entryPoints: ["src/lib/use-catalog.ts"],
      outfile: out,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [
        {
          name: "catalog",
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/ops$/ }, () => ({ path: "ops", namespace: "fixture" }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: `export const buildPublicCatalog=rows=>({lessons:rows});export const getServices=()=>new Promise((resolve,reject)=>globalThis.__catalogLoads.push({resolve,reject}));export const getPurchaseAvailability=async()=>{globalThis.__checkoutLoads=(globalThis.__checkoutLoads||0)+1;if(globalThis.__checkoutFailure)throw Error('payment service unavailable');return {ready:true,scope:'all'};};`,
            }));
          },
        },
      ],
    });
    const { useLiveCatalog, CatalogProvider } = await import(
      pathToFileURL(process.cwd() + "/" + out)
    );
    function View() {
      current = useLiveCatalog();
      return createElement("p", null, current.status + ":" + current.lessons.length);
    }
    assert.match(renderToString(createElement(View)), /loading:0/);
    dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid" });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(createElement(View)));
    await act(async () => globalThis.__catalogLoads[0].reject(new Error("network")));
    assert.equal(current.status, "error");
    assert.equal(current.checkoutStatus, "ready");
    assert.equal(
      current.purchaseAvailability.scope,
      "all",
      "payment readiness is separate from catalog failure",
    );
    await act(async () => current.retry());
    assert.equal(current.status, "loading");
    await act(async () => current.retry());
    await act(async () => globalThis.__catalogLoads[2].resolve([{ id: "current" }]));
    assert.equal(current.status, "ready");
    assert.equal(current.lessons[0].id, "current");
    await act(async () => globalThis.__catalogLoads[1].resolve([{ id: "obsolete" }]));
    assert.equal(current.lessons[0].id, "current");
    await act(async () => current.retry());
    await act(async () => globalThis.__catalogLoads[3].resolve([]));
    assert.equal(current.status, "ready");
    assert.equal(current.lessons.length, 0);
    globalThis.__checkoutFailure = true;
    const initial = { catalog: { lessons: [{ id: "server-rendered" }] }, failed: false };
    assert.match(
      renderToString(createElement(CatalogProvider, { initial }, createElement(View))),
      /ready:1/,
    );
    const before = globalThis.__checkoutLoads;
    await act(async () =>
      root.render(
        createElement(
          CatalogProvider,
          { initial },
          createElement(View, { key: "a" }),
          createElement(View, { key: "b" }),
        ),
      ),
    );
    assert.equal(
      globalThis.__catalogLoads.length,
      4,
      "SSR catalog is reused without duplicate fetches",
    );
    assert.equal(
      globalThis.__checkoutLoads,
      before + 1,
      "nested consumers share a single readiness check",
    );
    assert.equal(current.status, "ready");
    assert.equal(current.checkoutStatus, "error");
    assert.equal(current.purchaseAvailability, undefined);
    assert.equal(
      current.lessons[0].id,
      "server-rendered",
      "payment failure does not hide the successful catalog",
    );
    await act(async () =>
      root.render(
        createElement(
          CatalogProvider,
          {
            initial: { catalog: { lessons: [{ id: "revalidated-price" }] }, failed: false },
          },
          createElement(View),
        ),
      ),
    );
    assert.equal(
      current.lessons[0].id,
      "revalidated-price",
      "route revalidation replaces old prices",
    );
    assert.equal(globalThis.__catalogLoads.length, 4, "fresh loader data does not fetch twice");
  } finally {
    if (root) await act(async () => root.unmount());
    dom?.window.close();
    Object.assign(globalThis, {
      window: prior.window,
      document: prior.document,
      IS_REACT_ACT_ENVIRONMENT: prior.act,
    });
    delete globalThis.__catalogLoads;
    delete globalThis.__checkoutLoads;
    delete globalThis.__checkoutFailure;
    await rm(temp, { recursive: true, force: true });
  }
});
