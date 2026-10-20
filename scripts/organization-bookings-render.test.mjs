import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
async function render(run) {
  const dir = await mkdtemp("scripts/.booking-render-"),
    dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid" }),
    keys = ["window", "document", "FormData", "IS_REACT_ACT_ENVIRONMENT"],
    prior = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    FormData: dom.window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const calls = [],
    data = {
      canAdjust: true,
      bookings: [
        {
          id: "booking",
          revision: 3,
          title: "Synthetic lesson",
          player: "Synthetic Athlete",
          coach: "coach",
          startsAt: "2030-01-07T22:00:00.000Z",
          endsAt: "2030-01-07T23:00:00.000Z",
          status: "confirmed",
          checkedInAt: null,
          eventId: null,
          editable: true,
        },
      ],
      events: [
        {
          id: "camp",
          name: "Synthetic camp",
          editable: true,
          sessions: [
            {
              sessionKey: "a".repeat(64),
              revision: 2,
              date: "2030-01-09",
              start: "16:00",
              end: "17:00",
              location: "Facility",
              status: "confirmed",
            },
          ],
        },
      ],
    };
  const fixture = {
    get: async () => data,
    save: async (name, value) => {
      calls.push({ name, value });
      return { ok: true };
    },
  };
  globalThis.__bookingFixture = fixture;
  let root;
  try {
    const out = resolve(dir, "component.mjs");
    await build({
      entryPoints: ["src/components/coordinator/organization-bookings.tsx"],
      outfile: out,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      plugins: [
        {
          name: "fixture",
          setup(b) {
            b.onResolve({ filter: /organization-bookings-api$/ }, () => ({
              path: "api",
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: `export const getOrganizationBookings=()=>globalThis.__bookingFixture.get();export const saveOrganizationBookingOperation=({data})=>globalThis.__bookingFixture.save('booking',data);export const saveOrganizationEventSessionOperation=({data})=>globalThis.__bookingFixture.save('session',data);`,
            }));
          },
        },
      ],
    });
    const React = await import("react"),
      { createRoot } = await import("react-dom/client"),
      { OrganizationBookings } = await import(pathToFileURL(out));
    root = createRoot(document.getElementById("root"));
    await React.act(async () => root.render(React.createElement(OrganizationBookings)));
    await run({
      dom,
      calls,
      fixture,
      data,
      act: React.act,
      click: async (text) =>
        React.act(async () =>
          [...document.querySelectorAll("button")].find((b) => b.textContent === text).click(),
        ),
    });
  } finally {
    if (root) {
      const { act } = await import("react");
      await act(async () => root.unmount());
    }
    dom.window.close();
    for (const k of keys)
      if (prior[k] === undefined) delete globalThis[k];
      else globalThis[k] = prior[k];
    delete globalThis.__bookingFixture;
    await rm(dir, { recursive: true, force: true });
  }
}
test("booking editor sends exact immutable identity CAS and blocks repeated submission", () =>
  render(async ({ dom, calls, fixture, act, click }) => {
    await click("Manage booking");
    const form = document.querySelector("form");
    form.querySelector("[name=date]").value = "2030-01-08";
    form.querySelector("[name=time]").value = "16:00";
    form.querySelector("[name=reason]").value = "Weather schedule adjustment";
    let done;
    fixture.save = async (name, value) => {
      calls.push({ name, value });
      return new Promise((r) => (done = r));
    };
    await act(async () => {
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].value, {
      bookingId: "booking",
      revision: 3,
      expectedStartsAt: "2030-01-07T22:00:00.000Z",
      expectedEndsAt: "2030-01-07T23:00:00.000Z",
      action: "reschedule",
      date: "2030-01-08",
      time: "16:00",
      reason: "Weather schedule adjustment",
    });
    assert.equal(form.querySelector("fieldset").disabled, true);
    await act(async () => done({ ok: true }));
    assert.equal(document.querySelector("form"), null);
    assert.match(document.body.textContent, /Operational schedule saved/);
  }));
test("session cancellation uses stable key and rejects stale editor state after denied refresh", () =>
  render(async ({ dom, calls, fixture, act, click }) => {
    await click("Manage session");
    const form = document.querySelector("form"),
      select = form.querySelector("select");
    await act(async () => {
      select.value = "cancel";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(form.querySelector("[name=date]"), null);
    form.querySelector("[name=reason]").value = "Weather cancellation";
    fixture.save = async (name, value) => {
      calls.push({ name, value });
      fixture.get = async () => {
        throw Error("Operational access revoked");
      };
      throw Error("Schedule changed. Reload.");
    };
    await act(async () =>
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
    );
    assert.deepEqual(calls[0].value, {
      eventId: "camp",
      sessionKey: "a".repeat(64),
      revision: 2,
      action: "cancel",
      reason: "Weather cancellation",
    });
    assert.equal(document.querySelector("form"), null);
    assert.doesNotMatch(
      document.body.textContent,
      /Synthetic Athlete|Synthetic lesson|Synthetic camp/,
    );
    assert.match(document.body.textContent, /Schedule changed/);
  }));
test("closing editors performs no write", () =>
  render(async ({ calls, data, fixture, click }) => {
    await click("Manage booking");
    await click("Close");
    assert.equal(calls.length, 0);
    assert.equal(document.querySelector("form"), null);
    data.bookings[0].eventId = "camp";
    fixture.get = async () => data;
    await click("Manage session");
    await click("Close");
    assert.equal(calls.length, 0);
    assert.match(document.body.textContent, /Bookings & session schedule/);
  }));
