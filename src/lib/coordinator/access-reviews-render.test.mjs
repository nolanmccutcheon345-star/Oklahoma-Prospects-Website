import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";
const mocks = {
  "@/lib/coordinator/api": `export const getScheduledCoordinatorReviews=async()=>[]; export const getCoordinatorAccessReviews=()=>globalThis.accessReviewUi.load(); export const recordCoordinatorAccessReview=({data})=>globalThis.accessReviewUi.save(data); export const saveCoordinatorAccessReviewPolicy=({data})=>globalThis.accessReviewUi.policy(data);`,
};
const initial = () => ({
  assignments: [
    {
      user_id: "synthetic",
      name: "Synthetic Staff",
      sport: "softball",
      status: "active",
      coverage: "teams",
      team_ids: [],
      permissions: [],
      independent_roles: [],
      revision: 2,
      period: "monthly",
      due: true,
      lastReviewedAt: null,
      reviewedRevision: null,
    },
  ],
  history: [],
  policy: {
    revision: 0,
    weeklyDays: 7,
    monthlyDays: 30,
    quarterlyDays: 90,
    denialThreshold: 5,
    denialWindowHours: 24,
  },
});
test("access review UI submits only reviewed assignment revision, prevents duplicate submits and displays recovery", async () => {
  let workspace = initial(),
    calls = [],
    finish;
  globalThis.accessReviewUi = {
    load: async () => structuredClone(workspace),
    save: async (data) => {
      calls.push(data);
      await new Promise((resolve) => {
        finish = resolve;
      });
      workspace.assignments[0].due = false;
    },
  };
  const oldFormData = globalThis.FormData;
  try {
    await withRendered(
      "src/components/coordinator/access-reviews.tsx",
      "CoordinatorAccessReviews",
      {},
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        assert.match(host.textContent, /Zero operational permissions/);
        assert.match(host.textContent, /Review due/);
        const form = [...host.querySelectorAll("form")].find((f) => f.querySelector("textarea"));
        form.querySelector("textarea").value = "Reviewed exact saved permissions";
        form.querySelector('input[type="checkbox"]').checked = true;
        await act(async () => {
          form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
          form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
        });
        assert.deepEqual(calls, [
          {
            userId: "synthetic",
            sport: "softball",
            revision: 2,
            period: "monthly",
            reason: "Reviewed exact saved permissions",
            confirmed: true,
          },
        ]);
        assert.ok(form.querySelector('button[type="submit"]').disabled);
        await act(async () => finish());
        assert.match(host.textContent, /Review current/);
        assert.match(host.textContent, /Access was not changed/);
        globalThis.accessReviewUi.save = async () => {
          throw new Error("Access changed. Refresh and review the current assignment.");
        };
        form.querySelector("textarea").value = "Reviewed exact saved permissions";
        await act(async () =>
          form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
        );
        assert.match(host.querySelector('[role="alert"]').textContent, /Access changed/);
        assert.equal(form.querySelector('button[type="submit"]').disabled, false);
      },
    );
  } finally {
    globalThis.FormData = oldFormData;
    delete globalThis.accessReviewUi;
  }
});
test("access review UI exposes loading failure and retry without claiming an empty authorized result", async () => {
  globalThis.accessReviewUi = {
    load: async () => {
      throw new Error("Review access unavailable");
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/access-reviews.tsx",
      "CoordinatorAccessReviews",
      {},
      mocks,
      async ({ host, act }) => {
        assert.match(host.querySelector('[role="alert"]').textContent, /unavailable/);
        assert.doesNotMatch(host.textContent, /No current coordinator/);
        globalThis.accessReviewUi.load = async () => ({
          ...initial(),
          assignments: [],
          history: [],
        });
        await act(async () =>
          [...host.querySelectorAll("button")]
            .find((b) => b.textContent === "Refresh Reviews")
            .click(),
        );
        assert.equal(host.querySelector('[role="alert"]'), null);
        assert.match(host.textContent, /No current coordinator assignments/);
      },
    );
  } finally {
    delete globalThis.accessReviewUi;
  }
});

test("review policy form submits bounded settings with the current revision and preserves assignments", async () => {
  const workspace = initial();
  const before = structuredClone(workspace.assignments);
  const calls = [];
  globalThis.accessReviewUi = {
    load: async () => structuredClone(workspace),
    policy: async (data) => {
      calls.push(data);
      workspace.policy = { ...data, revision: 12 };
    },
  };
  const oldFormData = globalThis.FormData;
  try {
    await withRendered(
      "src/components/coordinator/access-reviews.tsx",
      "CoordinatorAccessReviews",
      {},
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        const form = host.querySelector("details form");
        form.querySelector('[name="denialThreshold"]').value = "3";
        await act(async () =>
          form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
        );
        assert.deepEqual(calls, [{ ...initial().policy, denialThreshold: 3 }]);
        assert.deepEqual(workspace.assignments, before);
        assert.match(
          host.querySelector('[role="status"]').textContent,
          /permissions were not changed/,
        );
      },
    );
  } finally {
    globalThis.FormData = oldFormData;
    delete globalThis.accessReviewUi;
  }
});
