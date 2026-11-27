import test from "node:test";
import assert from "node:assert/strict";
import { withRendered } from "./render-component-support.mjs";

const lesson = {
  id: "s2",
  name: "Private Pitching 30",
  discipline: "Pitching",
  price: 60,
  minutes: 30,
  purpose: "Practice pitching",
  requiresAssessment: true,
};
const person = {
  id: "softball",
  coachId: "softball",
  name: "Synthetic Softball Coach",
  coach: true,
  instructor: true,
  sports: ["softball"],
  bookable: false,
  serviceIds: [],
  offeredServiceIds: ["s2"],
  teams: [],
};
const mocks = {
  "@/lib/use-catalog": `export const useLiveCatalog=()=>globalThis.trainingOfferFixture;`,
  "@/lib/auth/use-current-user": `export const useCurrentUser=()=>null;`,
  "@/lib/person-api": `export const getPublicPeople=async()=>[];`,
  "@/lib/commerce/api": `export const getCheckoutContext=async()=>{throw Error('Unexpected account read')};`,
  "@/lib/pd": `export const MEMBERSHIP_RULES=[];`,
  "@tanstack/react-router": `export const Link=({children})=>children;`,
};

test("softball finder keeps approved lessons visible without hours and explains availability", async () => {
  globalThis.trainingOfferFixture = {
    status: "ready",
    checkoutStatus: "ready",
    lessons: [lesson],
    memberships: [],
    packages: [],
  };
  try {
    await withRendered(
      "src/components/training-catalog.tsx",
      "CatalogAndBook",
      { view: "lessons", initialPeople: [person] },
      mocks,
      async (ui) => {
        const sport = ui.host.querySelector('select[aria-label="Sport"]');
        assert.ok(sport);
        await ui.change(sport, "softball");
        assert.match(ui.host.textContent, /Private Pitching 30/);
        assert.match(ui.host.textContent, /have not published bookable hours/);
        assert.doesNotMatch(ui.host.textContent, /No lessons match/);
        await ui.change(sport, "baseball");
        assert.match(ui.host.textContent, /No lessons match/);
        assert.doesNotMatch(ui.host.textContent, /have not published bookable hours/);
      },
    );
    await withRendered(
      "src/components/training-catalog.tsx",
      "CatalogAndBook",
      { view: "lessons", instructor: "softball", initialPeople: [person] },
      mocks,
      async (ui) => {
        assert.match(ui.host.textContent, /Private Pitching 30/);
        assert.match(ui.host.textContent, /have not published bookable hours/);
      },
    );
    await withRendered(
      "src/components/training-catalog.tsx",
      "CatalogAndBook",
      { view: "lessons", initialPeople: [{ ...person, instructor: false }] },
      mocks,
      async (ui) => {
        await ui.change(ui.host.querySelector('select[aria-label="Sport"]'), "softball");
        assert.match(ui.host.textContent, /No lessons match/);
      },
    );
  } finally {
    delete globalThis.trainingOfferFixture;
  }
});
