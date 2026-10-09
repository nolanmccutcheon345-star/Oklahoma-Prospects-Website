const periods = ["Winter", "Spring", "Summer", "Fall"] as const;
type Period = typeof periods[number];
const periodIndex = new Map<string, number>(periods.map((period, index) => [period, index]));
const yearMin = 2025;
const yearMax = 2040;
const allowed = /^(Winter|Spring|Summer|Fall) (20\d{2})$/;

export function isValidTeamSeason(value: string): boolean {
  const m = allowed.exec(value);
  if (!m) return false;
  const year = Number(m[2]);
  return year >= yearMin && year <= yearMax;
}
export function teamSeasonOptions(startYear = 2026, endYear = 2030): string[] {
  return Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
    .flatMap(year => periods.map(period => `${period} ${year}`));
}
export function canonicalTeamSeasons(selections: readonly string[]): string {
  const unique = [...new Set(selections.map(s => s.trim()))];
  if (!unique.length || unique.length > 10 || unique.some(s => !isValidTeamSeason(s)))
    throw new Error("Choose at least one valid season.");
  unique.sort((a, b) => {
    const [, pa, ya] = allowed.exec(a)!;
    const [, pb, yb] = allowed.exec(b)!;
    return Number(ya) - Number(yb) || (periodIndex.get(pa) ?? 0) - (periodIndex.get(pb) ?? 0);
  });
  const grouped = new Map<string, Period[]>();
  for (const s of unique) {
    const [, period, year] = allowed.exec(s)!;
    grouped.set(year, [...(grouped.get(year) ?? []), period as Period]);
  }
  return [...grouped].map(([year, names]) => `${names.join(" & ")} ${year}`).join(" / ");
}
export function selectedTeamSeasons(label: string): string[] {
  const groups = label.trim().split(/\s*\/\s*/);
  const selections: string[] = [];
  for (const group of groups) {
    const yearMatch = /\s(20\d{2})$/.exec(group.trim());
    if (!yearMatch) return [];
    const names = group.trim().slice(0, -yearMatch[0].length).split(/\s*(?:&|,)\s*/);
    if (!names.length) return [];
    for (const name of names) {
      const choice = `${name} ${yearMatch[1]}`;
      if (!isValidTeamSeason(choice)) return [];
      selections.push(choice);
    }
  }
  return [...new Set(selections)];
}
