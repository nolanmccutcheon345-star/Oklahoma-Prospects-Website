import { getSql } from "../db";
import { resolveIdentity } from "../identity.server";
import { coachHoldsTeam } from "../teams/privacy";
import type { ClubRecord } from "../teams/types";

export type DevScope = {
  admin: boolean;
  coachTeamIds: Set<string>;
  guardianAthleteIds: Set<string>;
  selfAthleteId: string | null;
};

function clubPayload(row: { payload: ClubRecord | string } | undefined): ClubRecord | null {
  if (!row) return null;
  return typeof row.payload === "string" ? JSON.parse(row.payload) as ClubRecord : row.payload;
}

/** Recomputed on every request. Team-development authority is never cached. */
export async function devScope(userId: string): Promise<DevScope> {
  const sql = await getSql();
  const me = await resolveIdentity(sql,userId);
  const [row] = await sql<{payload:ClubRecord|string;demo:boolean}>`
    select payload,demo from club_state where id='oklahoma-prospects'
  `;
  const club = !row?.demo ? clubPayload(row) : null;
  const coachTeamIds = new Set<string>();
  if (club && me.canTeamCoach) {
    for (const team of club.teams)
      if (!team.closed && coachHoldsTeam(club,me.email,team.id)) coachTeamIds.add(team.id);
  }

  const links = await sql<{team_id:string;roster_player_id:string;athlete_id:string}>`
    select team_id,roster_player_id,athlete_id
    from team_dev_roster_links
    where ended_at is null
  `;
  const householdIds = new Set([
    ...me.familyIds,
    ...me.guardianHouseholdIds,
    me.familyId,
  ].filter(Boolean));
  const guardianRosterIds = new Set<string>();
  if (club) {
    for (const team of club.teams)
      for (const player of team.roster)
        if (householdIds.has(player.familyId)) guardianRosterIds.add(player.id);
  }
  const guardianAthleteIds = new Set(
    links.filter(link=>guardianRosterIds.has(link.roster_player_id)).map(link=>link.athlete_id),
  );
  const linkedSelf = links.find(link=>me.playerIds.includes(link.athlete_id))?.athlete_id;
  const selfAthleteId = linkedSelf || me.playerIds[0] || null;

  return { admin: me.role === "admin", coachTeamIds, guardianAthleteIds, selfAthleteId };
}

export function canReadTeamDevelopment(scope: DevScope, teamId: string) {
  return scope.admin || scope.coachTeamIds.has(teamId);
}
export function canReadAthleteDevelopment(scope: DevScope, athleteId: string) {
  return scope.admin || scope.guardianAthleteIds.has(athleteId) || scope.selfAthleteId === athleteId;
}
export function assertTeamDevelopmentCoach(scope: DevScope, teamId: string) {
  if (!scope.admin && !scope.coachTeamIds.has(teamId)) throw new Error("Forbidden");
}
export function assertTeamDevelopmentAthlete(scope: DevScope, athleteId: string) {
  if (!canReadAthleteDevelopment(scope,athleteId)) throw new Error("Forbidden");
}
