import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";
const mocks = {
  "@/lib/coordinator/api": `export const getCoordinatorTryoutSchedule=x=>globalThis.tryoutScheduleFixture.read(x);export const saveCoordinatorTryout=x=>globalThis.tryoutScheduleFixture.save(x);export const requestCoordinatorTryoutReview=x=>globalThis.tryoutScheduleFixture.review(x);`,
};
const event = {
  id: "00000000-0000-4000-8000-000000000001",
  revision: 2,
  sport: "Softball",
  season: "Spring 2099",
  ageGroups: ["13U"],
  date: "2099-01-12",
  startTime: "16:00",
  endTime: "17:00",
  location: "Facility",
  capacity: 20,
  status: "published",
  coachId: "coach",
  laneIds: ["1"],
  updatedAt: "2026-10-20T00:00:00.000Z",
};
const workspace = {
  items: [event],
  nextCursor: null,
  coaches: [{ id: "coach", name: "Synthetic coach" }],
};
test("scoped tryout UI does not fetch without a team or expose edit controls to view-only staff", async () => {
  let calls = 0;
  globalThis.tryoutScheduleFixture = {
    read: async () => {
      calls++;
      return workspace;
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/tryout-scheduling.tsx",
      "TryoutScheduling",
      { teamId: "", allowed: () => true },
      mocks,
      async ({ host }) => {
        assert.equal(calls, 0);
        assert.match(host.textContent, /Select an authorized team/);
      },
    );
    await withRendered(
      "src/components/coordinator/tryout-scheduling.tsx",
      "TryoutScheduling",
      { teamId: "soft", allowed: (p) => p === "events.read" },
      mocks,
      async ({ host, act }) => {
        assert.equal(host.querySelector("form"), null);
        assert.match(host.textContent, /Spring 2099/);
        globalThis.tryoutScheduleFixture.read = async () => {
          throw Error("Access revoked");
        };
        await act(async () => host.querySelector("button").click());
        assert.match(host.querySelector('[role="alert"]').textContent, /Access revoked/);
        assert.doesNotMatch(host.textContent, /Spring 2099/);
      },
    );
  } finally {
    delete globalThis.tryoutScheduleFixture;
  }
});
test("published tryout edits submit a confirmed owner review instead of changing the event directly", async () => {
  const oldForm = globalThis.FormData;
  let review,
    saveCalls = 0;
  globalThis.tryoutScheduleFixture = {
    read: async () => workspace,
    save: async () => {
      saveCalls++;
    },
    review: async (v) => {
      review = v;
      return { ok: true };
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/tryout-scheduling.tsx",
      "TryoutScheduling",
      {
        teamId: "soft",
        allowed: (p) => ["events.read", "tryouts.update", "events.review.request"].includes(p),
      },
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        dom.window.confirm = () => true;
        const form = host.querySelector("form");
        form.querySelector('[name="reason"]').value = "Review revised public tryout";
        form.querySelector('[name="start"]').value = "17:00";
        form.querySelector('[name="end"]').value = "18:00";
        assert.equal(form.querySelector('[value="draft"]'), null);
        await act(async () => form.querySelector('button[type="submit"]').click());
        assert.equal(saveCalls, 0);
        assert.equal(review.data.change.teamId, "soft");
        assert.equal(review.data.change.revision, 2);
        assert.equal(review.data.change.sport, undefined);
        assert.equal(review.data.status, "published");
        assert.equal(review.data.confirm, true);
      },
    );
  } finally {
    globalThis.FormData = oldForm;
    delete globalThis.tryoutScheduleFixture;
  }
});
