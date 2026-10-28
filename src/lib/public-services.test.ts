import assert from "node:assert/strict";
import test from "node:test";
import { publishedServices } from "./public-services";

test("public service reads contain only active admin-published catalog products", () => {
  const rows = [
    { id: "s1", active: true, name: "New Player Assessment" },
    { id: "s2", active: false, name: "Unpublished service" },
    { id: "prototype-custom-offer", active: true, name: "Owner-only experiment" },
    { id: "constructor", active: true, name: "Prototype key should not count as listed" },
    { id: "m1", active: true, name: "Published membership" },
  ];
  assert.deepEqual(publishedServices(rows).map(row => row.id), ["s1", "prototype-custom-offer", "constructor", "m1"]);
  assert.equal(rows.length, 5, "filter must never mutate the owner's editor data");
});

test("public service reads fail closed on unknown or inactive catalog rows", () => {
  assert.deepEqual(publishedServices([{ id: "unknown", active: false }]), []);
  assert.deepEqual(publishedServices([{ id: "s9", active: false }]), []);
  assert.deepEqual(publishedServices([{ id: "s9", active: true }]).map(row=>row.id), ["s9"]);
});
