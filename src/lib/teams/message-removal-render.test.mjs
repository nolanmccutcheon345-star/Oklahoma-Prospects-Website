import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";
const mocks = {
  "@/lib/teams/message-removal-api": `export const removeChatMessage=x=>globalThis.removalUI(x);`,
};
const message = {
  id: "00000000-0000-4000-8000-000000000001",
  author: "Synthetic coach",
  body: "First words of the exact synthetic message",
  at: "extra projection must not reach strict API",
};
test("removal control is absent for non-owners", async () => {
  await withRendered(
    "src/components/teams/remove-message-button.tsx",
    "RemoveMessageButton",
    { owner: false, teamId: "base", message, onRemoved: () => {} },
    mocks,
    async ({ host }) => assert.equal(host.querySelector("button"), null),
  );
});
test("removal requires reason and exact author/excerpt confirmation, supports cancel, failure and retry", async () => {
  const calls = [];
  let loaded = 0,
    fail = true;
  globalThis.removalUI = async (x) => {
    calls.push(x);
    if (fail) throw Error("Owner access revoked");
    return { ok: true };
  };
  try {
    await withRendered(
      "src/components/teams/remove-message-button.tsx",
      "RemoveMessageButton",
      {
        owner: true,
        teamId: "base",
        message,
        onRemoved: () => {
          loaded++;
        },
      },
      mocks,
      async ({ host, act, dom }) => {
        const click = () => act(async () => host.querySelector("button").click());
        dom.window.prompt = () => null;
        await click();
        assert.equal(calls.length, 0);
        dom.window.prompt = () => "short";
        await click();
        assert.match(host.textContent, /between 10 and 1000/);
        assert.equal(calls.length, 0);
        dom.window.prompt = () => "Synthetic removal reason";
        dom.window.confirm = (text) => {
          assert.match(text, /Synthetic coach/);
          assert.match(text, /First words/);
          return false;
        };
        await click();
        assert.equal(calls.length, 0);
        dom.window.confirm = () => true;
        await click();
        assert.match(host.textContent, /Owner access revoked/);
        assert.equal(loaded, 0);
        assert.equal(host.querySelector("button").disabled, false);
        fail = false;
        await click();
        assert.equal(loaded, 1);
        assert.deepEqual(calls[1].data, {
          channel: "team",
          teamId: "base",
          id: message.id,
          author: message.author,
          body: message.body,
          reason: "Synthetic removal reason",
          confirm: true,
        });
      },
    );
  } finally {
    delete globalThis.removalUI;
  }
});

test("withheld Communication Review messages expose owner removal and disappear after refresh", async () => {
  let removed = false;
  const calls = [];
  globalThis.removalUI = async (input) => {
    calls.push(input);
    removed = true;
    return { ok: true };
  };
  globalThis.reviewRemovalUI = async () => ({
    canRemoveMessages: true,
    items: removed ? [] : [{ ...message, operational: false, sourceDigest: "a".repeat(64) }],
    nextCursor: null,
  });
  try {
    await withRendered(
      "src/components/coordinator/communications.tsx",
      "TeamMessageReview",
      { teams: [{ id: "base", name: "Synthetic team" }] },
      {
        ...mocks,
        "@/lib/coordinator/api": `export const getReviewableTeamMessages=()=>globalThis.reviewRemovalUI();export const reviewCoordinatorTeamMessage=async()=>({ok:true});export const previewCoordinatorNotice=()=>{};export const queueCoordinatorNotice=()=>{};export const getCoordinatorNoticeHistory=()=>{};export const getCoordinatorNoticeTargets=()=>{};export const cancelCoordinatorNotice=()=>{};export const getOwnerCommunicationArchive=()=>{};`,
      },
      async ({ host, act, dom, change }) => {
        await change(host.querySelector("select"), "base");
        assert.match(host.textContent, /Withheld pending review/);
        dom.window.prompt = () => "Synthetic duplicate removal";
        dom.window.confirm = () => true;
        await act(async () =>
          [...host.querySelectorAll("button")]
            .find((b) => b.textContent === "Remove message")
            .click(),
        );
        assert.equal(calls.length, 1);
        assert.equal(calls[0].data.id, message.id);
        assert.doesNotMatch(host.textContent, /First words|Withheld pending review/);
        assert.match(host.textContent, /No messages found/);
      },
    );
  } finally {
    delete globalThis.removalUI;
    delete globalThis.reviewRemovalUI;
  }
});
