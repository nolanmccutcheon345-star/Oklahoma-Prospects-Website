import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("public catalog refresh does not blank prices on window focus", () => {
  const source = readFileSync("src/lib/use-catalog.ts", "utf8");
  assert.doesNotMatch(source, /addEventListener\(\s*["']focus["']/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /shownRef/);
  assert.match(source, /60_000/);
});

test("maroon borders on ink and navy use the darker-surface rule color", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /--color-maroon-rule-dark:\s*#b24a6b/);
  assert.match(css, /:is\(\.bg-ink, \.bg-navy\)\.border-maroon/);
  assert.match(css, /border-color:\s*var\(--color-maroon-rule-dark\)/);
});

test("hash targets use page scroll-padding without a second header offset", () => {
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /scroll-padding-top:\s*calc\(var\(--header-height\) \+ 0\.75rem\);/);
  assert.doesNotMatch(
    css,
    /#(?:register|contact-form|schedule|softball|baseball|explore-teams|cage-booking)[\s\S]{0,240}scroll-margin-top:\s*calc\(var\(--header-height/,
  );
  assert.match(css, /\[id\^="person-"\]\s*\{\s*scroll-margin-top:\s*0\.75rem;\s*\}/);
});

test("team invoice action is readable on the light payments section", () => {
  const teams = readFileSync("src/routes/teams.tsx", "utf8");
  const section = teams.split("Team payments")[1]?.split("Softball tryouts")[0] ?? "";
  assert.match(section, /variant="outlineDark"/);
  assert.doesNotMatch(section, /variant="outline"/);
});
