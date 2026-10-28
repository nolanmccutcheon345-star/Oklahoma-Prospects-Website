/** Independent nonfinancial adapter. Never return or save the legacy ClubRecord contract. */
import type { z } from "zod";
import type { Sql } from "../db";
import { validTournamentDate } from "../teams/tournament-finder";
import { audit, CoordinatorDenied, requireOrganizationOperations, secured } from "./access.server";
import {
  filterOrganizationTournaments,
  safeOrganizationTournamentSourceUrl,
  organizationTournamentExportInput,
  organizationTournamentSourceInput,
  type OrganizationTournament,
  type OrganizationTournamentSourceInput,
  type OrganizationTournamentWorkspace,
} from "./organization-tournaments-contracts";

type Json = Record<string, unknown>;
const object = (v: unknown): Json =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const objects = (v: unknown): Json[] =>
  Array.isArray(v)
    ? v.filter((x): x is Json => x !== null && typeof x === "object" && !Array.isArray(x))
    : [];
const string = (v: unknown) => (typeof v === "string" ? v : "");
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
const date = (v: unknown) => (typeof v === "string" && validTournamentDate(v) ? v : "");
const sport = (v: unknown): "baseball" | "softball" | null =>
  v === "baseball" || v === "softball" ? v : null;
const inactive = (v: unknown) =>
  v === true || (typeof v === "string" && Boolean(v) && v !== "false");
function sourceEditable(raw: Json) {
  return (
    (raw.sourceUrl === undefined ||
      raw.sourceUrl === "" ||
      Boolean(safeOrganizationTournamentSourceUrl(raw.sourceUrl))) &&
    (raw.sourceCheckedOn === undefined ||
      raw.sourceCheckedOn === "" ||
      Boolean(date(raw.sourceCheckedOn))) &&
    (raw.distanceMiles === undefined ||
      (typeof raw.distanceMiles === "number" &&
        Number.isFinite(raw.distanceMiles) &&
        raw.distanceMiles >= 0 &&
        raw.distanceMiles <= 5000))
  );
}
function tournament(raw: Json): OrganizationTournament | null {
  const eventSport = sport(raw.sport);
  if (
    !eventSport ||
    !string(raw.id) ||
    raw.org === "Team schedule" ||
    (raw.type !== "tournament" && raw.type !== "showcase")
  )
    return null;
  const sourceUrl = safeOrganizationTournamentSourceUrl(raw.sourceUrl);
  return {
    id: string(raw.id),
    name: string(raw.name),
    org: string(raw.org),
    city: string(raw.city),
    state: /^[A-Z]{2}$/.test(string(raw.state)) ? string(raw.state) : "",
    start: date(raw.start),
    end: date(raw.end),
    // Rebuild nested values; legacy objects or unknown fields must not ride along.
    ages: strings(raw.ages).filter((age) => /^(?:[4-9]|1[0-9])U$|^Adult$/.test(age)),
    levels: strings(raw.levels).filter((level) => level.length <= 50),
    sport: eventSport,
    type: raw.type,
    sourceUrl,
    sourceEditable: sourceEditable(raw),
    sourceCheckedOn: sourceUrl ? date(raw.sourceCheckedOn) : "",
    distanceMiles:
      typeof raw.distanceMiles === "number" &&
      Number.isFinite(raw.distanceMiles) &&
      raw.distanceMiles >= 0 &&
      raw.distanceMiles <= 5000
        ? raw.distanceMiles
        : null,
  };
}
async function load(tx: Sql): Promise<OrganizationTournamentWorkspace> {
  const [row] = await tx<{
    payload: Json;
    rev: number;
  }>`select payload,rev from club_state where id='oklahoma-prospects' and not demo for share`;
  if (!row) throw new CoordinatorDenied();
  const payload = object(row.payload);
  const catalog = objects(payload.catalog)
    .map(tournament)
    .filter((event): event is OrganizationTournament => event !== null);
  const ids = new Set(catalog.map((event) => event.id));
  const teams = objects(payload.teams)
    .filter((team) => Boolean(sport(team.sport)) && !inactive(team.closed))
    .map((team) => ({
      id: string(team.id),
      name: string(team.name),
      sport: sport(team.sport)!,
      age: string(team.age),
      level: string(team.level),
      seasonStart: date(team.seasonStart),
      seasonEnd: date(team.seasonEnd),
      tournamentIds: strings(team.tournamentIds).filter((id) => ids.has(id)),
    }));
  return { revision: row.rev, teams, catalog };
}
export async function organizationTournaments(sql: Sql, userId: string) {
  return secured(sql, userId, "organization.tournaments.read", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const result = await load(tx);
    await audit(tx, userId, "organization.tournaments.read", "", "allowed");
    return result;
  });
}

/** Source metadata cannot change event identity, selection, fee inputs or financial history. */
export async function saveOrganizationTournamentSource(
  sql: Sql,
  userId: string,
  raw: OrganizationTournamentSourceInput,
) {
  return secured(sql, userId, "organization.tournament.source.save", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const input = organizationTournamentSourceInput.parse(raw);
    const [row] = await tx<{
      payload: Json;
      rev: number;
    }>`select payload,rev from club_state where id='oklahoma-prospects' and not demo for update`;
    if (!row) throw new CoordinatorDenied();
    if (row.rev !== input.revision)
      throw new Error("Tournament records changed. Reload before saving.");
    const payload = object(row.payload);
    const matches = objects(payload.catalog).filter((event) => event.id === input.id);
    if (matches.length !== 1 || !tournament(matches[0])) throw new CoordinatorDenied();
    const event = matches[0];
    if (!sourceEditable(event))
      throw new Error("This event’s source metadata needs owner review before editing.");
    const next: Json = {
      ...event,
      sourceUrl: safeOrganizationTournamentSourceUrl(input.sourceUrl),
      sourceCheckedOn: input.sourceCheckedOn,
    };
    if (input.distanceMiles === null) delete next.distanceMiles;
    else next.distanceMiles = input.distanceMiles;
    if (
      event.sourceUrl === next.sourceUrl &&
      event.sourceCheckedOn === next.sourceCheckedOn &&
      event.distanceMiles === next.distanceMiles
    ) {
      await audit(tx, userId, "organization.tournament.source.save", input.id, "allowed", {
        unchanged: true,
      });
      return { revision: row.rev, changed: false };
    }
    // Preserve every other array member, unknown nested value and financial field verbatim.
    const catalog = (payload.catalog as unknown[]).map((entry) => (entry === event ? next : entry));
    const saved = { ...payload, catalog, _rev: row.rev + 1, _savedAt: new Date().toISOString() };
    const updated = await tx<{
      rev: number;
    }>`update club_state set payload=${JSON.stringify(saved)}::jsonb,rev=rev+1,updated_at=now() where id='oklahoma-prospects' and not demo and rev=${row.rev} returning rev`;
    if (!updated.length) throw new Error("Tournament records changed. Reload before saving.");
    await audit(tx, userId, "organization.tournament.source.save", input.id, "allowed");
    return { revision: updated[0].rev, changed: true };
  });
}
function csvCell(value: string | number | null) {
  let result = value === null ? "" : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(result)) result = "'" + result;
  return '"' + result.replaceAll('"', '""') + '"';
}
export async function organizationTournamentReport(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof organizationTournamentExportInput>,
) {
  return secured(sql, userId, "organization.tournaments.export", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const input = organizationTournamentExportInput.parse(raw);
    const workspace = await load(tx);
    const team = workspace.teams.find((item) => item.id === input.teamId);
    if (input.teamId && !team) throw new CoordinatorDenied();
    const events = filterOrganizationTournaments(workspace.catalog, input.filters, team);
    const rows: (string | number | null)[][] = [
      [
        "Event",
        "Organizer",
        "Sport",
        "Type",
        "City",
        "State",
        "Start",
        "End",
        "Ages",
        "Divisions",
        "Distance miles",
        "Organizer URL",
        "Source checked",
        "On selected team schedule",
      ],
      ...events.map((event) => [
        event.name,
        event.org,
        event.sport,
        event.type,
        event.city,
        event.state,
        event.start,
        event.end,
        event.ages.join(", "),
        event.levels.join(", "),
        event.distanceMiles,
        event.sourceUrl,
        event.sourceCheckedOn,
        team ? (team.tournamentIds.includes(event.id) ? "Yes" : "No") : "",
      ]),
    ];
    await audit(tx, userId, "organization.tournaments.export", "", "allowed");
    return {
      filename: "prospects-operational-tournaments.csv",
      contentType: "text/csv;charset=utf-8",
      body: rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n",
    };
  });
}
