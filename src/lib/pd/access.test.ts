import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAthleteAccess,
  authorizeMessage,
  canAccessAthlete,
  filterDevelopmentData,
  scopeForViewer,
  type PdViewer,
} from "./access";
import { seedDevelopment } from "./seed";

const data = seedDevelopment();

function viewer(partial: Partial<PdViewer> & Pick<PdViewer, "role" | "email">): PdViewer {
  return { name: "", playerName: "", ...partial };
}

test("parent of Eli cannot fetch Ryder even by id", () => {
  const scope = scopeForViewer(
    viewer({ role: "parent", email: "marisol.navarro@example.com", name: "Marisol Navarro" }),
    data,
  );
  assert.equal(canAccessAthlete(scope, "a-down"), true);
  assert.equal(canAccessAthlete(scope, "a-full"), false);
  assert.throws(() => assertAthleteAccess(scope, "a-full"), /Forbidden/);
  const filtered = filterDevelopmentData(data, scope);
  assert.deepEqual(
    filtered.athletes.map((row) => row.id),
    ["a-down"],
  );
  assert.equal(filtered.athletes.some((row) => row.id === "a-full"), false);
});

test("coach-private notes never reach a parent payload", () => {
  const scope = scopeForViewer(
    viewer({ role: "parent", email: "marisol.navarro@example.com" }),
    data,
  );
  const filtered = filterDevelopmentData(data, scope);
  assert.equal(filtered.messages.some((row) => row.channel === "coach"), false);
  assert.equal(filtered.messages.some((row) => /UCL/i.test(row.body)), false);
  assert.ok(filtered.messages.some((row) => /recover/i.test(row.body)));
  assert.equal(filtered.athletes[0]?.notes, "");
});

test("staff still receive the UCL private note", () => {
  const scope = scopeForViewer(
    viewer({ role: "coach", email: "stevemccutcheon89@gmail.com", name: "Coach Steve" }),
    data,
  );
  const filtered = filterDevelopmentData(data, scope);
  assert.ok(filtered.messages.some((row) => row.channel === "coach" && /UCL/i.test(row.body)));
  assert.ok(filtered.athletes.some((row) => row.id === "a-full"));
});

test("unmatched parent fails closed — no family's file", () => {
  const scope = scopeForViewer(
    viewer({ role: "parent", email: "stranger@example.com", playerName: "Ryder McCabe" }),
    data,
  );
  assert.equal(canAccessAthlete(scope, "a-full"), false);
  const filtered = filterDevelopmentData(data, scope);
  assert.equal(filtered.athletes.length, 0);
  assert.equal(filtered.messages.length, 0);
});

test("player name is not an access key for another family's athlete", () => {
  const scope = scopeForViewer(
    viewer({
      role: "player",
      email: "stranger@example.com",
      playerName: "Ryder McCabe",
    }),
    data,
  );
  assert.equal(canAccessAthlete(scope, "a-full"), false);
});

test("parent cannot write a coach-channel note", () => {
  const scope = scopeForViewer(
    viewer({ role: "parent", email: "marisol.navarro@example.com" }),
    data,
  );
  assert.throws(
    () => authorizeMessage(scope, { athleteId: "a-down", body: "secret", channel: "coach" }),
    /Forbidden/,
  );
  const family = authorizeMessage(scope, { athleteId: "a-down", body: "We will rest Thursday.", channel: "family" });
  assert.equal(family.channel, "family");
});