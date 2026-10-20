import { z } from "zod";
import { tournamentToday, validTournamentDate } from "../teams/tournament-finder";

/** Only known public directory/event routes. Never echo arbitrary legacy URLs or query data. */
export function safeOrganizationTournamentSourceUrl(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 2000) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash)
      return "";
    const route = url.pathname;
    const params = [...url.searchParams.entries()];
    if (["www.usssa.com", "usssa.com"].includes(url.hostname)) {
      if (/^\/(baseball_events|fastpitch_events)\/?$/.test(route) && !url.search) return url.href;
      if (
        /^\/(baseball|fastpitch)\/event_home\/?$/.test(route) &&
        params.length === 1 &&
        params[0][0] === "eventID" &&
        /^\d{1,12}$/.test(params[0][1])
      )
        return url.href;
    }
    if (
      ["www.perfectgame.org", "perfectgame.org"].includes(url.hostname) &&
      route === "/Events/Default.aspx" &&
      params.length === 1 &&
      params[0][0] === "event" &&
      /^\d{1,12}$/.test(params[0][1])
    )
      return url.href;
    if (url.hostname === "search.perfectgame.org" && route === "/" && !url.search) return url.href;
    if (url.hostname === "play.fivetoolyouth.org" && /^\/events\/?$/.test(route) && !url.search)
      return url.href;
  } catch {
    /* Unsupported historical source remains private. */
  }
  return "";
}

export type OrganizationTournament = {
  id: string;
  name: string;
  org: string;
  city: string;
  state: string;
  start: string;
  end: string;
  ages: string[];
  levels: string[];
  sport: "baseball" | "softball";
  type: "tournament" | "showcase";
  sourceUrl: string;
  sourceCheckedOn: string;
  distanceMiles: number | null;
  sourceEditable: boolean;
};
export type OrganizationTournamentTeam = {
  id: string;
  name: string;
  sport: "baseball" | "softball";
  age: string;
  level: string;
  seasonStart: string;
  seasonEnd: string;
  tournamentIds: string[];
};
export type OrganizationTournamentWorkspace = {
  revision: number;
  teams: OrganizationTournamentTeam[];
  catalog: OrganizationTournament[];
};
const optionalDate = z.string().refine((v) => !v || validTournamentDate(v), "Choose a valid date.");
const numericFilter = z
  .string()
  .refine(
    (v) => v === "" || (/^\d+(?:\.\d+)?$/.test(v) && Number(v) <= 5000),
    "Enter a distance between 0 and 5000 miles.",
  );
export const organizationTournamentFilters = z
  .object({
    query: z.string().max(200),
    sport: z.enum(["", "baseball", "softball"]),
    age: z.string().max(20),
    state: z.string().max(2),
    division: z.string().max(50),
    range: z.enum(["season", "30", "90", "all", "custom"]),
    from: optionalDate,
    to: optionalDate,
    maxDistance: numericFilter,
    type: z.enum(["", "tournament", "showcase"]),
    plannedOnly: z.boolean(),
    sort: z.enum(["date", "distance"]),
  })
  .strict();
export type OrganizationTournamentFilters = z.infer<typeof organizationTournamentFilters>;
export const organizationTournamentExportInput = z
  .object({
    teamId: z.string().max(150),
    filters: organizationTournamentFilters,
  })
  .strict();
export const organizationTournamentSourceInput = z
  .object({
    id: z.string().trim().min(1).max(150),
    revision: z.number().int().nonnegative(),
    sourceUrl: z
      .string()
      .max(2000)
      .refine(
        (v) => !v || Boolean(safeOrganizationTournamentSourceUrl(v)),
        "Use a supported public USSSA, Perfect Game, or Five Tool organizer link without private parameters.",
      ),
    sourceCheckedOn: z
      .string()
      .refine(
        (v) => !v || (validTournamentDate(v) && v <= tournamentToday()),
        "Source checked must be today or earlier.",
      ),
    distanceMiles: z.number().finite().min(0).max(5000).nullable(),
  })
  .strict()
  .refine(
    (v) => !v.sourceCheckedOn || Boolean(v.sourceUrl),
    "Add an organizer link before recording a source check.",
  );
export type OrganizationTournamentSourceInput = z.infer<typeof organizationTournamentSourceInput>;

export function defaultOrganizationTournamentFilters(
  team?: OrganizationTournamentTeam,
): OrganizationTournamentFilters {
  return {
    query: "",
    sport: team?.sport || "",
    age: team?.age || "",
    state: "",
    division: "",
    range: team ? "season" : "90",
    from: "",
    to: "",
    maxDistance: "",
    type: "",
    plannedOnly: false,
    sort: "date",
  };
}
export function organizationTournamentRange(
  filters: OrganizationTournamentFilters,
  team?: OrganizationTournamentTeam,
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
export function filterOrganizationTournaments(
  catalog: OrganizationTournament[],
  filters: OrganizationTournamentFilters,
  team?: OrganizationTournamentTeam,
  today?: string,
) {
  const { from, to } = organizationTournamentRange(filters, team, today);
  const query = filters.query.trim().toLowerCase();
  if (from && to && from > to) return [];
  return catalog
    .filter((event) => {
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
      if (filters.plannedOnly && !team?.tournamentIds.includes(event.id)) return false;
      if ((from || to) && !validTournamentDate(event.start)) return false;
      if (from && (event.end || event.start) < from) return false;
      if (to && event.start > to) return false;
      if (
        filters.maxDistance !== "" &&
        (event.distanceMiles === null || event.distanceMiles > Number(filters.maxDistance))
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      const first =
        filters.sort === "distance"
          ? (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity)
          : a.start.localeCompare(b.start);
      return (
        (Number.isNaN(first) ? 0 : first) ||
        a.start.localeCompare(b.start) ||
        a.name.localeCompare(b.name)
      );
    });
}
export function organizationTournamentConflict(
  event: OrganizationTournament,
  team: OrganizationTournamentTeam,
  catalog: OrganizationTournament[],
) {
  return catalog.find(
    (other) =>
      other.id !== event.id &&
      team.tournamentIds.includes(other.id) &&
      event.start <= (other.end || other.start) &&
      other.start <= (event.end || event.start),
  );
}
