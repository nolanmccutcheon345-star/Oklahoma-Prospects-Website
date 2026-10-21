import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withRendered } from "../../../scripts/render-component-support.mjs";

test("existing assignment opens all permission categories and independent public controls without implicit writes", async () => {
  const names = [
    ...(await readFile("src/lib/coordinator/api.ts", "utf8")).matchAll(/export const (\w+)/g),
  ].map((m) => m[1]);
  const mocks = {
    "@/lib/coordinator/api": names
      .map((n) => `export const ${n}=args=>globalThis.managementUI['${n}'](args);`)
      .join("\n"),
  };
  const workspace = {
    accounts: [
      { id: "adult", name: "Synthetic Staff", email: "staff@example.invalid", role: "parent" },
    ],
    assignments: [
      {
        user_id: "adult",
        sport: "softball",
        status: "active",
        coverage: "teams",
        team_ids: [],
        permissions: [],
        revision: 1,
        independent_roles: [],
      },
    ],
    teams: [],
    leadership: [],
    retiredAccess: [],
  };
  const saves = [],
    publications = [];
  globalThis.managementUI = {
    getStaffRoles: async () => structuredClone(workspace),
    getCoordinatorInvitations: async () => [],
    saveStaffRole: async ({ data }) => {
      saves.push(data);
      workspace.assignments[0] = {
        ...workspace.assignments[0],
        permissions: data.permissions,
        revision: 2,
      };
    },
    savePublicLeadership: async ({ data }) => {
      publications.push(data);
      workspace.leadership = [
        {
          user_id: data.userId,
          enabled: data.enabled,
          titles: data.titles,
          display_order: data.order,
          revision: 1,
        },
      ];
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/staff-management.tsx",
      "StaffRoleManagement",
      {},
      mocks,
      async ({ host, act, change, dom }) => {
        const button = (text) =>
          [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
        await act(async () => button("Coordinator Invitations").click());
        await change(host.querySelector("select"), "adult");
        assert.match(host.textContent, /saved softball coordinator assignment exists/);
        await act(async () =>
          button("Manage this account’s permissions and public profile").click(),
        );
        const region = host.querySelector('[aria-label="Operational permission options"]');
        assert.ok(region);
        assert.ok(
          [...region.querySelectorAll("details")]
            .filter((d) => d.querySelector("fieldset"))
            .every((d) => d.open),
        );
        const options = [...region.querySelectorAll('input[type="checkbox"]')];
        assert.ok(options.length > 30);
        assert.ok(options.every((c) => !c.checked && !c.matches(":disabled")));
        assert.equal(saves.length, 0);
        assert.equal(publications.length, 0);
        await act(async () => options[0].click());
        dom.window.confirm = () => true;
        await act(async () => button("Save Permissions").click());
        assert.equal(saves.length, 1);
        assert.equal(saves[0].permissions.length, 1);
        assert.deepEqual(saves[0].teamIds, []);
        assert.equal(publications.length, 0);
        const publicPanel = [...host.querySelectorAll("details")].find((d) =>
          d.querySelector("summary")?.textContent.includes("Public coordinator titles"),
        );
        assert.ok(publicPanel.open);
        const checks = publicPanel.querySelectorAll('input[type="checkbox"]');
        await act(async () => {
          checks[0].click();
          checks[2].click();
        });
        await act(async () => button("Save Public Titles").click());
        assert.equal(publications.length, 1);
        assert.equal(publications[0].enabled, true);
        assert.deepEqual(publications[0].titles, ["Softball Coordinator"]);
        assert.equal(saves.length, 1, "public title does not save operational permissions");
        await change(host.querySelector('[aria-label="Verified staff account"]'), "");
        assert.equal(host.querySelector('[aria-label="Operational permission options"]'), null);
        await change(host.querySelector('[aria-label="Verified staff account"]'), "adult");
        const sport = [...host.querySelectorAll("select")].find((s) =>
          s.closest("label")?.textContent.includes("Role / sport"),
        );
        await change(sport, "baseball");
        const newOptions = [
          ...host.querySelectorAll(
            '[aria-label="Operational permission options"] input[type="checkbox"]',
          ),
        ];
        assert.ok(newOptions.every((c) => !c.checked && c.matches(":disabled")));
      },
    );
  } finally {
    delete globalThis.managementUI;
  }
});
