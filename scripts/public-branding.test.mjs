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
