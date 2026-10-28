import {
  TEAM_DEV_AGE_BANDS,
  TEAM_DEV_BLOCKED_TOKEN,
  TEAM_DEV_LEVELS,
  type NormalizedTeamDevSeedRecord,
  type TeamDevAgeBand,
  type TeamDevLevel,
  type TeamDevSeedRecord,
  type TeamDevSuggestionContext,
} from "./contracts";

const AGE_SHORTHAND: Record<string, TeamDevAgeBand[]> = {
  "AB9+": ["agp_9u-10u","agp_11u-12u","agp_13u-14u","agp_15u-17u"],
  "AB11+": ["agp_11u-12u","agp_13u-14u","agp_15u-17u"],
  "AB13+": ["agp_13u-14u","agp_15u-17u"],
  ANY: [...TEAM_DEV_AGE_BANDS],
};
const LEVEL_SHORTHAND: Record<string, TeamDevLevel[]> = { ANY: [...TEAM_DEV_LEVELS] };

export function expandAgeBands(value: unknown): TeamDevAgeBand[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.flatMap((entry) => {
    const key = String(entry);
    if (AGE_SHORTHAND[key]) return AGE_SHORTHAND[key];
    return (TEAM_DEV_AGE_BANDS as readonly string[]).includes(key) ? [key as TeamDevAgeBand] : [];
  }))];
}
export function expandLevels(value: unknown): TeamDevLevel[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.flatMap((entry) => {
    const key = String(entry);
    if (LEVEL_SHORTHAND[key]) return LEVEL_SHORTHAND[key];
    return (TEAM_DEV_LEVELS as readonly string[]).includes(key) ? [key as TeamDevLevel] : [];
  }))];
}
function replaceBlocked(value: unknown, path: string, blocked: string[]): unknown {
  if (value === TEAM_DEV_BLOCKED_TOKEN) {
    blocked.push(path);
    return null;
  }
  if (Array.isArray(value))
    return value.map((item,index)=>replaceBlocked(item, `${path}[${index}]`, blocked));
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>))
      next[key] = replaceBlocked(item, path ? `${path}.${key}` : key, blocked);
    return next;
  }
  return value;
}
export function normalizeCeilingRefs(value: unknown, ageBand: TeamDevAgeBand): string[] {
  const refs = Array.isArray(value) ? value : value == null ? [] : [value];
  const suffix = ageBand.replace("agp_","");
  return [...new Set(refs.map(String).map(ref=>ref.replaceAll("<band>",suffix)))];
}
export function normalizeSeedRecord(input: TeamDevSeedRecord): NormalizedTeamDevSeedRecord {
  if (!input.id?.trim()) throw new Error("Seed record requires id.");
  const blocked: string[] = [];
  const replaced = replaceBlocked(input,"",blocked) as TeamDevSeedRecord;
  return {
    ...replaced,
    id: input.id.trim(),
    version: Number.isSafeInteger(input.version) && Number(input.version) > 0 ? Number(input.version) : 1,
    status: "DRAFT",
    data_label: "ESTIMATE",
    blocked_fields: [...new Set(blocked)].sort(),
  };
}

function strengthFor(ageBand: TeamDevAgeBand, level: TeamDevLevel): string | null {
  if (ageBand === "agp_6u-8u" || ageBand === "agp_9u-10u")
    return level === "LVL-FND" || level === "LVL-DEV" ? "STR-FND-01" : null;
  if (ageBand === "agp_11u-12u")
    return level === "LVL-FND" || level === "LVL-DEV" ? "STR-INT-01" : null;
  if (ageBand === "agp_13u-14u")
    return level === "LVL-DEV" || level === "LVL-ADV" ? "STR-EA-01" : null;
  if (ageBand === "agp_15u-17u") {
    if (level === "LVL-DEV") return "STR-HS-01";
    if (level === "LVL-ADV" || level === "LVL-ELT") return "STR-HSA-01";
  }
  return null;
}
function withoutStrength(ids: string[]) {
  return ids.filter(id=>!id.startsWith("STR-"));
}
function uniq(ids: string[]) { return [...new Set(ids)]; }

/**
 * Runtime correction layer for appendix MAP-* suggestions.
 * The raw imported appendix remains unchanged/DRAFT/ESTIMATE for auditability.
 * This function removes known cross-band mismatches and supplies the compatible
 * strength seed for the concrete athlete context.
 */
export function resolveSeedSuggestions(
  map: TeamDevSeedRecord,
  context: TeamDevSuggestionContext,
): string[] {
  let ids = [...(map.suggest || [])];
  const id = map.id;

  // Postseason is intentionally light/recovery; never force a strength seed.
  if (id === "MAP-12") ids = withoutStrength(ids);

  // General pitcher mapping should not smuggle an age/level-incompatible strength
  // template. Strength is resolved from concrete age + level below.
  if (id === "MAP-17") ids = withoutStrength(ids);

  // Shared recovery must not point softball athletes at a baseball-only recovery
  // program. ARM-RTN-02 is the cross-sport recovery routine.
  if (id === "MAP-20" && context.sport === "softball")
    ids = ids.filter(x=>x !== "THR-BB-REC-01");

  // 6U-8U has no seeded ARM-RTN-01/THR-SB-ARM-01 age eligibility.
  if (context.ageBand === "agp_6u-8u")
    ids = ids.filter(x=>x !== "ARM-RTN-01" && x !== "THR-SB-ARM-01");

  // In-season baseball maintenance seed begins at 11U.
  if (id === "MAP-03" && context.ageBand === "agp_9u-10u")
    ids = ids.filter(x=>x !== "THR-BB-INS-01");

  // Softball position throwing seed is not tagged for Elite.
  if (id === "MAP-19" && context.level === "LVL-ELT")
    ids = ids.filter(x=>x !== "THR-SB-POS-01");

  // All maps that attempted to carry one strength template across multiple age
  // bands are corrected from the concrete context.
  if (["MAP-05","MAP-08","MAP-09","MAP-15","MAP-17","MAP-21"].includes(id)) {
    ids = withoutStrength(ids);
    const strength = strengthFor(context.ageBand,context.level);
    if (strength) ids.push(strength);
  }

  return uniq(ids);
}

export function mapAppliesToContext(map: TeamDevSeedRecord, context: TeamDevSuggestionContext) {
  const sports = Array.isArray(map.sport) ? map.sport.map(String) : [String(map.sport || "both")];
  if (!sports.includes("both") && !sports.includes(context.sport)) return false;
  const ages = expandAgeBands(map.age_band);
  if (ages.length && !ages.includes(context.ageBand)) return false;
  const levels = expandLevels(map.level);
  if (levels.length && !levels.includes(context.level)) return false;
  const phasesRaw = Array.isArray(map.phase) ? map.phase.map(String) : map.phase ? [String(map.phase)] : [];
  if (phasesRaw.length && !phasesRaw.includes("ANY") && !phasesRaw.includes(context.phase)) return false;
  const positions = Array.isArray(map.position) ? map.position.map(String) : map.position ? [String(map.position)] : [];
  if (positions.length && !positions.includes("ALL") && !positions.includes(context.position)) return false;
  return true;
}
