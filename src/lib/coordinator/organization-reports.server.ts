import type { Sql } from "../db";
import { organizationWorkspace } from "./organization.server";
import { audit } from "./access.server";
export const reportKinds = ["rosters", "registrations", "schedules", "evaluations"] as const;
export type OperationalReportKind = (typeof reportKinds)[number];
type Workspace = Awaited<ReturnType<typeof organizationWorkspace>>;
// CSV is a new projection, never generic Object.values / JSON serialization of records.
// Prefix formula-capable cells and quote every value to prevent spreadsheet injection.
function cell(value: unknown) {
  let s =
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : value === true
        ? "Yes"
        : value === false
          ? "No"
          : "";
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function operationalCsv(workspace: Workspace, kind: OperationalReportKind) {
  let rows: unknown[][];
  switch (kind) {
    case "rosters":
      rows = [
        [
          "Team",
          "Sport",
          "Player",
          "Number",
          "Positions",
          "School",
          "Graduation year",
          "Withdrawn",
        ],
        ...workspace.teams.flatMap((t) =>
          t.roster.map((p) => [
            t.name,
            t.sport,
            p.name,
            p.number,
            p.positions.join(", "),
            p.school,
            p.gradYear,
            p.withdrawn,
          ]),
        ),
      ];
      break;
    case "registrations":
      rows = [
        [
          "Player",
          "Sport",
          "Age",
          "Season",
          "Guardian",
          "Email",
          "Phone",
          "Registration status",
          "Follow-up",
        ],
        ...workspace.registrations.map((r) => [
          r.player,
          r.sport,
          r.age,
          r.season,
          r.parent,
          r.email,
          r.phone,
          r.status,
          r.workflow.status,
        ]),
      ];
      break;
    case "schedules":
      rows = [
        ["Team", "Kind", "Title", "Date", "Start", "End", "Location", "Status"],
        ...workspace.activities.map((a) => [
          workspace.teams.find((t) => t.id === a.teamId)?.name || "",
          a.kind,
          a.title,
          a.date,
          a.startTime,
          a.endTime,
          a.location,
          a.status,
        ]),
      ];
      break;
    case "evaluations":
      rows = [
        [
          "Player",
          "Sport",
          "Date",
          "Status",
          "Recommendation",
          "Reviewed",
          "Contact",
          "Approach",
          "Fielding",
          "Throwing",
          "Movement",
          "Knowledge",
          "Coachability",
        ],
        ...workspace.evaluations.map((e) => [
          e.playerName,
          e.sport,
          e.evaluationDate,
          e.status,
          e.recommendation,
          e.reviewed,
          e.ratings.contact,
          e.ratings.approach,
          e.ratings.fielding,
          e.ratings.throwing,
          e.ratings.movement,
          e.ratings.knowledge,
          e.ratings.coachability,
        ]),
      ];
      break;
    default:
      throw new Error("Choose an operational report.");
  }
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
export async function organizationReport(sql: Sql, userId: string, kind: OperationalReportKind) {
  if (!reportKinds.includes(kind)) throw new Error("Choose an operational report.");
  const workspace = await organizationWorkspace(sql, userId);
  const body = operationalCsv(workspace, kind);
  await audit(sql, userId, "organization.report.export", kind, "allowed");
  return {
    filename: `prospects-operational-${kind}.csv`,
    contentType: "text/csv;charset=utf-8",
    body,
  };
}
