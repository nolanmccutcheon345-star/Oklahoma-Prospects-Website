import { createHash } from "node:crypto";
import type { Sql } from "../db";
import { enrollmentScope } from "../enrollment/access.server";
import type { Team } from "../teams/types";
import type { TeamActivity } from "../teams/activity-contracts";
import { hubAction, hubQuery, type HubAction } from "./contracts";

async function scope(tx: Sql, actor: string) {
  const access = await enrollmentScope(tx, actor);
  const [profile] = await tx<{
    role: string;
  }>`select role from profiles where user_id=${actor} for share`;
  if (access.restricted || profile?.role === "player")
    throw Error("Team Hub is for linked parents, assigned coaches and the front office.");
  return {
    ...access,
    teams: access.teams.filter((t) => access.owner || t.coach || t.guardianPlayerIds.length),
  };
}
async function teamFor(tx: Sql, actor: string, teamId: string, editing = false) {
  const access = await scope(tx, actor);
  const allowed = access.teams.find((t) => t.id === teamId);
  if (!allowed)
    throw Error(
      "This team is not available to your account. Review your invitation or contact Prospects.",
    );
  const manage = access.owner || allowed.coach;
  if (editing && !manage)
    throw Error("Only assigned coaches and the front office can post team updates.");
  const [row] = await tx<{
    team: Team;
  }>`select t as team from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${teamId} and coalesce(t->>'closed','false')<>'true' for share of c`;
  if (!row) throw Error("Team unavailable.");
  return { access, allowed, manage, team: row.team };
}
function playersFor(s: Awaited<ReturnType<typeof teamFor>>) {
  return s.team.roster
    .filter((p) => !p.withdrawn)
    .map((p) => ({
      id: p.id,
      name: p.name,
      number: p.number,
      mine: s.allowed.guardianPlayerIds.includes(p.id),
      canChat: s.manage || s.allowed.guardianPlayerIds.includes(p.id),
    }));
}
function familyFor(s: Awaited<ReturnType<typeof teamFor>>, playerId: string) {
  const p = s.team.roster.find((p) => p.id === playerId && !p.withdrawn);
  if (!p || (!s.manage && !s.allowed.guardianPlayerIds.includes(p.id)))
    throw Error("This family conversation is not available to your account.");
  return p.familyId;
}
async function postsFor(tx: Sql, team: Team) {
  const current = await tx<{
    key: string;
    title: string;
    body: string;
    urgent: boolean;
    author: string;
    at: string;
  }>`select id::text as key,title,body,urgent,author,created_at::text as at from team_hub_posts where team_id=${team.id} order by created_at desc limit 100`;
  const legacy = (team.announcements || []).map((p) => ({
    key: `legacy:${p.id}:${createHash("sha256")
      .update(JSON.stringify([p.title, p.body, p.arrive, p.uniform, p.hotel]))
      .digest("hex")
      .slice(0, 24)}`,
    title: p.title,
    body: [
      p.body,
      p.arrive && `Arrival: ${p.arrive}`,
      p.uniform && `Uniform: ${p.uniform}`,
      p.hotel && `Hotel: ${p.hotel}`,
    ]
      .filter(Boolean)
      .join("\n"),
    urgent: p.pin,
    author: "Team coaches",
    at: "",
  }));
  return [...current, ...legacy];
}
async function eventsFor(tx: Sql, team: Team) {
  const rows = await tx<{
    payload: TeamActivity;
  }>`select payload from team_activities where team_id=${team.id} order by payload->>'date',payload->>'startTime'`;
  const events = rows.map(({ payload: p }) => ({
    id: p.id,
    title: p.title,
    kind: p.kind,
    date: p.date,
    time: p.startTime,
    endTime: p.endTime,
    location: p.location,
    cancelled: p.status === "cancelled",
  }));
  for (const p of team.practices || [])
    if (!events.some((e) => e.id === p.id))
      events.push({
        id: p.id,
        title: "Team practice",
        kind: "practice",
        date: p.date,
        time: p.time,
        endTime: "",
        location: p.where,
        cancelled: p.status === "cancelled",
      });
  return events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
export async function readHub(sql: Sql, actor: string, raw: unknown = {}) {
  const query = hubQuery.parse(raw);
  return sql.transaction(async (tx) => {
    const access = await scope(tx, actor);
    const teams = access.teams.map((t) => ({
      id: t.id,
      name: t.name,
      sport: t.sport,
      season: t.season,
      manage: access.owner || t.coach,
    }));
    const selected = query.teamId || teams[0]?.id;
    const identity = { name: access.user.name, owner: access.owner };
    if (!selected) return { me: identity, teams, selected: null, workspace: null };
    const s = await teamFor(tx, actor, selected);
    const playerId = query.playerId || null;
    const familyId = playerId ? familyFor(s, playerId) : null;
    const posts = await postsFor(tx, s.team);
    const acknowledgments = await tx<{
      post_key: string;
      user_id: string;
    }>`select post_key,user_id from team_hub_acknowledgments where team_id=${selected} and post_key=any(${posts.map((p) => p.key)}::text[])`;
    const events = await eventsFor(tx, s.team);
    const players = playersFor(s);
    const responses = await tx<{
      event_id: string;
      player_id: string;
      response: string;
    }>`select event_id,player_id,response from team_hub_rsvps where team_id=${selected} and player_id=any(${players.filter((p) => s.manage || p.mine).map((p) => p.id)}::text[])`;
    const messages = playerId
      ? await tx<{
          id: string;
          author: string;
          body: string;
          at: string;
          mine: boolean;
        }>`select id::text,author,body,created_at::text as at,author_id=${actor} as mine from (select * from team_hub_family_messages where team_id=${selected} and player_id=${playerId} and family_id=${familyId} order by created_at desc limit 100) m order by created_at,id`
      : await tx<{
          id: string;
          author: string;
          body: string;
          at: string;
          mine: boolean;
        }>`select id::text,author,body,created_at::text as at,user_id=${actor} as mine from (select m.* from team_chat_messages m where team_id=${selected} and (not exists(select 1 from coordinator_notice_messages n where n.message_id=m.id) or exists(select 1 from coordinator_notice_messages n where n.message_id=m.id and ${actor}=any(n.recipient_ids)) or ${access.owner}) order by created_at desc limit 100) m order by created_at,id`;
    return {
      me: identity,
      teams,
      selected,
      workspace: {
        name: s.team.name,
        coach: s.team.headCoach,
        manage: s.manage,
        players,
        posts: posts.map((p) => ({
          ...p,
          acknowledged: acknowledgments.some((a) => a.post_key === p.key && a.user_id === actor),
          count: s.manage ? acknowledgments.filter((a) => a.post_key === p.key).length : null,
        })),
        events: events.map((e) => ({
          ...e,
          responses: responses
            .filter((r) => r.event_id === e.id)
            .map((r) => ({ playerId: r.player_id, response: r.response })),
        })),
        messages,
      },
    };
  });
}
export async function writeHub(sql: Sql, actor: string, raw: HubAction) {
  const action = hubAction.parse(raw);
  return sql.transaction(async (tx) => {
    const s = await teamFor(tx, actor, action.teamId, action.kind === "post");
    if (action.kind === "ack") {
      if (!(await postsFor(tx, s.team)).some((p) => p.key === action.postKey))
        throw Error("This update changed. Refresh before acknowledging it.");
      await tx`insert into team_hub_acknowledgments(team_id,post_key,user_id) values(${action.teamId},${action.postKey},${actor}) on conflict do nothing`;
    } else if (action.kind === "rsvp") {
      familyFor(s, action.playerId);
      const event = (await eventsFor(tx, s.team)).find((e) => e.id === action.eventId);
      if (!event || event.cancelled)
        throw Error("This event is no longer available for attendance replies.");
      await tx`insert into team_hub_rsvps(team_id,event_id,player_id,response,user_id) values(${action.teamId},${action.eventId},${action.playerId},${action.response},${actor}) on conflict(team_id,event_id,player_id) do update set response=excluded.response,user_id=excluded.user_id,updated_at=now()`;
    } else {
      // Retried submissions preserve their request ID; a conflicting retry cannot overwrite a record.
      await tx.query("select pg_advisory_xact_lock(hashtext($1))", [
        `team-hub:${action.requestId}`,
      ]);
      if (action.kind === "post") {
        const [old] = await tx<{
          author_id: string;
          team_id: string;
          title: string;
          body: string;
          urgent: boolean;
        }>`select * from team_hub_posts where id=${action.requestId}`;
        if (old) {
          if (
            old.author_id !== actor ||
            old.team_id !== action.teamId ||
            old.title !== action.title ||
            old.body !== action.body ||
            old.urgent !== action.urgent
          )
            throw Error("Submission changed. Refresh and try again.");
        } else
          await tx`insert into team_hub_posts(id,team_id,author_id,author,title,body,urgent) values(${action.requestId},${action.teamId},${actor},${s.access.user.name},${action.title},${action.body},${action.urgent})`;
      } else if (action.playerId) {
        const familyId = familyFor(s, action.playerId);
        const [old] = await tx<{
          author_id: string;
          team_id: string;
          player_id: string;
          family_id: string;
          body: string;
        }>`select * from team_hub_family_messages where id=${action.requestId}`;
        if (old) {
          if (
            old.author_id !== actor ||
            old.team_id !== action.teamId ||
            old.player_id !== action.playerId ||
            old.family_id !== familyId ||
            old.body !== action.body
          )
            throw Error("Submission changed. Refresh and try again.");
        } else
          await tx`insert into team_hub_family_messages(id,team_id,player_id,family_id,author_id,author,body) values(${action.requestId},${action.teamId},${action.playerId},${familyId},${actor},${s.access.user.name},${action.body})`;
      } else {
        const [old] = await tx<{
          user_id: string;
          team_id: string;
          body: string;
        }>`select * from team_chat_messages where id=${action.requestId}`;
        if (old) {
          if (old.user_id !== actor || old.team_id !== action.teamId || old.body !== action.body)
            throw Error("Submission changed. Refresh and try again.");
        } else
          await tx`insert into team_chat_messages(id,team_id,user_id,author,body) values(${action.requestId},${action.teamId},${actor},${s.access.user.name},${action.body})`;
      }
    }
    return { ok: true };
  });
}
export type HubData = Awaited<ReturnType<typeof readHub>>;
