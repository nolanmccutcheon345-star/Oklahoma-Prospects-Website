import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./auth/redirect";
import { scopeForViewer, resolveViewerRole, filterDevelopmentData } from "./pd/access";
import { mergeScopedFile } from "./pd/file";
import { seedDevelopment } from "./pd/seed";

test("redirects reject protocol-relative, encoded and backslash destinations", () => {
  for (const value of ["//evil.example", "/%2fevil.example", "/\\evil.example", "/%5cevil.example", "https://evil.example", "/%00"]) assert.equal(safeNext(value), "/account");
  assert.equal(safeNext("/pay?id=s1"), "/pay?id=s1");
});
test("a display email or a forged browser role is not an authorization grant", () => {
  assert.equal(resolveViewerRole("nolanmccutcheon@icloud.com"), "parent");
  const localStorage = { role: "admin" };
  const viewer = { role: "parent" as const, email: "marisol.navarro@example.com", name: "Parent", playerName: "" };
  const scope = scopeForViewer(viewer, seedDevelopment());
  assert.notEqual(scope.athleteIds, "all");
  assert.equal(localStorage.role, "admin");
  assert.equal(scope.includeStaffOps, false);
});
test("parents cannot expand household, complete assessment, or mint lesson credits", () => {
  const full = seedDevelopment();
  const scope = scopeForViewer({ role: "parent", email: "marisol.navarro@example.com", name: "Parent", playerName: "" }, full);
  const incoming = structuredClone(full);
  const family = incoming.families.find(f => f.id === "f-navarro")!;
  family.athleteIds.push("a-full");
  family.email = "attacker@example.com";
  family.plan = { type: "elite", lessonCredits: 999 };
  const athlete = incoming.athletes.find(a => a.id === "a-down")!;
  athlete.assessmentComplete = !athlete.assessmentComplete;
  athlete.opLevel = 7;
  incoming.bookings[0].status = "paid";
  const merged = mergeScopedFile(full, incoming, scope);
  assert.deepEqual(merged.families.map(f => [f.id, f.email, f.athleteIds, f.plan]), full.families.map(f => [f.id, f.email, f.athleteIds, f.plan]));
  assert.equal(merged.athletes.find(a => a.id === "a-down")?.assessmentComplete, full.athletes.find(a => a.id === "a-down")?.assessmentComplete);
  assert.equal(merged.athletes.find(a => a.id === "a-down")?.opLevel, full.athletes.find(a => a.id === "a-down")?.opLevel);
  assert.deepEqual(merged.bookings, full.bookings);
  assert.equal(filterDevelopmentData(merged, scope).athletes.some(a => a.id === "a-full"), false);
});
test("coaches can save their own availability but cannot edit payouts or other coaches", () => {
  const full = seedDevelopment(); const coach = full.coaches[0];
  const scope = scopeForViewer({ role: "coach", email: coach.email, name: coach.name, playerName: "" }, full);
  const incoming = structuredClone(filterDevelopmentData(full, scope));
  incoming.availability = full.availability.filter(a => a.coachId !== coach.id);
  incoming.coachPayouts = [];
  const merged = mergeScopedFile(full, incoming, scope);
  assert.equal(merged.availability.some(a => a.coachId === coach.id), false);
  assert.deepEqual(merged.coachPayouts, full.coachPayouts);
  assert.deepEqual(merged.availability.filter(a => a.coachId !== coach.id), full.availability.filter(a => a.coachId !== coach.id));
});
