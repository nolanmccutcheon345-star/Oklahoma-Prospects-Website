import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "./render-component-support.mjs";
const profile = {
  bio: "Safe biography",
  photo: "",
  school: "School",
  gradYear: "2029",
  city: "",
  positions: "",
  bats: "",
  throws: "",
  height: "",
  weight: "",
  gpa: "",
  commitment: "",
  video: "",
};
const data = () => ({
  actorId: "sara",
  owner: false,
  sourceRevision: 7,
  athletes: [
    { id: "athlete", name: "Synthetic Athlete" },
    { id: "new", name: "New Athlete" },
  ],
  drafts: [
    {
      id: "draft",
      sport: "baseball",
      teamId: "",
      title: "Safe draft",
      body: "Operational body",
      status: "draft",
      revision: 2,
      authorId: "other",
      authorName: "Other",
      lastEditorId: "other",
      approvalRevision: null,
    },
  ],
  profiles: [
    {
      athleteId: "athlete",
      name: "Synthetic Athlete",
      revision: 3,
      profile,
      published: true,
      consentCurrent: true,
    },
  ],
  metrics: [
    {
      id: "metric",
      athleteId: "athlete",
      playerName: "Synthetic Athlete",
      revision: 4,
      metric: "pitchVelocity",
      value: 70,
      measuredOn: "2026-01-01",
      status: "pending",
      detail: {
        evidence: "https://example.invalid/evidence",
        method: "",
        reviewNote: "",
        verifierName: "",
      },
    },
  ],
  documents: [
    {
      id: "doc",
      athleteId: "athlete",
      name: "Safe document",
      kind: "Training",
      date: "2026-01-01",
      sourceRevision: 7,
      sourceDigest: "a".repeat(64),
    },
  ],
  withheld: { drafts: 1, profiles: 1, metrics: 1, documents: 1 },
});
const methods = [
  "classifyOrganizationContent",
  "saveOrganizationEditorialDraft",
  "decideOrganizationEditorialDraft",
  "saveOrganizationRecruitingProfile",
  "saveOrganizationRecruitingMetric",
  "reviewOrganizationRecruitingMetric",
  "saveOrganizationDocumentMetadata",
];
const mocks = {
  "@/lib/coordinator/organization-communications-api": `export const getOrganizationContent=async()=>{const s=globalThis.contentUi;s.reads++;if(s.failRead)throw Error('Refresh unavailable');return structuredClone(s.data);};export const getOrganizationContentReview=async()=>{globalThis.contentUi.reviews++;return structuredClone(globalThis.contentUi.sources);};${methods.map((name) => `export const ${name}=async({data})=>{const s=globalThis.contentUi;s.calls.push({name:'${name}',data:structuredClone(data)});if(s.gate)await s.gate;if(s.failSave)throw Error('Revision changed');return {ok:true};};`).join("")}`,
};
const button = (ui, text) =>
  [...ui.host.querySelectorAll("button")].find((b) => b.textContent === text);
async function click(ui, text) {
  const b = button(ui, text);
  assert.ok(b, text);
  await ui.act(async () => b.click());
}
async function type(ui, el, value) {
  assert.ok(el);
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
async function submit(ui, label) {
  const form = ui.host.querySelector(`form[aria-label="${label}"]`);
  assert.ok(form);
  await ui.act(async () =>
    form.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true })),
  );
}
async function render(work, overrides = {}) {
  globalThis.contentUi = {
    data: { ...data(), ...overrides },
    calls: [],
    reads: 0,
    reviews: 0,
    sources: [
      {
        kind: "pd-document",
        id: "doc",
        revision: 7,
        sourceDigest: "a".repeat(64),
        content: { name: "Reviewed metadata", kind: "Training", date: "2026-01-01" },
      },
    ],
  };
  try {
    await withRendered(
      "src/components/coordinator/organization-content.tsx",
      "OrganizationContent",
      {},
      mocks,
      (ui) => work(ui, globalThis.contentUi),
    );
  } finally {
    delete globalThis.contentUi;
  }
}
test("editorial edit submits exact CAS/scope and locks dirty navigation until save", async () =>
  render(async (ui, s) => {
    await ui.change(ui.host.querySelector("select"), "draft");
    await type(ui, ui.host.querySelector('[name="title"]'), "Updated safe draft");
    assert.equal(button(ui, "Recruiting profiles").disabled, true);
    assert.equal(button(ui, "Refresh content").disabled, true);
    await click(ui, "Submit for editorial review");
    assert.deepEqual(s.calls[0], {
      name: "saveOrganizationEditorialDraft",
      data: {
        id: "draft",
        revision: 2,
        sport: "baseball",
        teamId: "",
        title: "Updated safe draft",
        body: "Operational body",
        submit: true,
      },
    });
    assert.equal(s.reads, 2);
    assert.equal(button(ui, "Recruiting profiles").disabled, false);
  }));
test("submitted drafts are readonly; independent editorial decision includes both revisions", async () =>
  render(
    async (ui, s) => {
      await ui.change(ui.host.querySelector("select"), "draft");
      assert.equal(ui.host.querySelector("fieldset").disabled, true);
      assert.ok(ui.host.textContent.includes("does not publish"));
      await type(
        ui,
        ui.host.querySelector('form[aria-label="Editorial decision"] textarea'),
        "Reviewed editorial content",
      );
      await click(ui, "Approve editorial draft");
      assert.deepEqual(s.calls[0].data, {
        id: "draft",
        revision: 2,
        approvalRevision: 3,
        decision: "approved",
        reason: "Reviewed editorial content",
      });
    },
    { drafts: [{ ...data().drafts[0], status: "submitted", approvalRevision: 3 }] },
  ));
test("authors cannot self-review in UI and withheld narratives are not mounted", async () => {
  await render(
    async (ui) => {
      await ui.change(ui.host.querySelector("select"), "draft");
      assert.equal(ui.host.querySelector('form[aria-label="Editorial decision"]'), null);
    },
    {
      drafts: [{ ...data().drafts[0], status: "submitted", authorId: "sara", approvalRevision: 3 }],
    },
  );
  await render(
    async (ui) => {
      await click(ui, "Recruiting profiles");
      assert.equal(ui.host.querySelector('[name="bio"]'), null);
      assert.ok(ui.host.textContent.includes("withheld until an owner"));
    },
    { profiles: [{ ...data().profiles[0], profile: null }] },
  );
});
test("profile edit never submits guardian consent or publishing controls", async () =>
  render(async (ui, s) => {
    await click(ui, "Recruiting profiles");
    await type(ui, ui.host.querySelector('[name="bio"]'), "New safe biography");
    await submit(ui, "Recruiting profile");
    assert.deepEqual(Object.keys(s.calls[0].data).sort(), ["athleteId", "profile", "revision"]);
    assert.equal(s.calls[0].data.revision, 3);
    assert.equal(s.calls[0].data.profile.bio, "New safe biography");
    assert.equal(ui.host.querySelector('[name="consent"]'), null);
  }));
test("measurement details initialize accurately and dirty edit cannot discard changes through review", async () =>
  render(async (ui, s) => {
    await click(ui, "Recruiting measurements");
    assert.equal(ui.host.querySelector('[name="value"]').value, "70");
    await type(ui, ui.host.querySelector('[name="value"]'), "75");
    assert.equal(button(ui, "Reject measurement").disabled, true);
    await submit(ui, "Recruiting measurement");
    assert.equal(s.calls[0].name, "saveOrganizationRecruitingMetric");
    assert.equal(s.calls[0].data.value, 75);
    assert.equal(s.calls[0].data.revision, 4);
  }));
test("measurement review uses revision and blocks simultaneous measurement save", async () =>
  render(async (ui, s) => {
    await click(ui, "Recruiting measurements");
    const form = ui.host.querySelector('form[aria-label="Measurement review"]');
    await type(ui, form.querySelector("textarea"), "Measured in person");
    assert.equal(
      ui.host.querySelector('form[aria-label="Recruiting measurement"] fieldset').disabled,
      true,
    );
    await submit(ui, "Recruiting measurement");
    assert.equal(s.calls.length, 0);
    await click(ui, "Verify measurement");
    assert.deepEqual(s.calls[0].data, {
      id: "metric",
      revision: 4,
      approve: true,
      method: "Measured in person",
      note: "",
    });
  }));
test("document metadata sends only exact existing source and reviewed fields", async () =>
  render(async (ui, s) => {
    await click(ui, "Document metadata");
    assert.ok(ui.host.textContent.includes("No file upload"));
    assert.equal(ui.host.querySelector('input[type="file"]'), null);
    await type(ui, ui.host.querySelector('[name="name"]'), "Renamed metadata");
    await submit(ui, "Document metadata");
    assert.deepEqual(s.calls[0].data, { ...data().documents[0], name: "Renamed metadata" });
  }));
test("classification requires owner UI, explicit confirmation and exact revision digest", async () => {
  await render(async (ui) => assert.equal(button(ui, "Review withheld content"), undefined));
  await render(
    async (ui, s) => {
      await click(ui, "Review withheld content");
      assert.equal(s.reviews, 1);
      assert.equal(button(ui, "Classify reviewed content").disabled, true);
      await type(
        ui,
        ui.host.querySelector('form[aria-label="Owner content classification"] textarea'),
        "Reviewed safe operational metadata",
      );
      await ui.act(async () =>
        ui.host
          .querySelector('form[aria-label="Owner content classification"] input[type="checkbox"]')
          .click(),
      );
      await submit(ui, "Owner content classification");
      assert.deepEqual(s.calls[0].data, {
        kind: "pd-document",
        id: "doc",
        revision: 7,
        sourceDigest: "a".repeat(64),
        confirmed: true,
        reason: "Reviewed safe operational metadata",
      });
    },
    { owner: true },
  );
});
test("mutation busy lock prevents duplicate submits and source switching", async () =>
  render(async (ui, s) => {
    let release;
    s.gate = new Promise((resolve) => (release = resolve));
    await click(ui, "Recruiting profiles");
    await submit(ui, "Recruiting profile");
    assert.equal(button(ui, "Document metadata").disabled, true);
    await submit(ui, "Recruiting profile");
    assert.equal(s.calls.length, 1);
    await ui.act(async () => release());
    assert.equal(s.reads, 2);
  }));
test("refresh failure after mutation removes stale forms and explains saved outcome", async () =>
  render(async (ui, s) => {
    await click(ui, "Document metadata");
    s.failRead = true;
    await submit(ui, "Document metadata");
    assert.equal(s.calls.length, 1);
    assert.equal(ui.host.querySelector("form"), null);
    assert.ok(ui.host.textContent.includes("Changes saved. Refresh before editing again."));
  }));
