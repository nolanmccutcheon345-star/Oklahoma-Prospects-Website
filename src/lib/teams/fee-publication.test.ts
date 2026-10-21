import test from "node:test";
import assert from "node:assert/strict";
import { publicationCostIssues } from "./fee-health";
import {
  defaultBudget,
  calculateFees,
  project,
  additionalPlayerContribution,
  budgetSchema,
} from "./fee-model";
import type { TeamActivity } from "./activity-contracts";

const budget = () => ({
  ...defaultBudget(),
  start: "2027-02-01",
  end: "2027-07-31",
  scheduleCostsAutomatic: true,
});
const event = (extra: Partial<TeamActivity> = {}): TeamActivity => ({
  id: "11111111-1111-4111-8111-111111111111",
  teamId: "team",
  revision: 0,
  kind: "tournament",
  title: "Regional event",
  date: "2027-05-01",
  startTime: "10:00",
  endTime: "18:00",
  location: "Test field",
  status: "scheduled",
  entryFee: 60000,
  stats: [],
  ourRuns: 0,
  oppRuns: 0,
  ...extra,
});
test("publication requires real schedule costs and uniform selection, or explicit admin estimates", () => {
  const b = budget();
  assert.equal(publicationCostIssues(b, [], [], []).length, 2);
  const selected = { ...b, uniformId: "active-package" };
  assert.deepEqual(publicationCostIssues(selected, [event()], [], []), []);
  for (const activity of [
    event({ status: "cancelled" }),
    event({ kind: "practice" }),
    event({ date: "2028-05-01" }),
    event({ entryFee: undefined }),
  ])
    assert.equal(publicationCostIssues(selected, [activity], [], []).length, 1);
  assert.deepEqual(publicationCostIssues(selected, [event({ entryFee: 0 })], [], []), []);
  const catalog = [{ id: "catalog", org: "League", start: "2027-05-01", fee: 600 }];
  assert.deepEqual(publicationCostIssues(selected, [], catalog, ["catalog"]), []);
  assert.equal(publicationCostIssues(selected, [], catalog, []).length, 1);
  assert.equal(
    publicationCostIssues(selected, [], [{ ...catalog[0], fee: NaN }], ["catalog"]).length,
    1,
  );
  assert.deepEqual(
    publicationCostIssues({ ...b, tournamentEstimate: 0, uniformEstimate: 0 }, [], [], []),
    [],
  );
});
test("admin estimates replace costs once across full, PO, contingency and extra-player reporting", () => {
  const original = {
    ...budget(),
    poModel: 2 as const,
    tournament: 990000,
    uniformCost: 35000,
    tournamentEstimate: 180000,
    uniformEstimate: 12500,
  };
  const actual = {
    ...original,
    tournament: 180000,
    uniformCost: 12500,
    tournamentEstimate: undefined,
    uniformEstimate: undefined,
  };
  assert.deepEqual(calculateFees(original), calculateFees(actual));
  assert.deepEqual(calculateFees(original, true), calculateFees(actual, true));
  assert.deepEqual(project(original, 12, 1), project(actual, 12, 1));
  assert.deepEqual(
    additionalPlayerContribution(original, "full", { insurance: 0, registration: 0, other: 0 }),
    additionalPlayerContribution(actual, "full", { insurance: 0, registration: 0, other: 0 }),
  );
  assert.equal(original.tournament, 990000);
  assert.equal(original.uniformCost, 35000);
  const zero = { ...original, tournamentEstimate: 0, uniformEstimate: 0 };
  assert.equal(
    calculateFees(zero).fixed,
    calculateFees({ ...actual, tournament: 0, uniformCost: 0 }).fixed,
  );
  assert.equal(
    additionalPlayerContribution(zero, "full", { insurance: 0, registration: 0, other: 0 }).uniform,
    0,
  );
  for (const invalid of [-1, NaN, 1.5])
    assert.equal(budgetSchema.safeParse({ ...original, uniformEstimate: invalid }).success, false);
});
