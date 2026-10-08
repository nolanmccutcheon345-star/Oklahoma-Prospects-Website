import type { TryoutEvent } from "./tryout-events-contracts";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Prefer exact published event seasons over error-prone free text for group matching. */
export function publishedTryoutSeasons(
  events: readonly TryoutEvent[],
  sport: string,
  age: string,
): string[] {
  if (!age || !sport) return [];
  const seasons = new Map<string, string>();
  for (const event of events) {
    if (event.status !== "published" || !same(event.sport, sport) || !event.ageGroups.some(group => same(group, age)))
      continue;
    const season = event.season.trim();
    if (season && !seasons.has(season.toLowerCase())) seasons.set(season.toLowerCase(), season);
  }
  return [...seasons.values()].sort((a, b) => a.localeCompare(b));
}
