import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("public Train never renders staff pitching ladder or internal levels", () => {
  const publicTrain = readFileSync("src/routes/training.tsx", "utf8");
  assert.doesNotMatch(publicTrain, /Pitching ladder|OP-1|OP-7|OP_LEVELS/);
});

test("pitching progression remains available in the private development source", () => {
  const pd = readFileSync("src/lib/pd.ts", "utf8");
  const privateDevelopment = readFileSync("src/components/pd/content-views.tsx", "utf8");
  assert.match(pd, /OP_LEVELS/);
  assert.match(privateDevelopment, /OP_LEVELS/);
});
