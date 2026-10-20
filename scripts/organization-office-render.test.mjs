import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const methods = [
  "saveOrganizationTeam",
  "saveOrganizationPlayer",
  "saveOrganizationStaff",
  "moveOrganizationPlayer",
  "saveOrganizationRegistration",
  "saveOrganizationActivity",
  "saveOrganizationEvaluation",
  "reviewOrganizationEvaluation",
  "sendOrganizationMessage",
];
async function bundle(entry, mocks, directory) {
  const outfile = resolve(directory, "component.mjs");
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    plugins: [
      {
        name: "synthetic-boundaries",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            mocks[args.path] ? { path: args.path, namespace: "fixture" } : null,
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            contents: mocks[args.path],
            loader: "js",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  return import(pathToFileURL(outfile).href);
}
function environment() {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/coordinator" });
  const keys = ["window", "document", "HTMLElement", "FormData", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  return {
    dom,
    restore() {
      dom.window.close();
      for (const key of keys) {
        if (previous[key] === undefined) delete globalThis[key];
        else globalThis[key] = previous[key];
      }
    },
  };
}

test("organization operations keeps explicit team scope, posts only confirmed messages, and clears revoked data", async () => {
  const directory = await mkdtemp("scripts/.render-component-organization-");
  const env = environment();
  const fixture = {
    revision: 4,
    teams: [
      {
        id: "softball-team",
        name: "Synthetic Softball",
        sport: "softball",
        age: "14U",
        level: "Open",
        seasonLabel: "Spring 2030",
        seasonStart: "2030-01-01",
        seasonEnd: "2030-07-01",
        headCoach: "Synthetic Coach",
        coachEmail: "coach@example.invalid",
        closed: false,
        staff: [],
        roster: [
          {
            id: "player-one",
            teamId: "softball-team",
            name: "Synthetic Player",
            number: "12",
            positions: ["P"],
            bats: "R",
            throws: "R",
            gradYear: "2034",
            school: "Test School",
            email: "",
            withdrawn: false,
            parents: [
              {
                name: "Synthetic Guardian",
                rel: "Parent",
                email: "guardian@example.invalid",
                phone: "555-0100",
              },
            ],
            docs: { waiver: false, birthCert: false, insurance: false, physical: false },
          },
        ],
      },
      {
        id: "baseball-team",
        name: "Synthetic Baseball",
        sport: "baseball",
        age: "13U",
        level: "Open",
        seasonLabel: "",
        seasonStart: "",
        seasonEnd: "",
        headCoach: "",
        coachEmail: "",
        closed: false,
        roster: [],
        staff: [],
      },
    ],
    staff: [],
    registrations: [
      {
        id: "registration-one",
        kind: "tryout",
        status: "open",
        revision: 2,
        workRevision: 1,
        createdAt: "2030-01-01T12:00:00Z",
        player: "Synthetic Recruit",
        parent: "Recruit Guardian",
        email: "recruit-guardian@example.invalid",
        phone: "555-0101",
        age: "14U",
        sport: "softball",
        season: "Spring 2030",
        positions: "P",
        preferredTeamId: "softball-team",
        workflow: { teamId: "softball-team", assigneeId: "", status: "new", followUpDate: "" },
      },
    ],
    activities: [],
    evaluations: [],
    limitations: ["Only allowlisted operational fields are available."],
  };
  const calls = [];
  const communicationContracts = await import("../src/lib/coordinator/contracts.ts");
  const draftRows = [
    {
      id: "00000000-0000-4000-8000-000000000002",
      sport: "softball",
      teamId: "softball-team",
      title: "Existing operational draft",
      body: "Practice reminder",
      status: "draft",
      revision: 2,
      updatedAt: "2030-01-01T12:00:00Z",
    },
  ];
  let emailFailures = 1;
  let emailDelivery = "queued";
  globalThis.__organizationCommunications = {
    sendOrganizationRecruitingEmail: async ({ data }) => {
      communicationContracts.emailInput.parse(data);
      calls.push({ method: "sendOrganizationRecruitingEmail", data });
      if (emailFailures-- > 0) throw new Error("Synthetic temporary connection error.");
      return { ok: true, delivery: emailDelivery };
    },
    getOrganizationDrafts: async ({ data }) => {
      communicationContracts.scopeInput.parse(data);
      calls.push({ method: "getOrganizationDrafts", data });
      return {
        items: structuredClone(
          draftRows.filter((d) => d.sport === data.sport && d.teamId === data.teamId),
        ),
        withheldCount: 1,
      };
    },
    saveOrganizationDraft: async ({ data }) => {
      communicationContracts.draftInput.parse(data);
      calls.push({ method: "saveOrganizationDraft", data });
      const index = draftRows.findIndex((draft) => draft.id === data.id);
      const saved = {
        ...data,
        status: data.submit ? "submitted" : "draft",
        revision: data.revision + 1,
        updatedAt: "2030-01-02T12:00:00Z",
      };
      if (index === -1) draftRows.push(saved);
      else draftRows[index] = saved;
      return { ok: true, id: data.id, revision: saved.revision, status: saved.status };
    },
    getOrganizationOwnActivity: async () => [
      {
        action: "organization.team.save",
        targetId: "softball-team",
        result: "allowed",
        sport: "softball",
        teamId: "softball-team",
        createdAt: "2030-01-02T12:00:00Z",
      },
      {
        action: "organization.player.save",
        targetId: "synthetic-other-player",
        result: "allowed",
        sport: "baseball",
        teamId: "baseball-team",
        createdAt: "2030-01-01T12:00:00Z",
      },
    ],
  };
  const contracts = await import("../src/lib/coordinator/organization-contracts.ts");
  const schemas = {
    saveOrganizationTeam: contracts.organizationTeamInput,
    saveOrganizationPlayer: contracts.organizationPlayerInput,
    saveOrganizationStaff: contracts.organizationStaffInput,
    moveOrganizationPlayer: contracts.organizationMoveInput,
    saveOrganizationRegistration: contracts.organizationRegistrationInput,
    saveOrganizationActivity: contracts.organizationActivityInput,
    saveOrganizationEvaluation: contracts.organizationEvaluationInput,
    reviewOrganizationEvaluation: contracts.organizationEvaluationReviewInput,
    sendOrganizationMessage: contracts.organizationMessageInput,
  };
  let denied = false;
  let workspaceReads = 0;
  globalThis.__organizationUi = {
    getOrganizationWorkspace: async () => {
      workspaceReads++;
      if (denied) throw new Error("Operational access was revoked.");
      return structuredClone(fixture);
    },
    getOrganizationOccupancy: async () => [],
    ...Object.fromEntries(
      methods.map((method) => [
        method,
        async ({ data }) => {
          schemas[method].parse(data);
          calls.push({ method, data });
          if (method === "saveOrganizationTeam") {
            fixture.teams.find((team) => team.id === data.teamId).name = data.changes.name;
            fixture.revision++;
          }
          return { ok: true };
        },
      ]),
    ),
  };
  const mocks = {
    "@/lib/coordinator/organization-api": `export const {getOrganizationWorkspace,getOrganizationOccupancy,${methods.join(",")}} = globalThis.__organizationUi;`,
    "@/lib/coordinator/organization-communications-api":
      "export const {sendOrganizationRecruitingEmail,getOrganizationDrafts,saveOrganizationDraft,getOrganizationOwnActivity}=globalThis.__organizationCommunications;",
    "@/lib/coordinator/organization-reports-api":
      "export const getOrganizationReport=async()=>({filename:'synthetic.csv',contentType:'text/csv',body:'name\\nSynthetic'});",
    "@/lib/commerce/operations-api":
      "export const getOperationalServiceResources=async()=>[]; export const setServiceResources=async()=>({ok:true});",
    "@/lib/auth/gates": "export const UserButton=()=>null;",
    "@/lib/commerce/lesson-assignment-api":
      "export const getLessonAssignments=async()=>[{id:'synthetic-lesson',serviceName:'Synthetic lesson',playerName:'Synthetic Lesson Player',customerEmail:'lesson-guardian@example.invalid',coachId:'synthetic-coach',coachName:'Synthetic Instructor',startsAt:'2030-02-04T23:00:00Z',endsAt:'2030-02-05T00:00:00Z'}]; export const getLessonInstructors=async()=>{throw new Error('Operational assignment is unavailable until financial cutover');}; export const saveLessonInstructor=async()=>{throw new Error('No assignment may be posted after denied choices');};",
    "@/lib/pd/operational-lesson-api":
      "export const getOperationalLessonCompletions=async()=>({canRecord:false,lessons:[]}); export const saveOperationalLessonCompletion=async()=>{throw new Error('Inactive completion must not post');};",
    "@/components/staff/directory-desk": "export const StaffDirectoryDesk=()=>null;",
    "@/components/tryout-event-editor": "export const TryoutEventEditor=()=>null;",
    "@/components/coordinator/organization-game-results":
      "import {createElement} from 'react'; export const OrganizationGameResults=({onSaved})=>createElement('section',{'aria-label':'Game results'},createElement('h2',null,'Game Results & Statistics'),createElement('button',{onClick:onSaved},'Save Synthetic Game'));",
  };
  let root;
  try {
    const { OrganizationOffice } = await bundle(
      "src/components/coordinator/organization-office.tsx",
      mocks,
      directory,
    );
    const { act, createElement } = await import("react"),
      { createRoot } = await import("react-dom/client");
    const host = document.getElementById("root");
    root = createRoot(host);
    const click = (text) =>
      act(async () => {
        const button = [...host.querySelectorAll("button")].find((b) => b.textContent === text);
        assert.ok(button, text);
        button.click();
      });
    const control = (label) =>
      [...host.querySelectorAll("label")]
        .find((l) => l.childNodes[0]?.textContent?.trim() === label)
        ?.querySelector("input,select,textarea");
    const select = (label, value) =>
      act(async () => {
        const node = control(label);
        assert.ok(node, label);
        node.value = value;
        node.dispatchEvent(new env.dom.window.Event("change", { bubbles: true }));
      });
    const submit = (form) =>
      act(async () =>
        form.dispatchEvent(new env.dom.window.Event("submit", { bubbles: true, cancelable: true })),
      );
    window.confirm = () => true;
    await act(async () => root.render(createElement(OrganizationOffice)));
    assert.equal(host.querySelector("h1").textContent, "Organization Operations");
    const navButtons = [
      ...host.querySelectorAll('nav[aria-label="Organization operations"] button'),
    ].map((b) => b.textContent);
    for (const forbidden of ["Finance", "Payments", "Pricing", "Staff & Access", "Permissions"])
      assert.ok(!navButtons.includes(forbidden));
    await click("Players & Guardians");
    assert.match(host.textContent, /Select a team above/);
    await select("Team workspace", "softball-team");
    assert.match(host.textContent, /Synthetic Guardian/);
    assert.match(host.textContent, /guardian@example.invalid/);
    const playerArticle = [...host.querySelectorAll("article")].find((a) =>
      a.querySelector("h3")?.textContent.includes("Synthetic Player"),
    );
    const playerForm = playerArticle.querySelector("form");
    playerForm.querySelector('[name="number"]').value = "24";
    await submit(playerForm);
    const playerSave = calls.find((c) => c.method === "saveOrganizationPlayer").data;
    assert.equal(playerSave.teamId, "softball-team");
    assert.equal(playerSave.playerId, "player-one");
    assert.equal(playerSave.revision, 4);
    assert.equal(playerSave.changes.number, "24");
    assert.equal(playerSave.changes.parents[0].email, "guardian@example.invalid");
    assert.deepEqual(
      Object.keys(playerSave.changes).sort(),
      [
        "bats",
        "docs",
        "email",
        "gradYear",
        "name",
        "number",
        "parents",
        "positions",
        "school",
        "throws",
        "withdrawn",
      ].sort(),
    );
    await click("Teams");
    const teamArticle = [...host.querySelectorAll("article")].find(
      (a) => a.querySelector("h3")?.textContent === "Synthetic Softball",
    );
    const teamForm = teamArticle.querySelector("form");
    teamForm.querySelector('[name="name"]').value = "Updated Synthetic Softball";
    await submit(teamForm);
    assert.match(host.textContent, /Updated Synthetic Softball/);
    assert.equal(calls.filter((c) => c.method === "saveOrganizationTeam").length, 1);
    await click("Schedule");
    const activityForm = host.querySelector("form");
    for (const [name, text] of Object.entries({
      title: "Synthetic practice",
      date: "2030-02-04",
      startTime: "17:00",
      endTime: "18:00",
      location: "Synthetic facility",
    }))
      activityForm.querySelector(`[name="${name}"]`).value = text;
    activityForm.querySelector('[name="laneIds"][value="1"]').checked = true;
    await submit(activityForm);
    const activitySave = calls.find((c) => c.method === "saveOrganizationActivity").data;
    assert.equal(activitySave.teamId, "softball-team");
    assert.deepEqual(activitySave.laneIds, ["1"]);
    assert.equal(activitySave.status, "scheduled");
    await click("Evaluations");
    const evaluationForm = host.querySelector("form");
    evaluationForm.querySelector('[name="playerName"]').value = "Synthetic Evaluated Player";
    evaluationForm.querySelector('[name="evaluationDate"]').value = "2030-02-04";
    await submit(evaluationForm);
    const evaluationSave = calls.find((c) => c.method === "saveOrganizationEvaluation").data;
    assert.equal(evaluationSave.status, "draft");
    assert.deepEqual(Object.values(evaluationSave.ratings), [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    assert.equal("payload" in evaluationSave, false);
    await click("Team Messages");
    const messageForm = host.querySelector("form");
    messageForm.querySelector("textarea").value = "Practice starts at five.";
    window.confirm = () => false;
    await submit(messageForm);
    assert.equal(calls.filter((c) => c.method === "sendOrganizationMessage").length, 0);
    assert.doesNotMatch(host.textContent, /Message posted to/);
    window.confirm = () => true;
    await submit(messageForm);
    const sent = calls.find((c) => c.method === "sendOrganizationMessage").data;
    assert.equal(sent.teamId, "softball-team");
    assert.equal(sent.confirmedTeamId, "softball-team");
    assert.equal(sent.body, "Practice starts at five.");
    assert.match(host.textContent, /Message posted to the selected team/);
    await click("Registrations");
    const recruitArticle = [...host.querySelectorAll("article")].find(
      (article) => article.querySelector("h3")?.textContent === "Synthetic Recruit",
    );
    const emailForm = recruitArticle.querySelector('[name="subject"]').closest("form");
    emailForm.querySelector('[name="subject"]').value = "Tryout follow-up";
    emailForm.querySelector('[name="body"]').value = "Would Tuesday work for your tryout?";
    let confirmedText = "";
    window.confirm = (text) => {
      confirmedText = text;
      return false;
    };
    await submit(emailForm);
    assert.equal(
      calls.filter((call) => call.method === "sendOrganizationRecruitingEmail").length,
      0,
    );
    assert.match(confirmedText, /Recruit Guardian at recruit-guardian@example.invalid/);
    assert.match(confirmedText, /Subject: Tryout follow-up/);
    assert.match(confirmedText, /Would Tuesday work/);
    window.confirm = () => true;
    await submit(emailForm);
    assert.match(host.textContent, /Synthetic temporary connection error/);
    await submit(emailForm);
    const emailAttempts = calls.filter((call) => call.method === "sendOrganizationRecruitingEmail");
    assert.equal(emailAttempts.length, 2);
    assert.equal(emailAttempts[0].data.id, emailAttempts[1].data.id);
    assert.equal(emailAttempts[1].data.confirmedEmail, "recruit-guardian@example.invalid");
    assert.equal(emailAttempts[1].data.requestId, "registration-one");
    assert.match(host.textContent, /Recruiting email queued/);
    assert.doesNotMatch(host.textContent, /Email delivered/);
    emailDelivery = "sent";
    const nextEmailForm = recruitArticle.querySelector('[name="subject"]').closest("form");
    nextEmailForm.querySelector('[name="subject"]').value = "Second follow-up";
    nextEmailForm.querySelector('[name="body"]').value = "Thank you for confirming.";
    await submit(nextEmailForm);
    assert.match(host.textContent, /email provider accepted this recruiting email/);
    assert.match(host.textContent, /Inbox delivery is not confirmed/);
    await click("Website Drafts");
    assert.deepEqual(calls.filter((call) => call.method === "getOrganizationDrafts").at(-1).data, {
      sport: "softball",
      teamId: "softball-team",
    });
    assert.match(host.textContent, /1 existing draft is withheld/);
    assert.match(host.textContent, /Existing operational draft/);
    const newDraftForm = host.querySelector("form");
    newDraftForm.querySelector('[name="title"]').value = "New operational announcement";
    newDraftForm.querySelector('[name="body"]').value = "Team practice is on Tuesday.";
    await submit(newDraftForm);
    const createdDraft = calls
      .filter((call) => call.method === "saveOrganizationDraft")
      .at(-1).data;
    assert.equal(createdDraft.revision, 0);
    assert.equal(createdDraft.submit, false);
    assert.equal(createdDraft.sport, "softball");
    assert.equal(createdDraft.teamId, "softball-team");
    const draftArticle = [...host.querySelectorAll("article")].find(
      (article) => article.querySelector("h3")?.textContent === "Existing operational draft",
    );
    const draftForm = draftArticle.querySelector("form");
    draftForm.querySelector('[name="title"]').value = "Revised operational draft";
    draftForm.querySelector('[name="submit"]').checked = true;
    await submit(draftForm);
    const submittedDraft = calls
      .filter((call) => call.method === "saveOrganizationDraft")
      .at(-1).data;
    assert.equal(submittedDraft.revision, 2);
    assert.equal(submittedDraft.submit, true);
    assert.match(host.textContent, /Draft submitted for owner review. It has not been published/);
    const submittedArticle = [...host.querySelectorAll("article")].find(
      (article) => article.querySelector("h3")?.textContent === "Revised operational draft",
    );
    assert.equal(submittedArticle.querySelector("form"), null);
    await click("My Activity");
    assert.match(host.textContent, /organization.team.save/);
    assert.doesNotMatch(host.textContent, /organization.player.save|synthetic-other-player/);
    await select("Program", "baseball");
    assert.match(host.textContent, /organization.player.save/);
    assert.doesNotMatch(host.textContent, /organization.team.save/);
    await select("Program", "softball");
    await select("Team workspace", "softball-team");
    await click("Lessons");
    assert.match(host.textContent, /Lesson instructor assignments/);
    const lessonSection = host.querySelector('[aria-label="Lesson instructor assignments"]');
    await act(async () => lessonSection.querySelector('input[type="checkbox"]').click());
    assert.match(lessonSection.textContent, /Synthetic Instructor/);
    await click("Change instructor");
    assert.match(
      lessonSection.textContent,
      /Operational assignment is unavailable until financial cutover/,
    );
    assert.equal(lessonSection.querySelectorAll("form,select,textarea").length, 0);
    assert.doesNotMatch(lessonSection.textContent, /Save assignment/);
    await click("Game Results");
    assert.match(host.textContent, /Game Results & Statistics/);
    assert.equal(control("Program"), undefined);
    assert.equal(control("Team workspace"), undefined);
    const readsBeforeGameSave = workspaceReads;
    await click("Save Synthetic Game");
    assert.equal(workspaceReads, readsBeforeGameSave + 1);
    await click("Players & Guardians");
    denied = true;
    await click("Refresh Records");
    assert.match(host.textContent, /Operational access was revoked/);
    assert.doesNotMatch(
      host.textContent,
      /Synthetic Guardian|guardian@example.invalid|Synthetic Player/,
    );
    assert.equal(
      host.querySelectorAll('nav[aria-label="Organization operations"] button').length,
      0,
    );
  } finally {
    if (root) {
      const { act } = await import("react");
      await act(async () => root.unmount());
    }
    delete globalThis.__organizationUi;
    delete globalThis.__organizationCommunications;
    env.restore();
    await rm(directory, { recursive: true, force: true });
  }
});

test("withheld staff biography stays disabled and presentation metadata is never submitted", async () => {
  const directory = await mkdtemp("scripts/.render-component-directory-");
  const env = environment();
  const row = {
    id: "00000000-0000-4000-8000-000000000001",
    version: 1,
    name: "Synthetic Staff",
    title: "Coordinator",
    program: "Softball",
    email: "staff@example.invalid",
    phone: "",
    bio: "",
    published: false,
    bioWithheld: true,
  };
  const calls = [];
  globalThis.__directoryUi = {
    getStaffDirectory: async () => [row],
    saveStaffDirectoryListing: async ({ data }) => {
      calls.push(data);
      return { ...row, ...data, version: 2 };
    },
  };
  const mocks = {
    "@/lib/staff-directory-api":
      "export const {getStaffDirectory,saveStaffDirectoryListing}=globalThis.__directoryUi;",
    "@tanstack/react-router":
      "export const useRouter=()=>({invalidate:async()=>{}}); export const Link=()=>null;",
  };
  let root;
  try {
    const { StaffDirectoryDesk } = await bundle(
      "src/components/staff/directory-desk.tsx",
      mocks,
      directory,
    );
    const { act, createElement } = await import("react"),
      { createRoot } = await import("react-dom/client");
    const host = document.getElementById("root");
    root = createRoot(host);
    await act(async () => root.render(createElement(StaffDirectoryDesk)));
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Edit Synthetic Staff")
        .click(),
    );
    assert.equal(host.querySelector("textarea").disabled, true);
    assert.equal(host.querySelector('input[type="checkbox"]').disabled, true);
    assert.match(host.textContent, /Unclassified draft biography is withheld/);
    await act(async () =>
      host
        .querySelector("form")
        .dispatchEvent(new env.dom.window.Event("submit", { bubbles: true, cancelable: true })),
    );
    assert.equal(calls.length, 1);
    assert.equal("bioWithheld" in calls[0], false);
    assert.equal(calls[0].bio, "");
    assert.equal(calls[0].published, false);
  } finally {
    if (root) {
      const { act } = await import("react");
      await act(async () => root.unmount());
    }
    delete globalThis.__directoryUi;
    env.restore();
    await rm(directory, { recursive: true, force: true });
  }
});
