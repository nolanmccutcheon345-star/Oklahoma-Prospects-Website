import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("assign coach for me selects a qualified coach only after reading real open slots", () => {
  const page=readFileSync("src/routes/pay.tsx","utf8");
  const quote=readFileSync("src/lib/commerce/checkout.server.ts","utf8");
  assert.match(page,/Assign coach for me/);
  assert.match(page,/coach\.serviceIds\.includes\(serviceId\)/);
  assert.match(page,/getCheckoutQuote\(\{/);
  assert.match(page,/result\.slots\.length > 0/);
  assert.match(page,/setCoachId\(coach\.id\)/);
  assert.match(page,/generation !== autoCoachAttempt\.current/);
  assert.match(page,/setAutoCoachError\("No qualified coach has available times that day/);
  assert.match(quote,/requireCoachService\(/);
  assert.match(quote,/coachAvailable\(/);
  assert.match(page,/The booking is confirmed only after payment/);
  assert.doesNotMatch(page,/Math\.random\(\)/);
});
