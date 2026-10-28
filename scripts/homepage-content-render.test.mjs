import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";

test("homepage revalidation removes withdrawn content and ignores an earlier retry", async () => {
  const temp = await mkdtemp("scripts/.homepage-render-");
  const prior = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  let root, dom;
  globalThis.__homepageRetries = [];
  try {
    const out = temp + "/component.mjs";
    await build({
      entryPoints: ["src/components/homepage-content.tsx"],
      outfile: out,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [
        {
          name: "homepage-fixture",
          setup(b) {
            b.onResolve({ filter: /^@\/lib\/website-content-api$/ }, () => ({
              path: "api",
              namespace: "fixture",
            }));
            b.onResolve({ filter: /^@tanstack\/react-router$/ }, () => ({
              path: "router",
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            resolveDir: process.cwd(),
              contents:
                args.path === "api"
                  ? "export const getPublicHomepage=()=>new Promise(resolve=>globalThis.__homepageRetries.push(resolve));"
                  : "import {createElement} from 'react'; export const Link=({to,children,...props})=>createElement('a',{href:to,...props},children);",
            }));
          },
        },
      ],
    });
    const { HomepagePeople } = await import(pathToFileURL(process.cwd() + "/" + out));
    dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid" });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    root = createRoot(document.getElementById("root"));
    const published = {
      content: {
        coaches: [],
        testimonials: [
          {
            id: "quote",
            quote: "Approved fixture quote",
            attribution: "Fixture family",
            teamAffiliation: "",
          },
        ],
      },
      failed: false,
    };
    const empty = { content: { coaches: [], testimonials: [] }, failed: false };
    await act(async () => root.render(createElement(HomepagePeople, { initial: published })));
    assert.match(document.body.textContent, /Approved fixture quote/);
    await act(async () => root.render(createElement(HomepagePeople, { initial: empty })));
    assert.doesNotMatch(document.body.textContent, /Approved fixture quote|Trusted by Prospects/);
    const failed = { content: null, failed: true };
    await act(async () => root.render(createElement(HomepagePeople, { initial: failed })));
    const retry = [...document.querySelectorAll("button")].find((button) =>
      /try again/i.test(button.textContent),
    );
    assert.ok(retry);
    await act(async () => retry.click());
    assert.equal(globalThis.__homepageRetries.length, 1);
    const revalidated = { content: { coaches: [], testimonials: [] }, failed: false };
    await act(async () => root.render(createElement(HomepagePeople, { initial: revalidated })));
    await act(async () => globalThis.__homepageRetries[0](published));
    assert.doesNotMatch(
      document.body.textContent,
      /Approved fixture quote|Trusted by Prospects/,
      "late retry cannot restore withdrawn content",
    );
  } finally {
    if (root) await act(async () => root.unmount());
    dom?.window.close();
    Object.assign(globalThis, {
      window: prior.window,
      document: prior.document,
      IS_REACT_ACT_ENVIRONMENT: prior.act,
    });
    delete globalThis.__homepageRetries;
    await rm(temp, { recursive: true, force: true });
  }
});
