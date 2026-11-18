import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

test("public roster never renders historical identity payloads, including for nonstaff accounts", async () => {
  const out = resolve("scripts/.public-roster-privacy-render.mjs");
  const result = await build({
    entryPoints: ["src/components/public-team-roster.tsx"], bundle: true,
    platform: "node", format: "esm", write: false, external: ["react", "react/*"],
    plugins: [{ name: "privacy-fixture", setup(b) {
      b.onResolve({ filter: /^@\// }, ({path}) => ({path, namespace: "fixture"}));
      b.onResolve({ filter: /^\.\// }, ({path, importer}) => importer.endsWith("public-team-roster.tsx") ? ({path, namespace: "fixture"}) : undefined);
      b.onLoad({ filter: /.*/, namespace: "fixture" }, ({path}) => ({ loader: "js", contents:
        path.endsWith("use-current-user") ? "export const useCurrentUserState=()=>({user:globalThis.publicRosterViewer,isPending:false});" :
        path.endsWith("public-api") ? "export const getPublicTeamsView=async()=>[];export const getTeamStatsAccess=async()=>({allowed:false});" :
        path.endsWith("public-profile-text") ? "export const publicCoachName=x=>x;" :
        path.endsWith("public-request") ? "export const publicRequest=x=>x;" :
        path.endsWith("public-record") ? "export const publicRecordLabel=()=>null;" :
        "export const CatalogStatus=()=>null;export const TeamActivities=()=>null;export const Button=()=>null;export const CoachBio=()=>null;export const StatsTable=()=>null;"
      }));
    }}],
  });
  await writeFile(out,result.outputFiles[0].text);
  try {
    const {PublicTeamRoster}=await import(pathToFileURL(out).href);
    const initial=[{id:"synthetic-team",name:"Synthetic team",sport:"Baseball",age:"13U",season:"2027",seasons:["2027"],record:{w:0,l:0,t:0},stats:{},coaches:[],players:[{id:"private-id",name:"Synthetic secret roster identity",number:"17"}]}];
    for (const viewer of [null,{id:"parent"},{id:"unrelated-coach"},{id:"dev",isDevFallback:true}]) {
      globalThis.publicRosterViewer=viewer;
      const html=renderToString(createElement(PublicTeamRoster,{teamId:"synthetic-team",initial}));
      assert.doesNotMatch(html,/Synthetic secret roster identity|private-id|View stats/);
      assert.match(html,/Player names are visible only to authorized staff/);
    }
  } finally { delete globalThis.publicRosterViewer; await rm(out,{force:true}); }
});
