import test from "node:test";
import assert from "node:assert/strict";
import { TRYOUT_REQUEST_SESSION } from "./club";
import { validateTryoutRegistration } from "./tryout-registration";
import { inquiryInput } from "./portal-contracts";

test("both sports accept approved age groups without a fabricated session or deadline", () => {
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
        positions: "New player / still learning",
        notes: "No additional notes",
        usssaStatus: "not-registered",
        sport,
        session: TRYOUT_REQUEST_SESSION,
      });
      assert.notEqual(input.kind, "contact");
      if (input.kind === "contact") throw new Error("Unexpected input kind");
      assert.doesNotThrow(() => validateTryoutRegistration(input, "2027-01-01"));
    }
  }
});

test("tryout intake requires positions, notes and an explicit USSSA response for either sport", () => {
  const valid = {
    kind: "tryout", requestId: "8f8ad426-33e6-4b21-bb78-a836b72b0254",
    player: "Test player", age: "12U", parent: "Test parent", phone: "9185550100",
    email: "parent@example.test", positions: "Pitcher, shortstop", notes: "Working on fielding",
    usssaStatus: "provided", usssaAthleteId: "00123456", sport: "Softball", session: TRYOUT_REQUEST_SESSION,
  };
  for (const sport of ["Baseball", "Softball"]) {
    for (const field of ["positions", "notes", "usssaStatus", "usssaAthleteId"]) {
      for (const blank of [undefined, "", "   "]) {
        assert.equal(inquiryInput.safeParse({ ...valid, sport, [field]: blank }).success, false, `${sport}: ${field}`);
      }
    }
    const parsed = inquiryInput.parse({ ...valid, sport, positions: " Pitcher, shortstop ", usssaAthleteId: " 00123456 " });
    if (parsed.kind === "contact") throw new Error("Unexpected contact");
    assert.equal(parsed.usssaAthleteId, "00123456");
    assert.equal(parsed.positions, "Pitcher, shortstop");
    for (const usssaStatus of ["unknown", "not-registered"]) {
      assert.equal(inquiryInput.safeParse({ ...valid, sport, usssaStatus, usssaAthleteId: "" }).success, true);
      assert.equal(inquiryInput.safeParse({ ...valid, sport, usssaStatus }).success, false);
    }
  }
  for (const usssaAthleteId of ["123ABC", "123.45", "-123", "1e5", "9".repeat(31)]) {
    assert.equal(inquiryInput.safeParse({ ...valid, usssaAthleteId }).success, false);
  }
  assert.equal(inquiryInput.safeParse({ ...valid, kind: "team-inquiry", positions: "", notes: "", usssaStatus: "", usssaAthleteId: "" }).success, true);
  assert.equal(inquiryInput.safeParse({ kind: "contact", requestId: valid.requestId, name: "Parent", email: valid.email, phone: "", message: "Tryout question" }).success, true);
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
  for (const age of ["", "  ", "x".repeat(121), "22U", "Unknown", "16-u", "0U"]) {
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
