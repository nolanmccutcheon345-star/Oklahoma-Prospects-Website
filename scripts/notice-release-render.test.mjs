import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

test("owner notice controls require exact selection and separate approval before scoped sending", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/office" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const row = {
    queue: "fee",
    id: "fixture-one",
    digest: "a".repeat(64),
    status: "queued",
    approvalStatus: "held",
    recipients: ["synthetic@example.invalid"],
    subject: "Synthetic current dues notice",
    text: "Synthetic dues, version 13. No real recipients.",
    teamIds: ["synthetic"],
    revision: 13,
    createdAt: "2026-10-29T20:40:00Z",
    channel: "email",
    attempts: 0,
    providerStatus: "not confirmed",
  };
  globalThis.__noticeFixture = {
    rows: [row],
    counts: [
      { queue: "fee", total: 1, held: 1, approved: 0, sent: 0, invalid: 0 },
      { queue: "center", total: 287, held: 287, approved: 0, sent: 0, invalid: 0 },
    ],
    readiness: { enabled: true, blockers: [], schedulerEnabled: false },
    calls: [],
    nextCursor: null,
  };
  const mock = `export const getNoticeReleaseAudit=async()=>structuredClone(globalThis.__noticeFixture);export const approveNoticeRelease=async({data})=>{globalThis.__noticeFixture.calls.push({action:'approve',...data});globalThis.__noticeFixture.rows[0].approvalStatus='approved';};export const holdNoticeRelease=async()=>{throw Error('Unexpected hold');};export const dispatchNoticeRelease=async({data})=>{globalThis.__noticeFixture.calls.push({action:'dispatch',...data});globalThis.__noticeFixture.rows[0].approvalStatus='sent';return {results:[{queue:'fee',id:'fixture-one',status:'accepted',message:'Provider accepted; inbox delivery unconfirmed'}]};};`;
  await mkdir("artifacts", { recursive: true });
  const output = resolve("artifacts/notice-release-render.mjs");
  const result = await build({
    entryPoints: ["src/components/notifications/release-controls.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "notice-fixture",
        setup(b) {
          b.onResolve({ filter: /release-control-api$/ }, () => ({
            path: "mock",
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
  await writeFile(output, result.outputFiles[0].text);
  const { NoticeReleaseControls } = await import(pathToFileURL(output).href);
  const host = document.getElementById("root"),
    root = createRoot(host);
  const button = (text) =>
    [...host.querySelectorAll("button")].find((b) => b.textContent.startsWith(text));
  try {
    await act(async () => root.render(createElement(NoticeReleaseControls)));
    assert.equal(globalThis.__noticeFixture.calls.length, 0);
    await act(async () => button("Load / refresh").click());
    assert.match(host.textContent, /center: 287 total · 287 held/);
    assert.match(host.textContent, /synthetic@example.invalid/);
    assert.match(host.textContent, /version 13/);
    assert.equal(button("Approve selected").disabled, true);
    assert.equal(button("Send only").disabled, true);
    await act(async () => host.querySelector('article input[type="checkbox"]').click());
    assert.equal(button("Approve selected").disabled, true);
    await act(async () => [...host.querySelectorAll('input[type="checkbox"]')].at(-1).click());
    assert.equal(button("Approve selected").disabled, false);
    assert.equal(button("Send only").disabled, true);
    await act(async () => button("Approve selected").click());
    assert.equal(globalThis.__noticeFixture.calls.length, 1);
    assert.deepEqual(globalThis.__noticeFixture.calls[0].items, [
      { queue: "fee", id: "fixture-one", digest: "a".repeat(64) },
    ]);
    assert.equal(button("Send only").disabled, true);
    await act(async () => host.querySelector('article input[type="checkbox"]').click());
    await act(async () => [...host.querySelectorAll('input[type="checkbox"]')].at(-1).click());
    await act(async () => button("Send only").click());
    assert.equal(globalThis.__noticeFixture.calls.length, 2);
    assert.equal(globalThis.__noticeFixture.calls[1].action, "dispatch");
    assert.match(host.textContent, /Provider accepted; inbox delivery unconfirmed/);
    assert.equal(button("Send only").disabled, true);
    assert.equal(host.querySelector('article input[type="checkbox"]').disabled, true);
  } finally {
    await act(async () => root.unmount());
    await rm(output, { force: true });
    dom.window.close();
    delete globalThis.__noticeFixture;
  }
});
