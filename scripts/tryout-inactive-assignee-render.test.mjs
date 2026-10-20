import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "./render-component-support.mjs";
const mocks = {
  "@/lib/tryout-center-api": `export const getTryoutCenter=async()=>structuredClone(globalThis.tryoutInactive.data);export const getTryoutDetail=async()=>({activity:[],delivery:[]});export const saveTryoutWork=async({data})=>{globalThis.tryoutInactive.work.push(data);};export const saveTryoutAppointment=async({data})=>{globalThis.tryoutInactive.appointments.push(data);};export const saveTryoutMessage=async()=>{};export const saveTryoutPreferences=async()=>{};export const readTryoutNotice=async()=>{};`,
  "./commerce/office-requests": `export function RequestStageForm(){return null;}`,
  "./registration-desk": `export function RegistrationDesk(){return null;}`,
  "./tryout-evaluations": `export function TryoutEvaluations(){return null;}`,
};
const state = () => ({
  data: {
    userId: "owner",
    owner: false,
    staff: [
      {
        id: "active",
        staffId: "active-staff",
        name: "Active Coach",
        email: "active@example.invalid",
      },
    ],
    teams: [],
    registrations: [
      {
        id: "registration",
        kind: "tryout",
        status: "new",
        payload: {
          player: "Synthetic Player",
          sport: "Baseball",
          season: "2026",
          age: "12U",
          email: "guardian@example.invalid",
        },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    work: [
      {
        request_id: "registration",
        assignee_id: "inactive",
        revision: 3,
        follow_up: "contacted",
        team_id: "",
        follow_up_date: null,
      },
    ],
    notices: [],
    appointments: [
      {
        id: "appointment",
        request_id: "registration",
        coach_id: "inactive-staff",
        revision: 2,
        starts_at: "2026-01-02T22:00:00Z",
        ends_at: "2026-01-02T23:00:00Z",
        status: "confirmed",
        location: "Synthetic facility",
        lane_ids: [],
        event_id: null,
      },
    ],
    events: [],
    publicTeams: [],
    preferences: { email_enabled: true, sports: [], ages: [], team_ids: [] },
    failures: [],
  },
  work: [],
  appointments: [],
});
const button = (ui, text) =>
  [...ui.host.querySelectorAll("button")].find((b) => b.textContent === text);
async function render(work) {
  globalThis.tryoutInactive = state();
  try {
    await withRendered(
      "src/components/tryout-center.tsx",
      "TryoutCenter",
      {},
      mocks,
      async (ui) => {
        assert.ok(ui.host.textContent.includes("Assigned coach (inactive)"));
        await ui.act(async () => button(ui, "Open Synthetic Player").click());
        await work(ui, globalThis.tryoutInactive);
      },
    );
  } finally {
    delete globalThis.tryoutInactive;
  }
}
test("current inactive assignee remains selected for unrelated follow-up updates", async () =>
  render(async (ui, s) => {
    const select = ui.host.querySelector('[aria-label="Primary coach"]');
    assert.equal(select.value, "inactive");
    assert.equal(select.selectedOptions[0].disabled, true);
    assert.equal(select.selectedOptions[0].textContent, "Assigned coach (inactive)");
    await ui.act(async () => button(ui, "Save follow-up").click());
    assert.equal(s.work[0].assignee, "inactive");
    assert.equal(s.work[0].revision, 3);
  }));
test("switching to active assignee removes inactive option from new choices", async () =>
  render(async (ui) => {
    const select = ui.host.querySelector('[aria-label="Primary coach"]');
    await ui.change(select, "active");
    assert.equal(select.querySelector('option[value="inactive"]'), null);
    assert.equal(select.value, "active");
  }));
test("existing inactive appointment coach remains selected for cancellation", async () =>
  render(async (ui, s) => {
    const select = ui.host.querySelector('[aria-label="Appointment coach"]');
    assert.equal(select.value, "inactive-staff");
    assert.equal(select.selectedOptions[0].disabled, true);
    const status = [...ui.host.querySelectorAll("select")].find(
      (select) =>
        [...select.options].some((o) => o.value === "cancelled") &&
        [...select.options].some((o) => o.value === "proposed"),
    );
    assert.ok(status);
    await ui.change(status, "cancelled");
    await ui.act(async () => button(ui, "Save appointment").click());
    assert.equal(s.appointments[0].coachId, "inactive-staff");
    assert.equal(s.appointments[0].status, "cancelled");
  }));
