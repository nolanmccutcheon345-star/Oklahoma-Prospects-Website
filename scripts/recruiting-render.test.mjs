import { currentSeason } from "../src/lib/recruiting-contracts.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
test("recruiting editor submits drafts, explicit guardian consent and verification requests; public stats filter by season", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://fixture.invalid/player-profiles",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const profile = {
    bio: "Player biography",
    photo: "",
    school: "Example High",
    gradYear: "2030",
    city: "Broken Arrow",
    positions: "P / OF",
    bats: "R",
    throws: "R",
    height: "",
    weight: "",
    gpa: "",
    commitment: "",
    video: "",
  };
  const fixture = {
    workspace: {
      admin: false,
      players: [
        {
          id: "a",
          name: "Example Player",
          guardian: true,
          revision: 1,
          profile,
          published: false,
          metrics: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              metric: "pitchVelocity",
              value: 78,
              measured_on: "2026-10-01",
              revision: 1,
              status: "unverified",
              evidence: "",
              review_note: "",
            },
          ],
          links: [],
        },
      ],
      requests: [],
      rosters: [],
    },
    public: [
      {
        id: "a",
        name: "Example Player",
        profile,
        metrics: [],
        teams: [
          { id: "t", name: "Prospects", current: true, seasons: ["Spring 2025", currentSeason()] },
        ],
        rows: [
          { teamId: "t", season: currentSeason(), values: { ab: 4, h: 2 } },
          { teamId: "t", season: "Spring 2025", values: { ab: 6, h: 1 } },
        ],
        additional: [],
      },
    ],
    saves: [],
    consents: [],
    metrics: [],
  };
  globalThis.__recruitingFixture = fixture;
  const mocks = {
    "@tanstack/react-router": `export const createFileRoute=()=>config=>({...config,useParams:()=>({playerId:'a'})});`,
    "@/lib/auth/use-current-user": `export const useCurrentUserState=()=>({user:{id:'parent'},isPending:false});`,
    "@/lib/recruiting-api": `const f=()=>globalThis.__recruitingFixture;export const getRecruitingWorkspace=async()=>structuredClone(f().workspace);export const getRecruitingPlayer=async()=>f().public;export const saveRecruiting=async({data})=>{f().saves.push(data);f().workspace.players[0].revision++;};export const setRecruitingConsent=async({data})=>{f().consents.push(data);f().workspace.players[0].published=data.publish;};export const submitRecruitingMetric=async({data})=>f().metrics.push(data);export const reviewRecruiting=async()=>{};export const linkRecruiting=async()=>{};`,
  };
  const out = resolve("artifacts/recruiting-render.mjs");
  await mkdir("artifacts", { recursive: true });
  const result = await build({
    stdin: {
      contents: `export {Route as Workspace} from './src/routes/player-profiles';export {Route as Public} from './src/routes/player.$playerId';`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
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
  const { Workspace, Public } = await import(pathToFileURL(out).href);
  const host = document.getElementById("root");
  let root = createRoot(host);
  const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);
  const select = async (el, value) =>
    act(async () => {
      el.value = value;
      el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
  try {
    await act(async () => root.render(createElement(Workspace.component)));
    await select(host.querySelector("select"), "a");
    assert.equal(button("Authorize & publish profile").disabled, true);
    assert.equal(host.querySelector("input[type=checkbox]").checked, false);
    await act(async () => button("Save profile").click());
    assert.equal(fixture.saves.length, 1);
    assert.equal(fixture.saves[0].athleteId, "a");
    assert.match(host.textContent, /Profile saved/);
    const metricDetails = [...host.querySelectorAll("details")].find((d) =>
      d.querySelector("summary")?.textContent.includes("Pitch velocity"),
    );
    await act(async () => metricDetails.querySelector("summary").click());
    await act(async () => metricDetails.querySelector("input[type=checkbox]").click());
    await act(async () => button("Save & request verification").click());
    assert.equal(fixture.metrics.length, 1);
    assert.equal(fixture.metrics[0].request, true);
    assert.equal(fixture.metrics[0].value, 78);
    await act(async () => root.unmount());
    root = createRoot(host);
    fixture.workspace.players[0].guardian = false;
    await act(async () => root.render(createElement(Workspace.component)));
    await select(host.querySelector("select"), "a");
    assert.equal(button("Authorize & publish profile"), undefined);
    assert.match(host.textContent, /Only a parent or legal guardian/);
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(createElement(Public.component)));
    const season = [...host.querySelectorAll("label")]
      .find((l) => l.textContent.startsWith("Season"))
      .querySelector("select");
    assert.equal(season.value, currentSeason());
    assert.match(host.querySelector("table").textContent, /0.500/);
    await select(season, "all");
    assert.match(host.querySelector("table").textContent, /0.300/);
    assert.match(host.querySelector("table").textContent, /At bats10/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.__recruitingFixture;
    await rm(out, { force: true });
  }
});
