import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { seedMasterMatrix } from "../src/lib/teams/budget-matrix.ts";
import { defaultBudget, project } from "../src/lib/teams/fee-model.ts";
test("team fee UI saves admin drafts and offers only permitted coach controls", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/office" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    CustomEvent: dom.window.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const budget = { ...defaultBudget(), start: "2027-04-01", end: "2027-06-15", months: 2.5 };
  const plan = {
    budget,
    status: "draft",
    revision: 1,
    uniforms: [],
    players: {},
    expenses: [],
    history: [],
  };
  const team = {
    id: "team",
    name: "Example team",
    closed: false,
    access: "admin",
    poEnabled: false,
    revision: 1,
    status: "draft",
    publication: null,
    players: [],
    events: [],
    choices: {
      hotelNightly: 20000,
      hotelNights: 3,
      tournament: 0,
      uniformId: "",
      canTournament: true,
      canUniform: true,
      uniforms: [{ id: "uniform", name: "Sample uniform", items: "Jersey, hat", price: 12000 }],
      full: 50000,
      po: 50000,
    },
    private: {
      plan,
      forecast: project(budget, 10, 0),
      actual: {
        totalCollected: 0,
        totalCredits: 0,
        expensesPaid: 0,
        expensesUnpaid: 0,
        earned: 0,
        deferred: 0,
        actualDistributable: 0,
        nolan: 0,
        steve: 0,
        contingencyFunded: 0,
        fundedContingencyRemaining: 0,
      },
    },
  };
  const fixture = { data: { admin: true, teams: [team], business: null }, saved: [] };
  globalThis.__feeFixture = fixture;
  globalThis.__matrixFixture = {
    value: seedMasterMatrix(),
    revision: 1,
    people: [{ userId: "parent", name: "Example Parent", role: "parent" }],
  };
  const mocks = {
    "@/lib/auth/use-current-user": `export const useCurrentUserState=()=>({user:{id:"fixture"}});`,
    "@/lib/teams/fee-api": `export const getBudgetMaster=async()=>globalThis.__matrixFixture;export const saveBudgetMaster=async({data})=>{globalThis.__matrixSaved=data;return {saved:true};};export const getTeamUniform=async()=>null;export const getTeamFundingStatus=async()=>({overduePlayers:2,tracking:true});export const getFeeWorkspace=async()=>globalThis.__feeFixture.data;export const changeFeePlan=async({data})=>{globalThis.__feeFixture.saved.push(data);return {ok:true};};export const saveFeeBusiness=async()=>({ok:true});`,
    "@/lib/teams/store": `export const recordTeamPayment=async()=>({ok:true});`,
  };
  const out = resolve("artifacts/team-fee-render.mjs");
  await mkdir("artifacts", { recursive: true });
  const result = await build({
    entryPoints: ["src/components/teams/fee-workspace.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "fee-fixture",
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
  const { TeamFeeWorkspace } = await import(pathToFileURL(out).href);
  const host = document.getElementById("root");
  let root = createRoot(host);
  try {
    await act(async () => root.render(createElement(TeamFeeWorkspace)));
    assert.match(host.textContent, /2 players have overdue team payments/);
    assert.match(host.textContent, /Nightly hotel stipend/);
    assert.match(host.textContent, /Fee Composition/);
    assert.match(host.textContent, /Projected business contribution per player/);
    const masterSelect = [...host.querySelectorAll("select")].find((s) =>
      s.parentElement.textContent.includes("Matrix row"),
    );
    assert.equal(masterSelect.options.length, 120);
    await act(async () => {
      masterSelect.value = "softball:14:springSummer";
      masterSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    const head = [...host.querySelectorAll("label")]
      .find((l) => l.textContent.includes("Head coach — season ($)"))
      .querySelector("input");
    assert.equal(head.value, "3900");
    const poOrg = [...host.querySelectorAll("label")]
      .find((l) => l.textContent.includes("PO organization fee for this age"))
      .querySelector("input");
    assert.equal(poOrg.value, "350");
    assert.match(host.textContent, /Membership \/ facility per pitcher-only player per month/);
    const rules = [...host.querySelectorAll("select")].filter((s) =>
      s.parentElement.textContent.includes("Facility overhead contribution"),
    );
    await act(async () => {
      rules[0].value = "fixed";
      rules[0].dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.match(host.textContent, /Monthly team contribution/);
    assert.match(host.textContent, /Monthly facility costs & staffing/);
    assert.match(host.textContent, /Cleaning per month/);
    const personSelect = [...host.querySelectorAll("select")].find((s) =>
      s.parentElement.textContent.includes("Add person to staffing budget"),
    );
    await act(async () => {
      personSelect.value = "parent";
      personSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Add staffing person")
        .click(),
    );
    assert.match(host.textContent, /Example Parent per month/);

    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Save master defaults")
        .click(),
    );
    assert.equal(globalThis.__matrixSaved.value.rows.length, 120);
    assert.equal(globalThis.__matrixSaved.value.overheadRule.monthly, 50000);
    assert.equal(globalThis.__matrixSaved.value.payroll[0].userId, "parent");
    assert.match(host.textContent, /Master saved/);
    assert.match(host.textContent, /Season & private pricing assumptions/);
    assert.match(host.textContent, /FEE HEALTH · INCOMPLETE/);
    assert.doesNotMatch(host.textContent, /Pitcher-only fee|Projected pitcher-only players/);
    assert.equal(
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Approve & publish fees")
        .disabled,
      true,
    );
    assert.match(host.textContent, /acceptance midpoint/);
    assert.match(host.textContent, /\$500\.00/);
    const save = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Save draft & expenses",
    );
    await act(async () => save.click());
    assert.equal(fixture.saved[0].action, "save");
    assert.equal(fixture.saved[0].budget.membershipMonthly, 20000);
    const poToggle = [...host.querySelectorAll("label")]
      .find((l) => l.textContent.includes("pitcher-only roster spots"))
      ?.querySelector("input");
    assert.ok(poToggle);
    await act(async () => poToggle.click());
    assert.match(host.textContent, /PO shared\/direct component/);
    assert.match(host.textContent, /PO team-cost allocation/);
    assert.match(host.textContent, /Allowed POs on this team/);
    assert.match(host.textContent, /4 POs for 15U–17U/);
    assert.doesNotMatch(
      host.textContent,
      /Pitcher-only shared-cost allocation|Other direct cost per pitcher-only/,
    );
    await act(async () => root.unmount());
    fixture.data = { admin: true, teams: [], business: null };
    root = createRoot(host);
    await act(async () => root.render(createElement(TeamFeeWorkspace)));
    assert.match(host.textContent, /Master budget defaults/);
    await act(async () => root.unmount());
    fixture.data = {
      admin: false,
      teams: [{ ...team, access: "coach", private: null }],
      business: null,
    };
    root = createRoot(host);
    await act(async () => root.render(createElement(TeamFeeWorkspace)));
    assert.match(host.textContent, /Allowed pitcher-only players/);
    assert.doesNotMatch(host.textContent, /Allowed POs on this team/);
    assert.match(host.textContent, /3 nights × \$200.00 = \$600.00/);
    assert.doesNotMatch(
      host.textContent,
      /Master budget defaults|private pricing assumptions|Projected distributable|Nolan ownership|Vendor cost/,
    );
    const select = [...host.querySelectorAll("select")].find((s) =>
      s.parentElement.textContent.includes("Uniform package"),
    );
    await act(async () => {
      select.value = "uniform";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    const submit = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Submit selections & calculate fee",
    );
    await act(async () => submit.click());
    assert.deepEqual(fixture.saved.at(-1), {
      teamId: "team",
      revision: 1,
      action: "propose",
      tournament: 0,
      uniformId: "uniform",
    });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.__feeFixture;
    await rm(out, { force: true });
  }
});
