import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withRendered } from "../../../scripts/render-component-support.mjs";
test("owner withdrawal UI requires confirmation, submits exact sport revisions and refreshes zero permissions", async () => {
  const names = [
    ...(await readFile("src/lib/coordinator/api.ts", "utf8")).matchAll(/export const (\w+)/g),
  ].map((m) => m[1]);
  const mocks = {
    "@/lib/coordinator/api": names
      .map((name) => `export const ${name}=(args)=>globalThis.resetUi['${name}'](args);`)
      .join("\n"),
  };
  const calls = [];
  const workspace = {
    accounts: [
      {
        id: "synthetic",
        name: "Synthetic Staff",
        email: "synthetic@example.invalid",
        role: "parent",
      },
    ],
    assignments: [
      {
        user_id: "synthetic",
        sport: "softball",
        status: "active",
        coverage: "sport",
        permissions: ["rosters.read"],
        team_ids: [],
        revision: 4,
        independent_roles: [],
      },
    ],
    teams: [],
    leadership: [],
    retiredAccess: [{ user_id: "synthetic", status: "active", revision: 2 }],
  };
  globalThis.resetUi = {
    getStaffRoles: async () => structuredClone(workspace),
    resetStaffCoordinatorAccess: async ({ data }) => {
      calls.push(data);
      workspace.assignments[0] = {
        ...workspace.assignments[0],
        permissions: [],
        status: "suspended",
        revision: 5,
      };
    },
  };
  const old = globalThis.FormData;
  try {
    await withRendered(
      "src/components/coordinator/staff-management.tsx",
      "StaffRoleManagement",
      {},
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        const select = host.querySelector("select");
        await act(async () => {
          select.value = "synthetic";
          select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        });
        const form = host.querySelector('[name="resetReason"]').closest("form");
        form.querySelector("textarea").value = "Owner reviewed withdrawal of both sport scopes";
        dom.window.confirm = () => false;
        await act(async () =>
          form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
        );
        assert.equal(calls.length, 0);
        dom.window.confirm = () => true;
        await act(async () =>
          form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
        );
        assert.deepEqual(calls, [
          {
            userId: "synthetic",
            assignments: [{ sport: "softball", revision: 4 }],
            legacyRevision: 2,
            reason: "Owner reviewed withdrawal of both sport scopes",
            confirmed: true,
          },
        ]);
        assert.match(host.querySelector('[role="status"]').textContent, /access withdrawn/);
        assert.deepEqual(workspace.assignments[0].permissions, []);
      },
    );
  } finally {
    globalThis.FormData = old;
    delete globalThis.resetUi;
  }
});
