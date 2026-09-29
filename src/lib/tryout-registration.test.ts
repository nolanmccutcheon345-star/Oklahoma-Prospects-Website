import test from "node:test";
import assert from "node:assert/strict";
import { SOFTBALL_TRYOUT_SESSION } from "./club";
import { BASEBALL_TRYOUT_SESSIONS, validateTryoutRegistration } from "./tryout-registration";
import { inquiryInput } from "./portal-contracts";

test("all four approved softball ages can register without a scheduled date", () => {
  for (const age of ["10U", "12U", "14U", "16U"]) {
    const input = inquiryInput.parse({ kind: "tryout", requestId: "8f8ad426-33e6-4b21-bb78-a836b72b0254", player: "Test player", age, parent: "Test parent", phone: "9185550100", email: "parent@example.test", notes: "", sport: "Softball", session: SOFTBALL_TRYOUT_SESSION });
    assert.equal(input.kind, "tryout");
    assert.doesNotThrow(() => validateTryoutRegistration(input, "2026-09-27"));
    assert.doesNotThrow(() => validateTryoutRegistration(input, "2026-11-16"));
  }
});

test("softball cannot use unapproved ages or claim a baseball session", () => {
  for (const age of ["8U", "13U", "15U", "18U", ""]) {
    assert.throws(() => validateTryoutRegistration({ sport: "Softball", age, session: SOFTBALL_TRYOUT_SESSION }, "2026-09-27"), /Choose 10U/);
  }
  for (const session of ["", BASEBALL_TRYOUT_SESSIONS.find((s) => s.age === "10U")!.value]) {
    assert.throws(() => validateTryoutRegistration({ sport: "Softball", age: "10U", session }, "2026-09-27"), /to be announced/);
  }
});

test("baseball still requires its matching age, session and registration deadline", () => {
  for (const session of BASEBALL_TRYOUT_SESSIONS) {
    const input = { sport: "Baseball", age: session.age, session: session.value };
    assert.doesNotThrow(() => validateTryoutRegistration(input, "2026-11-15"));
    assert.throws(() => validateTryoutRegistration(input, "2026-11-16"), /ended/);
    assert.throws(() => validateTryoutRegistration({ ...input, age: "16U" }, "2026-09-27"), /matching baseball/);
  }
  assert.throws(() => validateTryoutRegistration({ sport: "Baseball", age: "10U", session: SOFTBALL_TRYOUT_SESSION }, "2026-09-27"), /matching baseball/);
  assert.throws(() => validateTryoutRegistration({ sport: "Unknown", age: "10U", session: SOFTBALL_TRYOUT_SESSION }, "2026-09-27"), /matching baseball/);
});
