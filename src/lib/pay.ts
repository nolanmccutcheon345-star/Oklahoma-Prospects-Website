import { BOOKABLE_LANES, HOUSEHOLD_CAGE_PLAN_IDS, type BookableLaneId } from "@/lib/club";
import { ASSESSMENT_IDS, findLesson } from "@/lib/catalog";
import { PD_POLICY } from "@/lib/pd";
import type { PublicCatalog } from "@/lib/ops";

export type PaySearch = {
  kind?: string;
  id?: string;
  date?: string;
  time?: string;
  minutes?: number;
  receipt?: string;
  cages?: string;
  use?: string;
  assessed?: string;
};

export type PayLine = {
  label: string;
  amount: number;
};

export type PayItem = {
  kind: string;
  id: string;
  title: string;
  price: number;
  minutes: number;
  detail: string;
  credits: number;
  remote: number;
  planName: string;
  lines: PayLine[];
  laneIds: string[];
  use?: "household" | "team";
  error?: string;
};

function moneyLine(label: string, amount: number): PayLine {
  return { label, amount };
}

export function parseLaneIds(raw?: string): BookableLaneId[] {
  if (!raw) return [];
  const allowed = new Set(BOOKABLE_LANES.map((row) => row.id));
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is BookableLaneId => allowed.has(part as BookableLaneId));
}

export function parsePaySearch(search: Record<string, unknown>): PaySearch {
  return {
    kind: typeof search.kind === "string" ? search.kind : undefined,
    id: typeof search.id === "string" ? search.id : undefined,
    date: typeof search.date === "string" ? search.date : undefined,
    time: typeof search.time === "string" ? search.time : undefined,
    minutes:
      typeof search.minutes === "number"
        ? search.minutes
        : Number(search.minutes) || undefined,
    receipt: typeof search.receipt === "string" ? search.receipt : undefined,
    cages: typeof search.cages === "string" ? search.cages : undefined,
    use: typeof search.use === "string" ? search.use : undefined,
    assessed: typeof search.assessed === "string" ? search.assessed : undefined,
  };
}

function hourlyFor(
  catalog: PublicCatalog,
  id: "individual" | "team" | "field",
) {
  return catalog.cages.find((item) => item.id === id)?.price ?? (id === "field" ? 75 : id === "team" ? 60 : 50);
}

export function isTeamUse(use: string | undefined, laneIds: string[]): boolean {
  if (use === "team") return true;
  return parseLaneIds(laneIds.join(",")).length >= 3;
}

export function resolveCageRate(input: { use?: string; rate?: string; laneIds: string[] }): "individual" | "team" {
  if (isTeamUse(input.use, input.laneIds)) return "team";
  if (input.rate === "team" || input.use === "team") return "team";
  return "individual";
}

export function quoteCages(
  catalog: PublicCatalog,
  input: { rate: string; laneIds: string[]; minutes: number; use?: string },
): PayItem | null {
  const minutes = input.minutes > 0 ? input.minutes : 60;
  const hours = minutes / 60;
  const lanes = parseLaneIds(input.laneIds.join(","));
  const rate = resolveCageRate({ use: input.use, rate: input.rate, laneIds: lanes });

  if (lanes.length === 0) {
    return {
      kind: "cage",
      id: rate,
      title: "Pick a cage",
      price: 0,
      minutes,
      detail: "Choose at least one cage before paying.",
      credits: 0,
      remote: 0,
      planName: "",
      lines: [],
      laneIds: [],
      use: rate === "team" ? "team" : "household",
      error: "Select at least one cage before paying.",
    };
  }

  const lines: PayLine[] = lanes.map((id) => {
    const lane = BOOKABLE_LANES.find((row) => row.id === id)!;
    const hourly = lane.group === "field" ? hourlyFor(catalog, "field") : hourlyFor(catalog, rate);
    const amount = Math.round(hourly * hours);
    return moneyLine(`${minutes} min · ${lane.name} · $${hourly}/hr`, amount);
  });
  const price = lines.reduce((sum, line) => sum + line.amount, 0);
  const names = lanes.map((id) => BOOKABLE_LANES.find((row) => row.id === id)?.name ?? id);
  const title =
    lanes.length === 1
      ? names[0]
      : `${lanes.length} cages · ${names.join(" + ")}`;
  return {
    kind: "cage",
    id: rate,
    title,
    price,
    minutes,
    detail: `${minutes} min · ${names.join(" · ")} · ${rate === "team" ? "team rate" : "household rate"}`,
    credits: 0,
    remote: 0,
    planName: "",
    lines,
    laneIds: lanes,
    use: rate === "team" ? "team" : "household",
  };
}

function needsAssessmentFee(kind: string, id: string): boolean {
  if (kind === "lesson") {
    if (ASSESSMENT_IDS.has(id)) return false;
    const lesson = findLesson(id);
    if (!lesson) return true;
    if (lesson.entry || lesson.group) return false;
    if (lesson.id === "s5") return false;
    return lesson.requiresAssessment;
  }
  if (kind === "membership") return id === "m1" || id === "m2" || id === "m3";
  return false;
}

export function applyAssessmentFee(item: PayItem, hasAssessment: boolean): PayItem {
  if (hasAssessment) return item;
  if (!needsAssessmentFee(item.kind, item.id)) return item;
  const fee = PD_POLICY.assessmentSurcharge;
  const label =
    item.kind === "membership"
      ? `No assessment on file · first month +$${fee}`
      : `No assessment on file · first lesson +$${fee}`;
  const lines = [...item.lines, moneyLine(label, fee)];
  const price = item.price + fee;
  const firstMonth =
    item.kind === "membership"
      ? ` First month $${price}, then $${item.price}/mo.`
      : "";
  return {
    ...item,
    price,
    lines,
    detail: `${item.detail}${firstMonth}`,
  };
}

export function applyUseRules(item: PayItem, search: PaySearch): PayItem {
  const team = search.use === "team";
  if (item.kind === "cage-plan" && team) {
    return {
      ...item,
      error:
        "Household cage memberships are not for team practices. Book a team cage or a team monthly plan.",
    };
  }
  if (item.kind === "membership" && team && (item.id === "m1" || item.id === "m2" || item.id === "m3")) {
    return {
      ...item,
      error: "Development memberships are for one athlete, not a team workout. Use team cage rates for groups of three or more.",
    };
  }
  return item;
}

export function quoteCheckout(
  search: PaySearch,
  catalog: PublicCatalog,
  hasAssessment: boolean,
): PayItem | null {
  const item = resolvePayItem(search, catalog);
  if (!item) return null;
  const withUse = applyUseRules(item, search);
  if (withUse.error) return withUse;
  return applyAssessmentFee(withUse, hasAssessment);
}

export function resolvePayItem(
  search: PaySearch,
  catalog: PublicCatalog,
): PayItem | null {
  const kind = search.kind ?? "lesson";
  const id = search.id ?? "";
  if (kind === "lesson") {
    const lesson = catalog.lessons.find((item) => item.id === id);
    if (!lesson) return null;
    return {
      kind,
      id: lesson.id,
      title: lesson.name,
      price: lesson.price,
      minutes: lesson.minutes,
      detail: `${lesson.minutes} min · ${lesson.discipline} · ${lesson.purpose}`,
      credits: 0,
      remote: 0,
      planName: "",
      lines: [moneyLine(`${lesson.name} · ${lesson.minutes} min`, lesson.price)],
      laneIds: [],
    };
  }
  if (kind === "package") {
    const pack = catalog.packages.find((item) => item.id === id);
    if (!pack) return null;
    return {
      kind,
      id: pack.id,
      title: pack.name,
      price: pack.price,
      minutes: pack.minutes,
      detail: `${pack.credits} credits · expires in ${pack.expiresDays} days`,
      credits: pack.credits,
      remote: 0,
      planName: pack.name,
      lines: [moneyLine(`${pack.name} · ${pack.credits} sessions`, pack.price)],
      laneIds: [],
    };
  }
  if (kind === "membership") {
    const plan = catalog.memberships.find((item) => item.id === id);
    if (!plan) return null;
    return {
      kind,
      id: plan.id,
      title: plan.name,
      price: plan.price,
      minutes: plan.minutes,
      detail: plan.detail,
      credits: plan.lessons,
      remote: plan.remote,
      planName: plan.name,
      lines: [moneyLine(`${plan.name} · monthly`, plan.price)],
      laneIds: [],
    };
  }
  if (kind === "cage") {
    return quoteCages(catalog, {
      rate: id || "individual",
      laneIds: parseLaneIds(search.cages),
      minutes: search.minutes ?? 60,
      use: search.use,
    });
  }
  if (kind === "cage-plan") {
    const plan = catalog.cagePlans.find(
      (item) =>
        item.id === id || item.name.toLowerCase().replace(/\s+/g, "-") === id,
    );
    if (!plan) return null;
    const household = HOUSEHOLD_CAGE_PLAN_IDS.includes(plan.id as (typeof HOUSEHOLD_CAGE_PLAN_IDS)[number]);
    return {
      kind,
      id: plan.id,
      title: `${plan.name} cage membership`,
      price: plan.price,
      minutes: plan.hours * 60,
      detail: household
        ? `${plan.hours} included hours / month · household athletes only — not for team practices.`
        : `${plan.hours} included hours / month · ${plan.bestFor}`,
      credits: plan.hours,
      remote: 0,
      planName: plan.name,
      lines: [moneyLine(`${plan.name} · ${plan.hours} hours / month`, plan.price)],
      laneIds: [],
    };
  }
  return null;
}

export function isLessonKind(kind: string | undefined) {
  return kind === "lesson" || kind === "package" || kind === "membership";
}

export function linesTotal(lines: PayLine[]) {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}
