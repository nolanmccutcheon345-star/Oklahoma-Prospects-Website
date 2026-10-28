import test, { after } from "node:test";
import { createElement } from "react";
globalThis.__instructorCreateElement = createElement;
after(() => {
  delete globalThis.__instructorCreateElement;
});
import assert from "node:assert/strict";
import { withRendered } from "./render-component-support.mjs";
const button = (host, text) =>
  [...host.querySelectorAll("button")].find((node) => node.textContent === text);
async function click(ui, element) {
  assert.ok(element);
  await ui.act(async () => element.click());
}
async function input(ui, element, value) {
  await ui.act(async () => {
    Object.getOwnPropertyDescriptor(ui.dom.window.HTMLTextAreaElement.prototype, "value").set.call(
      element,
      value,
    );
    element.dispatchEvent(new ui.dom.window.Event("input", { bubbles: true }));
  });
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const row = (overrides) => ({
  id: "assigned",
  athlete_name: "Synthetic Athlete",
  service: "Hitting",
  starts_at: "2026-01-10T22:00:00.000Z",
  ends_at: "2026-01-10T22:30:00.000Z",
  status: "confirmed",
  recorded: false,
  has_draft: false,
  ...overrides,
});
const mocks = {
  "@/lib/operational-instruction-api": `
    export const getOperationalInstructionBookings=async()=>{const s=globalThis.instructorUi;s.reads++;if(s.load)return s.load();if(s.readError)throw Error(s.readError);return structuredClone(s.rows);};
    export const recordInstructorAttendance=async({data})=>{const s=globalThis.instructorUi;s.saves.push(structuredClone(data));if(s.save)return s.save(data);if(s.saveError)throw Error(s.saveError);s.rows=s.rows.map(r=>r.id===data.bookingId?{...r,recorded:true}:r);return {ok:true};};`,
  "../pd/booked-guided-lesson": `const createElement=globalThis.__instructorCreateElement;export function BookedGuidedLesson({bookingId,onClose}){return createElement('div',{'aria-label':'Guided draft fixture'},bookingId,createElement('button',{onClick:onClose},'Close draft'));}`,
};
const state = (overrides) => ({ rows: [row()], reads: 0, saves: [], ...overrides });
async function render(s, work) {
  globalThis.instructorUi = s;
  try {
    await withRendered(
      "src/components/commerce/operational-instructor-sessions.tsx",
      "OperationalInstructorSessions",
      {},
      mocks,
      work,
    );
  } finally {
    delete globalThis.instructorUi;
  }
}
async function fillAttendance(ui) {
  await input(ui, ui.host.querySelector("textarea"), "Synthetic attendance observation");
  await click(ui, ui.host.querySelector('input[type="checkbox"]'));
}
test("operational schedule shows empty/error/loading states and refresh recovery", async () => {
  const s = state({ rows: [] });
  await render(s, async (ui) => {
    assert.match(ui.host.textContent, /No lesson sessions/);
    s.readError = "Schedule unavailable";
    await click(ui, button(ui.host, "Refresh sessions"));
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /Schedule unavailable/);
    s.readError = "";
    s.rows = [row()];
    await click(ui, button(ui.host, "Refresh sessions"));
    assert.match(ui.host.textContent, /Synthetic Athlete/);
    assert.equal(ui.host.querySelector('[role="alert"]'), null);
  });
  const wait = deferred(),
    pending = state({ load: () => wait.promise });
  await render(pending, async (ui) => {
    assert.match(ui.host.textContent, /Loading sessions/);
    assert.equal(button(ui.host, "Refresh sessions").disabled, true);
  });
  wait.resolve([]);
  await Promise.resolve();
  assert.equal(pending.reads, 1);
});
test("actual attendance submit sends exact scoped payload and refreshes once", async () => {
  const s = state();
  await render(s, async (ui) => {
    assert.equal(button(ui.host, "Record attendance observation").type, "submit");
    assert.equal(button(ui.host, "Record attendance observation").disabled, true);
    await fillAttendance(ui);
    await click(ui, button(ui.host, "Record attendance observation"));
    assert.deepEqual(s.saves, [
      {
        bookingId: "assigned",
        expectedEndsAt: "2026-01-10T22:30:00.000Z",
        attendance: "present",
        recap: "Synthetic attendance observation",
        qualifiedReview: true,
      },
    ]);
    assert.equal(s.reads, 2);
    assert.match(ui.host.textContent, /Attendance observation recorded/);
    assert.equal(ui.host.querySelector("form"), null);
  });
});
test("pending attendance blocks repeated submissions and navigation controls", async () => {
  const wait = deferred(),
    s = state({ save: () => wait.promise });
  await render(s, async (ui) => {
    await fillAttendance(ui);
    await click(ui, button(ui.host, "Record attendance observation"));
    await click(ui, button(ui.host, "Record attendance observation"));
    assert.equal(s.saves.length, 1);
    assert.equal(button(ui.host, "Refresh sessions").disabled, true);
    assert.equal(button(ui.host, "Open guided lesson draft").disabled, true);
    assert.equal(ui.host.querySelector("textarea").disabled, true);
    await ui.act(async () => {
      s.rows = [row({ recorded: true })];
      wait.resolve({ ok: true });
      await wait.promise;
    });
    assert.equal(s.reads, 2);
    assert.match(ui.host.textContent, /Attendance observation recorded/);
  });
});
test("attendance failure keeps entered observation and permits retry", async () => {
  const s = state({ saveError: "Observation could not save" });
  await render(s, async (ui) => {
    await fillAttendance(ui);
    await click(ui, button(ui.host, "Record attendance observation"));
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /could not save/);
    assert.equal(ui.host.querySelector("textarea").value, "Synthetic attendance observation");
    assert.equal(ui.host.querySelector('input[type="checkbox"]').checked, true);
    s.saveError = "";
    await click(ui, button(ui.host, "Record attendance observation"));
    assert.equal(s.saves.length, 2);
    assert.equal(s.reads, 2);
  });
});
test("future, recorded and unpublished-guided lessons have explicit attendance guards", async () => {
  for (const [override, copy] of [
    [{ ends_at: "2099-01-01T22:30:00.000Z" }, /after this lesson ends/],
    [{ recorded: true }, /Attendance observation recorded/],
    [{ has_draft: true }, /guided draft needs owner review/],
  ])
    await render(state({ rows: [row(override)] }), async (ui) => {
      assert.match(ui.host.textContent, copy);
      assert.equal(ui.host.querySelector("form"), null);
    });
});
test("guided draft open-close refreshes only the scoped schedule and mounts no legacy controls", async () => {
  const s = state();
  await render(s, async (ui) => {
    assert.equal(ui.host.querySelector('[aria-label="Guided draft fixture"]'), null);
    assert.equal(button(ui.host, "Complete Lesson & Share Recap"), undefined);
    assert.equal(ui.host.querySelector('a[href="/my-profile"]'), null);
    await click(ui, button(ui.host, "Open guided lesson draft"));
    assert.match(
      ui.host.querySelector('[aria-label="Guided draft fixture"]').textContent,
      /assigned/,
    );
    await click(ui, button(ui.host, "Close draft"));
    assert.equal(ui.host.querySelector('[aria-label="Guided draft fixture"]'), null);
    assert.equal(s.reads, 2);
  });
});
test("unmounted attendance completion does not request stale refresh", async () => {
  const wait = deferred(),
    s = state({ save: () => wait.promise });
  await render(s, async (ui) => {
    await fillAttendance(ui);
    await click(ui, button(ui.host, "Record attendance observation"));
    assert.equal(s.saves.length, 1);
  });
  wait.resolve({ ok: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.reads, 1);
});
const instruction = (overrides) => ({
  revision: 7,
  active: false,
  canManage: true,
  canSuspend: false,
  blockers: [],
  ...overrides,
});
async function renderAccess(info, work) {
  const saved = [];
  await withRendered(
    "src/components/coordinator/organization-instruction-access.tsx",
    "OrganizationInstructionAccess",
    {
      userId: "trainee",
      instruction: info,
      busy: false,
      onSave: async (data) => {
        saved.push(data);
      },
    },
    {},
    (ui) => work(ui, saved),
  );
}
test("operational instructor access actual click submits revision and reason only", async () => {
  await renderAccess(instruction(), async (ui, saved) => {
    await click(ui, ui.host.querySelector('[name="instructionActive"]'));
    await input(ui, ui.host.querySelector("textarea"), "Assign synthetic instructional workflow");
    assert.equal(button(ui.host, "Save instructor access").type, "submit");
    await click(ui, button(ui.host, "Save instructor access"));
    assert.deepEqual(saved, [
      {
        userId: "trainee",
        revision: 7,
        active: true,
        reason: "Assign synthetic instructional workflow",
      },
    ]);
  });
});
test("protected instructor controls are disabled with readable blockers", async () => {
  await renderAccess(
    instruction({
      canManage: false,
      blockers: ["Owner and administrator accounts are protected."],
    }),
    async (ui, saved) => {
      assert.match(ui.host.textContent, /Owner and administrator/);
      assert.equal(ui.host.querySelector("fieldset").disabled, true);
      assert.equal(button(ui.host, "Save instructor access").disabled, true);
      await click(ui, button(ui.host, "Save instructor access"));
      assert.deepEqual(saved, []);
    },
  );
});
test("suspension-only access cannot re-enable an identity-drifted account", async () => {
  await renderAccess(
    instruction({
      active: true,
      canManage: false,
      canSuspend: true,
      blockers: ["Instructor identity changed."],
    }),
    async (ui, saved) => {
      assert.equal(button(ui.host, "Save instructor access").disabled, true);
      await click(ui, ui.host.querySelector('[name="instructionActive"]'));
      assert.equal(ui.host.querySelector('[name="instructionActive"]').disabled, true);
      await input(ui, ui.host.querySelector("textarea"), "Suspend changed synthetic identity");
      await click(ui, button(ui.host, "Save instructor access"));
      assert.equal(saved.length, 1);
      assert.equal(saved[0].active, false);
    },
  );
});
const routeMocks = {
  "@tanstack/react-router": `export const createFileRoute=()=>options=>options.component;`,
  "@/lib/auth/use-current-user": `export const useCurrentUserState=()=>({user:{id:'trainee'},isPending:false});`,
  "@/lib/auth/gates": `export function RedirectToSignIn(){return null;}`,
  "@/lib/operational-instruction-api": `export const getOperationalInstructionEntry=async()=>{const s=globalThis.instructorRoute;if(s.error)throw Error(s.error);return {operationalOnly:s.operationalOnly};};`,
  "@/lib/person-api": `export const getMyPerson=async()=>{globalThis.instructorRoute.personReads++;return {value:{instructor:true},canManage:false};};`,
  "@/components/commerce/operational-instructor-sessions": `const createElement=globalThis.__instructorCreateElement;export const OperationalInstructorSessions=()=>createElement('p',null,'Operational sessions fixture');`,
  "@/components/commerce/coach-sessions": `const createElement=globalThis.__instructorCreateElement;export const CoachSessions=()=>createElement('p',null,'Legacy paid sessions fixture');`,
  "@/components/commerce/coach-profile": `const createElement=globalThis.__instructorCreateElement;export const CoachProfile=()=>createElement('p',null,'Legacy profile fixture');`,
  "@/components/finance/my-finance": `const createElement=globalThis.__instructorCreateElement;export const MyFinance=()=>createElement('p',null,'Financial fixture');`,
};
async function renderRoute(value, work) {
  globalThis.instructorRoute = { personReads: 0, ...value };
  try {
    await withRendered("src/routes/instructor.tsx", "Route", {}, routeMocks, (ui) =>
      work(ui, globalThis.instructorRoute),
    );
  } finally {
    delete globalThis.instructorRoute;
  }
}
test("operational instructor route omits financial and legacy profile workspaces", async () => {
  await renderRoute({ operationalOnly: true }, async (ui, s) => {
    assert.match(ui.host.textContent, /Operational sessions fixture/);
    assert.doesNotMatch(
      ui.host.textContent,
      /Financial fixture|Legacy paid sessions|Legacy profile/,
    );
    assert.equal(s.personReads, 0);
    assert.equal(ui.host.querySelector('a[href="/my-profile"]'), null);
  });
});
test("genuine legacy instructor route retains existing finance and instructor controls", async () => {
  await renderRoute({ operationalOnly: false }, async (ui, s) => {
    assert.match(ui.host.textContent, /Legacy paid sessions fixture/);
    assert.match(ui.host.textContent, /Financial fixture/);
    assert.match(ui.host.textContent, /Legacy profile fixture/);
    assert.equal(s.personReads, 1);
    assert.ok(ui.host.querySelector('a[href="/my-profile"]'));
  });
});
test("instructor entry failure does not fall through to legacy financial workspace", async () => {
  await renderRoute({ error: "Instructor entry unavailable" }, async (ui, s) => {
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /entry unavailable/);
    assert.equal(s.personReads, 0);
    assert.doesNotMatch(ui.host.textContent, /Financial fixture|Operational sessions fixture/);
  });
});
