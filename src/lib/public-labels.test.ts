import test from "node:test";
import assert from "node:assert/strict";
import {
  joinMeta,
  publicEventTypeLabel,
  publicLessonDiscipline,
  publicSportLabel,
  publicTeamName,
  sortSeasonLabels,
} from "./public-labels";

test("public team names drop internal codes and retire old brands", () => {
  assert.equal(publicTeamName("PROSPECTS 12U MAROON - BSB"), "Prospects 12U MAROON");
  assert.equal(publicTeamName("PROSPECTS 14U NAVY - SB"), "Prospects 14U NAVY");
  assert.equal(publicTeamName("OKLAHOMA PROSPECTS 13U SB"), "Prospects 13U SB");
  assert.equal(publicTeamName("PROSPECT NAVY 8U"), "Prospects Navy 8U");
  assert.equal(publicTeamName("Prospects 14u Maroon - bsb"), "Prospects 14U Maroon");
});

test("public labels format sport, event type, seasons and metadata", () => {
  assert.equal(publicSportLabel("Both"), "Baseball & Softball");
  assert.equal(publicEventTypeLabel("camp"), "Camp");
  assert.deepEqual(sortSeasonLabels(["Summer 2027", "Spring 2027"]), [
    "Spring 2027",
    "Summer 2027",
  ]);
  assert.equal(joinMeta("Class of 2033", "", undefined, "SS"), "Class of 2033 · SS");
  assert.equal(joinMeta("Class of 2033", null, ""), "Class of 2033");
});

test("lesson discipline follows a Fielding name even if the stored value is Pitching", () => {
  assert.equal(
    publicLessonDiscipline({ name: "Private Fielding 30", discipline: "Pitching" }),
    "Fielding",
  );
  assert.equal(
    publicLessonDiscipline({ name: "Private Pitching 30", discipline: "Pitching" }),
    "Pitching",
  );
  assert.equal(publicLessonDiscipline({ name: "Arm care", discipline: "Pitching" }), "Pitching");
});
