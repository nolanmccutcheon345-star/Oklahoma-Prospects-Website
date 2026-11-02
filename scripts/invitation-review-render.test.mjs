import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

test("invitation screen presents the exact email and sends only on the final reviewed action", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/office" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const fixture = (globalThis.__invitationReview = { calls: [], blockers: [], fail: false });
  const mock = `export const reviewInvitationEmail=async({data})=>{globalThis.__invitationReview.calls.push({action:'review',...data});return {review:{id:data.id,digest:'a'.repeat(64),recipients:['synthetic@example.invalid'],subject:'Account invitation',text:'Sign in at https://prospectssports.club/invitations',approvalStatus:'held'},blockers:globalThis.__invitationReview.blockers};};export const sendReviewedInvitation=async({data})=>{globalThis.__invitationReview.calls.push({action:'send',...data});if(globalThis.__invitationReview.fail)throw Error('Invitation changed. Review it again before sending.');return {status:'accepted',message:'Email provider accepted the invitation. Check delivery to confirm recipient-server delivery.'};};export const checkInvitationDelivery=async()=>({status:'accepted',delivery:'delivered',invitation:'pending'});`;
  const output = resolve("artifacts/invitation-review-render.mjs");
  await mkdir("artifacts", { recursive: true });
  const result = await build({
    entryPoints: ["src/components/invitation-delivery.tsx"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "fixture",
        setup(b) {
          b.onResolve({ filter: /invitation-delivery-api$/ }, () => ({
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
  const { InvitationDelivery } = await import(pathToFileURL(output).href);
  const host = document.getElementById("root"),
    root = createRoot(host);
  const button = (name) => [...host.querySelectorAll("button")].find((b) => b.textContent === name);
  try {
    await act(async () =>
      root.render(createElement(InvitationDelivery, { id: "one", autoReview: true })),
    );
    assert.deepEqual(fixture.calls, [{ action: "review", id: "one" }]);
    assert.match(host.textContent, /synthetic@example.invalid/);
    assert.match(host.textContent, /https:\/\/prospectssports.club\/invitations/);
    await act(async () => button("Send invitation").click());
    assert.deepEqual(fixture.calls[1], {
      action: "send",
      id: "one",
      digest: "a".repeat(64),
      confirmed: true,
    });
    assert.match(host.textContent, /provider accepted.*Check delivery/);
    assert.equal(button("Send invitation"), undefined);
    await act(async () => button("Check email delivery").click());
    assert.match(host.textContent, /delivery: delivered.*invitation: pending/);
    fixture.fail = true;
    await act(async () => button("Review invitation email").click());
    await act(async () => button("Send invitation").click());
    assert.match(host.querySelector('[role="alert"]').textContent, /changed/);
    assert.equal(button("Send invitation"), undefined);
    fixture.blockers = ["Invitation email delivery is paused."];
    await act(async () => button("Review invitation email").click());
    assert.equal(button("Send invitation").disabled, true);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.__invitationReview;
    await rm(output, { force: true });
  }
});
