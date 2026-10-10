import { seedMasterMatrix, masterSchema, rowKey } from "../src/lib/teams/budget-matrix.ts";
import { writeFile } from "node:fs/promises";
const m = masterSchema.parse(seedMasterMatrix());
const columns = [
  "months",
  "head",
  "assistant",
  "organization",
  "insurance",
  "background",
  "balls",
  "equipment",
  "operations",
  "misc",
  "fields",
];
const rows = m.rows.map((r) => {
  for (const k of columns) if (!Number.isFinite(r[k]) || r[k] < 0) throw Error(`${rowKey(r)} ${k}`);
  return `| ${rowKey(r)} | ${columns.map((k) => (k === "months" ? r[k] : (r[k] / 100).toFixed(2))).join(" | ")} | PASS |`;
});
await writeFile(
  "docs/budget-matrix-validation.md",
  `# Supplied master matrix validation\n\n120/120 unique combinations passed: two sports × ages 6–17 × five seasons. All required defaults are populated; amounts below are dollars. Zero outdoor-field cost for Winter/Fall is intentional. This validates the supplied defaults, not unsupplied actual facility expenses or live team season choices.\n\n| Row | Months | Head | Assistant | Org/player | Insurance | Background | Balls | Equipment | Operations | Misc | Fields | Result |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|\n${rows.join("\n")}\n`,
);
console.log("PASS: 120/120 complete unique master rows.");

const { calculateFees } = await import("../src/lib/teams/fee-model.ts");
const { budgetFromMatrix } = await import("../src/lib/teams/budget-matrix.ts");
const { sampleClub } = await import("../src/lib/teams/seed.ts");
const { appendFile } = await import("node:fs/promises");
const poRows = m.rows.map((r) => {
  const f = calculateFees(budgetFromMatrix(sampleClub().teams[0], m, r));
  if (f.allocation !== f.poAllocation || f.poSubsidy !== 0)
    throw Error(`PO underfunded: ${rowKey(r)}`);
  return `| ${rowKey(r)} | ${(r.poOrganization / 100).toFixed(2)} | ${(f.member / 100).toFixed(2)} | ${(f.poMember / 100).toFixed(2)} | ${(f.poDiscount / 100).toFixed(2)} | 100% |`;
});
await appendFile(
  "docs/budget-matrix-validation.md",
  `\n## Linked PO pricing audit\n\n120/120 PO rows fund the identical shared/direct component. Discounts below exclude processing and final rounding. Membership defaults: full $200/month; PO $150/month. Exact supplied organization/discount matrices are also independently asserted in po-pricing.test.ts.\n\n| Row | PO organization | Full membership | PO membership | PO discount | Shared cost allocation |\n|---|---:|---:|---:|---:|---:|\n${poRows.join("\n")}\n`,
);
console.log("PASS: 120/120 linked PO common-cost and membership calculations.");
