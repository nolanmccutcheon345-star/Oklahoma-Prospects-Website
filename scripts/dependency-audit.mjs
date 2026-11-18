import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Steve approved this temporary, pre-existing risk on 2026-11-18 for PR274.
// This is risk acceptance, NOT a vulnerability fix. Remove when upstream fixes it.
export const exception = Object.freeze({
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  source: 1247710,
  version: "4.0.7",
  path: "node_modules/picomatch",
  lockSha256: "d55f011fec1b26920cc31dbbeaa82b6840ab3aeea86c138c25b4bee75676d6c9",
  expires: "2026-11-25T00:00:00Z",
});

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function evaluateAudit(report, lockText, now = new Date()) {
  const fail = (message) => {
    throw new Error(message);
  };
  if (
    !report ||
    report.error ||
    report.auditReportVersion !== 2 ||
    !isRecord(report.vulnerabilities) ||
    Array.isArray(report.vulnerabilities) ||
    !isRecord(report.metadata?.vulnerabilities)
  )
    fail("Invalid or failed npm audit report");
  const entries = Object.entries(report.vulnerabilities);
  const levels = ["info", "low", "moderate", "high", "critical"];
  const counts = Object.fromEntries(levels.map((level) => [level, 0]));
  for (const [name, item] of entries) {
    if (
      !item ||
      item.name !== name ||
      !levels.includes(item.severity) ||
      !Array.isArray(item.via) ||
      !item.via.length ||
      !Array.isArray(item.nodes) ||
      !item.nodes.length
    )
      fail(`Malformed finding: ${name}`);
    if (item.severity === "critical") fail(`Critical finding: ${name}`);
    counts[item.severity]++;
  }
  if (
    report.metadata.vulnerabilities.total !== entries.length ||
    levels.some((level) => report.metadata.vulnerabilities[level] !== counts[level])
  )
    fail("Inconsistent audit counts");
  const roots = (name, seen = new Set()) => {
    if (seen.has(name)) fail(`Cyclic audit graph: ${name}`);
    const item = report.vulnerabilities[name];
    if (!item) fail(`Unresolved audit dependency: ${name}`);
    const next = new Set(seen).add(name);
    return item.via.flatMap((via) => {
      if (typeof via === "string") return roots(via, next);
      if (
        !via ||
        typeof via.url !== "string" ||
        !Number.isInteger(via.source) ||
        !levels.includes(via.severity) ||
        via.name !== name ||
        via.dependency !== name
      )
        fail(`Malformed advisory: ${name}`);
      return [{ advisory: via, finding: item }];
    });
  };
  let accepted = false;
  for (const [name, item] of entries) {
    for (const { advisory, finding } of roots(name)) {
      if (advisory.url === exception.url) {
        if (
          advisory.source !== exception.source ||
          advisory.name !== "picomatch" ||
          advisory.severity !== "high" ||
          advisory.range !== "<=4.0.7" ||
          finding.nodes.length !== 1 ||
          finding.nodes[0] !== exception.path
        )
          fail("Picomatch advisory no longer matches reviewed risk");
        accepted = true;
      } else if (
        ["high", "critical"].includes(advisory.severity) ||
        (["high", "critical"].includes(item.severity) &&
          !roots(name).some(({ advisory: a }) => a.url === exception.url))
      ) {
        fail(`Unaccepted high/critical finding: ${name} ${advisory.url}`);
      }
    }
  }
  if (accepted) {
    if (!Number.isFinite(+now) || +now >= Date.parse(exception.expires))
      fail("Picomatch exception expired");
    if (createHash("sha256").update(lockText).digest("hex") !== exception.lockSha256)
      fail("Reviewed dependency lock changed");
    const lock = JSON.parse(lockText);
    if (lock.packages?.[exception.path]?.version !== exception.version)
      fail("Reviewed Picomatch version changed");
  }
  return { accepted, findings: entries.length };
}

export function evaluateCommand(result, lockText, now = new Date()) {
  if (result.error || result.signal || ![0, 1].includes(result.status))
    throw new Error("npm audit did not complete successfully");
  const report = JSON.parse(result.stdout);
  const verdict = evaluateAudit(report, lockText, now);
  const blocking = report.metadata.vulnerabilities.high + report.metadata.vulnerabilities.critical;
  if (result.status !== (blocking > 0 ? 1 : 0))
    throw new Error("Audit exit status does not match report");
  return verdict;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = spawnSync("npm", ["audit", "--json", "--audit-level=high"], {
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
    });
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    const verdict = evaluateCommand(result, readFileSync("package-lock.json", "utf8"));
    console.log(
      verdict.accepted
        ? `Temporary Picomatch risk accepted until ${exception.expires}; all other high/critical findings remain blocking.`
        : "Dependency audit passed without exception.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
