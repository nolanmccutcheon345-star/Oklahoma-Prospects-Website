import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
test("admin assignment panel loads eligible instructors, saves existing lesson, and handles unavailable times", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/front-office" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const lesson = {
    id: "paid",
    serviceName: "Private lesson",
    playerName: "Synthetic Player",
    coachId: null,
    coachName: "",
    startsAt: "2030-01-07T22:00:00.000Z",
    endsAt: "2030-01-07T23:00:00.000Z",
  };
  globalThis.assignmentFixture = {
    lessons: [lesson],
    instructors: [{ id: "qualified", name: "Available Instructor" }],
    saved: [],
  };
  const out = resolve("scripts/.assignment-render.mjs");
  const mock = `export const getLessonAssignments=async()=>globalThis.assignmentFixture.lessons;
 export const getLessonInstructors=async()=>({...globalThis.assignmentFixture.lessons[0],instructors:globalThis.assignmentFixture.instructors});
 export const saveLessonInstructor=async({data})=>{globalThis.assignmentFixture.saved.push(data);const b=globalThis.assignmentFixture.lessons[0];b.coachId=data.coachId;b.coachName='Available Instructor';return {ok:true};};`;
  const result = await build({
    entryPoints: ["src/components/commerce/lesson-assignments.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "fixture",
        setup(b) {
          b.onResolve({ filter: /lesson-assignment-api$/ }, (a) => ({
            path: a.path,
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: mock,
            loader: "js",
          }));
        },
      },
    ],
  });
  await writeFile(out, result.outputFiles[0].text);
  const { LessonAssignments } = await import(pathToFileURL(out).href),
    { act, createElement } = await import("react"),
    { createRoot } = await import("react-dom/client");
  const host = document.getElementById("root"),
    root = createRoot(host);
  const click = async (text) =>
    act(async () =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === text).click(),
    );
  try {
    await act(async () => root.render(createElement(LessonAssignments)));
    assert.match(host.textContent, /1 needs an instructor/);
    await click("Find available instructors");
    assert.deepEqual(
      [...host.querySelector("select").options].map((o) => o.value),
      ["", "qualified"],
    );
    await act(async () => {
      const s = host.querySelector("select");
      s.value = "qualified";
      s.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await act(async () =>
      host
        .querySelector("form")
        .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
    );
    assert.deepEqual(globalThis.assignmentFixture.saved, [
      {
        id: "paid",
        coachId: "qualified",
        expectedCoachId: null,
        startsAt: lesson.startsAt,
        endsAt: lesson.endsAt,
      },
    ]);
    assert.match(host.textContent, /existing booking and payment are unchanged/);
    assert.match(host.textContent, /0 need an instructor/);
    await act(async () => host.querySelector("input[type=checkbox]").click());
    assert.match(host.textContent, /Available Instructor/);
    globalThis.assignmentFixture.instructors = [];
    await click("Change instructor");
    assert.match(host.textContent, /No qualified instructors are available/);
    assert.equal(host.querySelector("button[type=submit]"), null);
  } finally {
    await act(async () => root.unmount());
    await rm(out, { force: true });
    dom.window.close();
    delete globalThis.assignmentFixture;
  }
});
