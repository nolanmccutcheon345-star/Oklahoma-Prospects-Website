import type { Sql } from "../db";
import type { Team } from "./types";
import type { FeePlan } from "./fee-contracts";
import { offersPO } from "./fee-health";
import { defaultBudget } from "./fee-model";
import { assertPORosterSpace, poRosterLimit, type RosterRole } from "./po-roster";
export async function assertRosterAssignment(
  sql: Sql,
  team: Team,
  role: RosterRole,
  excludePlayer = "",
  excludeRequest = "",
) {
  if (role === "full") return;
  const [plan] = await sql<{
    payload: FeePlan;
  }>`select payload from team_fee_plans where team_id=${team.id}`;
  if (!offersPO(plan?.payload.budget || defaultBudget(), team.sport))
    throw Error(
      "This team does not offer pitcher-only roster spots. Front Office must enable them first.",
    );
  const pending = await sql<{
    id: string;
  }>`select id from club_requests where kind in ('tryout','team-inquiry') and payload->>'teamId'=${team.id} and payload->>'stage'='offer' and payload->>'rosterRole'='po' and coalesce(payload->>'rosterPlayerId','')='' and id<>${excludeRequest}`;
  assertPORosterSpace(team, pending.length, excludePlayer, plan?.payload.budget.poRosterLimit);
}
export async function assertRosterCapacity(sql: Sql, team: Team, budget: FeePlan["budget"]) {
  const pending = await sql<{
    id: string;
  }>`select id from club_requests where kind in ('tryout','team-inquiry') and payload->>'teamId'=${team.id} and payload->>'stage'='offer' and payload->>'rosterRole'='po' and coalesce(payload->>'rosterPlayerId','')=''`;
  const count =
    team.roster.filter((p) => !p.withdrawn && p.roleType === "po").length + pending.length;
  const limit = budget.poRosterLimit ?? poRosterLimit(team.age);
  if (count > limit)
    throw Error(
      `This team has ${count} active PO players/offers. Resolve those assignments before lowering its PO limit to ${limit}.`,
    );
}
