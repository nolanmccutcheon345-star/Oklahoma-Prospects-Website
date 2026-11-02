import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public instructor, coach and camp headers use current academy branding", () => {
  for (const path of ["src/routes/instructors.tsx", "src/routes/coaches.tsx", "src/routes/events.tsx"]) {
    const route = read(path);
    assert.match(route, /Prospects Sports Academy|PROSPECTS SPORTS ACADEMY/);
    assert.doesNotMatch(route, /eyebrow="Oklahoma Prospects"|>OKLAHOMA PROSPECTS<\/p>/);
  }
});

test("public page heads, shop help and family tryout emails do not use retired names", () => {
  for (const path of [
    "src/routes/merchandise.tsx",
    "src/routes/merchandise_.$productId.tsx",
    "src/routes/players.tsx",
    "src/routes/player.$playerId.tsx",
    "src/routes/events.tsx",
    "src/components/shop.tsx",
    "src/components/tryout-center.tsx",
    "src/lib/tryout-center.server.ts",
  ])
    assert.doesNotMatch(read(path), /Oklahoma Prospects|Top Prospects/i, path);
});

test("the linked web app manifest ships as a static production file", () => {
  assert.match(read("src/routes/__root.tsx"), /rel: "manifest", href: "\/__grok\/manifest\.webmanifest"/);
  const manifest = JSON.parse(read("public/__grok/manifest.webmanifest"));
  assert.equal(manifest.name, "Prospects Sports Academy");
  assert.equal(manifest.start_url, "/");
  for (const icon of manifest.icons) assert.doesNotThrow(() => read("public" + icon.src), icon.src);
});
