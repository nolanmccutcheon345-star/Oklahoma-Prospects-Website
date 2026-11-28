import test from "node:test";
import assert from "node:assert/strict";
import { pageHead, retireBrand } from "./seo";

test("retired public names are replaced in titles, og titles and descriptions", () => {
  const head = pageHead(
    "/merchandise",
    "Oklahoma Prospects Shop",
    "Top Prospects gear from Oklahoma Prospects Academy.",
  );
  const text = JSON.stringify(head);
  assert.doesNotMatch(text, /Oklahoma Prospects|Top Prospects/i);
  assert.equal(head.meta[0].title, "Prospects Sports Academy Shop | Prospects Sports Academy");
  assert.equal(retireBrand("Prospects Sports Academy"), "Prospects Sports Academy");
  assert.equal(retireBrand("Broken Arrow, Oklahoma"), "Broken Arrow, Oklahoma");
});

test("pageHead strips a duplicate Prospects suffix and uses a self canonical", () => {
  const head = pageHead(
    "/articles/nolan-mccutcheon-coaching-story",
    "Nolan McCutcheon: His Baseball & Coaching Story | Prospects",
    "A long description. ".repeat(20),
  );
  assert.equal(
    head.meta[0].title,
    "Nolan McCutcheon: His Baseball & Coaching Story | Prospects Sports Academy",
  );
  assert.equal(
    head.links[0].href,
    "https://prospectssports.club/articles/nolan-mccutcheon-coaching-story",
  );
  const description = head.meta.find((m) => "name" in m && m.name === "description");
  assert.ok(description && "content" in description);
  assert.ok((description.content as string).length <= 160);
});
