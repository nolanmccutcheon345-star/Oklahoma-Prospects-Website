import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleClub } from "../src/lib/teams/seed.ts";
import { operationalClubView } from "../src/lib/teams/operational-view.ts";

const mocks = {
  "./team-financial-management": `import React from 'react';export const TeamFinancialManagement=()=>React.createElement('div',{'data-testid':'team-financial-management'},'Team financial management');`,
  "./assign-players-panel": `import React from 'react';export const AssignPlayersPanel=()=>React.createElement('div',{'data-testid':'assign-players-panel'},'Assign players panel');`,
  "./roster-cleanup-controls": `export const RosterCleanupControls=()=>null;`,
  "./team-coach-profile-editor": `export const TeamCoachProfileEditor=()=>null;`,
  "./season-picker": `export const SeasonPicker=()=>null;`,
  "@/components/teams/roster-role-select": `export const RosterRoleSelect=()=>null;`,
  "@/lib/team-coach-directory-api": `export const getAssignableTeamCoaches=async()=>[];`,
  "@/lib/teams/store": `export const officeAddPlayer=async()=>{};export const officeAddTeam=async()=>{};export const officeRemoveTeam=async()=>{};export const officeSaveTeamSeasons=async()=>{};`,
};

async function loadOfficeApp() {
  const out = resolve("artifacts/office-assign-players-render.mjs");
  await mkdir("artifacts", { recursive: true });
  const result = await build({
    entryPoints: ["src/components/teams/office-app.tsx"],
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
  try {
    return (await import(pathToFileURL(out).href)).OfficeApp;
  } finally {
    await rm(out, { force: true });
  }
}

test("AssignPlayersPanel renders in legacy mode (financial=null) and owner active mode, but stays hidden when financial.owner is false", async () => {
  const OfficeApp = await loadOfficeApp();
  const club = operationalClubView(sampleClub(), "admin", {
    email: "owner@example.invalid",
    familyId: "",
  });
  const baseFinancial = {
    mode: "basis",
    version: 1,
    owner: true,
    obligations: [],
    coachTeams: [],
    staff: [],
    catalog: [],
  };

  const legacyHtml = renderToStaticMarkup(
    createElement(OfficeApp, {
      initialTab: "teams",
      club,
      financial: null,
      onChange: () => {},
      onSave: async () => true,
      onReload: async () => {},
    }),
  );
  assert.match(legacyHtml, /data-testid="assign-players-panel"/);
  assert.doesNotMatch(legacyHtml, /data-testid="team-financial-management"/);

  const ownerBasisHtml = renderToStaticMarkup(
    createElement(OfficeApp, {
      initialTab: "teams",
      club,
      financial: baseFinancial,
      onChange: () => {},
      onSave: async () => true,
      onReload: async () => {},
    }),
  );
  assert.match(ownerBasisHtml, /data-testid="assign-players-panel"/);
  assert.match(ownerBasisHtml, /data-testid="team-financial-management"/);

  const nonOwnerHtml = renderToStaticMarkup(
    createElement(OfficeApp, {
      initialTab: "teams",
      club,
      financial: { ...baseFinancial, owner: false },
      onChange: () => {},
      onSave: async () => true,
      onReload: async () => {},
    }),
  );
  assert.doesNotMatch(nonOwnerHtml, /data-testid="assign-players-panel"/);
  assert.doesNotMatch(nonOwnerHtml, /data-testid="team-financial-management"/);
});
