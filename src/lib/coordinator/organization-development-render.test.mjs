import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";

const mock = {
  "@/lib/coordinator/organization-development-api": `
    export const getOrganizationDevelopment = () => globalThis.developmentUi.load();
    export const saveOrganizationDevelopmentProfile = ({data}) => globalThis.developmentUi.profile(data);
    export const saveOrganizationDevelopmentMetric = ({data}) => globalThis.developmentUi.metric(data);
    export const assignOrganizationDevelopmentDay = ({data}) => globalThis.developmentUi.day(data);
    export const reviewOrganizationDevelopmentCurriculum = ({data}) => globalThis.developmentUi.review(data);
  `,
};
const drill = {
  id: "baseball-drill",
  version: "v2",
  name: "Synthetic tee drill",
  discipline: "Hitting",
  sports: ["Baseball"],
  purpose: "Repeat measured contact",
  equipment: "Synthetic tee",
  steps: ["Prepare a clear lane", "Hold a balanced finish"],
  cue: "Synthetic cue",
  correction: "Synthetic correction",
  regression: "Synthetic regression",
  progression: "Synthetic progression",
  measure: "Synthetic measurement",
  minimumSkill: 1,
  minAge: 8,
  supervision: "Synthetic supervision",
  safety: "Synthetic safety",
  dose: "Qualified volume selection",
  review: "qualified coach review required",
  provenance: "Synthetic provenance",
  demoUrl: null,
};
function fixture() {
  return {
    revision: 12,
    athletes: [
      {
        athleteId: "athlete-1",
        revision: 4,
        name: "Synthetic Baseball Athlete",
        sport: "baseball",
        position: "Pitcher",
        throws: "R",
        bats: "L",
        graduationYear: 2030,
        school: "Synthetic school",
        city: "Synthetic city",
        profileEditable: true,
      },
      {
        athleteId: "athlete-2",
        revision: 2,
        name: "Synthetic Softball Athlete",
        sport: "softball",
        position: "",
        throws: "",
        bats: "",
        graduationYear: 0,
        school: "",
        city: "",
        profileEditable: false,
      },
    ],
    metrics: [
      { id: "metric-1", athleteId: "athlete-1", kind: "velocity", date: "2030-05-01", value: 62 },
    ],
    sessionMetrics: [
      {
        id: "session-1",
        athleteId: "athlete-1",
        track: "Hitting",
        day: "2030-05-02",
        successes: 7,
        attempts: 10,
        verified: false,
      },
    ],
    days: [
      {
        athleteId: "athlete-1",
        day: "2030-05-15",
        items: [{ id: "existing-1", track: "Hitting", sets: 2, reps: 5 }],
      },
    ],
    assignments: [
      {
        id: "assignment-1",
        athleteId: "athlete-1",
        revision: 3,
        status: "active",
        sport: "Baseball",
        discipline: "Hitting",
        startDate: "2030-05-01",
        reviewDate: "2030-06-01",
        phase: 1,
        tasks: [{ id: "task-1", drillId: drill.id, date: "2030-05-03", phase: 1 }],
      },
    ],
    curriculum: {
      drills: [
        drill,
        { ...drill, id: "second-drill", name: "Synthetic balance drill" },
        { ...drill, id: "advanced-drill", name: "Synthetic advanced drill", minimumSkill: 3 },
        { ...drill, id: "retired-drill", name: "Retired drill" },
        { ...drill, id: "softball-drill", name: "Softball drill", sports: ["Softball"] },
      ],
      programs: [
        {
          id: "program-1",
          version: "v3",
          name: "Synthetic program",
          sport: "Baseball",
          discipline: "Hitting",
          minAge: 8,
          minimumSkill: 1,
          objective: "Program objective",
          baseline: "Program baseline",
          equipment: "Program equipment",
          phases: [
            {
              name: "Foundation",
              drillIds: [drill.id],
              checkpoint: "Program checkpoint",
              regression: "Program regression",
            },
          ],
          frequency: "Program frequency",
          recovery: "Program recovery",
          completion: "Program completion",
          next: "Program next",
          keywords: ["contact", "balance"],
        },
      ],
      controls: [
        {
          kind: "drill",
          id: "retired-drill",
          version: "v1",
          revision: 2,
          status: "retired",
          recommended: false,
        },
        {
          kind: "program",
          id: "program-1",
          version: "v3",
          revision: 7,
          status: "review-required",
          recommended: false,
        },
      ],
    },
  };
}
const button = (host, text) =>
  [...host.querySelectorAll("button")].find((node) => node.textContent === text);
const control = (host, text) =>
  [...host.querySelectorAll("label")]
    .find((node) => node.textContent.trim().startsWith(text))
    ?.querySelector("input,select,textarea");
async function inputText(act, dom, input, value) {
  await act(async () => {
    const prototype =
      input.tagName === "TEXTAREA"
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function submit(act, dom, form, times = 1) {
  await act(async () => {
    for (let i = 0; i < times; i++)
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  });
}
const render = (work, props = {}) =>
  withRendered(
    "src/components/coordinator/organization-development.tsx",
    "OrganizationDevelopment",
    props,
    mock,
    work,
  );

test("development profiles and metrics use allowlisted revisioned writes and prevent double submission", async () => {
  const workspace = fixture(),
    profiles = [],
    metrics = [];
  let finish,
    callbacks = 0;
  globalThis.developmentUi = {
    load: async () => structuredClone(workspace),
    profile: async (input) => {
      profiles.push(input);
      await new Promise((resolve) => {
        finish = resolve;
      });
      workspace.athletes[0] = { ...workspace.athletes[0], ...input, revision: input.revision + 1 };
    },
    metric: async (input) => {
      metrics.push(input);
      workspace.metrics[0] = { ...input };
      workspace.revision++;
    },
  };
  try {
    await render(
      async ({ host, act, dom, change }) => {
        assert.equal(control(host, "Athlete name").readOnly, true);
        assert.equal(control(host, "Recorded sport").readOnly, true);
        assert.match(host.textContent, /7 successes \/ 10 attempts · Unverified/);
        assert.match(host.textContent, /Historical narrative and clinical notes are withheld/);
        assert.doesNotMatch(host.innerHTML, /priceCents|profit_split|instructorId|billing|roleId/);
        await inputText(act, dom, control(host, "Position"), "Shortstop");
        await submit(act, dom, button(host, "Save Athlete Profile").closest("form"), 2);
        assert.equal(profiles.length, 1);
        assert.equal(button(host, "Reload Development Records").disabled, true);
        assert.equal(button(host, "Curriculum Standards").disabled, true);
        assert.deepEqual(
          Object.keys(profiles[0]).sort(),
          [
            "athleteId",
            "revision",
            "position",
            "throws",
            "bats",
            "graduationYear",
            "school",
            "city",
          ].sort(),
        );
        assert.equal(profiles[0].revision, 4);
        assert.equal(profiles[0].position, "Shortstop");
        await act(async () => finish());
        assert.match(host.textContent, /Athlete profile saved/);
        assert.equal(callbacks, 1);
        await change(control(host, "Measurement to edit"), "metric-1");
        await change(control(host, "Metric type"), "spin");
        await inputText(act, dom, control(host, "Measured value"), "-1");
        await submit(act, dom, button(host, "Save Measurement").closest("form"));
        assert.equal(metrics.length, 0);
        assert.match(host.textContent, /measured value within the metric range/);
        await inputText(act, dom, control(host, "Measured value"), "1500");
        await submit(act, dom, button(host, "Save Measurement").closest("form"));
        assert.equal(metrics.length, 1);
        assert.deepEqual(metrics[0], {
          id: "metric-1",
          athleteId: "athlete-1",
          revision: 12,
          kind: "spin",
          date: "2030-05-01",
          value: 1500,
        });
        assert.match(host.textContent, /1500 rpm/);
        await change(control(host, "Athlete"), "athlete-2");
        assert.match(host.textContent, /profile needs owner review/);
        assert.equal(control(host, "Position").matches(":disabled"), true);
        assert.equal(button(host, "Save Athlete Profile"), undefined);
        assert.doesNotMatch(host.textContent, /1500 rpm|7 successes/);
      },
      {
        onSaved: () => {
          callbacks++;
        },
      },
    );
  } finally {
    delete globalThis.developmentUi;
  }
});

test("new daily plans filter sport, reviewed skill and retirement, preserve days and require explicit rest and review", async () => {
  const workspace = fixture(),
    days = [];
  globalThis.developmentUi = {
    load: async () => structuredClone(workspace),
    day: async (input) => {
      days.push(input);
      workspace.days.push({
        athleteId: input.athleteId,
        day: input.day,
        items: input.items.map((item) => ({ ...item, track: "Hitting" })),
      });
      workspace.revision++;
    },
  };
  try {
    await render(async ({ host, act, dom, change }) => {
      assert.equal(control(host, "Reviewed athlete skill").value, "");
      assert.equal(control(host, "Drill 1").disabled, true);
      assert.equal(button(host, "Assign New Training Day").disabled, true);
      await change(control(host, "Reviewed athlete skill"), "beginner");
      assert.match(
        host.textContent,
        /No available drills match this sport and reviewed skill level/,
      );
      await change(control(host, "Reviewed athlete skill"), "developing");
      const options = [...control(host, "Drill 1").options].map((option) => option.value);
      assert.deepEqual(options, ["baseball-drill", "second-drill"]);
      assert.match(host.textContent, /Synthetic safety/);
      assert.equal(control(host, "Rest between sets (seconds) for drill 1").value, "");
      await inputText(act, dom, control(host, "Training day"), "2030-05-15");
      assert.equal(button(host, "Assign New Training Day").disabled, true);
      await submit(act, dom, button(host, "Assign New Training Day").closest("form"));
      assert.equal(days.length, 0);
      await inputText(act, dom, control(host, "Training day"), "2030-05-16");
      await inputText(act, dom, control(host, "Sets for drill 1"), "2");
      await inputText(act, dom, control(host, "Reps per set for drill 1"), "5");
      await inputText(act, dom, control(host, "Rest between sets (seconds) for drill 1"), "45");
      await act(async () => button(host, "Add Another Drill").click());
      await change(control(host, "Drill 2"), "second-drill");
      await inputText(act, dom, control(host, "Sets for drill 2"), "1");
      await inputText(act, dom, control(host, "Reps per set for drill 2"), "4");
      await submit(act, dom, button(host, "Assign New Training Day").closest("form"));
      assert.equal(days.length, 0);
      await act(async () => control(host, "I am qualified to assign").click());
      await submit(act, dom, button(host, "Assign New Training Day").closest("form"));
      assert.equal(days.length, 0, "Missing rest seconds must block a manually submitted form");
      await inputText(act, dom, control(host, "Rest between sets (seconds) for drill 2"), "90");
      assert.equal(control(host, "I am qualified to assign").checked, false);
      await act(async () => control(host, "I am qualified to assign").click());
      await inputText(act, dom, control(host, "Training day"), "2030-05-17");
      assert.equal(control(host, "I am qualified to assign").checked, false);
      await inputText(act, dom, control(host, "Training day"), "2030-05-16");
      await act(async () => control(host, "I am qualified to assign").click());
      await submit(act, dom, button(host, "Assign New Training Day").closest("form"), 2);
      assert.equal(days.length, 1);
      assert.equal(days[0].qualifiedReview, true);
      assert.equal(days[0].day, "2030-05-16");
      assert.equal(days[0].athleteId, "athlete-1");
      assert.equal(days[0].skill, "developing");
      assert.deepEqual(
        days[0].items.map(({ drillId, version, sets, reps, restSeconds }) => ({
          drillId,
          version,
          sets,
          reps,
          restSeconds,
        })),
        [
          { drillId: "baseball-drill", version: "v2", sets: 2, reps: 5, restSeconds: 45 },
          { drillId: "second-drill", version: "v2", sets: 1, reps: 4, restSeconds: 90 },
        ],
      );
      assert.notEqual(days[0].items[0].id, days[0].items[1].id);
      assert.match(host.textContent, /New daily training plan assigned/);
      assert.equal(workspace.days[0].day, "2030-05-15");
      assert.equal(workspace.days[0].items[0].reps, 5);
    });
  } finally {
    delete globalThis.developmentUi;
  }
});

test("daily plan skill changes and published version changes require a fresh qualified review", async () => {
  const workspace = fixture();
  globalThis.developmentUi = { load: async () => structuredClone(workspace) };
  try {
    await render(async ({ host, act, dom, change }) => {
      await change(control(host, "Reviewed athlete skill"), "advanced");
      await change(control(host, "Drill 1"), "advanced-drill");
      await inputText(act, dom, control(host, "Sets for drill 1"), "2");
      await inputText(act, dom, control(host, "Reps per set for drill 1"), "5");
      await inputText(act, dom, control(host, "Rest between sets (seconds) for drill 1"), "60");
      await act(async () => control(host, "I am qualified to assign").click());
      await change(control(host, "Reviewed athlete skill"), "developing");
      assert.equal(control(host, "Drill 1").value, "baseball-drill");
      assert.equal(control(host, "Sets for drill 1").value, "");
      assert.equal(control(host, "Rest between sets (seconds) for drill 1").value, "");
      assert.equal(control(host, "I am qualified to assign").checked, false);
      await act(async () => control(host, "I am qualified to assign").click());
      workspace.curriculum.drills[0] = { ...workspace.curriculum.drills[0], version: "v3" };
      await act(async () => button(host, "Reload Development Records").click());
      assert.equal(control(host, "Reviewed athlete skill").value, "");
      assert.equal(control(host, "I am qualified to assign").checked, false);
      await change(control(host, "Reviewed athlete skill"), "developing");
      assert.match(host.textContent, /Version v3/);
    });
  } finally {
    delete globalThis.developmentUi;
  }
});

test("curriculum review displays complete program and drill content and submits versioned qualified decisions", async () => {
  const workspace = fixture(),
    reviews = [];
  globalThis.developmentUi = {
    load: async () => structuredClone(workspace),
    review: async (input) => {
      reviews.push(input);
      workspace.curriculum.controls[1] = { ...input, revision: input.revision + 1 };
    },
  };
  try {
    await render(async ({ host, act, dom, change }) => {
      await act(async () => button(host, "Curriculum Standards").click());
      for (const value of [
        drill.purpose,
        drill.equipment,
        ...drill.steps,
        drill.cue,
        drill.correction,
        drill.regression,
        drill.progression,
        drill.measure,
        drill.supervision,
        drill.safety,
        drill.dose,
        drill.review,
        drill.provenance,
      ])
        assert.ok(host.textContent.includes(value), value);
      await change(control(host, "Content to review"), "program:program-1");
      for (const value of [
        "Program objective",
        "Program baseline",
        "Program equipment",
        "Foundation",
        "Program checkpoint",
        "Program regression",
        "Program frequency",
        "Program recovery",
        "Program completion",
        "Program next",
        "Synthetic safety",
      ])
        assert.ok(host.textContent.includes(value), value);
      assert.equal(control(host, "Mark approved version").disabled, true);
      await change(control(host, "Academy content decision"), "approved");
      await act(async () => control(host, "Mark approved version").click());
      await inputText(
        act,
        dom,
        control(host, "Reviewer qualifications"),
        "Qualified synthetic reviewer checked the complete content and prerequisites.",
      );
      await submit(act, dom, button(host, "Save Academy Content Decision").closest("form"));
      assert.equal(reviews.length, 0);
      await act(async () => control(host, "I am qualified to review").click());
      await submit(act, dom, button(host, "Save Academy Content Decision").closest("form"), 2);
      assert.equal(reviews.length, 1);
      assert.deepEqual(
        Object.keys(reviews[0]).sort(),
        [
          "kind",
          "id",
          "version",
          "revision",
          "status",
          "recommended",
          "reason",
          "qualifiedReview",
        ].sort(),
      );
      assert.equal(reviews[0].kind, "program");
      assert.equal(reviews[0].id, "program-1");
      assert.equal(reviews[0].version, "v3");
      assert.equal(reviews[0].revision, 7);
      assert.equal(reviews[0].recommended, true);
      assert.equal(reviews[0].qualifiedReview, true);
      assert.match(host.textContent, /Academy content decision saved/);
      assert.equal(control(host, "Content to review").value, "program:program-1");
      assert.match(host.textContent, /Academy recommended/);
    });
  } finally {
    delete globalThis.developmentUi;
  }
});

test("conflicts retain drafts, reload revocation removes records, and loading and empty states recover", async () => {
  const workspace = fixture();
  let resolveLoad,
    deferred = true,
    denied = false,
    empty = false;
  globalThis.developmentUi = {
    load: () => {
      if (deferred)
        return new Promise((resolve) => {
          resolveLoad = resolve;
        });
      if (denied) return Promise.reject(new Error("Development access removed."));
      return Promise.resolve(
        empty
          ? { ...fixture(), athletes: [], curriculum: { drills: [], programs: [], controls: [] } }
          : structuredClone(workspace),
      );
    },
    profile: async () => {
      throw new Error("This profile changed. Reload before saving.");
    },
  };
  try {
    await render(async ({ host, act, dom }) => {
      assert.match(host.textContent, /Loading development records/);
      assert.equal(host.querySelector("form"), null);
      await act(async () => {
        deferred = false;
        resolveLoad(structuredClone(workspace));
      });
      await inputText(act, dom, control(host, "Position"), "Unsaved shortstop");
      await submit(act, dom, button(host, "Save Athlete Profile").closest("form"));
      assert.match(host.textContent, /This profile changed/);
      assert.equal(control(host, "Position").value, "Unsaved shortstop");
      denied = true;
      await act(async () => button(host, "Reload Development Records").click());
      assert.match(host.textContent, /Development access removed/);
      assert.equal(host.querySelector("form"), null);
      assert.doesNotMatch(host.textContent, /Synthetic Baseball Athlete|Synthetic safety/);
      denied = false;
      empty = true;
      await act(async () => button(host, "Reload Development Records").click());
      assert.match(host.textContent, /No athletes are available/);
      await act(async () => button(host, "Curriculum Standards").click());
      assert.match(host.textContent, /No published built-in drills or programs/);
      empty = false;
      await act(async () => button(host, "Reload Development Records").click());
      assert.match(host.textContent, /Synthetic tee drill/);
    });
  } finally {
    delete globalThis.developmentUi;
  }
});
