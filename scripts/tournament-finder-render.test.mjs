import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "./render-component-support.mjs";
const event = {
  id: "fixture-event",
  name: "Synthetic Spring Tournament",
  org: "Fixture Organizer",
  city: "Broken Arrow",
  state: "OK",
  sport: "baseball",
  ages: ["13U"],
  levels: ["Open"],
  start: "2099-03-20",
  end: "2099-03-22",
  fee: 500,
  type: "tournament",
  stayToPlay: false,
  verifiedOn: "2026-09-01",
};
const team = {
  id: "fixture-team",
  name: "Synthetic Prospects 13U",
  sport: "baseball",
  age: "13U",
  seasonStart: "2099-03-01",
  seasonEnd: "2099-07-01",
  tournamentIds: [],
};
const club = { teams: [team], catalog: [event], notifications: [], _rev: 1, _demo: false };
const transportMocks = {
  "@/lib/teams/store": `export const saveFinancialCatalogPrice=async({data})=>{globalThis.__catalogFinancialCalls?.push(data);if(globalThis.__catalogFinancialFailure)throw Error("Financial basis changed. Reload.");return {version:2,sourceClubRevision:2};};`,
};
const entry = "src/components/teams/tournament-finder.tsx";
const button = (host, name) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent.trim().replace(/\s+/g, " ") === name,
  );

test("the team's age remains selected even when the catalog has no matching age", async () => {
  await withRendered(
    entry,
    "TournamentFinder",
    {
      club: { ...club, teams: [{ ...team, age: "6U" }] },
      teamId: team.id,
      onSave: async () => true,
    },
    transportMocks,
    async ({ host }) => {
      const age = [...host.querySelectorAll("label")]
        .find((label) => label.textContent.startsWith("Age division"))
        .querySelector("select");
      assert.equal(age.value, "6U");
      assert.equal(age.selectedOptions[0].textContent, "6U");
      assert.match(host.textContent, /No tournaments match/);
    },
  );
});

test("coach finder shows truthful sources, accessible filters, real saves, and failures", async () => {
  const calls = [];
  let fail = false;
  await withRendered(
    entry,
    "TournamentFinder",
    {
      club,
      teamId: team.id,
      onSave: async (next) => {
        calls.push(next);
        return !fail;
      },
    },
    transportMocks,
    async ({ host, act, change }) => {
      assert.match(host.textContent, /live nationwide feed is not connected/);
      assert.match(host.textContent, /Not source-checked/);
      assert.doesNotMatch(host.textContent, /Source checked by office/);
      assert.equal(button(host, "Add tournament record"), undefined);
      assert.equal(host.querySelectorAll("[data-tournament]").length, 1);
      await change(
        [...host.querySelectorAll("label")]
          .find((l) => l.textContent.startsWith("Sport"))
          .querySelector("select"),
        "softball",
      );
      assert.match(host.textContent, /No tournaments match/);
      await act(async () => button(host, "Reset filters").click());
      await act(async () => button(host, "Advanced filters +").click());
      assert.equal(button(host, "Advanced filters −").getAttribute("aria-expanded"), "true");
      await act(async () => button(host, "Add to team schedule").click());
      assert.deepEqual(calls[0].teams[0].tournamentIds, [event.id]);
      assert.deepEqual(calls[0].notifications, []);
      assert.match(host.textContent, /saved to Synthetic Prospects 13U/);
      fail = true;
      await act(async () => button(host, "Add to team schedule").click());
      assert.match(host.querySelector('[role="alert"]').textContent, /Could not confirm/);
      assert.equal(button(host, "Add to team schedule").disabled, false);
    },
  );
});

test("pending saves reject double clicks; source links reject script URLs", async () => {
  let finish,
    count = 0;
  await withRendered(
    entry,
    "TournamentFinder",
    {
      club: {
        ...club,
        catalog: [{ ...event, sourceUrl: "javascript:alert(1)", sourceCheckedOn: "2026-10-01" }],
      },
      teamId: team.id,
      onSave: () => {
        count++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
    transportMocks,
    async ({ host, act }) => {
      assert.equal(host.querySelector('a[href^="javascript:"]'), null);
      assert.doesNotMatch(host.textContent, /Source checked by office/);
      await act(async () => {
        const add = button(host, "Add to team schedule");
        add.click();
        add.click();
      });
      assert.equal(count, 1);
      assert.ok(button(host, "Saving…").disabled);
      await act(async () => finish(true));
      assert.match(host.textContent, /saved to Synthetic/);
    },
  );
});

test("office can cancel, validate, and save a sourced manual record without verification claims", async () => {
  let saved;
  await withRendered(
    entry,
    "TournamentFinder",
    {
      club,
      admin: true,
      onSave: async (next) => {
        saved = next;
        return true;
      },
    },
    transportMocks,
    async ({ host, act, dom }) => {
      const previousFormData = globalThis.FormData;
      globalThis.FormData = dom.window.FormData;
      try {
        await act(async () => button(host, "Add tournament record").click());
        await act(async () => button(host, "Cancel").click());
        assert.equal(host.querySelector("form"), null);
        await act(async () => button(host, "Add tournament record").click());
        const form = host.querySelector("form");
        for (const [name, value] of Object.entries({
          name: "Manual fixture",
          org: "Fixture Organizer",
          city: "Tulsa",
          state: "OK",
          start: "2099-04-01",
          end: "2099-04-02",
          ages: "13U",
          levels: "Open",
          fee: "450",
          sourceUrl: "https://example.invalid/event",
          sourceCheckedOn: "2026-10-01",
          distanceMiles: "20",
        }))
          form.elements[name].value = value;
        await act(async () =>
          form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
        );
        assert.equal(saved.catalog.length, 2);
        assert.equal(saved.catalog[1].sourceUrl, "https://example.invalid/event");
        assert.equal(saved.catalog[1].verifiedOn, "");
        assert.equal(saved.catalog[1].sourceCheckedOn, "2026-10-01");
        assert.equal(host.querySelector("form"), null);
      } finally {
        globalThis.FormData = previousFormData;
      }
    },
  );
});

const financial = {
  mode: "basis",
  version: 7,
  owner: true,
  catalog: [{ id: event.id, name: event.name, fee: 725 }],
  obligations: [],
  coachTeams: [],
  staff: [],
};
test("active finder does not present operational price placeholders as approved prices", async () => {
  await withRendered(
    entry,
    "TournamentFinder",
    {
      club: { ...club, catalog: [{ ...event, fee: 0 }] },
      financial: { ...financial, owner: false, catalog: [] },
      onSave: async () => true,
    },
    transportMocks,
    async ({ host, act }) => {
      assert.match(host.textContent, /Confirm entry fee with organizer/);
      assert.doesNotMatch(host.textContent, /\$0|Lowest entry fee|Review financial price/);
      await act(async () => button(host, "Advanced filters +").click());
      assert.doesNotMatch(host.textContent, /Maximum entry fee/);
    },
  );
});
test("active owner price confirmation is explicit, versioned, cancellable and reloadable after conflict", async () => {
  globalThis.__catalogFinancialCalls = [];
  globalThis.__catalogFinancialFailure = false;
  let reloaded = 0,
    saves = 0;
  try {
    await withRendered(
      entry,
      "TournamentFinder",
      {
        club: { ...club, catalog: [{ ...event, fee: 0 }] },
        financial,
        admin: true,
        onReload: async () => {
          reloaded++;
        },
        onSave: async () => {
          saves++;
          return true;
        },
      },
      transportMocks,
      async ({ host, act, dom }) => {
        assert.match(host.textContent, /\$725/);
        assert.doesNotMatch(host.textContent, /\$0/);
        await act(async () => button(host, "Edit record").click());
        assert.equal(host.querySelector('[name="fee"]'), null);
        await act(async () => button(host, "Cancel").click());
        await act(async () => button(host, "Review financial price").click());
        await act(async () => button(host, "Cancel").click());
        assert.equal(globalThis.__catalogFinancialCalls.length, 0);
        await act(async () => button(host, "Review financial price").click());
        const form = host.querySelector('[aria-label="Owner catalog financial price"]');
        assert.equal(button(host, "Save financial catalog price").disabled, true);
        await act(async () => {
          const textarea = form.querySelector("textarea");
          Object.getOwnPropertyDescriptor(
            dom.window.HTMLTextAreaElement.prototype,
            "value",
          ).set.call(textarea, "Reviewed organizer price");
          textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
          form.querySelector('input[type="checkbox"]').click();
        });
        globalThis.__catalogFinancialFailure = true;
        await act(async () =>
          form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
        );
        assert.deepEqual(globalThis.__catalogFinancialCalls[0], {
          expectedBasisVersion: 7,
          sourceClubRevision: 1,
          catalogId: event.id,
          fee: 725,
          confirmed: true,
          reason: "Reviewed organizer price",
        });
        assert.match(host.querySelector('[role="alert"]').textContent, /Financial basis changed/);
        await act(async () => button(host, "Refresh financial prices").click());
        assert.equal(reloaded, 1);
        assert.equal(host.querySelector("form"), null);
        assert.equal(saves, 0);
      },
    );
  } finally {
    delete globalThis.__catalogFinancialCalls;
    delete globalThis.__catalogFinancialFailure;
  }
});
