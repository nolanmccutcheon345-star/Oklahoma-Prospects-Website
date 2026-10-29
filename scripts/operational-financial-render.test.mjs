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
  "@/lib/enrollment/api": `export const getTeamWaiverReadiness=async()=>[];`,
  "./fee-workspace": `import React from 'react';export const TeamFeeWorkspace=({teamId})=>React.createElement('div',{'data-financial-team':teamId||'all'},'Financial fee workspace');`,
  "./team-financial-management": `export const TeamFinancialManagement=()=>null;`,
  "./team-activities": `export const TeamActivities=()=>null;`,
  "./uniform-photos": `export const SelectedTeamUniform=()=>null;`,
  "./roster-consent-form": `export const TeamRosterConsentForm=()=>null;`,
  "./tournament-finder": `export const TournamentFinder=()=>null;`,
  "@/components/finance/my-finance": `export const MyFinance=()=>null;`,
  "@/components/commerce/player-birthdays": `export const PrivatePlayerBirthday=()=>null;`,
  "./team-coach-profile-editor": `export const TeamCoachProfileEditor=()=>null;`,
  "@/components/teams/roster-role-select": `export const RosterRoleSelect=()=>null;`,
  "@/components/team-development/family-panel": `export const TeamDevelopmentFamilyPanel=()=>null;`,
  "@/components/team-development/coach-panel": `export const TeamDevelopmentCoachPanel=()=>null;`,
  "@/components/team-development/admin-panel": `export const TeamDevelopmentAdminPanel=()=>null;`,
  "@/lib/team-coach-directory-api": `export const getAssignableTeamCoaches=async()=>[];`,
  "@/lib/teams/store": `export const officeAddPlayer=async()=>{};export const officeAddTeam=async()=>{};export const officeRemoveTeam=async()=>{};export const officeSaveTeamSeasons=async()=>{};export const coachAddRosterPlayer=async()=>{};export const coachRemoveRosterPlayer=async()=>{};`,
  "@tanstack/react-router": `import React from 'react';export const Link=({to,children,...props})=>React.createElement('a',{href:to,...props},children);`,
};
async function component(file, name) {
  const out = resolve("artifacts/financial-render-" + name + ".mjs");
  await mkdir("artifacts", { recursive: true });
  const result = await build({
    entryPoints: [file],
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
    return (await import(pathToFileURL(out).href))[name];
  } finally {
    await rm(out, { force: true });
  }
}
const obligation = {
  agreementId: "a1",
  teamSeasonId: "season1",
  teamId: "historic-team",
  teamName: "Historical Team",
  playerId: "historical-player",
  playerName: "Historical Player",
  familyId: "historic-home",
  signed: 1000,
  due: 850,
  agreement: { version: "v1", signedBy: "Parent", signedAt: "2026-01-01" },
  feeLock: {
    amount: 1000,
    lockedAt: "2026-01-01",
    policyVersion: "v1",
    components: { season: 1000 },
  },
  planLock: {
    dep: 100,
    deadline: "2027-01-01",
    planType: "four",
    rows: [{ date: "2027-01-01", amount: 1000 }],
  },
  payments: [
    {
      date: "2026-01-01",
      amount: 100,
      fee: 0,
      charged: 100,
      method: "cash",
      label: "Historic deposit",
      receipt: "receipt-old",
    },
  ],
  credits: [{ label: "Sponsor", amount: 50 }],
  depositPaid: true,
};
const financial = {
  mode: "basis",
  version: 1,
  owner: false,
  obligations: [obligation],
  coachTeams: [],
  staff: [],
  catalog: [],
};
test("mounted family desk retains historical obligations with no current linked player", async () => {
  const FamilyApp = await component("src/components/teams/family-app.tsx", "FamilyApp");
  const club = operationalClubView(sampleClub(), "parent", {
    email: "none@example.invalid",
    familyId: "none",
    familyIds: [],
  });
  const html = renderToStaticMarkup(
    createElement(FamilyApp, {
      club,
      financial,
      familyId: "none",
      familyIds: [],
      isPlayer: false,
      lang: "en",
      onChange: () => {},
      onReload: () => {},
    }),
  );
  assert.match(html, /Historical Player/);
  assert.match(html, /Historical Team/);
  assert.match(html, /\$850/);
  assert.match(html, /receipt-old/);
  assert.match(html, /2027-01-01/);
  assert.match(html, /data-financial-team="all"/);
  assert.match(html, /No player is linked/);
  assert.ok(html.indexOf("Historical Player") < html.indexOf("No player is linked"));
});
test("mounted owner and coach displays use separate financial values after operational reassignment", async () => {
  const OfficeApp = await component("src/components/teams/office-app.tsx", "OfficeApp");
  const CoachApp = await component("src/components/teams/coach-app.tsx", "CoachApp");
  const club = operationalClubView(sampleClub(), "admin", {
    email: "owner@example.invalid",
    familyId: "",
  });
  club.teams = [];
  const view = {
    ...financial,
    owner: true,
    staff: [
      {
        teamId: "historic-team",
        teamName: "Historical Team",
        id: "coach1",
        name: "Historical Coach",
        monthly: 1743,
        applyAmount: 12,
        w9: true,
        safeSport: true,
      },
    ],
  };
  const office = renderToStaticMarkup(
    createElement(OfficeApp, {
      club,
      financial: view,
      onChange: () => {},
      onSave: async () => true,
    }),
  );
  assert.match(office, /\$1,000/);
  assert.match(office, /\$100/);
  assert.match(office, /\$1,743/);
  assert.match(office, /Historical Player/);
  const coach = renderToStaticMarkup(
    createElement(CoachApp, {
      club,
      financial: { ...view, owner: false, obligations: [] },
      onChange: () => {},
      onSave: async () => true,
      onReload: async () => {},
    }),
  );
  assert.match(coach, /No teams assigned/);
  assert.match(coach, /Historical Coach/);
  assert.match(coach, /\$1,743/);
  assert.doesNotMatch(coach, /Historical Player/);
});

const { withRendered } = await import("./render-component-support.mjs");
const button = (host, name) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === name);
async function textInput(act, dom, element, value) {
  await act(async () => {
    const proto =
      element.tagName === "TEXTAREA"
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
const admissionMocks = {
  "@/lib/teams/store": `export const previewTeamFinancialAdmission=async({data})=>{globalThis.__admission.review.push(data);return globalThis.__admission.preview;};export const admitTeamFinancialEntities=async({data})=>{globalThis.__admission.saved.push(data);if(globalThis.__admission.fail)throw Error('Financial setup changed. Review again.');return {version:2};};`,
  "./financial-event-commitments": `export const FinancialEventCommitments=()=>null;`,
};
test("owner financial admission requires review of accounts and confirmation, preserves digest and recovers after stale review", async () => {
  const club = operationalClubView(sampleClub(), "admin", {
      email: "owner@example.invalid",
      familyId: "",
    }),
    team = club.teams[0];
  team.roster = team.roster.slice(0, 1);
  const p = team.roster[0];
  let reload = 0;
  globalThis.__admission = {
    review: [],
    saved: [],
    fail: true,
    preview: {
      basisVersion: 3,
      sourceClubRevision: club._rev,
      reviewDigest: "reviewed-exact-identities",
      team: {
        ...team,
        compensationAccounts: [
          { userId: "payee1", name: "Reviewed Payee", email: "payee@example.invalid" },
        ],
        financialTerms: { ...team },
      },
      players: [
        {
          ...p,
          parentEmails: ["parent@example.invalid"],
          guardians: [
            { userId: "parent", name: "Reviewed Guardian", email: "parent@example.invalid" },
          ],
        },
      ],
    },
  };
  try {
    await withRendered(
      "src/components/teams/team-financial-management.tsx",
      "TeamFinancialManagement",
      {
        club,
        financial: { ...financial, owner: true },
        onReload: async () => {
          reload++;
        },
      },
      admissionMocks,
      async ({ host, act, dom }) => {
        await act(async () => host.querySelector('fieldset input[type="checkbox"]').click());
        await act(async () => button(host, "Review financial setup").click());
        assert.match(host.textContent, /Reviewed Guardian/);
        assert.match(host.textContent, /Reviewed Payee/);
        assert.match(host.textContent, /payee@example.invalid/);
        assert.equal(button(host, "Confirm financial setup").disabled, true);
        await act(async () => button(host, "Cancel").click());
        assert.equal(globalThis.__admission.saved.length, 0);
        await act(async () => button(host, "Review financial setup").click());
        await textInput(
          act,
          dom,
          host.querySelector("form textarea"),
          "Owner reviewed new enrollment",
        );
        await act(async () => host.querySelector('form input[type="checkbox"]').click());
        await act(async () =>
          host
            .querySelector("form")
            .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
        );
        assert.equal(globalThis.__admission.saved[0].reviewDigest, "reviewed-exact-identities");
        assert.equal(globalThis.__admission.saved[0].expectedBasisVersion, 3);
        assert.deepEqual(globalThis.__admission.saved[0].playerIds, [p.id]);
        assert.equal(globalThis.__admission.saved[0].confirmed, true);
        assert.match(host.querySelector('[role="alert"]').textContent, /Financial setup changed/);
        await act(async () => button(host, "Refresh financial setup").click());
        assert.equal(reload, 1);
        assert.equal(host.querySelector("form"), null);
      },
    );
  } finally {
    delete globalThis.__admission;
  }
});
test("owner event editor sends frozen financial revision and offers explicit refresh after conflict", async () => {
  const event = {
    id: "event1",
    revision: 4,
    title: "Reviewed event",
    kind: "tournament",
    date: "2027-04-01",
    status: "scheduled",
    entryFee: 75000,
    travel: "local",
    overnightNights: 0,
  };
  globalThis.__financialEvents = {
    reads: 0,
    saved: [],
    data: {
      basisVersion: 9,
      events: [event],
      candidates: [
        { ...event, id: "new-event", revision: 12, title: "Operational candidate", entryFee: 0 },
      ],
    },
  };
  const mocks = {
  "@/lib/enrollment/api": `export const getTeamWaiverReadiness=async()=>[];`,
    "@/lib/teams/fee-api": `export const getFinancialEventCommitments=async()=>{globalThis.__financialEvents.reads++;return globalThis.__financialEvents.data;};export const saveFinancialEventCommitment=async({data})=>{globalThis.__financialEvents.saved.push(data);throw Error('Financial basis changed. Refresh.');};export const admitFinancialEventCommitment=async({data})=>{globalThis.__financialEvents.saved.push(data);return {version:10};};`,
  };
  try {
    await withRendered(
      "src/components/teams/financial-event-commitments.tsx",
      "FinancialEventCommitments",
      { teamId: "team1", onSaved: async () => {} },
      mocks,
      async ({ host, act, dom }) => {
        assert.match(host.textContent, /\$750/);
        await act(async () => button(host, "Edit financial commitment").click());
        await textInput(act, dom, host.querySelector("textarea"), "Reviewed event revision");
        await act(async () =>
          host
            .querySelector("form")
            .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
        );
        assert.equal(globalThis.__financialEvents.saved[0].revision, 4);
        assert.equal(globalThis.__financialEvents.saved[0].basisVersion, 9);
        assert.equal(globalThis.__financialEvents.saved[0].entryFee, 75000);
        assert.match(host.querySelector('[role="alert"]').textContent, /Financial basis changed/);
        await act(async () => button(host, "Refresh financial commitments").click());
        assert.equal(host.querySelector("form"), null);
        assert.equal(globalThis.__financialEvents.reads, 2);
        await act(async () => button(host, "Review financial event").click());
        assert.equal(button(host, "Add financial commitment").disabled, true);
        await textInput(act, dom, host.querySelector("textarea"), "Reviewed new event");
        await act(async () => host.querySelector('input[type="checkbox"]').click());
        await act(async () =>
          host
            .querySelector("form")
            .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
        );
        assert.equal(globalThis.__financialEvents.saved[1].sourceRevision, 12);
        assert.equal(globalThis.__financialEvents.saved[1].confirmed, true);
        assert.equal("revision" in globalThis.__financialEvents.saved[1], false);
      },
    );
  } finally {
    delete globalThis.__financialEvents;
  }
});
