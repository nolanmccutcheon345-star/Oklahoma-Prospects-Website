import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.createSourceFile(
  "api.ts",
  readFileSync(new URL("./api.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);

function middlewareFor(name: string) {
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((candidate) => candidate.name.getText(source) === name);
  assert.ok(declaration?.initializer, `${name} must exist`);
  const middleware: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "middleware"
    ) {
      middleware.push(...node.arguments.map((argument) => argument.getText(source)));
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration.initializer);
  return middleware;
}

test("owner roster eligibility transports use unrestricted owner auth, not coordinator assignments", () => {
  for (const name of [
    "getRosterEligibilityReview",
    "approveRosterEligibility",
    "revokeRosterEligibility",
  ]) {
    assert.deepEqual(middlewareFor(name), ["[authMiddleware]"], name);
  }
});

test("coordinator roster transports still require active coordinator assignments", () => {
  for (const name of [
    "getEligibleCoordinatorAthletes",
    "addEligibleCoordinatorAthlete",
    "saveCoordinatorPlayerInformation",
  ]) {
    assert.deepEqual(middlewareFor(name), ["[coordinatorAuthMiddleware]"], name);
  }
});
