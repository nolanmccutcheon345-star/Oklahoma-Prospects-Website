import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("src/routes/training.tsx", "utf8");
test("Train has no inquiry-first CTAs, obsolete first-month fee or exposed OP-1–OP-7 ladder", () => {
  assert.doesNotMatch(page, /Ask about|Lesson enrollment by inquiry|FIRST_MONTH_SETUP_CENTS|OP_LEVELS|Pitching ladder/i);
  assert.doesNotMatch(page, /navigate\\(\\{ to: "\/contact"/);
  assert.match(page, /Online lesson checkout temporarily unavailable/);
});
test("Train gates lessons, plans and packages on selected athlete, not sibling state", () => {
  assert.match(page, /const hasAssessment = selectedAthlete\\?\\.assessmentComplete === true/);
  assert.match(page, /hasAssessment \\|\\| ASSESSMENT_PRODUCTS\\.has\\(item\\.id\\)/);
  assert.match(page, /hasAssessment \\? <section id="memberships"/);
  assert.match(page, /hasAssessment \\? <>/);
  assert.match(page, /getCheckoutContext\\(\\)/);
  assert.match(page, /canPurchase\\(catalog\\.purchaseAvailability/);
});
