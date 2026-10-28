import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { reviewedReleaseIdentity } from "./reviewed-release.mjs";
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const identity = reviewedReleaseIdentity({ command: "build", mode: "production" });
assert.deepEqual(
  identity,
  { commit: head, dirty: false },
  "The clean CI source must produce an eligible exact-commit release seal.",
);
const manifest = JSON.parse(await readFile("public/release.json", "utf8"));
assert.equal(manifest.commit, head);
assert.equal(manifest.dirty, false);
console.log(`PASS reviewed build source: ${head}; no database or permissions changed.`);
