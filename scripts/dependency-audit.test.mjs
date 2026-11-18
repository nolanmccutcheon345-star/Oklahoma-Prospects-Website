import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateAudit, evaluateCommand, exception } from "./dependency-audit.mjs";
const lock = readFileSync(new URL("../package-lock.json", import.meta.url), "utf8");
const now = new Date("2026-11-18T12:00:00Z");
const advisory = () => ({
  name: "picomatch",
  dependency: "picomatch",
  source: exception.source,
  url: exception.url,
  severity: "high",
  range: "<=4.0.7",
});
const finding = (name, severity, via) => ({ name, severity, via, nodes: [`node_modules/${name}`] });
function report(vulnerabilities) {
  const counts = {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    total: Object.keys(vulnerabilities).length,
  };
  for (const v of Object.values(vulnerabilities)) counts[v.severity]++;
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: counts } };
}
const fixture = () =>
  report({
    picomatch: finding("picomatch", "high", [advisory()]),
    parent: finding("parent", "high", ["picomatch"]),
  });
const evaluate = (r) => evaluateAudit(r, lock, now);
test("accepts only reviewed Picomatch and its transitive chains", () =>
  assert.equal(evaluate(fixture()).accepted, true));
test("clean audit needs no exception even after expiry", () =>
  assert.equal(evaluateAudit(report({}), "irrelevant", new Date("2030-01-01")).accepted, false));
test("preserves existing moderate-only threshold", () =>
  assert.equal(
    evaluate(
      report({
        moderate: finding("moderate", "moderate", [
          {
            name: "moderate",
            dependency: "moderate",
            source: 1,
            url: "https://example.invalid/moderate",
            severity: "moderate",
          },
        ]),
      }),
    ).accepted,
    false,
  ));
for (const severity of ["high", "critical"])
  test(`blocks unrelated ${severity} even in mixed Picomatch chain`, () => {
    const r = fixture();
    r.vulnerabilities.other = finding("other", severity, [
      {
        name: "other",
        dependency: "other",
        source: 2,
        url: "https://example.invalid/other",
        severity,
      },
    ]);
    r.vulnerabilities.parent.via.push("other");
    assert.throws(() => evaluate(report(r.vulnerabilities)), /Unaccepted|Critical/);
  });
for (const [label, mutate] of [
  ["wrong source", (r) => r.vulnerabilities.picomatch.via[0].source++],
  ["changed severity", (r) => (r.vulnerabilities.picomatch.via[0].severity = "critical")],
  ["changed range", (r) => (r.vulnerabilities.picomatch.via[0].range = "*")],
  [
    "extra path",
    (r) => r.vulnerabilities.picomatch.nodes.push("node_modules/other/node_modules/picomatch"),
  ],
  ["unresolved dependency", (r) => r.vulnerabilities.parent.via.push("missing")],
  ["cycle", (r) => r.vulnerabilities.picomatch.via.push("parent")],
  ["error response", (r) => (r.error = { message: "offline" })],
  ["missing count", (r) => delete r.metadata.vulnerabilities.high],
  ["wrong version", (r) => (r.auditReportVersion = 3)],
  ["empty via", (r) => (r.vulnerabilities.parent.via = [])],
  ["malformed advisory", (r) => (r.vulnerabilities.picomatch.via = [{}])],
])
  test(`fails closed: ${label}`, () => {
    const r = fixture();
    mutate(r);
    assert.throws(() => evaluate(r));
  });
test("lockfile drift blocks exception", () =>
  assert.throws(() => evaluateAudit(fixture(), lock + "\n", now), /lock changed/));
test("expired and invalid clocks block exception", () => {
  for (const date of [new Date(exception.expires), new Date("invalid")])
    assert.throws(() => evaluateAudit(fixture(), lock, date), /expired/);
});

test("rejects malformed vulnerability and count containers", () => {
  for (const value of [true, 4, "", [], null]) {
    const r = report({});
    r.vulnerabilities = value;
    assert.throws(() => evaluate(r));
    const q = report({});
    q.metadata.vulnerabilities = value;
    assert.throws(() => evaluate(q));
  }
});
test("critical propagated severity cannot inherit exception", () => {
  const r = fixture();
  r.vulnerabilities.parent.severity = "critical";
  assert.throws(() => evaluate(report(r.vulnerabilities)), /Critical/);
});
test("command status, malformed output, errors and signals fail closed", () => {
  for (const result of [
    { status: 1, stdout: JSON.stringify(report({})) },
    { status: 0, stdout: JSON.stringify(fixture()) },
    { status: 2, stdout: JSON.stringify(fixture()) },
    { status: 1, stdout: "not JSON" },
    { status: null, signal: "SIGTERM", stdout: "" },
    { status: 1, error: new Error("timeout"), stdout: "" },
    { status: 1, stdout: JSON.stringify({ error: { message: "registry down" } }) },
  ])
    assert.throws(() => evaluateCommand(result, lock, now));
  assert.equal(
    evaluateCommand({ status: 1, stdout: JSON.stringify(fixture()) }, lock, now).accepted,
    true,
  );
});
