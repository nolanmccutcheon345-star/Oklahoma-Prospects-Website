import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

test("parent guide resumes the correct player, distinguishes unresolved payment/autopay, and removes stale progress when access fails", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://fixture.invalid/account",
    pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { act, createElement } = await import("react"),
    { createRoot } = await import("react-dom/client");
  const titles = [
    "Verify your email and accept your invitation",
    "Confirm your player and team",
    "Complete required enrollment documents",
    "Review and accept your player's fee agreement",
    "Pay the initial deposit",
    "Set up monthly automatic payments",
    "Review your enrollment and payment status",
  ];
  const player = (id, status) => ({
    teamId: "team-" + id,
    playerId: id,
    name: "Synthetic " + id,
    team: "Team " + id,
    season: "2098",
    parentComplete: false,
    participation: "Prospects review is still required.",
    steps: titles.map((title, i) => ({
      title,
      status: i < 4 ? "Complete" : i === 4 ? status : "Autopay unavailable",
      detail: "Saved records determine completion.",
      href: `/enrollment?teamId=team-${id}&playerId=${id}#enrollment-payments`,
    })),
  });
  const fixture = {
    data: {
      owner: false,
      pendingInvitations: 1,
      players: [player("one", "Payment processing"), player("two", "Action needed")],
    },
    calls: 0,
    fail: false,
  };
  globalThis.__parentGuideUI = fixture;
  const out = resolve("artifacts/parent-enrollment-guide-ui.mjs");
  await mkdir("artifacts", { recursive: true });
  const result = await build({
    entryPoints: ["src/components/enrollment/guide.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "guide-fixture",
        setup(b) {
          b.onResolve({ filter: /^@\/lib\/enrollment\/guide-api$/ }, (a) => ({
            path: a.path,
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents: `export const getEnrollmentGuide=async()=>{const f=globalThis.__parentGuideUI;f.calls++;if(f.fail)throw Error('Guardian access revoked');return structuredClone(f.data)};`,
          }));
        },
      },
    ],
  });
  await writeFile(out, result.outputFiles[0].text);
  const { ParentEnrollmentGuide } = await import(pathToFileURL(out).href);
  const host = document.getElementById("root"),
    root = createRoot(host);
  const refresh = async () =>
    act(async () =>
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent === "Refresh progress")
        .click(),
    );
  try {
    await act(async () => root.render(createElement(ParentEnrollmentGuide)));
    assert.match(host.textContent, /Complete your player’s enrollment/);
    assert.match(host.textContent, /pending household invitation/);
    assert.match(host.textContent, /Payment processing/);
    assert.match(host.textContent, /Autopay unavailable/);
    assert.doesNotMatch(host.textContent, /Parent steps completed/);
    const links = [...host.querySelectorAll("a")].filter(
      (a) => a.textContent === "Continue enrollment",
    );
    assert.equal(links.length, 2);
    assert.match(links[0].href, /playerId=one/);
    assert.match(links[1].href, /playerId=two/);
    assert.equal(
      host.querySelector('a[href="/family"]').textContent,
      "Open payment history and receipts",
    );
    // Refresh changes nothing until the authoritative response changes.
    await refresh();
    assert.match(host.textContent, /Payment processing/);
    fixture.data.players[0].steps[4].status = "Complete";
    fixture.data.players[0].steps[5].status = "Autopay not authorized";
    await act(async () => window.dispatchEvent(new window.Event("enrollment-progress-updated")));
    assert.match(host.textContent, /Pay the initial deposit — Complete/);
    assert.match(host.textContent, /Autopay not authorized/);
    assert.doesNotMatch(host.textContent, /Parent steps completed/);
    await act(async () =>
      root.render(createElement(ParentEnrollmentGuide, { teamId: "team-two", playerId: "two" })),
    );
    assert.match(host.textContent, /Synthetic two/);
    assert.doesNotMatch(host.textContent, /Synthetic one/);
    fixture.fail = true;
    await refresh();
    assert.match(host.querySelector('[role="alert"]').textContent, /Guardian access revoked/);
    assert.doesNotMatch(host.textContent, /Synthetic two/);
    assert.ok(fixture.calls >= 4);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.__parentGuideUI;
    await rm(out, { force: true });
  }
});
