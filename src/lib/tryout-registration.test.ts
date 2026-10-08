import test from "node:test";
import assert from "node:assert/strict";
import { TRYOUT_REQUEST_SESSION } from "./club";
import { validateTryoutRegistration } from "./tryout-registration";
import { inquiryInput } from "./portal-contracts";

test("both sports accept any age group without a fabricated session or deadline", () => {
  for (const sport of ["Baseball", "Softball"]) {
    for (const age of ["4U", "6U", "7U", "11U", "12U", "14U", "16U", "18U", "Adult"]) {
      const input = inquiryInput.parse({
        kind: "tryout",
        requestId: "8f8ad426-33e6-4b21-bb78-a836b72b0254",
        player: "Test player",
        age,
        parent: "Test parent",
        phone: "9185550100",
        email: "parent@example.test",
        notes: "",
        sport,
        session: TRYOUT_REQUEST_SESSION,
      });
      assert.notEqual(input.kind, "contact");
      if (input.kind === "contact") throw new Error("Unexpected input kind");
      assert.doesNotThrow(() => validateTryoutRegistration(input, "2027-01-01"));
    }
  }
});

test("a stale page cannot claim enrollment in an unsupported scheduled session", () => {
  for (const session of [
    "",
    "Saturday 2026-11-14 · 10U · 1:00–2:00 PM",
    "Softball tryouts · Date and time to be announced",
  ]) {
    assert.throws(
      () => validateTryoutRegistration({ sport: "Baseball", age: "10U", session }, "2026-10-06"),
      /Refresh/,
    );
  }
});

test("intake rejects missing age and invalid sport before saving", () => {
  assert.throws(
    () =>
      validateTryoutRegistration(
        { sport: "Unknown", age: "10U", session: TRYOUT_REQUEST_SESSION },
        "2026-10-06",
      ),
    /Choose/,
  );
  for (const age of ["", "  ", "x".repeat(121)]) {
    assert.throws(
      () =>
        validateTryoutRegistration(
          { sport: "Softball", age, session: TRYOUT_REQUEST_SESSION },
          "2026-10-06",
        ),
      /age group/,
    );
  }
});
