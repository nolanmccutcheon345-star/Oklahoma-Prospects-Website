import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";
const mocks = {
  "@/lib/coordinator/api": `export const getEligibleCoordinatorAthletes=x=>globalThis.rosterFixture.read(x);export const addEligibleCoordinatorAthlete=x=>globalThis.rosterFixture.add(x);export const getRosterEligibilityReview=x=>globalThis.rosterFixture.ownerRead(x);export const approveRosterEligibility=x=>globalThis.rosterFixture.approve(x);export const revokeRosterEligibility=x=>globalThis.rosterFixture.revoke(x);export const saveCoordinatorPlayerInformation=x=>globalThis.rosterFixture.save(x);`,
};
test("eligible athlete confirmation uses exact team and revisions and clears revoked data", async () => {
  let confirmed = false,
    saved = 0;
  const calls = [];
  globalThis.rosterFixture = {
    read: async () => ({
      items: [{ id: "clearance", athleteId: "child", name: "Synthetic athlete", revision: 2 }],
      clubRevision: 17,
      nextCursor: null,
    }),
    add: async (v) => {
      calls.push(v);
      throw Error("Eligibility revoked");
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/roster-management.tsx",
      "EligibleRosterAthletes",
      {
        teamId: "soft",
        onAdded: async () => {
          saved++;
        },
      },
      mocks,
      async ({ host, act, dom }) => {
        dom.window.confirm = () => confirmed;
        const button = () =>
          [...host.querySelectorAll("button")].find((b) => b.textContent === "Add to Roster");
        await act(async () => button().click());
        assert.equal(calls.length, 0);
        confirmed = true;
        await act(async () => button().click());
        assert.deepEqual(calls[0].data, {
          id: "clearance",
          teamId: "soft",
          revision: 2,
          clubRevision: 17,
          confirm: true,
        });
        assert.equal(saved, 0);
        assert.match(host.querySelector('[role="alert"]').textContent, /revoked/);
        assert.equal(button(), undefined);
      },
    );
  } finally {
    delete globalThis.rosterFixture;
  }
});
test("routine player form submits only approved nonfinancial fields", async () => {
  const before = globalThis.FormData,
    calls = [];
  let saved = 0;
  globalThis.rosterFixture = {
    save: async (v) => {
      calls.push(v);
      return { ok: true };
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/roster-management.tsx",
      "RoutinePlayerInformation",
      {
        teamId: "soft",
        player: {
          id: "child",
          revision: 18,
          bats: "",
          throws: "",
          gradYear: "",
          school: "",
          parents: [],
        },
        onSaved: async () => {
          saved++;
        },
      },
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        host.querySelector('[name="school"]').value = "Synthetic school";
        host.querySelector('[name="bats"]').value = "L";
        await act(async () => host.querySelector('button[type="submit"]').click());
        assert.deepEqual(calls[0].data, {
          teamId: "soft",
          playerId: "child",
          revision: 18,
          bats: "L",
          throws: "",
          gradYear: "",
          school: "Synthetic school",
        });
        assert.equal(saved, 1);
      },
    );
  } finally {
    globalThis.FormData = before;
    delete globalThis.rosterFixture;
  }
});

test("owner clearance form requires reviewed identity, team, expiry and confirmation", async () => {
  const previous = globalThis.FormData,
    calls = [];
  globalThis.rosterFixture = {
    ownerRead: async () => ({
      clubRevision: 11,
      candidates: [
        {
          id: "child",
          name: "Synthetic athlete",
          guardianId: "guardian",
          guardianName: "Synthetic guardian",
          identityDigest: "a".repeat(64),
        },
      ],
      clearances: [],
      teams: [{ id: "soft", name: "Softball Team", sport: "softball" }],
    }),
    approve: async (v) => {
      calls.push(v);
      return { ok: true };
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/roster-management.tsx",
      "RosterEligibilityReview",
      {},
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        dom.window.confirm = () => true;
        const form = host.querySelector("details form");
        form.querySelector('[name="team"]').value = "soft";
        form.querySelector('[name="expires"]').value = "2099-01-01T12:00";
        form.querySelector('[name="reason"]').value =
          "Owner verified eligibility and guardian relationship";
        await act(async () => form.querySelector('button[type="submit"]').click());
        assert.equal(calls.length, 0);
        form.querySelector('[type="checkbox"]').checked = true;
        await act(async () => form.querySelector('button[type="submit"]').click());
        assert.equal(calls.length, 1);
        assert.equal(calls[0].data.identityDigest, "a".repeat(64));
        assert.equal(calls[0].data.clubRevision, 11);
        assert.equal(calls[0].data.guardianId, "guardian");
        assert.equal(calls[0].data.teamId, "soft");
        assert.equal(calls[0].data.confirmEligibility, true);
        assert.equal(calls[0].data.permissions, undefined);
        assert.match(host.textContent, /No athlete or account access was activated/);
      },
    );
  } finally {
    globalThis.FormData = previous;
    delete globalThis.rosterFixture;
  }
});
