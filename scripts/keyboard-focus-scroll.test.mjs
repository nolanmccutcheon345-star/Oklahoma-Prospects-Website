import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("keyboard focus scrolling reserves extra room for both sticky navigation edges", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const html = css.match(/@layer base\s*\{\s*html\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(html, /scroll-padding-top:\s*6rem;/);
  assert.match(html, /scroll-padding-bottom:\s*calc\(var\(--bottom-nav-space\) \+ 0\.75rem\);/);
  assert.match(css, /--bottom-nav-space:\s*calc\(var\(--bottom-nav-height\) \+ 1px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*3px solid/);
});
