import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("owner office has a matching jump target for each section without hiding existing tools", () => {
  const page = readFileSync("src/routes/office.tsx", "utf8");
  assert.match(page, /aria-label="Front office sections"/);
  for (const name of [
    "office-evaluations", "office-requests", "office-payments",
    "office-discounts", "office-operations", "office-booking-changes", "office-teams",
  ]) {
    assert.ok(page.includes(`"#${name}"`), `${name} navigation target`);
    assert.ok(page.includes(`id="${name}"`), `${name} section`);
  }
  for (const component of [
    "OfficeRequests", "SquareOffice", "DiscountOffice", "OfficeOperations",
    "StaffBookingChanges", "OfficeApp",
  ]) assert.ok(page.includes(`<${component}`), component);
  assert.match(page, /state.role !== "admin"/);
});
