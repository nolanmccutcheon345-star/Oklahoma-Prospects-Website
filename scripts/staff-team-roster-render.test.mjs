import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

test("private team roster transport requires server identity, strict team input and no-store", async () => {
  const api = await readFile("src/lib/teams/staff-roster-api.ts", "utf8");
  assert.match(api, /method: "POST"/);
  assert.match(api, /middleware\(\[authMiddleware\]\)/);
  assert.match(api, /\.strict\(\)/);
  assert.match(api, /clubIdentity\(context.userId\)/);
  assert.match(api, /setResponseHeader\("Cache-Control", "private, no-store"\)/);
  assert.match(api, /staffTeamRosterView\(await loadPublicClub\(\), data.teamId, me\)/);
});

test("staff roster has no SSR data, clears on logout/team/account changes and ignores stale responses", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  globalThis.staffRosterFixture = { user: null, isPending: false, requests: [] };
  const out = resolve("scripts/.staff-roster-render-test.mjs");
  const built = await build({
    entryPoints: ["src/components/teams/staff-team-roster.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*"],
    plugins: [
      {
        name: "synthetic-staff-roster",
        setup(b) {
          b.onResolve({ filter: /^@\/lib\/auth\/use-current-user$/ }, () => ({
            path: "auth",
            namespace: "fixture",
          }));
          b.onResolve({ filter: /^@\/lib\/teams\/staff-roster-api$/ }, () => ({
            path: "api",
            namespace: "fixture",
          }));
          b.onResolve({ filter: /ui\/button$/ }, () => ({ path: "button", namespace: "fixture" }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            loader: "js",
            contents:
              path === "auth"
                ? "export const useCurrentUserState=()=>globalThis.staffRosterFixture;"
                : path === "api"
                  ? "export const getStaffTeamRoster=({data})=>new Promise((resolve,reject)=>globalThis.staffRosterFixture.requests.push({teamId:data.teamId,resolve,reject}));"
                  : 'import {createElement} from "react"; export const Button=({variant,...props})=>createElement("button",props);',
          }));
        },
      },
    ],
  });
  await writeFile(out, built.outputFiles[0].text);
  const { StaffTeamRoster } = await import(pathToFileURL(out).href);
  const { act, createElement } = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { createRoot } = await import("react-dom/client");
  const host = document.getElementById("root"),
    root = createRoot(host);
  const fixture = globalThis.staffRosterFixture;
  const roster = (teamId, name) => ({
    teamId,
    teamName: "Synthetic team",
    players: [{ id: "synthetic", name, number: "7", withdrawn: false }],
  });
  const render = (teamId = "team-a") =>
    act(async () => root.render(createElement(StaffTeamRoster, { teamId })));
  try {
    assert.equal(renderToString(createElement(StaffTeamRoster, { teamId: "team-a" })), "");
    await render();
    assert.equal(fixture.requests.length, 0);
    fixture.user = { id: "owner", isDevFallback: false };
    await render();
    assert.match(host.textContent, /Checking staff roster/);
    await act(async () =>
      fixture.requests.at(-1).resolve(roster("team-a", "Private synthetic athlete")),
    );
    assert.match(host.textContent, /Private synthetic athlete/);
    assert.match(host.textContent, /1 active players/);
    fixture.user = null;
    await render();
    assert.equal(host.textContent, "");
    fixture.user = { id: "owner", isDevFallback: false };
    await render();
    const stale = fixture.requests.at(-1);
    await render("team-b");
    await act(async () => stale.resolve(roster("team-a", "Stale private athlete")));
    assert.doesNotMatch(host.textContent, /Stale private athlete/);
    await act(async () =>
      fixture.requests.at(-1).resolve(roster("team-b", "Team B private athlete")),
    );
    assert.match(host.textContent, /Team B private athlete/);
    fixture.user = { id: "unrelated-parent", isDevFallback: false };
    await render("team-b");
    assert.doesNotMatch(host.textContent, /Team B private athlete/);
    await act(async () => fixture.requests.at(-1).resolve(null));
    assert.equal(host.textContent, "");
    fixture.user = { id: "owner", isDevFallback: false };
    await render();
    await act(async () => fixture.requests.at(-1).reject(new Error("Synthetic failure")));
    assert.match(host.textContent, /could not be checked/);
    await act(async () => host.querySelector("button").click());
    await act(async () =>
      fixture.requests.at(-1).resolve({ teamId: "team-a", teamName: "Empty team", players: [] }),
    );
    assert.match(host.textContent, /No players on this team's private roster yet/);
    fixture.isPending = true;
    await render();
    assert.equal(host.textContent, "");
  } finally {
    await act(async () => root.unmount());
    await rm(out, { force: true });
    dom.window.close();
    delete globalThis.staffRosterFixture;
  }
});
