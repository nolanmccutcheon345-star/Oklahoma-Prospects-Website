import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { BobbyMembership, BOBBY_7U_TEAM_ID } from "./bobby-membership.tsx";

test("Bobby's approved membership is scoped only to his exact 7U team", () => {
  for (const teamId of ["", "t-prospects-12u-maroon-bsb-l25g", "7U", `${BOBBY_7U_TEAM_ID}-other`]) {
    assert.equal(renderToStaticMarkup(React.createElement(BobbyMembership, { teamId })), "");
  }
});

test("Bobby's public card preserves the corrected package and uses request-only signup", () => {
  const dom = new JSDOM(
    renderToStaticMarkup(
      React.createElement(BobbyMembership, {
        teamId: BOBBY_7U_TEAM_ID,
      }),
    ),
  );
  try {
    const document = dom.window.document;
    const text = document.body.textContent;
    for (const expected of [
      "$350 initial deposit",
      "$99 monthly membership",
      "Due when you enroll.",
      "Due on the 1st, January–June 2027 (six monthly payments).",
      "One team hat",
      "Two jerseys",
      "Two pairs of pants",
      "One team cage jacket",
      "one cage for 1½ hours each week",
      "Individual indoor training time",
      "Full access to all our website tools",
      "BAYB league fee directly",
      "does not reserve a roster place or collect a payment",
    ]) {
      assert.ok(text.includes(expected), expected);
    }
    assert.doesNotMatch(text, /uniform deposit|bat bag|batting gloves|all.inclusive|unlimited/i);
    const link = document.querySelector("a");
    assert.equal(link.textContent, "Request a 7U tryout");
    assert.equal(link.getAttribute("href"), "/tryouts?sport=Baseball&age=7U#register");
    assert.equal(document.querySelector("form"), null);
    const section = document.querySelector("section");
    assert.equal(document.getElementById(section.getAttribute("aria-labelledby")).tagName, "H2");
  } finally {
    dom.window.close();
  }
});
