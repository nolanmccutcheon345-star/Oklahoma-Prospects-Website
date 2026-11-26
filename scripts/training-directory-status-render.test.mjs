import assert from "node:assert/strict";
import test from "node:test";
import { withRendered } from "./render-component-support.mjs";

const catalog = {
  status: "ready",
  checkoutStatus: "ready",
  lessons: [
    {
      id: "s2",
      name: "Fixture Pitching Lesson",
      discipline: "Pitching",
      price: 60,
      minutes: 30,
      purpose: "Practice pitching",
      requiresAssessment: true,
    },
  ],
  memberships: [],
  packages: [],
};
const person = {
  id: "fixture-coach",
  coachId: "fixture-coach",
  name: "Fixture Instructor",
  instructor: true,
  bookable: true,
  sports: ["softball"],
  serviceIds: ["s2"],
};
const mocks = {
  "@/lib/use-catalog":
    "export const useLiveCatalog=()=>globalThis.trainingDirectoryFixture.catalog;",
  "@/lib/auth/use-current-user": "export const useCurrentUser=()=>null;",
  "@/lib/person-api":
    "export const getPublicPeople=()=>globalThis.trainingDirectoryFixture.read();",
  "@/lib/commerce/api":
    "export const getCheckoutContext=async()=>{throw Error('Unexpected account read')};",
  "@/lib/pd": "export const MEMBERSHIP_RULES=[];",
  "@tanstack/react-router": "export const Link=({children})=>children;",
};

async function render(props, read, work) {
  globalThis.trainingDirectoryFixture = { catalog, read };
  try {
    await withRendered(
      "src/components/training-catalog.tsx",
      "CatalogAndBook",
      { view: "lessons", instructor: person.coachId, ...props },
      mocks,
      work,
    );
  } finally {
    delete globalThis.trainingDirectoryFixture;
  }
}

const loading = /Checking instructor availability/;
const unavailable = /not currently listed for online lessons/;
const noLessons = /No lessons match these choices/;

test("filtered training distinguishes directory loading, failure, and successful retry", async () => {
  let succeed,
    fail,
    calls = 0;
  const read = () =>
    new Promise((resolve, reject) => {
      calls++;
      succeed = resolve;
      fail = reject;
    });
  await render({ initialPeople: null }, read, async ({ host, act }) => {
    assert.equal(calls, 1);
    assert.match(host.textContent, loading);
    assert.doesNotMatch(host.textContent, unavailable);
    assert.doesNotMatch(host.textContent, noLessons);

    await act(async () => fail(Error("Fixture network failure")));
    const error = host.querySelector('[role="alert"]');
    assert.ok(error);
    assert.match(error.textContent, /load instructor information/);
    assert.doesNotMatch(host.textContent, loading);
    assert.doesNotMatch(host.textContent, unavailable);
    assert.doesNotMatch(host.textContent, noLessons);
    const retry = error.querySelector("button");
    assert.equal(retry.textContent, "Try again");

    await act(async () => retry.click());
    assert.equal(calls, 2);
    assert.equal(host.querySelector('[role="alert"]'), null);
    assert.match(host.textContent, loading);
    assert.doesNotMatch(host.textContent, unavailable);

    await act(async () => succeed([person]));
    assert.match(host.textContent, /Requested instructor:\s*Fixture Instructor/);
    assert.match(host.textContent, /Fixture Pitching Lesson/);
    assert.doesNotMatch(host.textContent, loading);
    assert.doesNotMatch(host.textContent, unavailable);
    assert.doesNotMatch(host.textContent, noLessons);
  });
});

test("a successfully loaded directory can report a genuinely unknown instructor", async () => {
  await render(
    { instructor: "unknown-instructor", initialPeople: null },
    async () => [person],
    async ({ host }) => {
      assert.match(host.textContent, unavailable);
      assert.doesNotMatch(host.textContent, loading);
      assert.equal(host.querySelector('[role="alert"]'), null);
    },
  );
});
