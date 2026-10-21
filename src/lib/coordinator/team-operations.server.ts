import type { Sql } from "../db";
import type { z } from "zod";
import { teamOperationsInput } from "./team-operations-contracts";
import {
  secured,
  requireTeam,
  grants,
  permits,
  teamScope,
  audit,
  CoordinatorDenied,
} from "./access.server";
export async function teamOperations(sql: Sql, userId: string, teamId: string) {
  return secured(sql, userId, "teams.operations.read", async (tx) => {
    const team = await teamScope(tx, teamId),
      current = await grants(tx, userId, true);
    const can = (p: import("./contracts").Capability) => permits(current, p, team.sport, teamId);
    if (
      !["teams.openings", "teams.needs", "teams.statistics"].some((p) =>
        can(p as import("./contracts").Capability),
      )
    )
      throw new CoordinatorDenied();
    const [r] = await tx<{
      revision: number;
      openings: number;
      needs: string;
    }>`select revision,openings,needs from coordinator_team_operations where team_id=${teamId}`;
    const result: {
      revision: number;
      openings?: number;
      needs?: string;
      record?: { wins: number; losses: number; ties: number };
    } = { revision: r?.revision || 0 };
    if (can("teams.openings")) result.openings = r?.openings || 0;
    if (can("teams.needs")) result.needs = r?.needs || "";
    if (can("teams.statistics")) {
      const [stats] = await tx<{
        wins: number;
        losses: number;
        ties: number;
      }>`select count(*) filter(where (case when a.payload->>'ourRuns' ~ '^[0-9]{1,3}$' then (a.payload->>'ourRuns')::int end)>(case when a.payload->>'oppRuns' ~ '^[0-9]{1,3}$' then (a.payload->>'oppRuns')::int end))::int as wins,count(*) filter(where (case when a.payload->>'ourRuns' ~ '^[0-9]{1,3}$' then (a.payload->>'ourRuns')::int end)<(case when a.payload->>'oppRuns' ~ '^[0-9]{1,3}$' then (a.payload->>'oppRuns')::int end))::int as losses,count(*) filter(where (case when a.payload->>'ourRuns' ~ '^[0-9]{1,3}$' then (a.payload->>'ourRuns')::int end)=(case when a.payload->>'oppRuns' ~ '^[0-9]{1,3}$' then (a.payload->>'oppRuns')::int end))::int as ties from team_activities a where a.team_id=${teamId} and a.payload->>'kind'='game' and a.payload->>'status'='final' and a.payload->>'ourRuns' ~ '^[0-9]{1,3}$' and a.payload->>'oppRuns' ~ '^[0-9]{1,3}$'`;
      result.record = stats;
    }
    await audit(
      tx,
      userId,
      "teams.operations.read",
      teamId,
      "allowed",
      { fields: Object.keys(result) },
      team.sport,
      teamId,
    );
    return result;
  });
}
export async function saveTeamOperations(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof teamOperationsInput>,
) {
  const v = teamOperationsInput.parse(raw);
  return secured(sql, userId, "teams." + v.field, async (tx) => {
    const team = await requireTeam(
      tx,
      userId,
      v.field === "openings" ? "teams.openings" : "teams.needs",
      v.teamId,
    );
    await tx`select pg_advisory_xact_lock(hashtext(${"coordinator-team:" + v.teamId}))`;
    const [old] = await tx<{
      revision: number;
      openings: number;
      needs: string;
    }>`select revision,openings,needs from coordinator_team_operations where team_id=${v.teamId} for update`;
    if ((old?.revision || 0) !== v.revision)
      throw Error("Team information changed. Reload before saving.");
    const openings = v.field === "openings" ? v.value : old?.openings || 0,
      needs = v.field === "needs" ? v.value : old?.needs || "";
    await tx`insert into coordinator_team_operations(team_id,openings,needs,updated_by) values(${v.teamId},${openings},${needs},${userId}) on conflict(team_id) do update set openings=excluded.openings,needs=excluded.needs,revision=coordinator_team_operations.revision+1,updated_by=excluded.updated_by,updated_at=now()`;
    await audit(
      tx,
      userId,
      "teams." + v.field,
      v.teamId,
      "allowed",
      v.field === "openings" ? { before: old?.openings || 0, after: openings } : { changed: true },
      team.sport,
      team.id,
    );
    return { ok: true };
  });
}
