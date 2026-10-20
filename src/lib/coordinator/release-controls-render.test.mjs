import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";
const names = [
  "getPlayerPublicationCandidates",
  "getPlayerPublicationPreview",
  "submitPlayerPublication",
  "getOwnerPlayerPublications",
  "withdrawOwnerPlayerPublication",
  "getCoordinatorRecoveryHistory",
  "getCoordinatorRecoveryPreview",
  "applyCoordinatorRecovery",
  "getCoordinatorPrivacy",
  "getCoordinatorArchiveStatus",
  "saveCoordinatorPrivacyPolicy",
  "saveCoordinatorPrivacyReview",
];
const mocks = {
  "@/lib/coordinator/api": names
    .map((n) => `export const ${n}=x=>globalThis.releaseUI['${n}'](x);`)
    .join("\n"),
};
test("player publication confirms the exact consented preview and hides it after revoked authorization", async () => {
  const previous = globalThis.FormData;
  let approved = false,
    calls = [];
  globalThis.releaseUI = {
    getPlayerPublicationCandidates: async () => [
      { playerId: "player", name: "Synthetic consented athlete" },
    ],
    getPlayerPublicationPreview: async () => ({
      playerId: "player",
      sourceDigest: "c".repeat(64),
      display: { name: "Synthetic consented athlete", number: "11", photo: "" },
    }),
    submitPlayerPublication: async (x) => {
      calls.push(x);
      throw Error("Access revoked");
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/player-publication.tsx",
      "PlayerPublicationRequest",
      { teamId: "soft", kind: "roster" },
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        dom.window.confirm = () => approved;
        host.querySelector("select").value = "player";
        await act(async () => host.querySelector('button[type="submit"]').click());
        assert.match(host.textContent, /Synthetic consented athlete/);
        host.querySelector('[name="reason"]').value = "Owner must review this identity";
        host.querySelector('input[type="checkbox"]').checked = true;
        const submit = () => [...host.querySelectorAll('button[type="submit"]')].at(-1);
        await act(async () => submit().click());
        assert.equal(calls.length, 0);
        approved = true;
        await act(async () => submit().click());
        assert.equal(calls[0].data.sourceDigest, "c".repeat(64));
        assert.equal(calls[0].data.confirm, true);
        assert.doesNotMatch(host.textContent, /Synthetic consented athlete/);
        assert.match(host.textContent, /Access revoked/);
      },
    );
  } finally {
    globalThis.FormData = previous;
    delete globalThis.releaseUI;
  }
});
test("owner recovery uses the current preview and refreshes after confirmed completion", async () => {
  const previous = globalThis.FormData;
  let done = false,
    calls = [];
  globalThis.releaseUI = {
    getCoordinatorRecoveryHistory: async () => ({
      items: done
        ? []
        : [
            {
              id: 9,
              action: "rosters.number",
              teamId: "soft",
              targetId: "player",
              createdAt: "2026-10-20",
            },
          ],
      nextId: null,
    }),
    getCoordinatorRecoveryPreview: async () => ({
      auditId: 9,
      revision: 4,
      sourceDigest: "d".repeat(64),
      current: "88",
      restore: "11",
    }),
    applyCoordinatorRecovery: async (x) => {
      calls.push(x);
      done = true;
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/recovery.tsx",
      "CoordinatorRecovery",
      {},
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        dom.window.confirm = () => true;
        await act(async () =>
          [...host.querySelectorAll("button")]
            .find((b) => b.textContent === "Preview Recovery 9")
            .click(),
        );
        host.querySelector('[name="reason"]').value = "Restore accidental roster change";
        await act(async () => host.querySelector('button[type="submit"]').click());
        assert.deepEqual(calls[0].data, {
          auditId: 9,
          revision: 4,
          sourceDigest: "d".repeat(64),
          reason: "Restore accidental roster change",
          confirm: true,
        });
        assert.match(host.textContent, /Recovery completed and recorded/);
        assert.match(host.textContent, /No recoverable changes/);
      },
    );
  } finally {
    globalThis.FormData = previous;
    delete globalThis.releaseUI;
  }
});
test("privacy controls do not invent a retention period or claim a configured archive is verified", async () => {
  const previous = globalThis.FormData,
    calls = [];
  let policies = [];
  globalThis.releaseUI = {
    getCoordinatorPrivacy: async () => ({ policies, reviews: [], candidates: [] }),
    getCoordinatorArchiveStatus: async () => ({
      configured: true,
      pending: 1,
      lastVerifiedAt: null,
      lastRetainUntil: null,
    }),
    saveCoordinatorPrivacyPolicy: async (x) => {
      calls.push(x);
      policies = [{ ...x.data, revision: 1 }];
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/privacy.tsx",
      "CoordinatorPrivacy",
      {},
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        dom.window.confirm = () => true;
        assert.equal(host.querySelector('[name="days"]').value, "");
        assert.match(host.textContent, /No independently protected copy has been verified/);
        host.querySelector('[name="days"]').value = "30";
        host.querySelector('[name="purpose"]').value = "Synthetic operational retention purpose";
        host.querySelector('[name="basis"]').value = "Synthetic reviewed purpose and obligations";
        await act(async () => host.querySelector('button[type="submit"]').click());
        assert.equal(calls[0].data.revision, 0);
        assert.equal(calls[0].data.retentionDays, 30);
        assert.equal(calls[0].data.confirm, true);
        assert.match(host.textContent, /No account access or customer records changed/);
      },
    );
  } finally {
    globalThis.FormData = previous;
    delete globalThis.releaseUI;
  }
});
