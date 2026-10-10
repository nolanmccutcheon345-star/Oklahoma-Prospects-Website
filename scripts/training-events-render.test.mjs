import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
test("camp registration UI, calendar, and admin event editor use authoritative data", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/events" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { act, createElement } = await import("react"),
    { createRoot } = await import("react-dom/client");
  const event = {
    id: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    name: "Summer Skills Clinic",
    type: "clinic",
    sport: "Both",
    description: "Development clinic for players.",
    priceCents: 4567,
    location: "Prospects",
    sessions: [{ date: "2030-06-01", start: "10:00", end: "12:00" }],
    coachIds: ["coach"],
    coaches: [{ id: "coach", name: "Assigned Coach" }],
    capacity: 20,
    status: "published",
    policy: "Office approved cancellation policy.",
  };
  const fixture = {
    events: [event],
    family: {
      players: [{ id: "player", name: "Linked Player", birthDate: "2018-06-03" }],
      registrations: [],
    },
    calls: [],
    saved: [],
  };
  globalThis.__eventsFixture = fixture;
  const mocks = {
    "@tanstack/react-router": `import React from 'react';export const createFileRoute=()=>()=>({});export const Link=({children,to,...p})=>React.createElement('a',{href:to},children);`,
    "@/lib/auth/use-current-user": `export const useCurrentUser=()=>({id:'parent',displayName:'Parent',primaryEmail:'parent@example.invalid'});`,
    "@/components/commerce/square-card": `import React from 'react';export const SquareCard=({amountCents})=>React.createElement('p',null,'Secure payment '+amountCents);`,
    "@/lib/commerce/api": `export const submitSquarePayment=async()=>({});`,
    "@/lib/training-events-api": `export const getTrainingEvents=async()=>globalThis.__eventsFixture.events;export const getEventFamily=async()=>globalThis.__eventsFixture.family;export const startEventCheckout=async({data})=>{globalThis.__eventsFixture.calls.push(data);return {orderId:'order',totalCents:4567,holdUntil:'2030-06-01',square:{}}};export const getEventOffice=async()=>({events:globalThis.__eventsFixture.events,registrations:[],coaches:[{id:'coach',name:'Assigned Coach'}]});export const saveEvent=async({data})=>{globalThis.__eventsFixture.saved.push(data);return {...data,revision:data.revision+1};};`,
  };
  const out = resolve("artifacts/events-render.mjs");
  await mkdir("artifacts", { recursive: true });
  const result = await build({
    stdin: {
      contents: `export {EventsPage} from './src/routes/events';export {EventOffice} from './src/components/event-office';`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "event-fixture",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (a) =>
            mocks[a.path] ? { path: a.path, namespace: "fixture" } : null,
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents: mocks[a.path],
            loader: "js",
          }));
        },
      },
    ],
  });
  await writeFile(out, result.outputFiles[0].text);
  const { EventsPage, EventOffice } = await import(pathToFileURL(out).href);
  let root = createRoot(document.getElementById("root"));
  const host = document.getElementById("root");
  const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);
  try {
    await act(async () => root.render(createElement(EventsPage)));
    assert.equal(host.querySelector('[aria-label="Training"]'), null);
    assert.match(host.textContent, /Summer Skills Clinic/);
    assert.match(host.textContent, /\$45.67/);
    await act(async () => button("Calendar").click());
    assert.ok(host.querySelector('[aria-label="Upcoming events calendar"]'));
    await act(async () => button("Upcoming events").click());
    await act(async () => button("Register a player").click());
    const choose = host.querySelector("select");
    await act(async () => {
      choose.value = "player";
      choose.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(button("Continue to secure payment").disabled, true);
    await act(async () => host.querySelector("input[type=checkbox]").click());
    await act(async () => button("Continue to secure payment").click());
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].athleteId, "player");
    assert.equal(fixture.calls[0].revision, 1);
    assert.match(host.textContent, /Secure payment 4567/);
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(createElement(EventOffice)));
    await act(async () => button("Edit event").click());
    assert.equal(
      [...host.querySelectorAll("label")]
        .find((l) => l.textContent.includes("Full-camp price"))
        .querySelector("input").value,
      "45.67",
    );
    assert.match(host.textContent, /Assigned Coach/);
    await act(async () =>
      host
        .querySelector("form")
        .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
    );
    assert.equal(fixture.saved.length, 1);
    assert.equal(fixture.saved[0].priceCents, 4567);

    const camp = {
      ...event,
      pricingMode: "both",
      minAge: 8,
      maxAge: 12,
      type: "skills-class",
      priceCents: 12500,
      dayPriceCents: 5000,
      sessions: [
        { date: "2030-06-03", start: "13:00", end: "15:00" },
        { date: "2030-06-05", start: "13:00", end: "15:00" },
        { date: "2030-06-07", start: "14:00", end: "16:00" },
      ],
    };
    fixture.events = [camp];
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(createElement(EventOffice)));
    await act(async () => button("Edit event").click());
    assert.match(host.textContent, /Full camp or individual days/);
    assert.deepEqual(
      [...host.querySelectorAll("input[type=time]")].map((x) => x.value),
      ["13:00", "15:00", "13:00", "15:00", "14:00", "16:00"],
    );
    await act(async () => button("Copy first day’s times to all days").click());
    assert.deepEqual(
      [...host.querySelectorAll("input[type=time]")].map((x) => x.value),
      ["13:00", "15:00", "13:00", "15:00", "13:00", "15:00"],
    );
    await act(async () => button("Add another camp day").click());
    assert.equal(host.querySelectorAll("input[type=date]").length, 4);
    assert.deepEqual(
      [...host.querySelectorAll("input[type=time]")].slice(-2).map((x) => x.value),
      ["13:00", "15:00"],
    );
    await act(async () =>
      [...host.querySelectorAll("button")]
        .filter((b) => b.textContent === "Remove day")
        .at(-1)
        .click(),
    );
    await act(async () =>
      host
        .querySelector("form")
        .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })),
    );
    assert.equal(fixture.saved.at(-1).pricingMode, "both");
    assert.equal(fixture.saved.at(-1).minAge, 8);
    assert.equal(fixture.saved.at(-1).maxAge, 12);
    assert.equal(fixture.saved.at(-1).type, "skills-class");
    assert.equal(fixture.saved.at(-1).dayPriceCents, 5000);
    assert.equal(fixture.saved.at(-1).sessions.length, 3);
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(createElement(EventsPage)));
    await act(async () => button("Register a player").click());
    assert.match(host.textContent, /\$125.00 total per player/);
    assert.match(host.textContent, /Ages 8–12/);
    await act(async () => host.querySelectorAll("input[type=radio]")[1].click());
    assert.match(host.textContent, /Select camp days to see your total/);
    await act(async () => host.querySelectorAll("input[type=checkbox]")[0].click());
    await act(async () => host.querySelectorAll("input[type=checkbox]")[2].click());
    assert.match(host.textContent, /\$100.00 total per player/);
    await act(async () => {
      const player = host.querySelector("select");
      player.value = "player";
      player.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await act(async () => [...host.querySelectorAll("input[type=checkbox]")].at(-1).click());
    await act(async () => button("Continue to secure payment").click());
    assert.equal(fixture.calls.at(-1).option, "days");
    assert.deepEqual(fixture.calls.at(-1).dates, ["2030-06-03", "2030-06-07"]);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.__eventsFixture;
    await rm(out, { force: true });
  }
});
