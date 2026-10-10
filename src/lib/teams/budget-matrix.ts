import {
  overheadRuleSchema,
  facilityCostsSchema,
  payrollSchema,
  facilityMonthly,
  monthlyTeamOverhead,
  type OverheadRule,
} from "./facility-overhead";
import { z } from "zod";
import {
  defaultBudget,
  defaultPOOrganization,
  poAllocationFields,
  poDefaults,
  type FeeBudget,
} from "./fee-model";
import type { Team } from "./types";
const money = z.number().int().min(0).max(1000000000);
export const seasons = ["winter", "spring", "summer", "fall", "springSummer"] as const;
export const seasonNames = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  springSummer: "Spring + Summer",
};
export const matrixRow = z
  .object({
    sport: z.enum(["baseball", "softball"]),
    age: z.number().int().min(6).max(17),
    season: z.enum(seasons),
    months: z.number().positive().max(36),
    head: money,
    assistant: money,
    organization: money,
    poOrganization: money.optional(),
    insurance: money,
    background: money,
    balls: money,
    equipment: money,
    operations: money,
    misc: money,
    fields: money,
  })
  .strict();
export const masterSchema = z
  .object({
    ...poAllocationFields,
    baseline: z.number().int().min(1).max(100),
    membershipMonthly: money,
    contingencyBps: z.number().int().min(0).max(10000),
    hotelNightly: money,
    roundTo: money,
    gas: z.array(money).length(4),
    monthlyOverhead: money,
    overheadReviewed: z.boolean().optional(),
    overheadRule: overheadRuleSchema.optional(),
    facilityCosts: facilityCostsSchema.optional(),
    payroll: payrollSchema.optional(),
    reserveTarget: money,
    reserveBalance: money,
    reserveBps: z.number().int().min(0).max(10000),
    afterTargetBps: z.number().int().min(0).max(10000),
    rows: z.array(matrixRow).length(120),
  })
  .strict()
  .refine(
    (m) => new Set(m.rows.map(rowKey)).size === 120,
    "Each sport, age and season needs exactly one row.",
  );
export type MasterMatrix = z.infer<typeof masterSchema>;
export type MatrixRow = z.infer<typeof matrixRow>;
export const rowKey = (r: Pick<MatrixRow, "sport" | "age" | "season">) =>
  `${r.sport}:${r.age}:${r.season}`;
const head = [
  [600, 900, 700, 700, 1500],
  [650, 1000, 750, 750, 1700],
  [700, 1100, 800, 800, 1900],
  [750, 1200, 900, 900, 2100],
  [800, 1300, 1000, 1000, 2300],
  [900, 1500, 1100, 1100, 2600],
  [1000, 1700, 1300, 1300, 3000],
  [1100, 1900, 1500, 1500, 3400],
  [1200, 2200, 1700, 1700, 3900],
  [1300, 2400, 1900, 1900, 4300],
  [1400, 2600, 2100, 2000, 4700],
  [1500, 2800, 2300, 2200, 5100],
];
const org = [
  [125, 200, 175, 200, 275],
  [125, 225, 175, 225, 300],
  [150, 225, 200, 225, 325],
  [150, 250, 200, 250, 350],
  [175, 275, 225, 275, 375],
  [175, 300, 250, 300, 425],
  [200, 325, 275, 325, 450],
  [225, 350, 300, 375, 500],
  [225, 375, 325, 425, 550],
  [250, 400, 350, 550, 600],
  [250, 425, 350, 600, 600],
  [275, 450, 375, 625, 650],
];
const baseball = [
  [75, 175, 150, 150, 300],
  [100, 250, 200, 200, 400],
  [125, 300, 250, 250, 500],
  [150, 350, 300, 300, 600],
  [175, 425, 350, 350, 700],
];
const softball = [
  [75, 200, 150, 150, 325],
  [100, 250, 200, 200, 425],
  [125, 325, 250, 250, 525],
  [150, 375, 300, 300, 625],
  [175, 425, 350, 350, 725],
];
const equipment = [
  [50, 150, 125, 125, 250],
  [75, 175, 150, 150, 275],
  [75, 175, 150, 150, 300],
  [100, 200, 175, 175, 350],
  [100, 250, 200, 200, 400],
];
const operations = [
  [50, 100, 100, 100, 175],
  [50, 100, 100, 100, 175],
  [50, 125, 100, 100, 225],
  [50, 125, 100, 100, 225],
  [50, 150, 125, 125, 250],
];
const misc = [
  [50, 100, 75, 75, 150],
  [50, 100, 75, 75, 150],
  [50, 100, 100, 100, 175],
  [50, 100, 100, 100, 175],
  [50, 125, 100, 100, 200],
];
const fields = [
  [0, 300, 200, 0, 500],
  [0, 400, 250, 0, 650],
  [0, 500, 300, 0, 800],
  [0, 600, 400, 0, 1000],
  [0, 500, 400, 0, 900],
];
export function seedMasterMatrix(): MasterMatrix {
  const rows: MatrixRow[] = [];
  for (const sport of ["baseball", "softball"] as const)
    for (let age = 6; age <= 17; age++)
      for (let s = 0; s < 5; s++) {
        const group = age <= 8 ? 0 : age <= 10 ? 1 : age <= 12 ? 2 : age <= 14 ? 3 : 4;
        rows.push({
          sport,
          age,
          season: seasons[s],
          months: [2.5, 3.5, 2.5, 2.5, 6][s],
          head: head[age - 6][s] * 100,
          assistant: head[age - 6][s] * 50,
          organization: org[age - 6][s] * 100,
          poOrganization: defaultPOOrganization(org[age - 6][s] * 100),
          insurance: (age <= 12 ? 200 : age <= 15 ? 250 : 300) * 100,
          background: 3000,
          balls: (sport === "baseball" ? baseball : softball)[group][s] * 100,
          equipment: equipment[group][s] * 100,
          operations: operations[group][s] * 100,
          misc: misc[group][s] * 100,
          fields: fields[group][s] * 100,
        });
      }
  return {
    ...poDefaults,
    baseline: 10,
    membershipMonthly: 20000,
    contingencyBps: 1500,
    hotelNightly: 20000,
    roundTo: 2500,
    gas: [15000, 25000, 40000, 60000],
    monthlyOverhead: 800000,
    reserveTarget: 2400000,
    reserveBalance: 0,
    reserveBps: 1000,
    afterTargetBps: 500,
    rows,
  };
}
export function matchMatrix(
  team: Pick<Team, "age" | "sport" | "seasonLabel" | "seasons">,
  master: MasterMatrix,
) {
  const age = Number(team.age.match(/^(\d{1,2})\s*[uU]?$/)?.[1]);
  const label = (team.seasons?.length ? team.seasons : [team.seasonLabel]).join(" ");
  const found = seasons.slice(0, 4).filter((s) => new RegExp(s, "i").test(label));
  const years = [...new Set(label.match(/20\d{2}/g) || [])];
  const season =
    found.length === 1 && years.length <= 1
      ? found[0]
      : found.length === 2 &&
          found.includes("spring") &&
          found.includes("summer") &&
          years.length <= 1
        ? "springSummer"
        : null;
  return (
    master.rows.find((r) => r.age === age && r.sport === team.sport && r.season === season) || null
  );
}
export function budgetFromMatrix(team: Team, master: MasterMatrix, row: MatrixRow): FeeBudget {
  const b = defaultBudget();
  const amounts: Record<string, number> = {
    "Head coach": row.head,
    "Assistant coach": row.assistant,
    Insurance: row.insurance,
    "Background checks": row.background,
    Baseballs: row.balls,
    Equipment: row.equipment,
    "Team operations": row.operations,
    Miscellaneous: row.misc,
    "Field rental": row.fields,
  };
  return {
    ...b,
    start: team.seasonStart,
    end: team.seasonEnd,
    months: row.months,
    baseline: master.baseline,
    membershipMonthly: master.membershipMonthly,
    contingencyBps: master.contingencyBps,
    hotelNightly: master.hotelNightly,
    roundTo: master.roundTo,
    fullOrg: row.organization,
    poOrg: row.poOrganization ?? defaultPOOrganization(row.organization),
    ...Object.fromEntries(
      Object.keys(poDefaults).map((k) => [
        k,
        master[k as keyof typeof poDefaults] ?? poDefaults[k as keyof typeof poDefaults],
      ]),
    ),
    poOverrideReason: master.poOverrideReason,
    costs: b.costs.map((c) => ({
      ...c,
      id:
        c.name === "Head coach"
          ? "matrix-head"
          : c.name === "Assistant coach"
            ? "matrix-assistant"
            : c.id,
      name: c.name === "Baseballs" ? "Practice / game balls" : c.name,
      cents: amounts[c.name] || 0,
    })),
    poEnabled: false,
    scheduleCostsAutomatic: true,
    readiness: {
      schedule: false,
      gas: false,
      hotels: false,
      other: false,
      processing: false,
      noUniform: false,
    },
  };
}

export function allocateMonthlyBusiness(
  master: MasterMatrix,
  teams: {
    id: string;
    name: string;
    players: number;
    contribution: number;
    overheadRule?: OverheadRule;
  }[],
) {
  const total = teams.reduce((n, t) => n + t.players, 0);
  const monthly = facilityMonthly(master);
  let remainder = monthly;
  const rows = teams.map((t) => {
    const overhead =
      monthlyTeamOverhead(master, t.overheadRule) ??
      (total ? Math.floor((monthly * t.players) / total) : 0);
    remainder -= overhead;
    return { ...t, overhead };
  });
  if (total && teams.every((t) => monthlyTeamOverhead(master, t.overheadRule) === null))
    for (let i = 0; remainder > 0; i = (i + 1) % rows.length)
      if (rows[i].players) {
        rows[i].overhead++;
        remainder--;
      }
  const contribution = rows.reduce((n, r) => n + r.contribution, 0),
    net = contribution - monthly;
  const gap = Math.max(0, master.reserveTarget - master.reserveBalance);
  const reserve = Math.min(
    Math.max(0, net),
    Math.ceil(
      (Math.max(0, contribution) * (gap ? master.reserveBps : master.afterTargetBps)) / 10000,
    ),
    gap || Infinity,
  );
  const positive = rows.reduce((n, r) => n + Math.max(0, r.contribution - r.overhead), 0);
  let reserveLeft = reserve;
  const allocated = rows.map((r) => {
    const share = positive
      ? Math.floor((reserve * Math.max(0, r.contribution - r.overhead)) / positive)
      : 0;
    reserveLeft -= share;
    return { ...r, reserve: share };
  });
  if (positive)
    for (let i = 0; reserveLeft > 0; i = (i + 1) % allocated.length)
      if (allocated[i].contribution > allocated[i].overhead) {
        allocated[i].reserve++;
        reserveLeft--;
      }
  return {
    rows: allocated,
    contribution,
    overhead: monthly,
    unallocatedOverhead: Math.max(0, remainder),
    overallocatedOverhead: Math.max(0, -remainder),
    reserve,
    net,
    distributable: Math.max(0, net - reserve),
  };
}

// Upgrade working drafts, never publishedBudget or accepted player locks.
export function linkedPODraft(b: FeeBudget, master: MasterMatrix, team: Team): FeeBudget {
  b = { ...b, poEnabled: b.poEnabled ?? team.sport === "baseball" };
  if (b.poModel === 2) return b;
  const row = matchMatrix(team, master);
  return {
    ...b,
    ...Object.fromEntries(
      Object.keys(poDefaults).map((k) => [
        k,
        master[k as keyof typeof poDefaults] ?? poDefaults[k as keyof typeof poDefaults],
      ]),
    ),
    poModel: 2,
    poOrg: b.poOrg || (row?.poOrganization ?? defaultPOOrganization(b.fullOrg)),
    poOverrideReason: master.poOverrideReason,
  };
}
export function normalizePOMaster(m: MasterMatrix): MasterMatrix {
  return {
    ...poDefaults,
    ...m,
    rows: m.rows.map((r) => ({
      ...r,
      poOrganization: r.poOrganization ?? defaultPOOrganization(r.organization),
    })),
  };
}
