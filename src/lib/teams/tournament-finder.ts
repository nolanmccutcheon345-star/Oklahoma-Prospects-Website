import { z } from "zod";
import type { EventItem, Team } from "./types";

export function safeTournamentUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function validTournamentDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T12:00:00Z")) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}

export function tournamentToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

const date = z.string().refine(validTournamentDate, "Enter a valid date.");
export function validTournamentSource(value: {
  sourceCheckedOn?: string;
  sourceUrl?: string;
}): boolean {
  return !value.sourceCheckedOn || Boolean(value.sourceUrl && safeTournamentUrl(value.sourceUrl));
}

export const tournamentMetadata = {
  sourceUrl: z
    .string()
    .max(2000)
    .refine((v) => !v || Boolean(safeTournamentUrl(v)), "Use a complete HTTPS organizer link.")
    .optional(),
  sourceCheckedOn: z
    .string()
    .refine(
      (v) => !v || (validTournamentDate(v) && v <= tournamentToday()),
      "Last checked must be today or earlier.",
    )
    .optional(),
  distanceMiles: z.number().finite().min(0).max(5000).optional(),
};
export function parseTournamentSourceMetadata(input: unknown) {
  return z
    .object(tournamentMetadata)
    .strict()
    .refine(validTournamentSource, "Add an organizer link before recording a source check.")
    .parse(input);
}

/** Do not rewrite historical dates, eligibility, or costs used by an existing team schedule. */
export function assertTournamentCatalogEdits(
  stored: { catalog: EventItem[]; teams: Team[] },
  incoming: { catalog: EventItem[] },
): void {
  const referenced = new Set(stored.teams.flatMap((team) => team.tournamentIds));
  const protectedFields: (keyof EventItem)[] = [
    "id",
    "name",
    "org",
    "city",
    "state",
    "start",
    "end",
    "ages",
    "levels",
    "fee",
    "sport",
    "type",
    "stayToPlay",
    "verifiedOn",
  ];
  for (const old of stored.catalog) {
    if (!referenced.has(old.id)) continue;
    const next = incoming.catalog.find((event) => event.id === old.id);
    if (
      !next ||
      protectedFields.some((key) => JSON.stringify(old[key]) !== JSON.stringify(next[key]))
    )
      throw new Error(
        "A scheduled tournament's details are locked. Update only its source and distance, or create a separate record for changed event details.",
      );
  }
  for (const event of incoming.catalog) {
    if (
      event.org.trim().toLowerCase() === "team schedule" &&
      !stored.catalog.some((old) => old.id === event.id && old.org === "Team schedule")
    )
      throw new Error("Team schedule is reserved for the shared activity calendar.");
  }
}

const record = z
  .object({
    id: z.string().min(1).max(150),
    name: z.string().trim().min(1).max(200),
    org: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(
        (value) => value.toLowerCase() !== "team schedule",
        "Use the organizer name; Team schedule is reserved for the shared activity calendar.",
      ),
    city: z.string().trim().min(1).max(200),
    state: z.string().regex(/^[A-Z]{2}$/, "Use a two-letter state abbreviation."),
    start: date,
    end: date,
    ages: z
      .array(z.string().regex(/^(?:[4-9]|1[0-9])U$|^Adult$/))
      .min(1)
      .max(20),
    levels: z.array(z.string().trim().min(1).max(50)).min(1).max(20),
    fee: z.number().finite().min(0).max(10000000),
    sport: z.enum(["baseball", "softball"]),
    type: z.enum(["tournament", "showcase"]),
    stayToPlay: z.boolean(),
    verifiedOn: z.string().max(200),
    ...tournamentMetadata,
  })
  .strict()
  .refine((v) => v.end >= v.start, "End date must be on or after the start date.")
  .refine(validTournamentSource, "Add an organizer link before recording a source check.");

export function parseTournamentRecord(input: unknown): EventItem {
  return record.parse(input);
}

export type TournamentFilters = {
  query: string;
  sport: string;
  age: string;
  state: string;
  division: string;
  range: "season" | "30" | "90" | "all" | "custom";
  from: string;
  to: string;
  maxFee: string;
  maxDistance: string;
  type: string;
  noStayToPlay: boolean;
  plannedOnly: boolean;
  sort: "date" | "fee" | "distance";
};

export function defaultTournamentFilters(team?: Team): TournamentFilters {
  return {
    query: "",
    sport: team?.sport || "",
    age: team?.age || "",
    state: "",
    division: "",
    range: team ? "season" : "90",
    from: "",
    to: "",
    maxFee: "",
    maxDistance: "",
    type: "",
    noStayToPlay: false,
    plannedOnly: false,
    sort: "date",
  };
}

export function tournamentRange(
  filters: TournamentFilters,
  team?: Team,
  today = tournamentToday(),
) {
  if (filters.range === "season")
    return { from: team?.seasonStart || "", to: team?.seasonEnd || "" };
  if (filters.range === "custom") return { from: filters.from, to: filters.to };
  if (filters.range === "all") return { from: "", to: "" };
  const end = new Date(today + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + Number(filters.range) - 1);
  return { from: today, to: end.toISOString().slice(0, 10) };
}

export function tournamentMatchesTeam(event: EventItem, team: Team): boolean {
  return event.sport === team.sport && event.ages.includes(team.age);
}

export function tournamentConflict(
  event: EventItem,
  team: Team,
  catalog: EventItem[],
): EventItem | undefined {
  return catalog.find(
    (other) =>
      other.id !== event.id &&
      team.tournamentIds.includes(other.id) &&
      event.start <= (other.end || other.start) &&
      other.start <= (event.end || event.start),
  );
}

export function filterTournaments(
  catalog: EventItem[],
  filters: TournamentFilters,
  team?: Team,
  today?: string,
): EventItem[] {
  const { from, to } = tournamentRange(filters, team, today);
  const query = filters.query.trim().toLowerCase();
  if (from && to && from > to) return [];
  return catalog
    .filter((event) => {
      if (event.org === "Team schedule") return false;
      if (
        query &&
        ![event.name, event.org, event.city, event.state].join(" ").toLowerCase().includes(query)
      )
        return false;
      if (filters.sport && event.sport !== filters.sport) return false;
      if (filters.age && !event.ages.includes(filters.age)) return false;
      if (filters.state && event.state !== filters.state) return false;
      if (filters.division && !event.levels.includes(filters.division)) return false;
      if (filters.type && event.type !== filters.type) return false;
      if (filters.noStayToPlay && event.stayToPlay) return false;
      if (filters.plannedOnly && !team?.tournamentIds.includes(event.id)) return false;
      if ((from || to) && !validTournamentDate(event.start)) return false;
      if (from && (event.end || event.start) < from) return false;
      if (to && event.start > to) return false;
      if (filters.maxFee !== "" && event.fee > Number(filters.maxFee)) return false;
      if (
        filters.maxDistance !== "" &&
        (event.distanceMiles == null || event.distanceMiles > Number(filters.maxDistance))
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      const primary =
        filters.sort === "fee"
          ? a.fee - b.fee
          : filters.sort === "distance"
            ? (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity)
            : a.start.localeCompare(b.start);
      return (
        (Number.isNaN(primary) ? 0 : primary) ||
        a.start.localeCompare(b.start) ||
        a.name.localeCompare(b.name)
      );
    });
}

// Official directories checked October 19, 2026. These are outbound links, not feeds.
export const TOURNAMENT_DIRECTORIES = [
  { name: "USSSA Baseball", sport: "baseball", url: "https://www.usssa.com/baseball_events" },
  { name: "USSSA Fastpitch", sport: "softball", url: "https://www.usssa.com/fastpitch_events" },
  { name: "Perfect Game", sport: "", url: "https://search.perfectgame.org/" },
  { name: "Five Tool Youth", sport: "", url: "https://play.fivetoolyouth.org/events" },
] as const;
