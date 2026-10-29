import type { Sql } from "../db";

/** Resolve existing, explicit identity links only. Callers must authorize the roster
 * first. Never infer identity from a name, email, or a signed document. */
export async function rosterAthlete(tx: Sql, teamId: string, playerId: string) {
  const roster = await tx<{ household: string }>`select p->>'familyId' as household
    from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t
    cross join lateral jsonb_array_elements(t->'roster') p
    where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${teamId}
      and p->>'id'=${playerId} and coalesce(t->>'closed','false')<>'true'
      and coalesce(p->>'withdrawn','false')<>'true'`;
  const links = await tx<{ id: string; household: string | null }>`with links as (
    select athlete_id from team_dev_roster_links where team_id=${teamId}
      and roster_player_id=${playerId} and ended_at is null
    union select athlete_id from recruiting_roster_links where team_id=${teamId} and roster_id=${playerId}
  ) select l.athlete_id as id,a.household_id as household from links l left join club_athletes a on a.id=l.athlete_id`;
  const linked =
    roster.length === 1 &&
    Boolean(roster[0].household) &&
    links.length === 1 &&
    links[0].household === roster[0].household;
  return {
    athleteId: linked ? links[0].id : null,
    status: linked
      ? ("linked" as const)
      : links.length
        ? ("review-required" as const)
        : ("missing" as const),
  };
}
export async function rosterWaiver(tx: Sql, teamId: string, playerId: string) {
  const link = await rosterAthlete(tx, teamId, playerId);
  const [waiver] = await tx<{ current: boolean }>`select exists(select 1 from club_waivers
    where athlete_id=${link.athleteId} and signed_at<=now() and signed_at+interval '1 year'>now()) as current`;
  return { ...link, current: waiver.current };
}

/** Status-only projection for coaches. Never returns signatures or medical data. */
export async function teamWaiverReadiness(sql: Sql, actor: string, teamId: string) {
  const { secured } = await import("../coordinator/access.server");
  const { enrollmentScope, teamAccess } = await import("./access.server");
  return secured(sql, actor, "enrollment.waiver-readiness", async (tx) => {
    const team = teamAccess(await enrollmentScope(tx, actor), teamId);
    if (!team.canRead) throw Error("Assigned team access required.");
    const players = await tx<{ id: string }>`select p->>'id' as id from club_state c
      cross join lateral jsonb_array_elements(c.payload->'teams') t
      cross join lateral jsonb_array_elements(t->'roster') p where c.id='oklahoma-prospects'
      and not c.demo and t->>'id'=${teamId} and coalesce(p->>'withdrawn','false')<>'true'`;
    const statuses = [];
    for (const player of players) {
      const waiver = await rosterWaiver(tx, teamId, player.id);
      statuses.push({
        playerId: player.id,
        waiverCurrent: waiver.current,
        linkStatus: waiver.status,
      });
    }
    return statuses;
  });
}
