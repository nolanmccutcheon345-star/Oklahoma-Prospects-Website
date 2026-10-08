import type { Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import type { ClubRecord } from "../teams/types";
import { publishedPlayer, publicationPlayers } from "./publication";
import { AppError } from "./errors";
/** Never serialize private club roster identifiers or player stories in a roster list. */
function publicTeamPlayer(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, goal: row.goal, raised: row.raised };
}
function publicPlayerDetail(row: Record<string, unknown>) {
  const { team_id: _internalTeam, roster_player_id: _internalPlayer, ...publicRow } = row;
  return publicRow;
}

export async function realTeams(sql: Sql) {
  const [row] = await sql.query<{ payload: ClubRecord; demo: boolean }>(
    "SELECT payload,demo FROM club_state WHERE id='oklahoma-prospects'",
  );
  return row && !row.demo ? row.payload.teams : [];
}
export async function rosterChoicesFor(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId);
  if (me.role === "player")
    throw new AppError("A parent or authorized administrator must manage player fundraising.", 403);
  const teams = await realTeams(sql);
  return teams.flatMap((t) =>
    t.roster
      .filter(
        (p) =>
          me.role === "admin" ||
          me.familyIds.includes(p.familyId) ||
          p.parents.some((parent) =>
            [me.email, ...me.householdEmails].includes(parent.email.trim().toLowerCase()),
          ),
      )
      .map((p) => ({
        teamId: t.id,
        rosterPlayerId: p.id,
        teamName: t.name,
        sport: t.sport,
        age: t.age,
        playerName: p.name,
      })),
  );
}
export async function requireRosterChoice(
  sql: Sql,
  userId: string,
  teamId: unknown,
  playerId: unknown,
) {
  if (typeof teamId !== "string" || typeof playerId !== "string")
    throw new AppError("Select your roster player and team.");
  const choice = (await rosterChoicesFor(sql, userId)).find(
    (p) => p.teamId === teamId && p.rosterPlayerId === playerId,
  );
  if (!choice) throw new AppError("This roster player is not available to your household.", 403);
  return choice;
}
export async function linkedPlayer(sql: Sql, id: string) {
  const [link] = await sql.query<{ team_id: string; roster_player_id: string }>(
    "SELECT team_id,roster_player_id FROM fundraising_players WHERE id=$1",
    [id],
  );
  if (!link?.team_id || !link.roster_player_id) return null;
  const team = (await realTeams(sql)).find((t) => t.id === link.team_id);
  if (!team?.roster.some((p) => p.id === link.roster_player_id)) return null;
  const p = await publishedPlayer(sql, id);
  return p
    ? { ...p, team: team.name }
    : null;
}
export async function publicRoster(sql: Sql, teamId?: string, playerId?: string) {
  const teams = await realTeams(sql);
  const rows = await publicationPlayers(sql, "home");
  const links = await sql.query<{ id: string; team_id: string; roster_player_id: string }>(
    "SELECT id,team_id,roster_player_id FROM fundraising_players WHERE team_id IS NOT NULL",
  );
  const records = teams
    .map((t) => ({
      id: t.id,
      name: t.name,
      sport: t.sport,
      season: t.seasonLabel,
      players: rows.flatMap<
        Record<string, unknown> & { team_id: string; roster_player_id: string }
      >((p) => {
        const link = links.find((l) => l.id === p.id && l.team_id === t.id);
        return link && t.roster.some((r) => r.id === link.roster_player_id)
          ? [{ ...p, team: t.name, team_id: t.id, roster_player_id: link.roster_player_id }]
          : [];
      }),
    }))
    .filter((t) => t.players.length);
  if (!teamId) return { teams: records.map(({ players: _, ...t }) => t) };
  const team = records.find((t) => t.id === teamId);
  if (!team) throw new AppError("This public team roster is unavailable.", 404);
  if (playerId) {
    const player = team.players.find((p) => p.roster_player_id === playerId);
    if (!player) throw new AppError("This player page is unavailable.", 404);
    return { player: publicPlayerDetail(player) };
  }
  return { team: { ...team, players: team.players.map(publicTeamPlayer) } };
}
