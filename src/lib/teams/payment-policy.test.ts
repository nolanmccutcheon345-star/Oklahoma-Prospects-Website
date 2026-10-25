import test from "node:test";
import assert from "node:assert/strict";
import { teamPaymentDisclosure, unsupportedTeamPaymentPolicy } from "./payment-policy";
import { feeHealth } from "./fee-health";
import { defaultBudget } from "./fee-model";
test("new offers reject unsupported autopay and penalty promises without blocking ordinary review deadlines", () => {
  assert.deepEqual(unsupportedTeamPaymentPolicy(teamPaymentDisclosure), []);
  for (const policy of [
    "Primary and backup payment cards required; backup may be charged if primary fails.",
    "Monthly auto-draft is on.",
    "After 5 business days unpaid: roster hold.",
    "A 20% late fee applies.",
  ])
    assert.ok(unsupportedTeamPaymentPolicy(policy).length, policy);
  assert.deepEqual(
    unsupportedTeamPaymentPolicy(
      "Team checkout does not set up automatic charges. Refund eligibility reviewed within 15 business days.",
    ),
    [],
  );
});
test("an ended season remains blocked even with a future payment deadline", () => {
  const b = {
    ...defaultBudget(),
    start: "2025-02-01",
    end: "2025-06-30",
    deadlineOverride: "2030-01-01",
  };
  assert.ok(
    feeHealth(b, { today: "2026-10-24" }).pending.some((s) => s.includes("season has ended")),
  );
  assert.equal(
    feeHealth({ ...b, end: "2027-06-30" }, { today: "2026-10-24" }).pending.some((s) =>
      s.includes("season has ended"),
    ),
    false,
  );
});
