import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicCatalog, type ClubService } from "./ops";
import { defaultServicePresentation } from "./service-presentation";

function membership(id: string, featured: boolean, active = true, published = true): ClubService {
  return {
    id,
    kind: "membership",
    name: id,
    discipline: "Pitching",
    price: 100,
    minutes: 60,
    purpose: "Monthly training",
    entry: false,
    group_session: false,
    requires_assessment: false,
    credits: 4,
    remote: 0,
    expires_days: 0,
    hours: 0,
    featured,
    detail: "Plan detail",
    includes: ["Four 60-minute sessions"],
    unit: "",
    lanes: "",
    period: "/ month",
    hourly: "",
    bestFor: "",
    savings: "",
    perks: [],
    active,
    sort_order: 1,
    presentationRevision: 1,
    presentation: {
      ...defaultServicePresentation,
      status: published ? "published" : "draft",
    },
  };
}

test("public lesson memberships expose featured and omit inactive or unpublished rows", () => {
  const catalog = buildPublicCatalog([
    membership("m1", false),
    membership("m2", false),
    membership("m3", true),
    membership("hidden-inactive", true, false, true),
    membership("hidden-draft", true, true, false),
  ]);
  assert.deepEqual(
    catalog.memberships.map((plan) => [plan.id, plan.featured]),
    [
      ["m1", false],
      ["m2", false],
      ["m3", true],
    ],
  );
  assert.equal(
    catalog.memberships.some((plan) => plan.id.startsWith("hidden")),
    false,
  );
});
