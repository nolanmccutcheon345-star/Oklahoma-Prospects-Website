import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

test("guardian setup requires storage and schedule consent, exposes no raw card IDs and distinguishes paused collection", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/family" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { act, createElement } = await import("react"),
    { createRoot } = await import("react-dom/client");
  const fixture = {
    data: {
      status: "not set up",
      enabled: true,
      canManage: true,
      terms: { rows: [{ date: "2027-01-01", amountCents: 70000 }], graceDays: 5 },
      square: { environment: "sandbox", applicationId: "synthetic", locationId: "synthetic" },
      primary: null,
      backup: null,
      name: "Synthetic Guardian",
      email: "synthetic@example.invalid",
    },
    saved: [],
    changed: [],
    fail: false,
  };
  globalThis.__collectionUI = fixture;
  const mocks = {
    "@/lib/teams/collection-api": `export const getTeamCollection=async()=>{if(globalThis.__collectionUI.fail)throw Error("Access unavailable");return structuredClone(globalThis.__collectionUI.data)};export const saveTeamCollectionCard=async({data})=>{const f=globalThis.__collectionUI;f.saved.push(data);f.data[data.purpose]={brand:"VISA",last4:data.purpose==='primary'?'1111':'2222'};f.data.status='draft'};export const changeTeamCollection=async({data})=>{const f=globalThis.__collectionUI;f.changed.push(data);f.data.status=data.action==='activate'?'active':'revoked'};`,
    "../commerce/square-card": `import {createElement} from 'react';export const SquareCard=({onToken,intent})=>createElement('button',{type:'button',onClick:()=>onToken('synthetic-token','synthetic-request')},'Synthetic secure fields '+intent);`,
  };
  const out = resolve("artifacts/team-collection-ui.mjs");
  await mkdir("artifacts", { recursive: true });
  const result = await build({
    entryPoints: ["src/components/teams/team-collection-setup.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "collection-fixture",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (a) =>
            mocks[a.path] ? { path: a.path, namespace: "fixture" } : null,
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents: mocks[a.path],
            loader: "js",
          }));
        },
      },
    ],
  });
  await writeFile(out, result.outputFiles[0].text);
  const { TeamCollectionSetup } = await import(pathToFileURL(out).href);
  const host = document.getElementById("root"),
    root = createRoot(host);
  const button = (text) => {
    const b = [...host.querySelectorAll("button")].find((x) => x.textContent === text);
    assert.ok(b, text);
    return b;
  };
  const click = async (text) => act(async () => button(text).click());
  const check = async (text) =>
    act(async () =>
      [...host.querySelectorAll("label")]
        .find((l) => l.textContent.includes(text))
        .querySelector("input")
        .click(),
    );
  try {
    await act(async () =>
      root.render(
        createElement(TeamCollectionSetup, {
          teamId: "synthetic-team",
          playerId: "synthetic-player",
        }),
      ),
    );
    await click("Review automatic payment setup");
    assert.equal(button("Save primary card").disabled, true);
    assert.equal(button("Authorize automatic installments").disabled, true);
    await check("securely save this card");
    await click("Save primary card");
    await click("Synthetic secure fields STORE");
    assert.match(host.textContent, /ending 1111/);
    assert.equal(fixture.saved[0].consent, true);
    assert.deepEqual(
      { teamId: fixture.saved[0].teamId, playerId: fixture.saved[0].playerId },
      { teamId: "synthetic-team", playerId: "synthetic-player" },
    );
    await check("securely save this card");
    await click("Save backup card");
    await click("Synthetic secure fields STORE");
    assert.equal(button("Authorize automatic installments").disabled, true);
    await check("automatic-payment authorization above");
    await click("Authorize automatic installments");
    assert.equal(fixture.changed.length, 1);
    assert.equal(fixture.changed[0].action, "activate");
    assert.match(host.textContent, /Status: active/);
    assert.match(host.textContent, /20%/);
    assert.doesNotMatch(host.textContent, /synthetic-token|synthetic-request/);
    await click("Revoke my future automatic charges");
    assert.equal(fixture.changed[1].action, "revoke");
    fixture.data.enabled = false;
    await click("Review automatic payment setup");
    assert.equal(button("Authorize automatic installments").disabled, true);
    assert.match(host.textContent, /no scheduled charge/);
    fixture.fail = true;
    await click("Review automatic payment setup");
    assert.match(host.querySelector('[role="alert"]').textContent, /Access unavailable/);
    assert.doesNotMatch(host.textContent, /ending 1111|ending 2222/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.__collectionUI;
    await rm(out, { force: true });
  }
});
