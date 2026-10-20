import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "../../../scripts/render-component-support.mjs";
const mocks = {
  "@/lib/coordinator/api": `export const getCoordinatorProgramEvents=x=>globalThis.programFixture.read(x);export const createCoordinatorProgramEvent=x=>globalThis.programFixture.create(x);export const saveCoordinatorProgramEvent=()=>{throw Error('unexpected mutation')};export const addCoordinatorProgramSession=()=>{};export const moveCoordinatorProgramSession=()=>{};export const saveCoordinatorProgramEnrollment=()=>{};export const requestCoordinatorApproval=()=>{};`,
};
const empty = {
  items: [],
  nextCursor: null,
  athletes: [],
  coaches: [{ id: "coach", name: "Synthetic instructor" }],
};
test("program event UI waits for a team, respects view-only controls, and exposes read failures", async () => {
  let calls = 0;
  globalThis.programFixture = {
    read: async () => {
      calls++;
      return empty;
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/program-events.tsx",
      "ProgramEvents",
      { teamId: "", allowed: () => true },
      mocks,
      async ({ host }) => {
        assert.match(host.textContent, /Select an authorized team/);
        assert.equal(calls, 0);
      },
    );
    await withRendered(
      "src/components/coordinator/program-events.tsx",
      "ProgramEvents",
      { teamId: "soft", allowed: (p) => p === "events.read" },
      mocks,
      async ({ host, act }) => {
        assert.equal(host.querySelector("form"), null);
        assert.match(host.textContent, /No authorized events/);
        globalThis.programFixture.read = async () => {
          throw Error("Access revoked");
        };
        await act(async () => host.querySelector("button").click());
        assert.match(host.querySelector('[role="alert"]').textContent, /Access revoked/);
        assert.doesNotMatch(host.textContent, /No authorized events/);
      },
    );
  } finally {
    delete globalThis.programFixture;
  }
});
test("event creation retains its retry identity after uncertain failure and never sends publication or finance fields", async () => {
  const previousForm = globalThis.FormData,
    calls = [];
  globalThis.programFixture = {
    read: async () => empty,
    create: async (input) => {
      calls.push(input);
      if (calls.length === 1) throw Error("Uncertain response; refresh and retry");
      return { ok: true };
    },
  };
  try {
    await withRendered(
      "src/components/coordinator/program-events.tsx",
      "ProgramEvents",
      { teamId: "soft", allowed: (p) => p === "camps.create" },
      mocks,
      async ({ host, act, dom }) => {
        globalThis.FormData = dom.window.FormData;
        const submit = async () => {
          const form = host.querySelector("form");
          for (const [key, value] of Object.entries({
            name: "Synthetic camp",
            description: "Safe skill development",
            location: "Facility",
            capacity: "10",
            reason: "Create scoped program",
          }))
            form.querySelector(`[name="${key}"]`).value = value;
          form.querySelector('[name="coaches"]').checked = true;
          await act(async () => form.querySelector('button[type="submit"]').click());
        };
        await submit();
        assert.match(host.querySelector('[role="alert"]').textContent, /Uncertain/);
        await act(async () => host.querySelector("button").click());
        await submit();
        assert.equal(calls.length, 2);
        assert.deepEqual(calls[0], calls[1]);
        assert.equal(calls[1].data.teamId, "soft");
        assert.equal(calls[1].data.type, "camp");
        assert.equal(calls[1].data.publication, undefined);
        assert.equal(calls[1].data.price, undefined);
        assert.equal(calls[1].data.sport, undefined);
        assert.match(host.textContent, /Private event draft created/);
      },
    );
  } finally {
    globalThis.FormData = previousForm;
    delete globalThis.programFixture;
  }
});
