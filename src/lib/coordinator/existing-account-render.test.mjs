import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";
const mocks = {
  "@/lib/coordinator/api":
    "export const assignExistingStaffCoordinator=x=>globalThis.existingAccountUI(x);",
};
const data = {
  accounts: [
    { id: "adult", name: "Synthetic Adult", email: "adult@example.invalid", role: "parent" },
    { id: "child", name: "Synthetic Player", email: "child@example.invalid", role: "player" },
  ],
  assignments: [],
};
test("existing-account form confirms selection, prevents duplicate submission and opens selected role after success", async () => {
  const calls = [],
    assigned = [];
  let approved = false,
    resolve;
  globalThis.existingAccountUI = (x) => {
    calls.push(x.data);
    return new Promise((r) => {
      resolve = r;
    });
  };
  try {
    await withRendered(
      "src/components/coordinator/existing-account.tsx",
      "ExistingCoordinatorAccount",
      {
        data,
        onAssigned: async (...args) => assigned.push(args),
      },
      mocks,
      async ({ host, act, dom, change }) => {
        dom.window.confirm = () => approved;
        const [account, sport] = host.querySelectorAll("select");
        assert.equal(host.querySelector("button").disabled, true);
        assert.match(account.textContent, /Synthetic Adult — adult@example.invalid/);
        assert.doesNotMatch(account.textContent, /Synthetic Player/);
        await change(account, "adult");
        await change(sport, "baseball");
        await act(async () => host.querySelector("button").click());
        assert.equal(calls.length, 0);
        approved = true;
        await act(async () => host.querySelector("button").click());
        assert.deepEqual(calls, [
          { userId: "adult", sport: "baseball", independentRolesReviewed: false, confirm: true },
        ]);
        assert.equal(host.querySelector("button").disabled, true);
        await act(async () => host.querySelector("button").click());
        assert.equal(calls.length, 1);
        await act(async () => resolve({ ok: true }));
        assert.deepEqual(assigned, [["adult", "baseball"]]);
      },
    );
  } finally {
    delete globalThis.existingAccountUI;
  }
});
test("existing-account form displays server rejection and blocks already assigned accounts", async () => {
  globalThis.existingAccountUI = async () => {
    throw new Error("Owner authority revoked");
  };
  try {
    await withRendered(
      "src/components/coordinator/existing-account.tsx",
      "ExistingCoordinatorAccount",
      {
        data: { ...data, assignments: [{ user_id: "adult", sport: "baseball" }] },
        onAssigned: async () => assert.fail("must not navigate"),
      },
      mocks,
      async ({ host, act, dom, change }) => {
        dom.window.confirm = () => true;
        const [account, sport] = host.querySelectorAll("select");
        await change(account, "adult");
        await act(async () => host.querySelector("button").click());
        assert.match(host.querySelector('[role="alert"]').textContent, /Owner authority revoked/);
        assert.equal(host.querySelector("button").disabled, false);
        await change(sport, "baseball");
        assert.equal(host.querySelector("button").disabled, true);
        assert.match(host.textContent, /saved baseball coordinator assignment exists/);
      },
    );
  } finally {
    delete globalThis.existingAccountUI;
  }
});
