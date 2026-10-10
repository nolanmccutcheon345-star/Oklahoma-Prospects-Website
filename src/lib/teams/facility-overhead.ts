import { z } from "zod";
export const overheadRuleSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("automatic") }).strict(),
  z.object({ mode: z.literal("percent"), bps: z.number().int().min(0).max(10000) }).strict(),
  z.object({ mode: z.literal("fixed"), monthly: z.number().int().min(0).max(1000000000) }).strict(),
]);
export type OverheadRule = z.infer<typeof overheadRuleSchema>;
export const facilityCostsSchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(100),
        name: z.string().trim().min(1).max(120),
        monthly: z.number().int().min(0).max(1000000000),
      })
      .strict(),
  )
  .max(50)
  .refine(
    (rows) => new Set(rows.map((r) => r.id)).size === rows.length,
    "Duplicate cost categories.",
  );
export const payrollSchema = z
  .array(
    z
      .object({
        userId: z.string().min(1).max(150),
        name: z.string().max(200),
        monthly: z.number().int().min(0).max(1000000000),
        active: z.boolean(),
      })
      .strict(),
  )
  .max(200)
  .refine(
    (rows) => new Set(rows.map((r) => r.userId)).size === rows.length,
    "A person can appear on payroll only once.",
  );
export type FacilityConfig = {
  monthlyOverhead: number;
  facilityCosts?: z.infer<typeof facilityCostsSchema>;
  payroll?: z.infer<typeof payrollSchema>;
  overheadRule?: OverheadRule;
};
export function facilityMonthly(m: FacilityConfig) {
  return m.facilityCosts
    ? m.facilityCosts.reduce((s, c) => s + c.monthly, 0) +
        (m.payroll || []).filter((p) => p.active).reduce((s, p) => s + p.monthly, 0)
    : m.monthlyOverhead;
}
export function monthlyTeamOverhead(m: FacilityConfig, override?: OverheadRule) {
  const rule = override || m.overheadRule || { mode: "automatic" };
  return rule.mode === "fixed"
    ? rule.monthly
    : rule.mode === "percent"
      ? Math.round((facilityMonthly(m) * rule.bps) / 10000)
      : null;
}
export function teamSeasonOverhead<
  T extends { months: number; overhead: number; overheadRule?: OverheadRule },
>(b: T, m: FacilityConfig): T {
  const monthly = monthlyTeamOverhead(m, b.overheadRule);
  if (monthly === null) return b;
  const overhead = Math.round(monthly * b.months);
  if (!Number.isSafeInteger(overhead) || overhead > 1000000000)
    throw Error("Season overhead exceeds the supported total.");
  return { ...b, overhead };
}
export function initialFacilityCosts(total: number) {
  const base =
    total === 800000
      ? [
          ["lease", "Lease", 500000],
          ["utilities", "Utilities", 200000],
          ["maintenance", "Maintenance", 100000],
        ]
      : [["existing", "Existing facility costs", total]];
  return [
    ...base,
    ["software", "Software", 0],
    ["cleaning", "Cleaning", 0],
    ["equipment", "Equipment", 0],
    ["staffing", "Other monthly staffing", 0],
    ["other", "Other", 0],
  ].map(([id, name, monthly]) => ({
    id: String(id),
    name: String(name),
    monthly: Number(monthly),
  }));
}
