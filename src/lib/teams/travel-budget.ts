import type { ClubRecord } from "./types";
import type { TeamActivity } from "./activity-contracts";
import type { FeeBudget } from "./fee-model";
import type { Sql } from "../db";
export function seasonHotelNights(
  activities: TeamActivity[],
  budget: Pick<FeeBudget, "start" | "end">,
) {
  return activities
    .filter(
      (a) =>
        a.kind !== "practice" &&
        a.status !== "cancelled" &&
        a.travel === "travel" &&
        (!budget.start || a.date >= budget.start) &&
        (!budget.end || a.date <= budget.end),
    )
    .reduce((n, a) => n + (a.overnightNights || 0), 0);
}
export async function withScheduledHotels(
  sql: Sql,
  teamId: string,
  budget: FeeBudget,
): Promise<FeeBudget> {
  const rows = await sql<{
    payload: TeamActivity;
  }>`select payload from team_activities where team_id=${teamId}`;
  const [club] = budget.scheduleCostsAutomatic
    ? await sql<{
        payload: ClubRecord;
      }>`select payload from club_state where id='oklahoma-prospects'`
    : [];
  return {
    ...budget,
    tournament: budget.scheduleCostsAutomatic
      ? seasonEntryCosts(
          rows.map((r) => r.payload),
          budget,
          club?.payload.catalog || [],
          club?.payload.teams.find((t) => t.id === teamId)?.tournamentIds || [],
        )
      : budget.tournament,
    hotelNightly: budget.hotelNightly || 0,
    hotelNights: seasonHotelNights(
      rows.map((r) => r.payload),
      budget,
    ),
  };
}

export function seasonEntryCosts(
  activities: TeamActivity[],
  budget: FeeBudget,
  catalog: { id: string; org: string; start: string; fee: number }[],
  selected: string[],
) {
  const inSeason = (date: string) =>
    (!budget.start || date >= budget.start) && (!budget.end || date <= budget.end);
  return (
    activities
      .filter((a) => a.kind !== "practice" && a.status !== "cancelled" && inSeason(a.date))
      .reduce((n, a) => n + (a.entryFee || 0), 0) +
    catalog
      .filter((e) => selected.includes(e.id) && e.org !== "Team schedule" && inSeason(e.start))
      .reduce((n, e) => n + Math.round(e.fee * 100), 0)
  );
}
