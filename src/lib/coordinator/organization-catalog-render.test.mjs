import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";

const mock = {
  "@/lib/coordinator/organization-catalog-api": `
    export const getOrganizationCatalog = () => globalThis.catalogUi.load();
    export const saveOrganizationServiceMetadata = ({data}) => globalThis.catalogUi.service(data);
    export const saveOrganizationTrainingEventMetadata = ({data}) => globalThis.catalogUi.event(data);
  `,
};
const service = {
  id: "lesson",
  revision: 4,
  kind: "lesson",
  name: "Private lesson",
  discipline: "Pitching",
  purpose: "Current public summary",
  detail: "Current public description",
  sortOrder: 10,
  featured: false,
  nameEditable: false,
};
function fixture() {
  return {
    services: [
      service,
      {
        ...service,
        id: "membership",
        kind: "membership",
        name: "Development membership",
        nameEditable: true,
      },
    ],
    events: ["Baseball", "Softball"].map((sport, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
      revision: 7,
      editToken: "a".repeat(32),
      name: `${sport} camp`,
      description: `Published ${sport} camp description.`,
      type: "camp",
      sport,
      status: "published",
      location: "Synthetic facility",
      sessions: [{ date: "2030-06-01", start: "09:00", end: "12:00" }],
    })),
    registrations: ["Baseball", "Softball"].map((sport, i) => ({
      id: `registration-${i}`,
      eventId: `00000000-0000-4000-8000-00000000000${i + 1}`,
      athleteId: `athlete-${i}`,
      player: `Synthetic ${sport} Player`,
      status: "confirmed",
      sessions: [{ date: "2030-06-01", start: "09:00", end: "12:00" }],
    })),
  };
}
const button = (host, text) =>
  [...host.querySelectorAll("button")].find((node) => node.textContent === text);
const control = (host, text) =>
  [...host.querySelectorAll("label")]
    .find((node) => node.textContent.startsWith(text))
    ?.querySelector("input,select,textarea");
async function textInput(act, dom, input, value) {
  await act(async () => {
    const prototype =
      input.tagName === "TEXTAREA"
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
const render = (work, props = {}) =>
  withRendered(
    "src/components/coordinator/organization-catalog.tsx",
    "OrganizationCatalog",
    props,
    mock,
    work,
  );

test("catalog forms save only allowlisted public fields, block repeated submissions and cover both sports", async () => {
  const workspace = fixture(),
    services = [],
    events = [];
  let completeService;
  let callbacks = 0;
  globalThis.catalogUi = {
    load: async () => structuredClone(workspace),
    service: async (input) => {
      services.push(input);
      await new Promise((resolve) => {
        completeService = resolve;
      });
      workspace.services[0] = { ...workspace.services[0], ...input, revision: input.revision + 1 };
      return { ok: true };
    },
    event: async (input) => {
      events.push(input);
      const index = workspace.events.findIndex((event) => event.id === input.id);
      workspace.events[index] = { ...workspace.events[index], ...input, editToken: "b".repeat(32) };
      return { ok: true };
    },
  };
  try {
    await render(
      async ({ host, act, dom, change }) => {
        assert.equal(control(host, "Service name").readOnly, true);
        assert.match(host.textContent, /owner review to change/);
        assert.doesNotMatch(host.innerHTML, /priceCents|total_cents|order_id|profit_split/);
        await textInput(
          act,
          dom,
          control(host, "Public summary"),
          "Updated public training summary",
        );
        await act(async () => {
          const form = host.querySelector("form");
          for (let i = 0; i < 2; i++)
            form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
        });
        assert.equal(services.length, 1);
        assert.equal(button(host, "Reload Catalog").disabled, true);
        assert.equal(button(host, "Camps & Clinics").disabled, true);
        assert.deepEqual(
          Object.keys(services[0]).sort(),
          ["id", "revision", "name", "purpose", "detail", "sortOrder", "featured"].sort(),
        );
        assert.equal(services[0].purpose, "Updated public training summary");
        await act(async () => completeService());
        assert.match(host.textContent, /Published service details saved/);
        assert.equal(callbacks, 1);
        await change(control(host, "Published service"), "membership");
        assert.equal(control(host, "Service name").readOnly, false);
        await act(async () => button(host, "Camps & Clinics").click());
        assert.match(host.textContent, /Synthetic Baseball Player/);
        assert.doesNotMatch(host.textContent, /Synthetic Softball Player/);
        await change(control(host, "Sport"), "Softball");
        assert.match(host.textContent, /Synthetic Softball Player/);
        assert.doesNotMatch(host.textContent, /Synthetic Baseball Player/);
        await textInput(
          act,
          dom,
          control(host, "Public event description"),
          "Updated softball event description.",
        );
        await act(async () =>
          host
            .querySelector("form")
            .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
        );
        assert.equal(events.length, 1);
        assert.deepEqual(
          Object.keys(events[0]).sort(),
          ["id", "revision", "editToken", "name", "description"].sort(),
        );
        assert.equal(events[0].revision, 7);
        assert.equal(events[0].editToken, "a".repeat(32));
        assert.match(host.textContent, /Published event details saved/);
        assert.equal(callbacks, 2);
        await change(control(host, "Sport"), "Baseball");
        assert.match(host.textContent, /Synthetic Baseball Player/);
        assert.equal(
          control(host, "Public event description").value,
          "Published Baseball camp description.",
        );
      },
      {
        onSaved: () => {
          callbacks++;
        },
      },
    );
  } finally {
    delete globalThis.catalogUi;
  }
});

test("catalog loading, empty states, failed saves, revocation and retry do not retain private data", async () => {
  const workspace = fixture();
  let resolveLoad,
    failLoad = false,
    defer = true,
    empty = false;
  globalThis.catalogUi = {
    load: () => {
      if (defer)
        return new Promise((resolve) => {
          resolveLoad = resolve;
        });
      if (failLoad) return Promise.reject(new Error("Access removed. Reload your account."));
      return Promise.resolve(
        empty ? { services: [], events: [], registrations: [] } : structuredClone(workspace),
      );
    },
    service: async () => {
      throw new Error("This service changed. Reload before saving.");
    },
    event: async () => {
      throw new Error("This event changed. Reload before saving.");
    },
  };
  try {
    await render(async ({ host, act, dom }) => {
      assert.match(host.textContent, /Loading catalog/);
      assert.equal(host.querySelector("form"), null);
      await act(async () => {
        defer = false;
        resolveLoad(structuredClone(workspace));
      });
      assert.equal(control(host, "Service name").value, "Private lesson");
      await textInput(
        act,
        dom,
        control(host, "Public summary"),
        "Unsaved copy remains after conflict",
      );
      await act(async () =>
        host
          .querySelector("form")
          .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
      );
      assert.match(host.querySelector('[role="alert"]').textContent, /service changed/);
      assert.equal(control(host, "Public summary").value, "Unsaved copy remains after conflict");
      assert.equal(button(host, "Save Service Details").disabled, false);
      failLoad = true;
      await act(async () => button(host, "Reload Catalog").click());
      assert.match(host.textContent, /Access removed/);
      assert.equal(host.querySelector("form"), null);
      assert.doesNotMatch(host.textContent, /Private lesson|Synthetic.*Player/);
      failLoad = false;
      empty = true;
      await act(async () => button(host, "Reload Catalog").click());
      assert.match(host.textContent, /No published services/);
      await act(async () => button(host, "Camps & Clinics").click());
      assert.match(host.textContent, /No published camps or clinics/);
      empty = false;
      await act(async () => button(host, "Reload Catalog").click());
      assert.match(host.textContent, /Synthetic Baseball Player/);
      await act(async () =>
        host
          .querySelector("form")
          .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
      );
      assert.match(host.querySelector('[role="alert"]').textContent, /event changed/);
      assert.equal(button(host, "Save Event Details").disabled, false);
    });
  } finally {
    delete globalThis.catalogUi;
  }
});

test("catalog ignores a read that finishes after its workspace is unmounted", async () => {
  let resolveLoad;
  globalThis.catalogUi = {
    load: () =>
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
  };
  try {
    await render(async ({ host }) => {
      assert.match(host.textContent, /Loading catalog/);
    });
    resolveLoad(fixture());
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    delete globalThis.catalogUi;
  }
});
