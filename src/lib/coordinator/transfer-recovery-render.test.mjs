import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withRendered } from "../../../scripts/render-component-support.mjs";
test("owner transfer recovery requires confirmation of the current preview and refreshes approval status", async () => {
  const names = [
    ...(await readFile("src/lib/coordinator/api.ts", "utf8")).matchAll(/export const (\w+)/g),
  ].map((m) => m[1]);
  const mocks = {
    "@/lib/coordinator/api": names
      .map((n) => `export const ${n}=args=>globalThis.recoveryUi['${n}'](args);`)
      .join("\n"),
  };
  const row = {
    id: "approval",
    name: "Synthetic staff",
    sport: "softball",
    kind: "transfer",
    target_id: "athlete",
    proposal: {},
    reason: "Review team fit",
    status: "approved",
    revision: 2,
    created_at: "2030-01-01T00:00:00Z",
  };
  const calls = [];
  globalThis.recoveryUi = {
    getStaffRoles: async () => ({
      accounts: [],
      assignments: [],
      teams: [],
      leadership: [],
      retiredAccess: [],
    }),
    getCoordinatorApprovals: async () => structuredClone([row]),
    getCoordinatorTransferRecovery: async () => ({
      approvalRevision: 2,
      rosterRevision: 7,
      playerId: "athlete",
      fromTeamId: "teamB",
      toTeamId: "teamA",
    }),
    recoverCoordinatorTransfer: async ({ data }) => {
      calls.push(data);
      row.proposal.recovered = true;
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/staff-management.tsx",
      "StaffRoleManagement",
      {},
      mocks,
      async ({ host, act, dom }) => {
        const click = async (text) =>
          act(async () =>
            [...host.querySelectorAll("button")].find((b) => b.textContent === text).click(),
          );
        await click("Approval Queue");
        dom.window.prompt = () => "Restore after owner review";
        dom.window.confirm = () => false;
        await click("Recover transfer to original team");
        assert.equal(calls.length, 0);
        dom.window.confirm = (text) => {
          assert.match(text, /athlete from teamB to teamA/);
          return true;
        };
        await click("Recover transfer to original team");
        assert.deepEqual(calls, [
          {
            approvalId: "approval",
            approvalRevision: 2,
            rosterRevision: 7,
            reason: "Restore after owner review",
            confirm: true,
          },
        ]);
        assert.match(host.textContent, /Transfer recovered to its original team/);
        assert.equal(
          [...host.querySelectorAll("button")].some(
            (b) => b.textContent === "Recover transfer to original team",
          ),
          false,
        );
      },
    );
  } finally {
    delete globalThis.recoveryUi;
  }
});
