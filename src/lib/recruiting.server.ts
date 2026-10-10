import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import type { ClubRecord } from "./teams/types";
import type { TeamActivity } from "./teams/activity-contracts";
import { statKeys } from "./teams/activity-contracts";
import { teamSeasons } from "./teams/seasons";
import {
  blankProfile,
  profileData,
  saveProfileInput,
  consentInput,
  metricInput,
  reviewInput,
  linkInput,
  CONSENT_TEXT,
  CONSENT_VERSION,
} from "./recruiting-contracts";
import type { z } from "zod";
type Person = { id: string; name: string; household_id: string | null };
type Link = { athlete_id: string; team_id: string; roster_id: string };
type Me = Awaited<ReturnType<typeof resolveIdentity>>;
type Profile = {
  athlete_id: string;
  revision: number;
  payload: z.infer<typeof profileData>;
  published: boolean;
  consent_by: string | null;
  consent_name: string | null;
  consent_at: string | null;
  consent_version: string | null;
};
export type Metric = {
  id: string;
  athlete_id: string;
  metric: z.infer<typeof metricInput>["metric"];
  value: number;
  measured_on: string;
  status: "unverified" | "pending" | "verified" | "rejected";
  revision: number;
  evidence: string;
  verifier_name: string | null;
  verified_at: string | null;
  method: string;
  review_note: string;
};
async function records(sql: Sql) {
  const [r] = await sql<{
    payload: ClubRecord;
    demo: boolean;
  }>`select payload,demo from club_state where id='oklahoma-prospects'`;
  return {
    club: r && !r.demo ? r.payload : null,
    links: await sql<Link>`select athlete_id,team_id,roster_id from recruiting_roster_links`,
  };
}
function guardian(p: Person, me: Me) {
  return (
    !!p.household_id &&
    (me.role === "player" ? me.guardianHouseholdIds : me.familyIds).includes(p.household_id)
  );
}
function self(p: Person, me: Me, links: Link[]) {
  return (
    me.playerIds.includes(p.id) ||
    links.some((l) => l.athlete_id === p.id && me.playerIds.includes(l.roster_id))
  );
}
function head(p: Person, me: Me, club: ClubRecord | null, links: Link[]) {
  return !!club?.teams.some(
    (t) =>
      !t.closed &&
      t.coachEmail?.trim().toLowerCase() === me.email &&
      links.some(
        (l) =>
          l.athlete_id === p.id &&
          l.team_id === t.id &&
          t.roster.some((r) => r.id === l.roster_id && !r.withdrawn),
      ),
  );
}
async function access(sql: Sql, userId: string, id: string) {
  const me = await resolveIdentity(sql, userId);
  const [p] = await sql<Person>`select id,name,household_id from club_athletes where id=${id}`;
  if (!p) throw Error("Player unavailable.");
  const { club, links } = await records(sql);
  return {
    me,
    p,
    club,
    links,
    guardian: guardian(p, me),
    edit: me.role === "admin" || guardian(p, me) || self(p, me, links),
    review: me.role === "admin" || head(p, me, club, links),
  };
}
async function audit(sql: Sql, userId: string, action: string, id: string, data: unknown) {
  await sql`insert into audit_events(actor_id,action,target_table,target_id,after_state) values(${userId},${action},'recruiting_profiles',${id},${JSON.stringify(data)}::jsonb)`;
}
export async function saveRecruitingProfile(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof saveProfileInput>,
) {
  const d = saveProfileInput.parse(raw);
  const a = await access(sql, userId, d.athleteId);
  if (!a.edit) throw Error("Only this player, their guardian, or an admin may edit.");
  return sql.transaction(async (tx) => {
    await tx`select id from club_athletes where id=${d.athleteId} for update`;
    const [old] =
      await tx<Profile>`select * from recruiting_profiles where athlete_id=${d.athleteId} for update`;
    if ((old?.revision || 0) !== d.revision) throw Error("Profile changed. Reload before saving.");
    if (old)
      await tx`update recruiting_profiles set payload=${JSON.stringify(d.profile)}::jsonb,revision=revision+1,updated_at=now() where athlete_id=${d.athleteId}`;
    else
      await tx`insert into recruiting_profiles(athlete_id,payload) values(${d.athleteId},${JSON.stringify(d.profile)}::jsonb)`;
    await audit(tx, userId, "recruiting-profile-save", d.athleteId, { revision: d.revision + 1 });
  });
}
export async function consentRecruiting(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof consentInput>,
) {
  const d = consentInput.parse(raw),
    a = await access(sql, userId, d.athleteId);
  if (!a.guardian)
    throw Error("Only this player’s parent or legal guardian may authorize publication.");
  if (d.publish && (!d.consent || !d.signer))
    throw Error("Read the consent and sign before publishing.");
  await sql.transaction(async (tx) => {
    await tx`select id from club_athletes where id=${d.athleteId} for update`;
    const [p] =
      await tx<Profile>`select * from recruiting_profiles where athlete_id=${d.athleteId}`;
    if (!p) throw Error("Save a profile first.");
    await tx`update recruiting_profiles set published=${d.publish},consent_by=${userId},consent_name=${d.signer},consent_at=now(),consent_version=${CONSENT_VERSION},revision=revision+1,updated_at=now() where athlete_id=${d.athleteId}`;
    await audit(
      tx,
      userId,
      d.publish ? "recruiting-consent" : "recruiting-consent-withdrawn",
      d.athleteId,
      { text: CONSENT_TEXT, version: CONSENT_VERSION, signer: d.signer },
    );
  });
}
export async function saveRecruitingMetric(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof metricInput>,
) {
  const d = metricInput.parse(raw),
    a = await access(sql, userId, d.athleteId);
  if (!a.edit)
    throw Error("Only this player, their guardian, or an admin may submit measurements.");
  if (d.measuredOn > new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
    throw Error("Measurement date cannot be in the future.");
  await sql.transaction(async (tx) => {
    await tx`select id from club_athletes where id=${d.athleteId} for update`;
    const [old] =
      await tx<Metric>`select * from recruiting_metrics where athlete_id=${d.athleteId} and metric=${d.metric} for update`;
    if (old ? old.id !== d.id || old.revision !== d.revision : d.id !== "" || d.revision !== 0)
      throw Error("Measurement changed. Reload before saving.");
    const id = old?.id || randomUUID();
    if (old)
      await tx`update recruiting_metrics set value=${d.value},measured_on=${d.measuredOn},evidence=${d.evidence},status=${d.request ? "pending" : "unverified"},revision=revision+1,submitted_by=${userId},verified_by=null,verifier_name=null,verified_at=null,method='',review_note='',updated_at=now() where id=${id}`;
    else
      await tx`insert into recruiting_metrics(id,athlete_id,metric,value,measured_on,evidence,status,submitted_by) values(${id},${d.athleteId},${d.metric},${d.value},${d.measuredOn},${d.evidence},${d.request ? "pending" : "unverified"},${userId})`;
    await audit(tx, userId, "recruiting-metric-submit", d.athleteId, {
      id,
      requested: d.request,
      metric: d.metric,
      value: d.value,
    });
  });
}
export async function reviewRecruitingMetric(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof reviewInput>,
) {
  const d = reviewInput.parse(raw);
  const [m] = await sql<Metric>`select * from recruiting_metrics where id=${d.id}`;
  if (!m) throw Error("Request unavailable.");
  const a = await access(sql, userId, m.athlete_id);
  if (!a.review) throw Error("Only an admin or this player’s assigned head coach may verify.");
  if (d.approve && !d.method) throw Error("Describe how the measurement was verified.");
  await sql.transaction(async (tx) => {
    const [updated] =
      await tx`update recruiting_metrics set status=${d.approve ? "verified" : "rejected"},verified_by=${d.approve ? userId : null},verifier_name=${d.approve ? a.me.name : null},verified_at=${d.approve ? new Date().toISOString() : null},method=${d.method},review_note=${d.note},revision=revision+1,updated_at=now() where id=${d.id} and revision=${d.revision} and status='pending' returning id`;
    if (!updated) throw Error("Request changed or already reviewed. Reload.");
    await audit(tx, userId, "recruiting-metric-review", m.athlete_id, d);
  });
}
export async function linkRecruitingRoster(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof linkInput>,
) {
  const d = linkInput.parse(raw),
    a = await access(sql, userId, d.athleteId);
  if (a.me.role !== "admin") throw Error("Admin access required to link player identities.");
  if (!a.club?.teams.some((t) => t.id === d.teamId && t.roster.some((p) => p.id === d.rosterId)))
    throw Error("Choose an existing team roster record.");
  await sql.transaction(async (tx) => {
    if (d.remove)
      await tx`delete from recruiting_roster_links where athlete_id=${d.athleteId} and team_id=${d.teamId} and roster_id=${d.rosterId}`;
    else {
      const [old] =
        await tx<Link>`select * from recruiting_roster_links where team_id=${d.teamId} and roster_id=${d.rosterId}`;
      if (old && old.athlete_id !== d.athleteId)
        throw Error("This roster record is linked to another player. Unlink it there first.");
      await tx`insert into recruiting_roster_links(athlete_id,team_id,roster_id,linked_by) values(${d.athleteId},${d.teamId},${d.rosterId},${userId}) on conflict do nothing`;
    }
    await audit(tx, userId, "recruiting-roster-link", d.athleteId, d);
  });
}
export async function recruitingWorkspace(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId),
    { club, links } = await records(sql);
  const people = await sql<Person>`select id,name,household_id from club_athletes order by name`;
  const profiles = await sql<Profile>`select * from recruiting_profiles`;
  const metrics =
    await sql<Metric>`select id,athlete_id,metric,value::float as value,measured_on::text as measured_on,status,revision,evidence,verifier_name,verified_at::text as verified_at,method,review_note from recruiting_metrics`;
  return {
    admin: me.role === "admin",
    players: people
      .filter((p) => me.role === "admin" || guardian(p, me) || self(p, me, links))
      .map((p) => {
        const profile = profiles.find((r) => r.athlete_id === p.id);
        return {
          id: p.id,
          name: p.name,
          guardian: guardian(p, me),
          revision: profile?.revision || 0,
          profile: { ...blankProfile, ...profile?.payload },
          published: !!profile?.published,
          consentAt: profile?.consent_at,
          metrics: metrics.filter((m) => m.athlete_id === p.id),
          links: links.filter((l) => l.athlete_id === p.id),
        };
      }),
    requests: metrics
      .filter(
        (m) =>
          m.status === "pending" &&
          people.some(
            (p) => p.id === m.athlete_id && (me.role === "admin" || head(p, me, club, links)),
          ),
      )
      .map((m) => ({ ...m, playerName: people.find((p) => p.id === m.athlete_id)!.name })),
    rosters:
      me.role === "admin"
        ? (club?.teams || []).flatMap((t) =>
            t.roster.map((p) => ({
              teamId: t.id,
              rosterId: p.id,
              label: `${p.name} · ${t.name} · ${t.seasonLabel}`,
            })),
          )
        : [],
  };
}
export function recruitingStats(
  club: ClubRecord | null,
  links: Link[],
  id: string,
  games: TeamActivity[],
) {
  const rows: {
    teamId: string;
    team: string;
    season: string;
    date: string;
    values: Record<string, number>;
  }[] = [];
  const additional: {
    teamId: string;
    team: string;
    season: string;
    values: Record<string, number>;
  }[] = [];
  const teams = (club?.teams || []).flatMap((t) => {
    const match = links.filter((l) => l.athlete_id === id && l.team_id === t.id);
    if (!match.length) return [];
    const seasons = teamSeasons(t);
    for (const l of match) {
      const p = t.roster.find((p) => p.id === l.roster_id);
      if (!p) continue;
      const extra = Object.fromEntries(
        Object.entries(p.stats || {}).filter(
          ([k, v]) => !([...statKeys, "avg"] as string[]).includes(k) && Number.isFinite(v),
        ),
      );
      if (Object.keys(extra).length)
        additional.push({
          teamId: t.id,
          team: t.name,
          season: seasons.length === 1 ? seasons[0] : "Unassigned season",
          values: extra,
        });
      const counted: Record<string, number> = {};
      for (const g of games.filter(
        (g) => g.teamId === t.id && g.kind === "game" && g.status === "final",
      )) {
        const stat = g.stats.find((s) => s.playerId === p.id);
        if (!stat) continue;
        for (const k of statKeys) counted[k] = (counted[k] || 0) + stat.values[k];
        rows.push({
          teamId: t.id,
          team: t.name,
          season: g.season || (seasons.length === 1 ? seasons[0] : "Unassigned season"),
          date: g.date,
          values: stat.values,
        });
      }
      const remainder = Object.fromEntries(
        statKeys.map((k) => [k, Math.max(0, (p.stats?.[k] || 0) - (counted[k] || 0))]),
      );
      if (Object.values(remainder).some((v) => v > 0))
        rows.push({
          teamId: t.id,
          team: t.name,
          season: seasons.length === 1 ? seasons[0] : "Unassigned season",
          date: "",
          values: remainder,
        });
    }
    return [{ id: t.id, name: t.name, sport: t.sport, seasons, age: t.age, current: !t.closed }];
  });
  return { teams, rows, additional };
}
export async function publicRecruiting(sql: Sql, id?: string) {
  const rows = await sql<
    Profile & { name: string }
  >`select r.*,a.name from recruiting_profiles r join club_athletes a on a.id=r.athlete_id where published=true and consent_by is not null and consent_version=${CONSENT_VERSION}`;
  const selected = id ? rows.filter((p) => p.athlete_id === id) : rows;
  const { club, links } = await records(sql);
  const games = id
    ? (
        await sql<{
          payload: TeamActivity;
        }>`select payload from team_activities where payload->>'kind'='game' and payload->>'status'='final'`
      ).map((g) => g.payload)
    : [];
  const metrics = id
    ? await sql<Metric>`select id,athlete_id,metric,value::float as value,measured_on::text as measured_on,status,verifier_name,verified_at::text as verified_at,method from recruiting_metrics where athlete_id=${id}`
    : [];
  return selected.map((p) => ({
    id: p.athlete_id,
    name: p.name,
    profile: profileData.parse({ ...blankProfile, ...p.payload }),
    ...recruitingStats(club, links, p.athlete_id, games),
    metrics: metrics.map((m) => ({
      id: m.id,
      metric: m.metric,
      value: m.value,
      date: m.measured_on,
      status:
        m.status === "verified" ? "verified" : m.status === "pending" ? "pending" : "unverified",
      verifiedBy: m.status === "verified" ? m.verifier_name : null,
      verifiedAt: m.status === "verified" ? m.verified_at : null,
      method: m.status === "verified" ? m.method : "",
    })),
  }));
}
