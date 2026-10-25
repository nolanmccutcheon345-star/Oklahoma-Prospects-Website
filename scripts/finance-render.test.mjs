import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { financeSummary } from "../src/lib/finance/model.ts";
import { today } from "../src/lib/finance/contracts.ts";
import { teamBudgetLedger } from "../src/lib/finance/team-budget.ts";
import { defaultBudget } from "../src/lib/teams/fee-model.ts";
test("Finance renders cash protections, bank forms, approvals, receivables and audit without making transfers", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://fixture.invalid/office?section=finance",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const settings = {
      profit: 0,
      reserve: 2400000,
      tax: 0,
      restricted: 0,
      nolanBps: 5000,
      reviewedThrough: "",
      reviewNote: "",
      cadence: "manual",
    },
    sources = {
      teams: [],
      warnings: [],
      refunds: [],
      payments: [
        {
          id: "fixture",
          status: "COMPLETED",
          environment: "production",
          category: "cage-rental",
          amount_cents: 5000,
          refunded_cents: 1000,
          processingFee: null,
          created_at: "2027-01-01",
        },
      ],
      receivables: [
        {
          id: "partial",
          customer: "Synthetic customer",
          category: "membership",
          amount: 7900,
          paid: null,
          remaining: null,
          needsReview: true,
          status: "BALANCE NEEDS REVIEW",
          due: "2027-01-01",
        },
      ],
      candidates: [],
      services: [],
      payees: [],
    };
  globalThis.financeFixture = {
    revision: 0,
    settings,
    sources,
    records: [],
    audit: [],
    teamSpending: [],
    fundraisingCredits: [],
    summary: financeSummary([], settings, sources, today()),
  };
  globalThis.financeCalls = [];
  const out = resolve("scripts/.finance-render.mjs");
  const built = await build({
    entryPoints: ["src/components/finance/finance-workspace.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "fixture",
        setup(b) {
          b.onResolve({ filter: /^\.\/financial-cutover$/ }, () => ({
            path: "cutover",
            namespace: "cutover",
          }));
          b.onLoad({ filter: /.*/, namespace: "cutover" }, () => ({
            contents: "export const FinancialCutover=()=>null;",
            loader: "js",
          }));
          b.onResolve({ filter: /^@\/lib\/finance\/api$/ }, () => ({
            path: "api",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export const getFinance=async()=>globalThis.financeFixture;export const changeFinance=async({data})=>{globalThis.financeCalls.push(data);return {ok:true}};export const syncFinanceSquare=async()=>({count:0});",
            loader: "js",
          }));
        },
      },
    ],
  });
  await writeFile(out, built.outputFiles[0].text);
  const { FinanceWorkspace } = await import(pathToFileURL(out).href),
    { act, createElement } = await import("react"),
    { createRoot } = await import("react-dom/client");
  const host = document.getElementById("root"),
    root = createRoot(host);
  try {
    await act(async () => root.render(createElement(FinanceWorkspace)));
    assert.match(host.textContent, /Available distributable cash/);
    assert.match(host.textContent, /Add the business account/);
    const button = (t) => [...host.querySelectorAll("button")].find((b) => b.textContent === t);
    await act(async () => button("Team spending").click());
    assert.match(host.textContent, /No financial team records/);
    const publishedBudget = {
      ...defaultBudget(),
      costs: [
        { id: "coach", name: "Head coach", cents: 100000 },
        { id: "gas", name: "Coach gas", cents: 10000 },
        { id: "equipment", name: "Team equipment", cents: 20000 },
      ],
      tournament: 50000,
      hotelNightly: 15000,
      hotelNights: 2,
    };
    globalThis.financeFixture.teamSpending.push({
      teamId: "base",
      name: "Synthetic baseball",
      committed: 9,
      roster: 9,
      ceiling: 250000,
      formationReady: true,
      published: true,
      closed: false,
      current: false,
      remaining: 0,
      review: null,
      usage: {},
      ledger: teamBudgetLedger(
        { publishedBudget, published: { at: "2026-10-25", revision: 1 }, expenses: [] },
        [],
        "base",
      ),
    });
    await act(async () => button("Fundraising credits").click());
    assert.match(host.textContent, /No completed linked contributions/);
    await act(async () => button("Team spending").click());
    for (const label of [
      "Published budget ledger",
      "Tournament entries",
      "Head coach",
      "Coach gas",
      "Team equipment",
      "Scheduled coach hotel stipends",
      "Bank reconciled paid",
      "Allocate contingency to a budget line",
    ])
      assert.ok(host.textContent.includes(label), label);
    assert.equal(host.querySelectorAll("table tbody tr").length, 8);
    assert.ok(
      [...host.querySelectorAll("button")].find(
        (b) => b.textContent === "Save today's funding review",
      ).disabled,
    );
    await act(async () => button("Business Banking").click());
    assert.match(host.textContent, /manual bank ledger, not a live bank connection/);
    assert.ok([...host.querySelectorAll("input")].filter((i) => i.name === "last4").length === 2);
    assert.equal(host.querySelector("input[name=accountNumber]"), null);
    await act(async () => button("Payout Center").click());
    assert.match(host.textContent, /Only a matching bank transaction marks it paid/);
    assert.match(host.textContent, /Generate this month/);
    await act(async () => button("Receivables").click());
    assert.match(host.textContent, /Abandoned checkout attempts are not debts/);
    assert.match(host.textContent, /write-off/);
    assert.match(host.textContent, /excluded from the known-balance totals/);
    assert.match(host.textContent, /Cash paid Needs verification/);
    await act(async () => button("Square & Refunds").click());
    assert.match(host.textContent, /Sync Square settlements/);
    assert.match(host.textContent, /Collections by source/);
    assert.match(host.textContent, /cage-rental/);
    assert.match(host.textContent, /Needs fee details/);
    await act(async () => button("Audit").click());
    assert.match(host.textContent, /append-only/);
    assert.equal(globalThis.financeCalls.length, 0);
  } finally {
    await act(async () => root.unmount());
    await rm(out, { force: true });
    dom.window.close();
    delete globalThis.financeFixture;
    delete globalThis.financeCalls;
  }
});
