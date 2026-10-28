import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { releasedMaster } from "../src/lib/teams/pricing-defaults.ts";
import { seedMasterMatrix } from "../src/lib/teams/budget-matrix.ts";
import { defaultBudget, project } from "../src/lib/teams/fee-model.ts";
const release = JSON.parse(
  (await readFile("migrations/0099_team_pricing_defaults.sql", "utf8")).match(
    /VALUES \(1,'(.*?)'::jsonb/s,
  )[1],
);
for (const inherited of [false, true])
  for (const basisVersion of [undefined, 7]) {
    test(`team fee UI saves admin drafts and offers only permitted coach controls ${inherited ? "inherited" : "legacy pricing"} (${basisVersion === undefined ? "legacy" : "basis"})`, async () => {
      const version = basisVersion === undefined ? {} : { basisVersion };
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
      const budget = {
        ...defaultBudget(),
        ...(inherited ? { ...release, pricingInheritance: { version: 1, overrides: [] } } : {}),
        start: "2027-04-01",
        end: "2027-06-15",
        months: 2.5,
      };
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
        ...version,
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
        ...version,
        value: inherited ? releasedMaster(seedMasterMatrix(), release) : seedMasterMatrix(),
        revision: 1,
        people: [{ userId: "parent", name: "Example Parent", role: "parent" }],
      };
      const mocks = {
        "@/lib/teams/fee-notifications-api": `export const getFeeNotifications=async()=>({enabled:false,rows:[],preview:[]});export const refreshFeeDelivery=async()=>{throw Error("Unexpected delivery check")};export const sendFeeCatchup=async()=>{throw Error("Unexpected catch-up email")};`,
        "@/lib/teams/independent-api": `export const getIndependentWorkspace=async()=>({spaces:[],availableTeams:[],admin:false});export const changeIndependentTeam=async()=>{throw Error("Unexpected independent mutation")};export const downloadIndependentDocument=async()=>{throw Error("Unexpected receipt access")};export const exportIndependentStatement=async()=>{throw Error("Unexpected financial export")};export const findIndependentManager=async()=>{throw Error("Unexpected manager lookup")};`,
        "@/lib/teams/invitation-api": `export const getTeamInvitations=async()=>({name:"Synthetic team",published:false,players:[]});export const createTeamInvitation=async()=>{throw Error("Unexpected invitation")};`,
        "@/lib/invitation-delivery-api": `export const sendInvitationEmail=async()=>{throw Error("Unexpected send")};export const checkInvitationDelivery=async()=>{throw Error("Unexpected delivery check")};`,
        "@/lib/teams/collection-operations-api": `export const getCollectionOperations=async()=>({rows:[],enabled:false,sandboxConfigured:false,sandboxVerified:false});export const pauseCollectionAuthorization=async()=>{throw Error("Unexpected collection pause")};`,
        "@/lib/teams/offline-payment-api": `export const getOfflineTeamPayments=async()=>({payments:[]});export const reviewOfflineTeamPayment=async()=>{throw Error("Unexpected offline review")};`,
        "@/lib/teams/collection-api": `export const getTeamCollection=async()=>{throw Error("Unexpected collection setup")};export const saveTeamCollectionCard=async()=>{throw Error("Unexpected card save")};export const changeTeamCollection=async()=>{throw Error("Unexpected collection authorization")};`,
        "@/lib/finance/identity-admission-api": `export const getFinancialIdentityAdmissionOptions=async()=>({mode:globalThis.__matrixFixture.basisVersion?'basis':'legacy',basisVersion:globalThis.__matrixFixture.basisVersion||null,accounts:[],instructors:[]});export const previewFinancialIdentityAdmission=async()=>{throw Error("Unexpected identity preview")};export const admitFinancialIdentity=async()=>{throw Error("Unexpected identity admission")};`,
        "@/lib/teams/payment-api": `export const startTeamCheckout=async()=>{throw Error("Unexpected checkout")};`,
        "@/lib/commerce/api": `export const submitSquarePayment=async()=>{throw Error("Unexpected payment")};`,
        "@/lib/auth/use-current-user": `export const useCurrentUserState=()=>({user:{id:"fixture"}});`,
        "@/lib/teams/fee-api": `export const downloadFeeAgreement=async()=>{throw Error("Unexpected agreement download")};export const getBudgetMaster=async()=>globalThis.__matrixFixture;export const saveBudgetMaster=async({data})=>{globalThis.__matrixSaved=data;return {saved:true};};export const getTeamUniform=async()=>null;export const getTeamFundingStatus=async()=>({overduePlayers:2,tracking:true,hasOverduePayments:true,overdueRoster:[{playerId:"synthetic-one",playerName:"Synthetic Athlete One",guardianNames:["Synthetic Guardian One"],status:"Overdue"},{playerId:"synthetic-two",playerName:"Synthetic Athlete Two",guardianNames:[],status:"Overdue"}]});export const getFeeWorkspace=async()=>globalThis.__feeFixture.data;export const changeFeePlan=async({data})=>{globalThis.__feeFixture.saved.push(data);return {ok:true};};export const saveFeeBusiness=async()=>({ok:true});`,
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
        assert.match(host.textContent, /Private staff payment follow-up/);
        assert.match(host.textContent, /Synthetic Guardian One/);
        assert.match(host.textContent, /Nightly hotel stipend/);
        assert.match(host.textContent, /Fee Composition/);
        assert.match(host.textContent, /Personal memberships are purchased separately/);
        assert.doesNotMatch(
          host.textContent,
          /Individual Facility Access Upgrade|standalone individual access/i,
        );
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
        assert.match(
          host.textContent,
          /Team & Development Program Fee per pitcher-only player per month/,
        );
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
        assert.match(host.textContent, /Pricing overrides for softball · 14U · Spring/);
        const override = [...host.querySelectorAll("label")]
          .find((l) =>
            l.textContent.startsWith(
              "Row Team & Development Program Fee per full player per month",
            ),
          )
          .querySelector("input");
        assert.equal(override.value, "");
        assert.equal(override.placeholder, inherited ? "80" : "150");
        await act(async () => {
          Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(
            override,
            "175",
          );
          override.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
          override.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        });

        await act(async () =>
          [...host.querySelectorAll("button")]
            .find((b) => b.textContent === "Save master defaults")
            .click(),
        );
        assert.equal(globalThis.__matrixSaved.value.rows.length, 120);
        assert.equal(
          globalThis.__matrixSaved.value.rows.find(
            (r) => r.sport === "softball" && r.age === 14 && r.season === "springSummer",
          ).membershipMonthly,
          17500,
        );
        assert.equal(
          globalThis.__matrixSaved.value.rows.find(
            (r) => r.sport === "baseball" && r.age === 14 && r.season === "springSummer",
          ).membershipMonthly,
          undefined,
        );
        assert.equal(globalThis.__matrixSaved.value.overheadRule.monthly, 50000);
        assert.equal(globalThis.__matrixSaved.value.payroll[0].userId, "parent");
        assert.equal(
          Object.hasOwn(globalThis.__matrixSaved, "basisVersion"),
          basisVersion !== undefined,
        );
        assert.equal(globalThis.__matrixSaved.basisVersion, basisVersion);
        assert.match(host.textContent, /Master saved/);
        assert.match(host.textContent, /Season & private pricing assumptions/);
        assert.match(host.textContent, /FEE HEALTH · INCOMPLETE/);
        assert.doesNotMatch(host.textContent, /Pitcher-only fee|Projected pitcher-only players/);
        assert.equal(
          [...host.querySelectorAll("button")].find(
            (b) => b.textContent === "Review & publish fees",
          ).disabled,
          false,
        );
        dom.window.HTMLElement.prototype.scrollIntoView = () => {};
        await act(async () =>
          [...host.querySelectorAll("button")]
            .find((b) => b.textContent === "Review & publish fees")
            .click(),
        );
        assert.match(host.textContent, /Review & publish this team's fees/);
        assert.match(host.textContent, /Automatic collection is currently paused/);
        assert.match(host.textContent, /Required: Complete the payment/);
        assert.equal(
          host.querySelector('[aria-label="Fee publication review"]'),
          document.activeElement,
        );
        if (inherited) {
          assert.match(host.textContent, /Inherited from master/);
          assert.match(host.textContent, /Incomplete — set season dates and first event/);
          assert.match(host.textContent, /\$240\.00/);
          const deposit = [...host.querySelectorAll("label")]
            .filter((l) => l.textContent.startsWith("Deposit (%)"))
            .map((l) => l.querySelector("input"));
          assert.equal(deposit.length, 2);
          assert.ok(deposit.every((i) => i.value === "70"));
          // Explicitly override a team payment percentage, then reset all payment settings.
          await act(async () => {
            Object.getOwnPropertyDescriptor(
              dom.window.HTMLInputElement.prototype,
              "value",
            ).set.call(deposit[1], "60");
            deposit[1].dispatchEvent(new dom.window.Event("input", { bubbles: true }));
            deposit[1].dispatchEvent(new dom.window.Event("change", { bubbles: true }));
          });
          assert.match(host.textContent, /Payment percentages and deadlines: Team override/);
          const reset = [...host.querySelectorAll("button")].find(
            (b) =>
              b.textContent === "Reset to master default" &&
              b.parentElement.textContent.includes("Payment percentages and deadlines"),
          );
          await act(async () => reset.click());
          assert.match(
            host.textContent,
            /Payment percentages and deadlines: Inherited from master/,
          );
        } else {
          assert.match(host.textContent, /acceptance midpoint/);
          assert.match(host.textContent, /\$450\.00/);
        }
        assert.match(host.textContent, /Actual Billable Months/);
        assert.doesNotMatch(
          host.textContent,
          /Optional Individual Facility Access Upgrade|Standard standalone individual access/,
        );
        for (const [toggle, label, dollars] of [
          [
            "Use admin tournament-fee estimate",
            "Estimated tournament fees — team season total",
            "7750",
          ],
          ["Use admin uniform fee per player", "Estimated uniform fee per player", "250"],
        ]) {
          const checkbox = [...host.querySelectorAll("label")]
            .find((l) => l.textContent.trim() === toggle)
            .querySelector("input");
          await act(async () => checkbox.click());
          const input = [...host.querySelectorAll("label")]
            .find((l) => l.textContent.startsWith(label))
            .querySelector("input");
          await act(async () => {
            Object.getOwnPropertyDescriptor(
              dom.window.HTMLInputElement.prototype,
              "value",
            ).set.call(input, dollars);
            input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
            input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
          });
        }
        assert.match(host.textContent, /Live unsaved draft/);
        assert.match(host.textContent, /Where the team-cost amount comes from/);
        assert.match(host.textContent, /Tournament source: admin estimate/);
        assert.match(host.textContent, /\$7,750\.00/);
        assert.match(host.textContent, /\$250\.00/);
        const save = [...host.querySelectorAll("button")].find(
          (b) => b.textContent === "Save estimates & draft",
        );
        await act(async () => save.click());
        assert.equal(fixture.saved[0].action, "save");
        assert.equal(fixture.saved[0].budget.membershipMonthly, inherited ? 8000 : 15000);
        assert.equal(fixture.saved[0].budget.tournamentEstimate, 775000);
        assert.equal(fixture.saved[0].budget.uniformEstimate, 25000);
        assert.equal(Object.hasOwn(fixture.saved[0], "basisVersion"), basisVersion !== undefined);
        assert.equal(fixture.saved[0].basisVersion, basisVersion);
        dom.window.confirm = () => true;
        await act(async () =>
          [...host.querySelectorAll("button")]
            .find((b) => b.textContent === "Save & publish approved fees")
            .click(),
        );
        assert.equal(fixture.saved.at(-1).action, "publish");
        assert.equal(fixture.saved.at(-1).draft.budget.tournamentEstimate, 775000);
        assert.equal(fixture.saved.at(-1).basisVersion, basisVersion);
        if (!inherited) {
          const review = host.querySelector('[aria-label="Player obligations to publish"]');
          assert.ok(review);
          const offer = JSON.parse(fixture.saved.at(-1).reviewedOffer);
          assert.ok(review.textContent.includes(offer.policy));
          assert.ok(offer.schedules.full.length > 0);
        }
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
          ...version,
          teamId: "team",
          revision: 1,
          action: "propose",
          tournament: 0,
          uniformId: "uniform",
        });
        if (basisVersion !== undefined) {
          fixture.data = {
            ...fixture.data,
            teams: [{ ...fixture.data.teams[0], basisVersion: basisVersion + 1 }],
          };
          await act(async () => window.dispatchEvent(new CustomEvent("team-budget-updated")));
          const refreshedSelect = [...host.querySelectorAll("select")].find((s) =>
            s.parentElement.textContent.includes("Uniform package"),
          );
          assert.equal(
            refreshedSelect.value,
            "",
            "A new financial version resets the stale draft.",
          );
          await act(async () => {
            refreshedSelect.value = "uniform";
            refreshedSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
          });
          await act(async () =>
            [...host.querySelectorAll("button")]
              .find((b) => b.textContent === "Submit selections & calculate fee")
              .click(),
          );
          assert.deepEqual(fixture.saved.at(-1), {
            teamId: "team",
            revision: 1,
            basisVersion: basisVersion + 1,
            action: "propose",
            tournament: 0,
            uniformId: "uniform",
          });
          assert.doesNotMatch(
            host.textContent,
            /Master budget defaults|private pricing assumptions|Projected distributable|Nolan ownership|Vendor cost/,
          );
        }
        await act(async () => root.unmount());
        fixture.data = {
          admin: false,
          teams: [{ ...team, access: "family", private: null, choices: null, players: [] }],
          business: null,
        };
        root = createRoot(host);
        await act(async () =>
          root.render(createElement(TeamFeeWorkspace, { teamId: "other-team" })),
        );
        assert.match(host.textContent, /No assigned teams are available/);
        assert.doesNotMatch(host.textContent, /Example team|\$[0-9]/);
        await act(async () => root.unmount());
        root = createRoot(host);
        await act(async () => root.render(createElement(TeamFeeWorkspace, { teamId: "team" })));
        assert.match(host.textContent, /Player fees are awaiting Front Office publication/);
        assert.doesNotMatch(
          host.textContent,
          /\$[0-9]|Total fee|Admin tournament & uniform estimates/,
        );
      } finally {
        await act(async () => root.unmount());
        dom.window.close();
        delete globalThis.__feeFixture;
        delete globalThis.__matrixFixture;
        delete globalThis.__matrixSaved;
        await rm(out, { force: true });
      }
    });
  }
