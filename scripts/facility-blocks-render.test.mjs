import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

test("owner block form retries identical payload and requires explicit release confirmation", async () => {
  const out = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {FacilityBlocks} from './src/components/commerce/facility-blocks';createRoot(document.getElementById('root')).render(React.createElement(FacilityBlocks));`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "isolated-fixture",
        setup(b) {
          b.onResolve({ filter: /facility-blocks-api$/ }, () => ({
            path: "fixture",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `
      globalThis.__calls=[];globalThis.__rows=[];globalThis.__fail=true;
      export async function getFacilityBlocks(){return globalThis.__rows;}
      export async function createFacilityBlock({data}){globalThis.__calls.push(data);if(globalThis.__fail){globalThis.__fail=false;throw Error('Synthetic uncertain response');}globalThis.__rows=[{id:data.id,title:data.title,startsAt:'2099-11-15T22:00:00Z',endsAt:'2099-11-16T00:00:00Z',laneIds:data.laneIds,status:'confirmed'}];return {ok:true};}
      export async function cancelFacilityBlock({data}){globalThis.__cancel=data.id;globalThis.__rows=globalThis.__rows.map(r=>r.id===data.id?({...r,status:'cancelled'}):r);return {ok:true};}
    `,
            loader: "js",
          }));
        },
      },
    ],
  });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route("**/*", (r) =>
      r.request().url() === "http://localhost/"
        ? r.fulfill({ status: 200, contentType: "text/html", body: '<div id="root"></div>' })
        : r.abort(),
    );
    await page.goto("http://localhost/");
    await page.addScriptTag({ content: out.outputFiles[0].text });
    await page.getByLabel("Block title").fill("Synthetic workout");
    await page.getByLabel("Date", { exact: true }).fill("2099-11-15");
    await page.getByLabel("Start time (Central)").fill("16:00");
    for (const name of ["Lane 1", "Lane 2", "Fielding area (lanes 3–4)"])
      await page.getByLabel(name, { exact: true }).check();
    await page.getByRole("button", { name: "Reserve Facility Space" }).click();
    await page.getByText(/Synthetic uncertain response/).waitFor();
    // Editing cannot silently replace an uncertain request. Explicit retry sends exactly what was submitted.
    await page.getByLabel("Block title").fill("Changed visible form");
    await page.getByRole("button", { name: "Retry Same Block" }).click();
    await page.getByText(/Facility block saved/).waitFor();
    const calls = await page.evaluate(() => globalThis.__calls);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1]);
    assert.deepEqual(calls[0].laneIds, ["1", "2", "3-4"]);
    assert.equal(await page.getByLabel("Block title").inputValue(), "");
    await page.getByRole("button", { name: "Cancel Block", exact: true }).click();
    await page.getByRole("button", { name: "Keep Block" }).click();
    assert.equal(await page.evaluate(() => globalThis.__cancel), undefined);
    await page.getByRole("button", { name: "Cancel Block", exact: true }).click();
    await page.getByRole("button", { name: "Confirm Release" }).click();
    await page.getByText(/Block cancelled/).waitFor();
    assert.equal(await page.evaluate(() => globalThis.__cancel), calls[0].id);
  } finally {
    await browser.close();
  }
});
