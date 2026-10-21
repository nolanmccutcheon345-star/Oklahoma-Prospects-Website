import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";
const mocks = {
  "@/lib/coordinator/api": `export const getCoordinatorDrafts=x=>globalThis.contentFixture.read(x);export const saveCoordinatorDraft=x=>globalThis.contentFixture.save(x);export const getCoordinatorDraftVersions=x=>globalThis.contentFixture.versions(x);export const getOwnerPublishedCoordinatorContent=()=>globalThis.contentFixture.publications();export const withdrawPublishedCoordinatorPost=x=>globalThis.contentFixture.withdraw(x);export const getPublicProgramContent=x=>globalThis.contentFixture.public(x);`,
};
test("content creation confirms review and never implies viewing or publication", async () => {
  const old = globalThis.FormData,
    calls = [];
  let confirm = false;
  globalThis.contentFixture = {
    read: async () => {
      throw Error("Read must not be called");
    },
    save: async (x) => {
      calls.push(x);
      return { ok: true };
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/content-drafts.tsx",
      "ContentDrafts",
      {
        sport: "softball",
        teamId: "soft",
        allowed: (p) => ["content.tryout.draft", "content.submit"].includes(p),
      },
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        dom.window.confirm = () => confirm;
        assert.match(host.textContent, /viewing is a separate permission/);
        assert.deepEqual(
          [...host.querySelectorAll('select[name="kind"] option')].map((x) => x.value),
          ["tryout"],
        );
        host.querySelector('[name="title"]').value = "Synthetic tryout notice";
        host.querySelector('[name="body"]').value = "General program information only";
        host.querySelector('[name="submit"]').checked = true;
        await act(async () => host.querySelector('button[type="submit"]').click());
        assert.equal(calls.length, 0);
        confirm = true;
        await act(async () => host.querySelector('button[type="submit"]').click());
        assert.equal(calls.length, 1);
        assert.equal(calls[0].data.contentKind, "tryout");
        assert.equal(calls[0].data.revision, 0);
        assert.equal(calls[0].data.submit, true);
        assert.equal(calls[0].data.teamId, "soft");
        assert.match(host.textContent, /submitted for owner review/);
      },
    );
  } finally {
    globalThis.FormData = old;
    delete globalThis.contentFixture;
  }
});
test("content read revocation clears drafts and recorded private versions", async () => {
  let revoked = false;
  globalThis.contentFixture = {
    read: async () => {
      if (revoked) throw Error("Permission revoked");
      return [
        {
          id: "draft",
          title: "Private title",
          body: "Private draft body",
          status: "draft",
          content_kind: "announcement",
          revision: 4,
        },
      ];
    },
    versions: async () => [
      {
        revision: 4,
        status: "draft",
        title: "Historical title",
        body: "Historical text",
        created_at: "2026-10-01",
      },
    ],
  };
  try {
    await withRendered(
      "src/components/coordinator/content-drafts.tsx",
      "ContentDrafts",
      { sport: "softball", teamId: "soft", allowed: (p) => p === "content.read" },
      mocks,
      async ({ host, act }) => {
        assert.equal(host.querySelector("form"), null);
        await act(async () =>
          [...host.querySelectorAll("button")]
            .find((x) => x.textContent === "View Recorded Versions")
            .click(),
        );
        assert.match(host.textContent, /Historical text/);
        revoked = true;
        await act(async () =>
          [...host.querySelectorAll("button")]
            .find((x) => x.textContent === "Refresh Content")
            .click(),
        );
        assert.doesNotMatch(host.textContent, /Private draft body|Historical text/);
        assert.match(host.querySelector('[role="alert"]').textContent, /revoked/);
      },
    );
  } finally {
    delete globalThis.contentFixture;
  }
});
test("owner withdraw confirms exact publication revision and preserves history", async () => {
  const calls = [];
  let visible = true,
    confirm = false;
  globalThis.contentFixture = {
    publications: async () => [
      {
        id: "post",
        title: "Published title",
        body: "General notice",
        sport: "softball",
        visible,
        revision: 7,
      },
    ],
    withdraw: async (x) => {
      calls.push(x);
      visible = false;
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/content-drafts.tsx",
      "PublishedContentManagement",
      {},
      mocks,
      async ({ host, act, dom }) => {
        dom.window.prompt = () => "Correcting general notice";
        dom.window.confirm = () => confirm;
        const button = () =>
          [...host.querySelectorAll("button")].find(
            (x) => x.textContent === "Withdraw Public Update",
          );
        await act(async () => button().click());
        assert.equal(calls.length, 0);
        confirm = true;
        await act(async () => button().click());
        assert.deepEqual(calls[0].data, {
          id: "post",
          revision: 7,
          confirm: true,
          reason: "Correcting general notice",
        });
        assert.match(host.textContent, /Withdrawn/);
        assert.equal(button(), undefined);
      },
    );
  } finally {
    delete globalThis.contentFixture;
  }
});
test("public program updates render approved content as text without HTML execution", async () => {
  globalThis.contentFixture = {
    public: async (x) => {
      assert.equal(x.data, "softball");
      return [
        { id: "post", title: "<img src=x onerror=alert(1)>", body: "<script>private()</script>" },
      ];
    },
  };
  try {
    await withRendered(
      "src/components/public-program-updates.tsx",
      "PublicProgramUpdates",
      { sport: "softball" },
      mocks,
      async ({ host }) => {
        assert.equal(host.querySelector("script,img"), null);
        assert.match(host.textContent, /<script>private\(\)<\/script>/);
      },
    );
  } finally {
    delete globalThis.contentFixture;
  }
});
