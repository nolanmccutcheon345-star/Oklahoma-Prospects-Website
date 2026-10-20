import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";
const mocks = {
  "@/lib/coordinator/api": `export const getCoordinatorTeamOperations=(x)=>globalThis.teamOpsFixture.read(x);export const saveCoordinatorTeamOperations=(x)=>globalThis.teamOpsFixture.save(x);`,
};
test("team operations renders only allowed fields and submits exact reviewed revisions, clearing stale data after denial", async () => {
  const previousFormData = globalThis.FormData;
  let revision = 1;
  const calls = [];
  globalThis.teamOpsFixture = {
    read: async () => ({ revision, openings: 2 }),
    save: async (x) => {
      calls.push(x);
      revision++;
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/team-operations.tsx",
      "TeamOperations",
      { teamId: "synthetic-soft", allowed: (p) => p === "teams.openings" },
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        assert.ok(host.querySelector('[name="openings"]'));
        assert.equal(host.querySelector('[name="needs"]'), null);
        await act(async () => {
          host.querySelector('form button[type="submit"]').click();
        });
        assert.deepEqual(calls, [
          { data: { teamId: "synthetic-soft", revision: 1, field: "openings", value: 2 } },
        ]);
        assert.match(host.textContent, /Roster openings saved/);
        globalThis.teamOpsFixture.read = async () => {
          throw Error("Permission revoked");
        };
        await act(async () => host.querySelector("button").click());
        assert.match(host.querySelector('[role="alert"]').textContent, /Permission revoked/);
        assert.equal(host.querySelector("form"), null);
      },
    );
  } finally {
    delete globalThis.teamOpsFixture;
    globalThis.FormData = previousFormData;
  }
});
