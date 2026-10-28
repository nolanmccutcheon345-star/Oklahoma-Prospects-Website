import assert from "node:assert/strict";
import { test } from "node:test";
import { publicRecordLabel } from "./public-record";

test("unplayed or unpublished seasons do not display a zero-win record", () => {
  assert.equal(publicRecordLabel({ w: 0, l: 0, t: 0 }), null);
});

test("reported results retain wins, losses, and ties", () => {
  assert.equal(publicRecordLabel({ w: 5, l: 3, t: 1 }), "Record: 5–3–1 (W–L–T)");
  assert.equal(publicRecordLabel({ w: 0, l: 1, t: 0 }), "Record: 0–1–0 (W–L–T)");
});

test("invalid public records are not rendered as trustworthy statistics", () => {
  assert.equal(publicRecordLabel({ w: -1, l: 2, t: 0 }), null);
  assert.equal(publicRecordLabel({ w: Number.NaN, l: 0, t: 0 }), null);
});
