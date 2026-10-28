import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "./render-component-support.mjs";
const detail = () => ({
  userId: "coach",
  revision: 0,
  profileRevision: 0,
  sourceRevision: 1,
  loginEmail: "login@example.invalid",
  accountDisabled: false,
  profileWithheld: false,
  profile: {
    name: "Coach",
    photo: "",
    bio: "Public bio",
    sports: ["baseball"],
    specialties: [],
    ages: "",
    approach: "",
    achievements: "",
    welcome: "",
  },
  contactEmail: "contact@example.invalid",
  phone: "",
  active: true,
  publishCoach: true,
  publishInstructor: false,
  canPublishInstructor: true,
  coachId: "coach",
  windows: [],
  services: [],
  teams: [],
  instruction: { revision: 1, active: false, canManage: true, canSuspend: false, blockers: [] },
});
const mocks = {
  "@/lib/coordinator/organization-people-api": `export const getOrganizationPeople=async()=>({people:[{userId:'coach',name:'Coach',active:true},{userId:'other',name:'Other',active:true}]});export const getOrganizationPerson=async({data})=>{globalThis.peopleUi.reads.push(data);if(globalThis.peopleUi.readError)throw Error('Refresh failed');return structuredClone(globalThis.peopleUi.detail);};export const saveOrganizationPerson=async({data})=>{globalThis.peopleUi.saves.push(structuredClone(data));return {ok:true};};`,
  "@/lib/operational-instruction-api": `export const saveOrganizationInstruction=async({data})=>{globalThis.peopleUi.grants.push(structuredClone(data));if(globalThis.peopleUi.gate)await globalThis.peopleUi.gate;globalThis.peopleUi.detail.instruction.revision++;globalThis.peopleUi.detail.instruction.active=data.active;return {ok:true};};`,
};
const button = (ui, text) =>
  [...ui.host.querySelectorAll("button")].find((b) => b.textContent === text);
async function submit(ui, form) {
  await ui.act(async () =>
    form.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true })),
  );
}
async function type(ui, el, value) {
  await ui.act(async () => {
    Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA"
        ? ui.dom.window.HTMLTextAreaElement.prototype
        : ui.dom.window.HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(new ui.dom.window.Event("input", { bubbles: true }));
  });
}
async function render(work, change = {}) {
  globalThis.peopleUi = { detail: { ...detail(), ...change }, reads: [], saves: [], grants: [] };
  try {
    await withRendered(
      "src/components/coordinator/organization-people.tsx",
      "OrganizationPeople",
      {},
      mocks,
      async (ui) => {
        await ui.change(ui.host.querySelector('select[aria-label="Person"]'), "coach");
        await work(ui, globalThis.peopleUi);
      },
    );
  } finally {
    delete globalThis.peopleUi;
  }
}
test("contact-only save preserves publication flags and readonly authentication identity", async () =>
  render(async (ui, state) => {
    assert.ok(ui.host.textContent.includes("Sign-in email (read only): login@example.invalid"));
    assert.equal(ui.host.querySelector('[name="loginEmail"]'), null);
    await type(ui, ui.host.querySelector('[name="contactEmail"]'), "new@example.invalid");
    await submit(ui, ui.host.querySelector('form[aria-label="Operational person"]'));
    assert.equal(state.saves.length, 1);
    assert.equal(state.saves[0].contactEmail, "new@example.invalid");
    assert.equal(state.saves[0].publishCoach, true);
    assert.equal(state.saves[0].reviewedPublication, false);
    assert.equal("instructor" in state.saves[0], false);
    assert.equal(state.reads.length, 2);
  }));
test("changed public profile requires explicit review; withheld profile cannot be edited", async () => {
  await render(async (ui) => {
    await type(ui, ui.host.querySelector('[name="bio"]'), "Changed public biography");
    assert.equal(button(ui, "Save person").disabled, true);
    await ui.act(async () => ui.host.querySelector('[name="reviewedPublication"]').click());
    assert.equal(button(ui, "Save person").disabled, false);
  });
  await render(
    async (ui) => {
      assert.equal(ui.host.querySelector('[name="bio"]'), null);
      assert.ok(ui.host.textContent.includes("needs owner review"));
    },
    { profileWithheld: true, profile: null, publishCoach: false },
  );
});
test("instructor exact payload shares busy guard and refreshes detail after save", async () =>
  render(async (ui, state) => {
    let release;
    state.gate = new Promise((resolve) => {
      release = resolve;
    });
    await ui.act(async () => ui.host.querySelector('[name="instructionActive"]').click());
    await type(
      ui,
      ui.host.querySelector('[name="instructionReason"]'),
      "Reviewed operational coaching assignment",
    );
    const form = ui.host.querySelector('form[aria-label="Operational instructor access"]');
    await submit(ui, form);
    assert.equal(state.grants.length, 1);
    assert.deepEqual(state.grants[0], {
      userId: "coach",
      revision: 1,
      active: true,
      reason: "Reviewed operational coaching assignment",
    });
    assert.equal(ui.host.querySelector('select[aria-label="Person"]').disabled, true);
    await submit(ui, form);
    await submit(ui, ui.host.querySelector('form[aria-label="Operational person"]'));
    assert.equal(state.grants.length, 1);
    assert.equal(state.saves.length, 0);
    await ui.act(async () => release());
    assert.equal(state.reads.length, 2);
    assert.equal(ui.host.querySelector('[name="instructionActive"]').checked, true);
    assert.ok(ui.host.textContent.includes("Operational instructor access saved."));
  }));
test("saved mutation with failed refresh blocks stale follow-up writes", async () =>
  render(async (ui, state) => {
    state.readError = true;
    await submit(ui, ui.host.querySelector('form[aria-label="Operational person"]'));
    assert.equal(state.saves.length, 1);
    assert.equal(ui.host.querySelector('form[aria-label="Operational person"]'), null);
    assert.ok(ui.host.textContent.includes("Changes saved. Refresh people"));
  }));
