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
  return {
    ...budget,
    hotelNightly: budget.hotelNightly || 0,
    hotelNights: seasonHotelNights(
      rows.map((r) => r.payload),
      budget,
    ),
  };
}
