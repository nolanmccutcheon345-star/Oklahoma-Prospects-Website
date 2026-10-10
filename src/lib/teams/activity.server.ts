import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import type { ClubRecord, Team } from "./types";
import { coachHoldsTeam } from "./privacy";
import { canReadTeamStats } from "./public-view";
import {
  activityInput,
  chatInput,
  statKeys,
  resultOf,
  type TeamActivity,
} from "./activity-contracts";
async function load(sql: Sql, lock = false) {
  const [r] = lock
    ? await sql<{
        payload: ClubRecord;
        rev: number;
      }>`select payload,rev from club_state where id='oklahoma-prospects' for update`
    : await sql<{
        payload: ClubRecord;
        rev: number;
      }>`select payload,rev from club_state where id='oklahoma-prospects'`;
  if (!r) throw Error("Team records unavailable.");
  return r;
}
function access(
  club: ClubRecord,
  teamId: string,
  me: Awaited<ReturnType<typeof resolveIdentity>>,
  edit = false,
) {
  const t = club.teams.find((t) => t.id === teamId && !t.closed);
  if (!t) throw Error("Team unavailable.");
  const manage = me.role === "admin" || coachHoldsTeam(club, me.email, teamId);
  if (edit ? !manage : !canReadTeamStats(t, me))
    throw Error("Access is limited to this team's coaches, players and families.");
  return { t, manage };
}
export async function teamActivityWorkspace(sql: Sql, userId: string, teamId: string) {
  const me = await resolveIdentity(sql, userId),
    { payload: club } = await load(sql),
    { t, manage } = access(club, teamId, me);
  const rows = await sql<{
    payload: TeamActivity;
    revision: number;
  }>`select payload,revision from team_activities where team_id=${teamId} order by payload->>'date',payload->>'startTime'`;
  const messages = await sql<{
    id: string;
    author: string;
    body: string;
    at: string;
  }>`select id::text,author,body,created_at::text as at from (select * from team_chat_messages where team_id=${teamId} order by created_at desc limit 100) m order by created_at`;
  return {
    manage,
    teamName: t.name,
    record: t.record,
    players: t.roster
      .filter((p) => !p.withdrawn)
      .map((p) => ({ id: p.id, name: p.name, number: p.number, stats: p.stats })),
    activities: rows.map((r) => ({ ...r.payload, revision: r.revision })),
    messages,
  };
}
export async function saveTeamActivity(sql: Sql, userId: string, raw: TeamActivity) {
  const input = activityInput.parse(raw),
    me = await resolveIdentity(sql, userId);
  return sql.transaction(async (tx) => {
    const { payload: club, rev } = await load(tx, true),
      { t } = access(club, input.teamId, me, true),
      id = input.id || randomUUID();
    const [old] = await tx<{
      team_id: string;
      payload: TeamActivity;
      revision: number;
    }>`select team_id,payload,revision from team_activities where id=${id} for update`;
    if (old ? old.team_id !== t.id || old.revision !== input.revision : input.revision !== 0)
      throw Error("Activity changed. Reload before saving.");
    if (old && old.payload.kind !== input.kind)
      throw Error("Keep the activity type; cancel it and create a different activity if needed.");
    for (const stat of input.stats)
      if (!t.roster.some((p) => p.id === stat.playerId))
        throw Error("Stats must belong to this team's roster.");
    const next = { ...input, id, revision: (old?.revision || 0) + 1 };
    // Apply the change once, preserving historical totals already entered before per-game scoring.
    for (const [g, sign] of [
      [old?.payload, -1],
      [next, 1],
    ] as const) {
      if (!g) continue;
      const result = resultOf(g);
      if (result) t.record[result] = Math.max(0, t.record[result] + sign);
      if (g.kind === "game" && g.status === "final")
        for (const stat of g.stats) {
          const p = t.roster.find((p) => p.id === stat.playerId);
          if (!p) continue;
          p.stats ||= {};
          for (const k of statKeys)
            p.stats[k] = Math.max(0, (p.stats[k] || 0) + sign * stat.values[k]);
          if (p.stats.ab) p.stats.avg = p.stats.h / p.stats.ab;
          else delete p.stats.avg;
        }
    }
    if (next.kind === "practice") {
      const practice = {
        id,
        date: next.date,
        time: next.startTime,
        where: next.location,
        cageHours: 0,
        status: next.status === "cancelled" ? ("cancelled" as const) : ("on" as const),
      };
      t.practices = [...t.practices.filter((p) => p.id !== id), practice];
    }
    if (next.kind === "tournament") {
      // A coach schedules a tournament here, but cannot alter shared catalog prices.
      const ev = {
        id,
        name: next.title,
        sport: t.sport,
        ages: [t.age],
        start: next.date,
        end: next.date,
        city: next.location,
        state: "",
        org: "Team schedule",
        fee: 0,
        stayToPlay: false,
        levels: [],
        type: "tournament" as const,
        verifiedOn: next.date,
      };
      club.catalog = [...club.catalog.filter((e) => e.id !== id), ev];
      t.tournamentIds = t.tournamentIds.filter((x) => x !== id);
      if (next.status !== "cancelled") t.tournamentIds.push(id);
    }
    await tx`insert into team_activities(id,team_id,payload,revision,updated_by) values(${id},${t.id},${JSON.stringify(next)}::jsonb,${next.revision},${userId}) on conflict(id) do update set payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now()`;
    club._rev = rev + 1;
    club._savedAt = new Date().toISOString();
    await tx`update club_state set payload=${JSON.stringify(club)}::jsonb,rev=${rev + 1},updated_at=now() where id='oklahoma-prospects'`;
    await tx`insert into club_audit(user_id,action,detail) values(${userId},'team-activity',${t.id + ":" + id})`;
    return { id };
  });
}
export async function postTeamChat(
  sql: Sql,
  userId: string,
  raw: { teamId: string; body: string },
) {
  const data = chatInput.parse(raw),
    me = await resolveIdentity(sql, userId);
  return sql.transaction(async (tx) => {
    const { payload: club } = await load(tx, true);
    access(club, data.teamId, me);
    await tx`insert into team_chat_messages(id,team_id,user_id,author,body) values(${randomUUID()},${data.teamId},${userId},${me.name},${data.body})`;
    return { ok: true };
  });
}
export async function publicTeamGames(sql: Sql) {
  const [row] = await sql<{
    payload: ClubRecord;
    demo: boolean;
  }>`select payload,demo from club_state where id='oklahoma-prospects'`;
  if (!row || row.demo) return [];
  const club = row.payload;
  const rows = await sql<{
    payload: TeamActivity;
    revision: number;
  }>`select payload,revision from team_activities where payload->>'kind'='game' order by payload->>'date' desc limit 250`;
  return rows.flatMap(({ payload: g, revision }) => {
    const t = club.teams.find((t) => t.id === g.teamId && !t.closed);
    if (!t) return [];
    return [
      {
        id: g.id,
        revision,
        teamId: t.id,
        teamStats:
          g.status === "final"
            ? Object.fromEntries(
                statKeys.map((k) => [k, g.stats.reduce((sum, s) => sum + s.values[k], 0)]),
              )
            : undefined,
        sport: t.sport === "baseball" ? ("Baseball" as const) : ("Softball" as const),
        ageGroup: t.age,
        teamName: t.name,
        opponent: g.title,
        date: g.date,
        startTime: g.startTime,
        venue: g.location,
        status: g.status,
        ourRuns: g.ourRuns,
        oppRuns: g.oppRuns,
        inning: "",
        videoId: "",
        videoKind: "none" as const,
      },
    ];
  });
}
