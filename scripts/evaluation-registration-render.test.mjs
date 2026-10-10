import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
test("evaluation registration follows sport across teams and clears stale player selection", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/evaluations" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.scrollTo = () => {};
  globalThis.evaluationFixture = {
    owner: false,
    name: "Coach",
    teams: [{ id: "assigned", name: "Assigned baseball", sport: "baseball", age: "13U" }],
    evaluations: [],
    candidates: [
      {
        id: "b1",
        name: "Baseball 13",
        sport: "baseball",
        age: "13U",
        teamIds: ["assigned"],
        session: "",
      },
      { id: "b2", name: "Baseball 7", sport: "baseball", age: "7U", teamIds: [], session: "" },
      {
        id: "s1",
        name: "Softball 14",
        sport: "softball",
        age: "14U",
        teamIds: [],
        session: "Softball session",
      },
      { id: "s2", name: "Softball 10", sport: "softball", age: "10U", teamIds: [], session: "" },
    ],
  };
  const out = resolve("scripts/.evaluation-render.mjs");
  const mocks = {
    "@/lib/tryout-evaluations-api":
      'export const getTryoutEvaluations=async()=>globalThis.evaluationFixture;export const saveTryoutEvaluation=async()=>{throw Error("unexpected save")};',
    "@/lib/front-office-api":
      "export const getEvaluationReviews=async()=>[];export const markEvaluationReviewed=async()=>{};",
  };
  const result = await build({
    entryPoints: ["src/components/tryout-evaluations.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "fixture",
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
  const { TryoutEvaluations } = await import(pathToFileURL(out).href),
    { act, createElement } = await import("react"),
    { createRoot } = await import("react-dom/client"),
    host = document.getElementById("root"),
    root = createRoot(host);
  try {
    await act(async () => root.render(createElement(TryoutEvaluations)));
    await act(async () =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === "New evaluation").click(),
    );
    const control = (label) =>
      document.getElementById(
        [...host.querySelectorAll("label")].find((l) => l.textContent === label).htmlFor,
      );
    const change = async (label, value) =>
      act(async () => {
        const el = control(label);
        el.value = value;
        el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
    const options = () => [...control("Registration").options].map((o) => o.value);
    assert.deepEqual(options(), ["", "b1", "b2"]);
    await change("Sport", "softball");
    assert.deepEqual(options(), ["", "s1", "s2"]);
    await change("Registration", "s1");
    assert.equal(control("Player name").value, "Softball 14");
    assert.equal(control("Age group").value, "14U");
    assert.equal(control("Team (optional)").value, "");
    assert.equal(control("Session / location").value, "Softball session");
    assert.equal(control("Sport").disabled, false);
    await change("Sport", "baseball");
    assert.deepEqual(options(), ["", "b1", "b2"]);
    assert.equal(control("Registration").value, "");
    assert.equal(control("Player name").value, "");
    assert.equal(control("Session / location").value, "");
    await change("Registration", "b2");
    assert.equal(control("Player name").value, "Baseball 7");
    assert.equal(control("Team (optional)").value, "");
  } finally {
    await act(async () => root.unmount());
    await rm(out, { force: true });
    dom.window.close();
    delete globalThis.evaluationFixture;
  }
});
