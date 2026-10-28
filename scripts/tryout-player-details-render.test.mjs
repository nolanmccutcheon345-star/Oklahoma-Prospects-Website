import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

test("three-step tryout retains mandatory player details; USSSA unknown and new-player choices remain usable", async () => {
  const temp = await mkdtemp("scripts/.tryout-render-");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://test.invalid/tryouts" });
  const old = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  globalThis.requestAnimationFrame = (fn) => fn();
  dom.window.HTMLElement.prototype.scrollIntoView = ()=>{};
  const {act,createElement}=await import("react");
  const {createRoot}=await import("react-dom/client");
  let root;
  try {
    const outfile = temp + "/form.mjs";
    await build({ entryPoints: ["src/components/inquiry-form.tsx"], outfile, bundle: true, platform: "node", format: "esm", packages: "external", plugins: [{ name: "test-api", setup(b) {
      b.onResolve({filter:/use-current-user$/},()=>({path:'auth-state',namespace:'auth-test'}));
      b.onLoad({filter:/.*/,namespace:'auth-test'},()=>({contents:'export const useCurrentUserState=()=>({user:null,isPending:false});',loader:'js'}));
      b.onResolve({ filter: /\/(portal-api|tryout-events-api)$/ }, (args) => ({ path: args.path, namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const getPublicTryoutTeams=async()=>[]; export const getRegistrationAthletes=async()=>[]; export const claimAthleteRegistration=async()=>({ok:true}); export const sendInquiry=async()=>{throw new Error('No submissions expected');};", loader: "js" }));
    } }] });
    const { TryoutForm } = await import(pathToFileURL(process.cwd() + "/" + outfile));
    root = createRoot(document.getElementById("root"));
    const control = (label) => [...document.querySelectorAll("label")].find((el) => el.textContent.trim().startsWith(label))?.querySelector("input,textarea,select");
    for (const sport of ["Baseball", "Softball"]) {
      await act(async () => root.render(createElement(TryoutForm, { key: sport, initialSport: sport })));
      const change=async(field,value)=>{await act(async()=>{const proto=field.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(field,value);field.dispatchEvent(new dom.window.Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
      await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Continue to player details').click());
      assert.match(document.querySelector('h3').textContent,/Step 1/,'empty first step cannot advance');
      await change(control('Age group'),'12U');
      await change(control('Player name'),'Test Player');
      await change(control('Date of birth (private)'),'2014-09-01');
      await change(control('Expected high-school graduation year'),'unknown');
      await change(control('School status'),'homeschool');
      await change(control('Parent / Guardian'),'Test Guardian');
      await change(control('Phone'),'9185550123');
      await change(control('Email'),'test@example.invalid');
      await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Continue to player details').click());
      assert.match(document.querySelector('h3').textContent,/Step 2/,JSON.stringify([...document.querySelectorAll('input,select')].filter(e=>!e.checkValidity()).map(e=>({label:e.closest('label')?.textContent,value:e.value}))));
      assert.match(document.body.textContent, /Player details — mandatory/);
      for (const name of ["Player positions", "Player notes", "USSSA Player ID status"]) {
        const field = control(name);
        assert.ok(field, name);
        assert.equal(field.required, true, name);
        assert.equal(field.closest("details"), null, name + " must not be collapsed");
        assert.equal(field.checkValidity(), false, name + " cannot be blank");
      }
      assert.equal(control("USSSA Player / Athlete ID"), undefined);
      const status = control("USSSA Player ID status");
      for (const value of ["provided", "unknown", "not-registered"]) {
        await act(async () => { status.value = value; status.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
        assert.equal(status.checkValidity(), true);
        const id = control("USSSA Player / Athlete ID");
        if (value === "provided") {
          assert.equal(id.required, true);
          assert.equal(id.checkValidity(), false);
          id.value = "abc"; assert.equal(id.checkValidity(), false);
          id.value = "00123456"; assert.equal(id.checkValidity(), true);
        } else assert.equal(id, undefined);
      }
      const consent = document.querySelector('input[type="checkbox"]');
      assert.equal(consent.checked, false);
      assert.equal(consent.required, true);
    }
    await act(async () => root.render(createElement(TryoutForm, { key: "inquiry", intent: "inquiry" })));
    assert.equal(control("Player notes").required, false);
    assert.equal(control("USSSA Player ID status"), undefined);
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, { window: old.window, document: old.document, IS_REACT_ACT_ENVIRONMENT: old.act });
    await rm(temp, { recursive: true, force: true });
  }
});
