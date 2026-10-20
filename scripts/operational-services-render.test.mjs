import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "./render-component-support.mjs";

const service = {
  id: "published-service",
  kind: "lesson",
  name: "Private lesson",
  discipline: "Pitching",
  purpose: "Published summary",
  detail: "Published description",
  featured: false,
  sortOrder: 2,
  status: "active",
  revision: 3,
  sourceRevision: 7,
  financialApprovalRequired: false,
  nameEditable: false,
};
const draft = {
  ...service,
  id: "draft-service",
  name: "Draft lesson",
  status: "draft",
  revision: 1,
  sourceRevision: null,
  financialApprovalRequired: true,
  nameEditable: true,
};
const mocks = {
  "@/lib/coordinator/organization-services-api": `
  export const getOrganizationServices = () => globalThis.serviceUi.load();
  export const createOrganizationServiceDraft = ({data}) => globalThis.serviceUi.create(data);
  export const saveOrganizationService = ({data}) => globalThis.serviceUi.save(data);
  export const setOrganizationServiceStatus = ({data}) => globalThis.serviceUi.status(data);
`,
};
const button = (host, text) =>
  [...host.querySelectorAll("button")].find((node) => node.textContent === text);
const control = (host, text) =>
  [...host.querySelectorAll("label")]
    .find((node) => node.textContent.startsWith(text))
    ?.querySelector("input,select,textarea");
async function input({ act, dom }, node, value) {
  await act(async () => {
    const prototype =
      node.tagName === "TEXTAREA"
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value);
    node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function submit({ host, act, dom }, count = 1) {
  await act(async () => {
    for (let i = 0; i < count; i++)
      host
        .querySelector("form")
        .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  });
}
const render = (work, props = {}) =>
  withRendered(
    "src/components/coordinator/organization-services.tsx",
    "OrganizationServices",
    props,
    mocks,
    work,
  );

test("service edits use both revisions, preserve name locks, reject duplicate saves, and cancel safely", async () => {
  const saved = [],
    busy = [];
  let complete;
  let calls = 0;
  globalThis.serviceUi = {
    load: async () => [service, draft],
    save: async (data) => {
      saved.push(data);
      await new Promise((resolve) => {
        complete = resolve;
      });
    },
  };
  try {
    await render(
      async (context) => {
        const { host, act } = context;
        assert.doesNotMatch(host.innerHTML, /priceCents|profit_split|name="price"/);
        await act(async () => button(host, "Edit Service Details").click());
        assert.equal(control(host, "Service name").readOnly, true);
        await input(context, control(host, "Public summary"), "New public summary");
        await submit(context, 2);
        assert.equal(saved.length, 1);
        assert.equal(button(host, "Reload Services").disabled, true);
        assert.equal(button(host, "Cancel").disabled, true);
        assert.deepEqual(saved[0], {
          id: service.id,
          revision: 3,
          sourceRevision: 7,
          name: service.name,
          purpose: "New public summary",
          detail: service.detail,
          featured: false,
          sortOrder: 2,
        });
        await act(async () => complete());
        assert.equal(host.querySelector("form"), null);
        assert.match(host.textContent, /Service details saved/);
        assert.deepEqual(busy, [true, false]);
        assert.equal(calls, 1);
        await act(async () => button(host, "Edit Service Details").click());
        await input(context, control(host, "Public summary"), "Unsaved change");
        await act(async () => button(host, "Cancel").click());
        assert.equal(host.querySelector("form"), null);
        assert.equal(saved.length, 1);
        await act(async () => button(host, "Edit Service Details").click());
        assert.equal(control(host, "Public summary").value, service.purpose);
      },
      {
        onSaved: () => {
          calls++;
        },
        onBusyChange: (value) => busy.push(value),
      },
    );
  } finally {
    delete globalThis.serviceUi;
  }
});

test("copy and create send only unpriced draft metadata, never identities or entitlements", async () => {
  const created = [];
  globalThis.serviceUi = {
    load: async () => [service],
    create: async (data) => {
      created.push(data);
    },
  };
  try {
    await render(async (context) => {
      const { host, act, change } = context;
      await act(async () => button(host, "Copy to New Draft").click());
      assert.equal(control(host, "Service name").value, "Private lesson (copy)");
      assert.equal(control(host, "Service name").readOnly, false);
      assert.match(host.textContent, /Drafts cannot be purchased/);
      assert.equal(
        host.querySelectorAll('input[type="number"]').length,
        1,
        "only display order is numeric",
      );
      await submit(context, 2);
      assert.equal(created.length, 1);
      assert.deepEqual(created[0], {
        kind: "lesson",
        name: "Private lesson (copy)",
        discipline: "Pitching",
        purpose: service.purpose,
        detail: service.detail,
        featured: false,
        sortOrder: 2,
      });
      assert.match(host.textContent, /not available for purchase/);
      await act(async () => button(host, "New Service Draft").click());
      assert.equal(control(host, "Service name").value, "");
      await input(context, control(host, "Service name"), "Summer membership draft");
      await change(control(host, "Service category"), "membership");
      await submit(context);
      assert.equal(created[1].kind, "membership");
      assert.equal(created[1].discipline, "");
      assert.equal(created[1].purpose, "");
      assert.equal(created[1].featured, false);
    });
  } finally {
    delete globalThis.serviceUi;
  }
});

test("archive and reactivate require reasons; archived unapproved drafts restore only to review", async () => {
  let rows = [service, draft];
  const updates = [];
  globalThis.serviceUi = {
    load: async () => structuredClone(rows),
    status: async (data) => {
      updates.push(data);
      rows = rows.map((row) =>
        row.id === data.id
          ? {
              ...row,
              status:
                data.status === "active" && row.sourceRevision === null ? "draft" : data.status,
              revision: row.revision + 1,
            }
          : row,
      );
    },
  };
  try {
    await render(async (context) => {
      const { host, act, change } = context;
      await act(async () => button(host, "Archive Service").click());
      assert.match(host.textContent, /Existing paid bookings and prepared purchases/);
      await submit(context);
      assert.equal(updates.length, 0);
      await input(context, control(host, "Reason"), "Season ended.");
      assert.equal(control(host, "Reason").maxLength, 500);
      await submit(context, 2);
      assert.equal(updates.length, 1);
      assert.deepEqual(updates[0], {
        id: service.id,
        revision: 3,
        sourceRevision: 7,
        status: "archived",
        reason: "Season ended.",
      });
      await act(async () => button(host, "Reactivate Service").click());
      await input(context, control(host, "Reason"), "New season starts.");
      await submit(context);
      assert.equal(updates[1].revision, 4);
      assert.equal(updates[1].status, "active");
      await change(control(host, "Service"), draft.id);
      assert.equal(button(host, "Reactivate Service"), undefined);
      await act(async () => button(host, "Archive Service").click());
      await input(context, control(host, "Reason"), "Draft no longer needed.");
      await submit(context);
      assert.equal(updates[2].sourceRevision, null);
      assert.equal(button(host, "Reactivate Service"), undefined);
      assert.match(host.textContent, /Awaiting owner financial approval/);
      await act(async () => button(host, "Restore Draft").click());
      assert.match(host.textContent, /does not publish a purchasable service/);
      await input(context, control(host, "Reason"), "Resume owner review.");
      await submit(context);
      assert.equal(updates[3].status, "active");
      assert.match(host.textContent, /Draft restored for owner review/);
      assert.match(host.textContent, /Status: draft/);
    });
  } finally {
    delete globalThis.serviceUi;
  }
});

test("loading, empty, stale, failed access, retry and late completion states are safe", async () => {
  let resolveLoad,
    delayed = true,
    fail = false,
    empty = false;
  globalThis.serviceUi = {
    load: () =>
      delayed
        ? new Promise((resolve) => {
            resolveLoad = resolve;
          })
        : fail
          ? Promise.reject(new Error("Access removed. Reload your account."))
          : Promise.resolve(empty ? [] : [service]),
    save: async () => {
      throw new Error("This service changed. Reload before saving.");
    },
  };
  try {
    await render(async (context) => {
      const { host, act } = context;
      assert.match(host.textContent, /Loading services/);
      assert.equal(host.querySelector("form"), null);
      await act(async () => {
        delayed = false;
        resolveLoad([service]);
      });
      await act(async () => button(host, "Edit Service Details").click());
      await input(context, control(host, "Public summary"), "Unsubmitted newer copy");
      await submit(context);
      assert.match(host.querySelector('[role="alert"]').textContent, /service changed/);
      assert.equal(control(host, "Public summary").value, "Unsubmitted newer copy");
      assert.equal(button(host, "Save Service Details").disabled, false);
      fail = true;
      await act(async () => button(host, "Reload Services").click());
      assert.match(host.textContent, /Access removed/);
      assert.doesNotMatch(host.textContent, /Private lesson/);
      assert.equal(host.querySelector("form"), null);
      fail = false;
      empty = true;
      await act(async () => button(host, "Reload Services").click());
      assert.match(host.textContent, /No services yet/);
      assert.equal(button(host, "New Service Draft").disabled, false);
      await act(async () => button(host, "New Service Draft").click());
      await submit(context);
      assert.match(host.querySelector('[role="alert"]').textContent, /./);
      await act(async () => button(host, "Cancel").click());
    });
    delayed = true;
    await render(async ({ host }) => {
      assert.match(host.textContent, /Loading services/);
    });
    resolveLoad([service]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    delete globalThis.serviceUi;
  }
});
