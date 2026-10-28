import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "./render-component-support.mjs";

const draft = {
  id: "ops-draft",
  kind: "lesson",
  name: "Synthetic draft",
  discipline: "Pitching",
  purpose: "Draft public summary",
  detail: "Detailed draft metadata",
  featured: true,
  sortOrder: 12,
  status: "draft",
  revision: 4,
  sourceRevision: null,
  financialApprovalRequired: true,
  nameEditable: true,
};
const existing = {
  id: "priced-service",
  kind: "lesson",
  name: "Existing priced lesson",
  discipline: "Hitting",
  price: 75,
  minutes: 30,
  purpose: "Existing summary",
  detail: "Existing description",
  featured: false,
  sort_order: 2,
  active: true,
  entry: false,
  group_session: false,
  requires_assessment: false,
  credits: 0,
  remote: 0,
  expires_days: 0,
  hours: 0,
  includes: [],
  unit: "",
  lanes: "",
  period: "",
  hourly: "",
  bestFor: "",
  savings: "",
  perks: [],
};
const mocks = {
  "@/components/membership-presentation-editor":
    "export const MembershipPresentationEditor = () => null;",
  "@/lib/coordinator/organization-services-api":
    "export const getOwnerServiceDrafts = () => globalThis.ownerServiceUi.drafts();",
  "@/lib/ops": `
    export const SERVICE_KINDS = ['lesson','package','membership','cage','cage_plan','fee','team_plan'].map(id=>({id,label:id}));
    export const getAdminLessonTerms = () => globalThis.ownerServiceUi.terms();
    export const saveService = ({data}) => globalThis.ownerServiceUi.save(data);
    export const deleteAccount = () => {}, deleteStaff = () => {}, listAccounts = () => {}, saveAccount = () => {}, saveStaff = () => {};
  `,
  "@/components/finance/financial-identity-admission":
    "export const FinancialIdentityAdmission = () => null;",
  "@/components/staff/person-editor": "export const PersonEditor = () => null;",
  "@/components/pd/polish": "export const ArmConfirm = () => null;",
  "@/components/pd/education": "export const CoachEducationProgress = () => null;",
  "@/lib/pd/context": "export const useDevelopment = () => ({});",
};
const button = (host, text) =>
  [...host.querySelectorAll("button")].find((node) => node.textContent === text);
const control = (host, text) =>
  [...host.querySelectorAll("label")]
    .find((node) => node.textContent.trim().startsWith(text))
    ?.querySelector("input,select,textarea");
async function input({ act, dom }, node, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(
      node,
      value,
    );
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
const render = (work) =>
  withRendered("src/components/pd/admin-ops.tsx", "AdminServicesDesk", {}, mocks, work);

test("owner adoption requires draft review, fresh positive price and approval; retains metadata and both versions", async () => {
  const saved = [];
  let finish;
  let remaining = [draft];
  globalThis.ownerServiceUi = {
    terms: async () => ({ services: [existing], basisVersion: 9 }),
    drafts: async () => remaining,
    save: async (data) => {
      saved.push(data);
      await new Promise((resolve) => {
        finish = resolve;
      });
      remaining = [];
    },
  };
  try {
    await render(async (context) => {
      const { host, act } = context;
      assert.match(host.textContent, /Detailed draft metadata/);
      assert.equal(button(host, "Review Pricing & Approve Draft").disabled, true);
      assert.equal(host.querySelector("form"), null);
      await act(async () => control(host, "I reviewed this draft").click());
      await act(async () => button(host, "Review Pricing & Approve Draft").click());
      assert.equal(control(host, "Type").disabled, true);
      assert.equal(control(host, "Price ($)").value, "");
      assert.equal(control(host, "Active (visible").checked, false);
      assert.equal(button(host, "Save").disabled, true);
      await submit(context);
      assert.equal(saved.length, 0);
      await input(context, control(host, "Price ($)"), "0");
      await act(async () => control(host, "I approve this service").click());
      await submit(context);
      assert.equal(saved.length, 0);
      assert.match(host.textContent, /positive customer price/);
      await input(context, control(host, "Price ($)"), "82.50");
      assert.equal(control(host, "I approve this service").checked, false);
      await act(async () => control(host, "I approve this service").click());
      await act(async () => control(host, "Active (visible").click());
      assert.equal(
        control(host, "I approve this service").checked,
        false,
        "a changed publication choice needs fresh approval",
      );
      await act(async () => control(host, "I approve this service").click());
      await submit(context, 2);
      assert.equal(saved.length, 1);
      assert.equal(button(host, "Cancel").disabled, true);
      assert.equal(button(host, "Reload Services & Drafts").disabled, true);
      assert.deepEqual(
        Object.fromEntries(
          [
            "id",
            "kind",
            "name",
            "discipline",
            "purpose",
            "detail",
            "featured",
            "sort_order",
            "price",
            "basisVersion",
            "operationalDraftRevision",
            "operationalDraftConfirmed",
            "active",
          ].map((key) => [key, saved[0][key]]),
        ),
        {
          id: draft.id,
          kind: draft.kind,
          name: draft.name,
          discipline: draft.discipline,
          purpose: draft.purpose,
          detail: draft.detail,
          featured: true,
          sort_order: 12,
          price: 82.5,
          basisVersion: 9,
          operationalDraftRevision: 4,
          operationalDraftConfirmed: true,
          active: true,
        },
      );
      await act(async () => finish());
      assert.equal(host.querySelector("form"), null);
      assert.match(host.textContent, /No service drafts await owner approval/);
    });
  } finally {
    delete globalThis.ownerServiceUi;
  }
});

test("owner adoption cancel, stale revisions, reload errors, empty recovery and ordinary priced edits remain usable", async () => {
  let drafts = [draft],
    fails = false,
    saves = 0;
  globalThis.ownerServiceUi = {
    terms: async () => ({ services: [existing], basisVersion: 9 }),
    drafts: async () => {
      if (fails) throw new Error("Owner access changed. Reload your account.");
      return drafts;
    },
    save: async () => {
      saves++;
      throw new Error("Draft changed. Reload before approval.");
    },
  };
  try {
    await render(async (context) => {
      const { host, act } = context;
      const open = async () => {
        await act(async () => control(host, "I reviewed this draft").click());
        await act(async () => button(host, "Review Pricing & Approve Draft").click());
      };
      await open();
      await input(context, control(host, "Price ($)"), "90");
      await act(async () => button(host, "Cancel").click());
      assert.equal(saves, 0);
      assert.equal(host.querySelector("form"), null);
      assert.equal(control(host, "I reviewed this draft").checked, false);
      await open();
      assert.equal(control(host, "Price ($)").value, "");
      await input(context, control(host, "Price ($)"), "90");
      await act(async () => control(host, "I approve this service").click());
      await submit(context);
      assert.match(host.textContent, /Draft changed/);
      assert.equal(control(host, "Price ($)").value, "90");
      assert.equal(control(host, "I approve this service").checked, false);
      fails = true;
      await act(async () => button(host, "Reload Services & Drafts").click());
      assert.match(host.textContent, /Owner access changed/);
      assert.equal(host.querySelector("form"), null);
      assert.doesNotMatch(host.textContent, /Synthetic draft|Existing priced lesson/);
      fails = false;
      drafts = [];
      await act(async () => button(host, "Reload Services & Drafts").click());
      assert.match(host.textContent, /No service drafts await owner approval/);
      await act(async () => button(host, "Edit").click());
      assert.equal(control(host, "Price ($)").value, "75");
      assert.equal(control(host, "I approve this service"), undefined);
      assert.equal(button(host, "Save").disabled, false);
    });
  } finally {
    delete globalThis.ownerServiceUi;
  }
});

test("owner draft approval remains available before financial basis activation", async () => {
  const saved = [];
  globalThis.ownerServiceUi = {
    terms: async () => ({ services: [existing] }),
    drafts: async () => [draft],
    save: async (data) => {
      saved.push(data);
    },
  };
  try {
    await render(async (context) => {
      const { host, act } = context;
      await act(async () => control(host, "I reviewed this draft").click());
      assert.equal(button(host, "Review Pricing & Approve Draft").disabled, false);
      await act(async () => button(host, "Review Pricing & Approve Draft").click());
      await input(context, control(host, "Price ($)"), "65");
      await act(async () => control(host, "I approve this service").click());
      await submit(context);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].basisVersion, undefined);
      assert.equal(saved[0].operationalDraftRevision, 4);
    });
  } finally {
    delete globalThis.ownerServiceUi;
  }
});
