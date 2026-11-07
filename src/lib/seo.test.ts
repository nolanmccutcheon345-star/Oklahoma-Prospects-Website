import test from "node:test";
import assert from "node:assert/strict";
import { pageHead, retireBrand } from "./seo";

test("retired public names are replaced in titles, og titles and descriptions", () => {
  const head = pageHead("/merchandise", "Oklahoma Prospects Shop", "Top Prospects gear from Oklahoma Prospects Academy.");
  const text = JSON.stringify(head);
  assert.doesNotMatch(text, /Oklahoma Prospects|Top Prospects/i);
  assert.equal(head.meta[0].title, "Prospects Sports Academy Shop | Prospects Sports Academy");
  assert.equal(retireBrand("Prospects Sports Academy"), "Prospects Sports Academy");
  assert.equal(retireBrand("Broken Arrow, Oklahoma"), "Broken Arrow, Oklahoma");
});
