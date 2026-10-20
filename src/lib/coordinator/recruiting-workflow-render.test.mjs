import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";
const mocks = {
  "@/lib/coordinator/api": `export const getCoordinatorFollowup=()=>globalThis.workflowUi.load();export const saveCoordinatorFollowup=({data})=>globalThis.workflowUi.save(data);export const saveCoordinatorTryoutAttendance=({data})=>globalThis.workflowUi.attendance(data);export const getCoordinatorRecruitingDelivery=()=>globalThis.workflowUi.delivery();`,
};
test("recruiting workflow has no protected controls or data calls without grants", async () => {
  await withRendered(
    "src/components/coordinator/recruiting-workflow.tsx",
    "RecruitingWorkflow",
    {
      requestId: "synthetic",
      kind: "tryout",
      revision: 3,
      allowed: () => false,
      onSaved: async () => {},
    },
    mocks,
    async ({ host }) => {
      assert.equal(host.querySelectorAll("button,form,details").length, 0);
    },
  );
});
test("recruiting workflow submits the loaded revision once, refreshes, and exposes stale errors", async () => {
  let calls = [],
    finish,
    revision = 3,
    refreshed = 0;
  globalThis.workflowUi = {
    load: async () => ({
      revision,
      assigneeId: "staff",
      dueDate: "2030-05-01",
      assignees: [{ id: "staff", name: "Synthetic staff" }],
    }),
    save: async (data) => {
      calls.push(data);
      await new Promise((resolve) => {
        finish = resolve;
      });
      revision++;
    },
    attendance: async () => {
      throw Error("Attendance changed. Reload before saving.");
    },
    delivery: async () => [],
  };
  const previous = globalThis.FormData;
  try {
    await withRendered(
      "src/components/coordinator/recruiting-workflow.tsx",
      "RecruitingWorkflow",
      {
        requestId: "synthetic",
        kind: "tryout",
        revision: 3,
        allowed: () => true,
        onSaved: async () => {
          refreshed++;
        },
      },
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        const click = async (text) =>
          act(async () =>
            [...host.querySelectorAll("button")].find((b) => b.textContent === text).click(),
          );
        await click("Load current follow-up");
        const form = host.querySelector("form");
        await act(async () => {
          form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
          form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
        });
        assert.deepEqual(calls, [
          { requestId: "synthetic", revision: 3, assigneeId: "staff", dueDate: "2030-05-01" },
        ]);
        assert.ok(form.querySelector('button[type="submit"]').disabled);
        await act(async () => finish());
        assert.equal(refreshed, 1);
        assert.match(host.textContent, /Follow-up saved/);
        await click("Mark attended");
        assert.match(host.querySelector('[role="alert"]').textContent, /Attendance changed/);
        await click("Refresh delivery status");
        assert.match(host.textContent, /No messages sent by you/);
        assert.match(host.textContent, /does not confirm inbox receipt/);
      },
    );
  } finally {
    globalThis.FormData = previous;
    delete globalThis.workflowUi;
  }
});
