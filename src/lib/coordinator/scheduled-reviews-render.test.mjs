import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";
const mocks = {
  "@/lib/coordinator/api":
    "export const getScheduledCoordinatorReviews=()=>globalThis.reviewRunsUi();",
};
test("scheduled reports distinguish no receipt, denied access and performed checks", async () => {
  globalThis.reviewRunsUi = async () => [];
  try {
    await withRendered(
      "src/components/coordinator/scheduled-reviews.tsx",
      "ScheduledCoordinatorReviews",
      {},
      mocks,
      async ({ host, act }) => {
        assert.match(host.textContent, /does not confirm that integrity checks have run/);
        globalThis.reviewRunsUi = async () => {
          throw Error("Review authority revoked");
        };
        await act(async () => host.querySelector("button").click());
        assert.match(host.querySelector('[role="alert"]').textContent, /authority revoked/);
        globalThis.reviewRunsUi = async () => [
          {
            id: "daily:2030-04-01",
            cadence: "daily",
            period_start: "2030-03-31T05:00:00Z",
            period_end: "2030-04-01T05:00:00Z",
            findings: [{ code: "invalid-team-scope", priority: "review", count: 1 }],
            summary: {
              activeAssignments: 2,
              zeroPermissionAssignments: 1,
              pendingApprovals: 1,
              overdueAccessReviews: 1,
              actions: [],
            },
          },
        ];
        await act(async () => host.querySelector("button").click());
        assert.equal(host.querySelector('[role="alert"]'), null);
        assert.match(host.textContent, /invalid team scope \(1\)/);
        assert.match(host.textContent, /Owner review remains required/);
      },
    );
  } finally {
    delete globalThis.reviewRunsUi;
  }
});
