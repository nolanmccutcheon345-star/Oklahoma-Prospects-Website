import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
test("waiver receipts survive refresh failures and stale success clears on another athlete", async () => {
  const temp = await mkdtemp("scripts/.waiver-ui-");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://audit.example.invalid/waiver" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const f = { saved: false, failRead: false, failWrite: false, writes: 0 };
  globalThis.auditWaiver = f;
  const mocks = {
    "@tanstack/react-router": `import {createElement as h} from 'react';export const createFileRoute=()=>o=>({...o,useSearch:()=>({athleteId:'athlete',teamId:'base',playerId:'base-player'})});export const Link=p=>h('a',p,p.children);`,
    "@/lib/seo": `export const pageHead=()=>({});`,
    "@/lib/auth/use-current-user": `export const useCurrentUser=()=>({id:'synthetic-parent'});`,
    "@/lib/commerce/portal-api": `export const getFamilyBilling=async()=>{if(globalThis.auditWaiver.failRead)throw Error('Synthetic refresh failure');return {athletes:[{id:'athlete',name:'Synthetic Athlete'},{id:'sibling',name:'Synthetic Sibling'}]}};`,
    "@/lib/portal-api": `export const getMyWaivers=async()=>globalThis.auditWaiver.saved?[{id:'w',athlete_id:'athlete',athlete_name:'Synthetic Athlete',signer_name:'Synthetic Parent',expires_at:'2027-10-29'}]:[];export const saveAnnualWaiver=async({data})=>{globalThis.auditWaiver.writes++;if(globalThis.auditWaiver.failWrite)throw Error('Synthetic save failure');globalThis.auditWaiver.saved=true;return {ok:true,outcome:'saved',receipt:{id:'synthetic-receipt',athleteId:data.athleteId,signedAt:'2026-10-29',expiresAt:'2027-10-29'}}};`,
    "@/components/page-hero": `export const PageHero=()=>null;`,
    "@/components/commerce/athletes": `export const AddAthlete=()=>null;`,
    "@/components/ui/button": `import {createElement as h} from 'react';export const Button=p=>h('button',p,p.children);`,
  };
  const b = await build({
    entryPoints: ["src/routes/waiver.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "audit-ui",
        setup(x) {
          x.onResolve({ filter: /.*/ }, (a) =>
            mocks[a.path] ? { path: a.path, namespace: "mock" } : undefined,
          );
          x.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
            contents: mocks[a.path],
            loader: "js",
          }));
        },
      },
    ],
  });
  await writeFile(temp + "/bundle.mjs", b.outputFiles[0].text);
  const { Route } = await import(pathToFileURL(process.cwd() + "/" + temp + "/bundle.mjs"));
  const root = createRoot(document.getElementById("root"));
  const submit = () =>
    act(async () =>
      document
        .querySelector("form")
        .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })),
    );
  try {
    await act(async () => root.render(createElement(Route.component)));
    for (const input of document.querySelectorAll('input[type="checkbox"]')) input.checked = true;
    f.failRead = true;
    await submit();
    assert.equal(f.saved, true);
    assert.match(document.body.textContent, /Your signed waiver is saved/);
    assert.match(document.body.textContent, /status list could not refresh/);
    assert.match(document.body.textContent, /synthetic-receipt/);
    const select = document.querySelector('select[name="athlete"]');
    await act(async () => {
      select.value = "sibling";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.doesNotMatch(document.body.textContent, /Your signed waiver is saved/);
    f.failWrite = true;
    await submit();
    assert.match(document.body.textContent, /Synthetic save failure/);
    assert.doesNotMatch(document.body.textContent, /Your signed waiver is saved/);
    f.failRead = false;
    f.failWrite = false;
    const refresh = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Refresh waiver status",
    );
    await act(async () => refresh.click());
    await act(async () => {
      select.value = "athlete";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.match(document.body.textContent, /already on file/);
    assert.equal(
      document.querySelector("form"),
      null,
      "saved athlete does not invite repeated signatures",
    );
    assert.equal(f.writes, 2, "refresh never signs");
    const back = [...document.querySelectorAll("a")].find(
      (a) => a.textContent === "Return to player enrollment",
    );
    assert.equal(back.getAttribute("href"), "/enrollment?teamId=base&playerId=base-player");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.auditWaiver;
    await rm(temp, { recursive: true, force: true });
  }
});
