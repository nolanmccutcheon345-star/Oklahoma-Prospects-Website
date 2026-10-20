/** Restricted result corrections deliberately do not use the fee-aware activity saver. */
import type { Sql } from "../db";
import { battingStats, resultOf, statKeys } from "../teams/activity-contracts";
import {
  organizationGameResultInput,
  type OrganizationGameResultInput,
} from "./organization-contracts";
import { audit, CoordinatorDenied, requireOrganizationOperations, secured } from "./access.server";

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const objects = (value: unknown): Json[] =>
  Array.isArray(value)
    ? value.filter((v): v is Json => v !== null && typeof v === "object" && !Array.isArray(v))
    : [];
const string = (value: unknown) => (typeof value === "string" ? value : "");
const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const inactive = (value: unknown) =>
  value === true || (typeof value === "string" && Boolean(value) && value !== "false");
const activeTeam = (team: Json) =>
  !inactive(team.closed) && ["baseball", "softball"].includes(string(team.sport));
function counts(value: unknown) {
  const s = object(value);
  return {
    ab: count(s.ab),
    h: count(s.h),
    r: count(s.r),
    hr: count(s.hr),
    rbi: count(s.rbi),
    sb: count(s.sb),
    bb: count(s.bb),
    so: count(s.so),
  };
}
function record(value: unknown) {
  const r = object(value);
  return { w: count(r.w), l: count(r.l), t: count(r.t) };
}
function status(value: unknown): OrganizationGameResultInput["status"] | null {
  return value === "scheduled" || value === "live" || value === "final" ? value : null;
}

/** Reconstruct every level; mixed legacy payloads and unknown future fields stay private. */
export async function organizationGameResults(sql: Sql, userId: string) {
  return secured(sql, userId, "organization.game-results.read", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const [row] = await tx<{
      payload: Json;
    }>`select payload from club_state where id='oklahoma-prospects' and not demo for share`;
    if (!row) throw new CoordinatorDenied();
    const teams = objects(row.payload.teams).filter(activeTeam);
    const rows = await tx<{
      id: string;
      team_id: string;
      payload: Json;
      revision: number;
    }>`select id::text,team_id,payload,revision from team_activities where payload->>'kind'='game' and payload->>'status' in ('scheduled','live','final') order by payload->>'date' desc,payload->>'startTime',id`;
    const result = teams.map((team) => {
      const roster = objects(team.roster);
      return {
        id: string(team.id),
        name: string(team.name),
        sport: string(team.sport),
        record: record(team.record),
        players: roster.map((player) => {
          const stats = counts(player.stats);
          return {
            id: string(player.id),
            name: string(player.name),
            number:
              typeof player.number === "number" ? String(player.number) : string(player.number),
            withdrawn: inactive(player.withdrawn),
            stats: { ...stats, avg: stats.ab ? stats.h / stats.ab : null },
          };
        }),
        games: rows
          .filter((game) => game.team_id === team.id)
          .map((game) => {
            const g = object(game.payload);
            return {
              id: game.id,
              teamId: game.team_id,
              revision: game.revision,
              title: string(g.title),
              date: string(g.date),
              startTime: string(g.startTime),
              endTime: string(g.endTime),
              location: string(g.location),
              status: status(g.status)!,
              ourRuns: count(g.ourRuns),
              oppRuns: count(g.oppRuns),
              stats: objects(g.stats)
                .filter((stat) => roster.some((player) => player.id === stat.playerId))
                .map((stat) => ({ playerId: string(stat.playerId), values: counts(stat.values) })),
            };
          }),
      };
    });
    await audit(tx, userId, "organization.game-results.read", "", "allowed");
    return { teams: result };
  });
}

const changed = () => new Error("This game changed. Reload before saving.");
function previousStats(game: Json) {
  if (game.stats === undefined) return [];
  if (!Array.isArray(game.stats) || objects(game.stats).length !== game.stats.length)
    throw new Error("This game's statistics need review before correction.");
  const stats = objects(game.stats);
  const seen = new Set<string>();
  for (const stat of stats) {
    const id = string(stat.playerId),
      values = object(stat.values);
    if (
      !id ||
      seen.has(id) ||
      !battingStats.safeParse(Object.fromEntries(statKeys.map((key) => [key, values[key]]))).success
    )
      throw new Error("This game's statistics need review before correction.");
    seen.add(id);
  }
  return stats;
}

export async function saveOrganizationGameResult(
  sql: Sql,
  userId: string,
  raw: OrganizationGameResultInput,
) {
  return secured(sql, userId, "organization.game-result.save", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const input = organizationGameResultInput.parse(raw);
    // Match the existing scorer's lock order and serialize all cumulative-total changes.
    const [clubRow] = await tx<{
      payload: Json;
      rev: number;
    }>`select payload,rev from club_state where id='oklahoma-prospects' and not demo for update`;
    if (!clubRow) throw new CoordinatorDenied();
    const club = object(clubRow.payload);
    const team = objects(club.teams).find((t) => t.id === input.teamId && activeTeam(t));
    if (!team) throw new CoordinatorDenied();
    const [old] = await tx<{
      team_id: string;
      payload: Json;
      revision: number;
    }>`select team_id,payload,revision from team_activities where id=${input.id} for update`;
    if (!old || old.team_id !== input.teamId) throw new CoordinatorDenied();
    if (old.revision !== input.revision) throw changed();
    const game = object(old.payload);
    if (game.kind !== "game" || !status(game.status))
      throw new Error("Only scheduled, live, or final games can be scored here.");
    const [booking] =
      await tx`select activity_id from coordinator_practice_bookings where activity_id=${input.id}`;
    if (booking)
      throw new Error("This activity has linked reservations and cannot be scored here.");
    const roster = objects(team.roster);
    for (const stat of input.stats)
      if (!roster.some((player) => player.id === stat.playerId))
        throw new Error("Statistics must belong to this team's current roster.");
    const previous = previousStats(game);
    // Preserve unknown nested data, including legacy fields on statistical rows.
    // Omitted current-player lines become zero; historical orphan lines remain untouched.
    const nextStats = previous.map((stat) => {
      if (!roster.some((player) => player.id === stat.playerId)) return stat;
      const submitted = input.stats.find((s) => s.playerId === stat.playerId);
      return { ...stat, values: { ...object(stat.values), ...(submitted?.values || counts({})) } };
    });
    for (const stat of input.stats)
      if (!previous.some((p) => p.playerId === stat.playerId))
        nextStats.push({ playerId: stat.playerId, values: { ...stat.values } });
    const next = {
      ...game,
      status: input.status,
      ourRuns: input.ourRuns,
      oppRuns: input.oppRuns,
      stats: nextStats,
      revision: old.revision + 1,
    };
    const sameStats = JSON.stringify(previous) === JSON.stringify(nextStats);
    if (
      game.status === input.status &&
      game.ourRuns === input.ourRuns &&
      game.oppRuns === input.oppRuns &&
      sameStats
    ) {
      await audit(tx, userId, "organization.game-result.save", input.id, "allowed", {
        unchanged: true,
      });
      return { id: input.id, revision: old.revision, changed: false };
    }
    // Reverse only this game's previous contribution, then apply the correction once.
    const totals = { ...object(team.record), ...record(team.record) };
    for (const [current, direction] of [
      [game, -1],
      [next, 1],
    ] as const) {
      const result = resultOf({
        kind: "game",
        status: status(current.status)!,
        ourRuns: count(current.ourRuns),
        oppRuns: count(current.oppRuns),
      });
      if (result) totals[result] = Math.max(0, totals[result] + direction);
      if (current.status !== "final") continue;
      for (const stat of objects(current.stats)) {
        const player = roster.find((p) => p.id === stat.playerId);
        if (!player) continue;
        const cumulative = { ...object(player.stats) },
          values = object(stat.values);
        for (const key of statKeys)
          cumulative[key] = Math.max(0, count(cumulative[key]) + direction * count(values[key]));
        if (count(cumulative.ab)) cumulative.avg = count(cumulative.h) / count(cumulative.ab);
        else delete cumulative.avg;
        player.stats = cumulative;
      }
    }
    team.record = totals;
    const updated =
      await tx`update team_activities set payload=${JSON.stringify(next)}::jsonb,revision=revision+1,updated_by=${userId},updated_at=now() where id=${input.id} and team_id=${input.teamId} and revision=${input.revision} returning revision`;
    if (!updated.length) throw changed();
    club._rev = clubRow.rev + 1;
    club._savedAt = new Date().toISOString();
    const updatedClub =
      await tx`update club_state set payload=${JSON.stringify(club)}::jsonb,rev=rev+1,updated_at=now() where id='oklahoma-prospects' and not demo and rev=${clubRow.rev} returning rev`;
    if (!updatedClub.length) throw changed();
    await audit(tx, userId, "organization.game-result.save", input.id, "allowed", {
      revision: next.revision,
    });
    return { id: input.id, revision: next.revision, changed: true };
  });
}
