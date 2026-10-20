import type { Sql } from "../db";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  grants,
  scopedCoordinatorReady,
  hasOrganizationOperations,
  financiallyRestricted,
  permits,
  requireTeam,
  checkScope,
  audit,
  secured,
  CoordinatorDenied,
} from "./access.server";
import {
  scopeInput,
  recruitingHistoryInput,
  messageHistoryInput,
  rosterEditInput,
  prospectInput,
  requestEditInput,
  messageInput,
  emailInput,
  type Sport,
} from "./contracts";
export async function coordinatorEntry(sql: Sql, userId: string) {
  return secured(sql, userId, "coordinator.entry", async (tx) => {
    const assigned = await grants(tx, userId, true);
    const organizationOperations = await hasOrganizationOperations(tx, userId);
    const financialRestricted = await financiallyRestricted(tx, userId);
    return {
      available: assigned.some((g) => g.status === "active"),
      organizationOperations,
      financialRestricted,
    };
  });
}
export async function coordinatorHome(sql: Sql, userId: string) {
  return secured(sql, userId, "coordinator.home", async (tx) => {
    const assignments = await grants(tx, userId, true);
    // Only role identities/effective grants. No record totals or protected team names.
    const scopedReady = await scopedCoordinatorReady(tx, userId);
    const targets = scopedReady
      ? await tx<{
          id: string;
          name: string;
          sport: Sport;
        }>`select distinct t->>'id' as id,t->>'name' as name,t->>'sport' as sport from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t join coordinator_assignments g on g.user_id=${userId} and g.status='active' and cardinality(g.permissions)>0 and g.sport=t->>'sport' and (g.coverage='sport' or t->>'id'=any(g.team_ids)) where c.id='oklahoma-prospects' and not c.demo and coalesce(t->>'closed','false')<>'true'`
      : [];
    return {
      scopedReady,
      assignments: assignments.filter((g) => g.status !== "removed"),
      targets,
      organizationOperations: await hasOrganizationOperations(tx, userId),
      financialRestricted: await financiallyRestricted(tx, userId),
    };
  });
}
const scopeWhere = `(g.coverage='sport' or (t->>'id')=any(g.team_ids))`;
export async function coordinatorTeams(
  sql: Sql,
  userId: string,
  permission: "rosters.read" | "events.read" | "communications.read" | "reports.read",
) {
  return secured(sql, userId, permission, async (tx) => {
    const gs = await grants(tx, userId, true);
    if (!gs.some((g) => g.status === "active" && g.permissions.includes(permission)))
      throw new CoordinatorDenied();
    const teams = await tx.query<{ id: string; name: string; sport: Sport }>(
      `select distinct t->>'id' as id,t->>'name' as name,t->>'sport' as sport from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t join coordinator_assignments g on g.user_id=$1 and g.sport=t->>'sport' and g.status='active' and $2=any(g.permissions) and ${scopeWhere} where c.id='oklahoma-prospects' and not c.demo and coalesce(t->>'closed','false')<>'true' order by name`,
      [userId, permission],
    );
    return teams;
  });
}
export async function roster(sql: Sql, userId: string, teamId: string) {
  return secured(sql, userId, "rosters.read", async (tx) => {
    const team = await requireTeam(tx, userId, "rosters.read", teamId);
    const gs = await grants(tx, userId, true);
    const contacts = permits(gs, "contacts.read", team.sport, teamId);
    // Never select the source roster payload: it includes medical and billing records.
    const rows = await tx<{
      id: string;
      name: string;
      number: string;
      positions: string[];
      parents: { name: string; email: string; phone: string }[];
      revision: number;
    }>`select p->>'id' as id,p->>'name' as name,p->>'number' as number,p->'positions' as positions,
   case when ${contacts} then coalesce((select jsonb_agg(jsonb_build_object('name',guardian->>'name','email',guardian->>'email','phone',guardian->>'phone')) from jsonb_array_elements(coalesce(p->'parents','[]'::jsonb)) guardian),'[]'::jsonb) else '[]'::jsonb end as parents,c.rev as revision
   from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t cross join lateral jsonb_array_elements(t->'roster') p where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${teamId} and coalesce(p->>'withdrawn','false')<>'true'`;
    await audit(
      tx,
      userId,
      contacts ? "contacts.read" : "rosters.read",
      teamId,
      "allowed",
      { count: rows.length },
      team.sport,
      teamId,
    );
    return rows;
  });
}
export async function editRoster(sql: Sql, userId: string, raw: z.infer<typeof rosterEditInput>) {
  const input = rosterEditInput.parse(raw);
  return secured(sql, userId, "rosters.edit", async (tx) => {
    const team = await requireTeam(
      tx,
      userId,
      input.field === "number" ? "rosters.number" : "rosters.positions",
      input.teamId,
    );
    if (
      (input.field === "number" && typeof input.value !== "string") ||
      (input.field === "positions" && !Array.isArray(input.value))
    )
      throw new Error("Invalid roster field.");
    const [row] = await tx<{
      rev: number;
      ti: number;
      pi: number;
      old: unknown;
    }>`select c.rev,(tt.ordinality-1)::int as ti,(pp.ordinality-1)::int as pi,pp.p->${input.field} as old from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') with ordinality tt(t,ordinality) cross join lateral jsonb_array_elements(tt.t->'roster') with ordinality pp(p,ordinality) where c.id='oklahoma-prospects' and not c.demo and tt.t->>'id'=${input.teamId} and pp.p->>'id'=${input.playerId} and coalesce(pp.p->>'withdrawn','false')<>'true' for update of c`;
    if (!row) throw new CoordinatorDenied();
    if (row.rev !== input.revision) throw new Error("The roster changed. Reload before saving.");
    if (
      input.field === "number" &&
      input.value &&
      (
        await tx`select 1 from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t cross join lateral jsonb_array_elements(t->'roster') p where c.id='oklahoma-prospects' and t->>'id'=${input.teamId} and p->>'id'<>${input.playerId} and coalesce(p->>'withdrawn','false')<>'true' and p->>'number'=${input.value}`
      ).length
    )
      throw new Error("That jersey number is already assigned.");
    const path = ["teams", String(row.ti), "roster", String(row.pi), input.field];
    await tx`update club_state set payload=jsonb_set(payload,${path}::text[],${JSON.stringify(input.value)}::jsonb),rev=rev+1,updated_at=now() where id='oklahoma-prospects'`;
    await audit(
      tx,
      userId,
      "rosters." + input.field,
      input.playerId,
      "allowed",
      { field: input.field, before: row.old, after: input.value },
      team.sport,
      team.id,
    );
    return { ok: true };
  });
}
export type RequestRow = {
  id: string;
  kind: string;
  player: string;
  age: string;
  positions: string;
  sport: Sport;
  team_id: string;
  status: string;
  revision: number;
  work_revision: number;
  submitted_at: string;
  parent: string | null;
  email: string | null;
  phone: string | null;
};
function requestFields(contacts: string) {
  return `r.id,r.kind,to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as submitted_at,r.payload->>'player' as player,r.payload->>'age' as age,r.payload->>'positions' as positions,lower(r.payload->>'sport') as sport,coalesce(r.payload->>'preferredTeamId','') as team_id,coalesce(w.follow_up,'new') as status,r.coordinator_revision as revision,coalesce(w.revision,0) as work_revision,case when ${contacts} then r.payload->>'parent' end as parent,case when ${contacts} then r.payload->>'email' end as email,case when ${contacts} then r.payload->>'phone' end as phone`;
}
// Intake payloads are untrusted classifications. A selected team must exist
// in the authoritative club and agree with the claimed sport before disclosure.
const classifiedRequest = `(coalesce(r.payload->>'preferredTeamId','')='' or exists (
  select 1 from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t
  where c.id='oklahoma-prospects' and not c.demo
  and t->>'id'=r.payload->>'preferredTeamId'
  and t->>'sport'=lower(r.payload->>'sport')
  and coalesce(t->>'closed','false')<>'true'
))`;
const requestScope = `g.sport=lower(r.payload->>'sport') and (g.coverage='sport' or coalesce(r.payload->>'preferredTeamId','')=any(g.team_ids))`;
export async function recruiting(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof recruitingHistoryInput>,
) {
  const input = recruitingHistoryInput.parse(raw);
  return secured(sql, userId, "recruiting.read", async (tx) => {
    const current = await grants(tx, userId, true);
    const readPermission = permits(current, "recruiting.read", input.sport, input.teamId)
      ? "recruiting.read"
      : "tryouts.read";
    await checkScope(tx, userId, readPermission, input.sport, input.teamId);
    const contacts = permits(
      await grants(tx, userId, true),
      "contacts.read",
      input.sport,
      input.teamId,
    );
    const rows = await tx.query<RequestRow>(
      `select ${requestFields("$4::boolean")} from club_requests r left join office_request_work w on w.request_id=r.id where r.kind in ('tryout','team-inquiry') and lower(r.payload->>'sport')=$1 and ($2='' or r.payload->>'preferredTeamId'=$2) and exists(select 1 from coordinator_assignments g where g.user_id=$3 and g.status='active' and (case r.kind when 'tryout' then 'tryouts.read' else 'recruiting.read' end)=any(g.permissions) and ${requestScope}) and ${classifiedRequest} and ($5::timestamptz is null or (r.created_at,r.id)<($5::timestamptz,$6::text)) order by r.created_at desc,r.id desc limit 101`,
      [
        input.sport,
        input.teamId,
        userId,
        contacts,
        input.before?.at || null,
        input.before?.id || "",
      ],
    );
    await audit(
      tx,
      userId,
      contacts ? "contacts.read" : "recruiting.read",
      "",
      "allowed",
      { count: rows.length },
      input.sport,
      input.teamId,
    );
    const items = rows.slice(0, 100);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > 100 && last ? { at: last.submitted_at, id: last.id } : null,
    };
  });
}
export async function requestFor(
  tx: Sql,
  userId: string,
  id: string,
  permission: import("./contracts").Capability,
) {
  const [r] = await tx<{
    sport: Sport;
    team_id: string;
    revision: number;
    kind: string;
  }>`select lower(payload->>'sport') as sport,coalesce(payload->>'preferredTeamId','') as team_id,coordinator_revision as revision,kind from club_requests where id=${id} and kind in ('tryout','team-inquiry') for update`;
  if (!r || !["baseball", "softball"].includes(r.sport)) throw new CoordinatorDenied();
  const required =
    r.kind === "tryout" && permission === "recruiting.read"
      ? "tryouts.read"
      : r.kind === "tryout" && permission === "recruiting.status"
        ? "tryouts.status"
        : permission;
  await checkScope(tx, userId, required, r.sport, r.team_id);
  return r;
}
export async function createProspect(sql: Sql, userId: string, raw: z.infer<typeof prospectInput>) {
  const input = prospectInput.parse(raw);
  return secured(sql, userId, "recruiting.create", async (tx) => {
    await checkScope(tx, userId, "recruiting.create", input.sport, input.teamId);
    const payload = {
      player: input.player,
      age: input.age,
      positions: input.positions,
      sport: input.sport,
      preferredTeamId: input.teamId,
      parent: input.parent,
      email: input.email,
      phone: input.phone,
      source: "coordinator",
    };
    await tx`insert into club_requests(id,kind,payload,user_id) values(${input.id},'team-inquiry',${JSON.stringify(payload)}::jsonb,${userId})`;
    await audit(
      tx,
      userId,
      "recruiting.create",
      input.id,
      "allowed",
      {},
      input.sport,
      input.teamId,
    );
    return { ok: true };
  });
}
export async function editRequest(sql: Sql, userId: string, raw: z.infer<typeof requestEditInput>) {
  const input = requestEditInput.parse(raw);
  return secured(sql, userId, "recruiting." + input.action, async (tx) => {
    const r = await requestFor(
      tx,
      userId,
      input.id,
      input.action === "note"
        ? "recruiting.notes"
        : input.action === "status"
          ? "recruiting.status"
          : "recruiting.update",
    );
    if (input.action === "note") {
      const [exists] = await tx`select id from office_request_notes where id=${input.actionId}`;
      if (exists) throw new Error("This note was already recorded.");
      await tx`insert into office_request_notes(id,request_id,actor_id,note) values(${input.actionId},${input.id},${userId},${input.note})`;
    } else if (input.action === "status") {
      if (["attended", "no-show"].includes(input.status)) {
        if (r.kind !== "tryout") throw new CoordinatorDenied();
        await checkScope(tx, userId, "tryouts.attendance", r.sport, r.team_id);
      }
      const [old] = await tx<{
        revision: number;
      }>`select revision from office_request_work where request_id=${input.id} for update`;
      if ((old?.revision || 0) !== input.revision)
        throw new Error("Recruiting status changed. Reload.");
      await tx`insert into office_request_work(request_id,follow_up) values(${input.id},${input.status}) on conflict(request_id) do update set follow_up=excluded.follow_up,revision=office_request_work.revision+1,updated_at=now()`;
    } else {
      if (r.revision !== input.revision) throw new Error("Prospect changed. Reload.");
      await tx`update club_requests set payload=payload||${JSON.stringify({ age: input.age, positions: input.positions })}::jsonb,coordinator_revision=coordinator_revision+1 where id=${input.id}`;
    }
    await audit(
      tx,
      userId,
      "recruiting." + input.action,
      input.id,
      "allowed",
      input.action === "status" ? { status: input.status } : {},
      r.sport,
      r.team_id,
    );
    return { ok: true };
  });
}
export async function teamCommunications(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof messageHistoryInput>,
) {
  const input = messageHistoryInput.parse(raw);
  return secured(sql, userId, "communications.read", async (tx) => {
    await requireTeam(tx, userId, "communications.read", input.teamId);
    const rows = await tx.query<{ id: string; author: string; body: string; created_at: string }>(
      `select id,author,body,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at from team_chat_messages where team_id=$1 and ($2::timestamptz is null or (created_at,id::text)<($2::timestamptz,$3::text)) order by created_at desc,id desc limit 101`,
      [input.teamId, input.before?.at || null, input.before?.id || ""],
    );
    const items = rows.slice(0, 100);
    const last = items.at(-1);
    await audit(tx, userId, "communications.read", input.teamId, "allowed", {
      count: items.length,
    });
    return {
      items,
      nextCursor: rows.length > 100 && last ? { at: last.created_at, id: last.id } : null,
    };
  });
}
export async function postTeamMessage(sql: Sql, userId: string, raw: z.infer<typeof messageInput>) {
  const input = messageInput.parse(raw);
  return secured(sql, userId, "communications.team.send", async (tx) => {
    const team = await requireTeam(tx, userId, "communications.team.send", input.teamId);
    if (input.confirmedTeamId !== team.id) throw new CoordinatorDenied();
    const [user] = await tx<{ name: string }>`select name from "user" where id=${userId}`;
    // Existing authenticated team chat is the delivery surface; no addresses exposed to recipients.
    await tx`insert into team_chat_messages(id,team_id,user_id,author,body) values(${input.id},${team.id},${userId},${user.name},${input.body})`;
    await audit(
      tx,
      userId,
      "communications.team.send",
      input.id,
      "allowed",
      {},
      team.sport,
      team.id,
    );
    return { ok: true };
  });
}
export async function sendRecruitingEmail(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof emailInput>,
) {
  const input = emailInput.parse(raw);
  return secured(sql, userId, "communications.recruit.send", async (tx) => {
    const r = await requestFor(tx, userId, input.requestId, "communications.recruit.send");
    await checkScope(tx, userId, "contacts.read", r.sport, r.team_id);
    const [row] = await tx<{
      email: string;
    }>`select lower(trim(payload->>'email')) as email from club_requests where id=${input.requestId}`;
    if (!row.email || row.email !== input.confirmedEmail.trim().toLowerCase())
      throw new Error("The guardian recipient changed. Review it again.");
    await tx`insert into tryout_center_notices(id,request_id,email,subject,body,dedupe_key,category,coordinator_actor_id) values(${input.id},${input.requestId},${row.email},${input.subject},${input.body},${"coordinator:" + input.id},'coordinator-recruiting',${userId})`;
    await tx`insert into tryout_center_activity(id,request_id,actor_id,kind,subject,body) values(${randomUUID()},${input.requestId},${userId},'email',${input.subject},${input.body})`;
    await audit(
      tx,
      userId,
      "communications.recruit.send",
      input.id,
      "allowed",
      {},
      r.sport,
      r.team_id,
    );
    return { ok: true, delivery: "queued" as const };
  });
}
export async function operationalReports(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof scopeInput>,
) {
  const input = scopeInput.parse(raw);
  return secured(sql, userId, "reports.read", async (tx) => {
    const current = await grants(tx, userId, true);
    const can = (p: import("./contracts").Capability) =>
      permits(current, p, input.sport, input.teamId);
    const enabled = (
      [
        "reports.read",
        "reports.recruiting",
        "reports.tryouts",
        "reports.openings",
        "reports.attendance",
        "reports.events",
        "reports.followups",
      ] as const
    ).filter(can);
    if (!enabled.length) throw new CoordinatorDenied();
    await checkScope(tx, userId, enabled[0], input.sport, input.teamId);
    const report: Record<string, number> = {};
    if (can("reports.read")) {
      const [counts] = await tx<{
        teams: number;
        players: number;
      }>`select count(distinct t->>'id')::int as teams,count(p)::int as players from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t left join lateral jsonb_array_elements(t->'roster') p on coalesce(p->>'withdrawn','false')<>'true' where c.id='oklahoma-prospects' and not c.demo and coalesce(t->>'closed','false')<>'true' and t->>'sport'=${input.sport} and (${input.teamId}='' or t->>'id'=${input.teamId})`;
      Object.assign(report, counts);
    }
    if (
      can("reports.recruiting") ||
      can("reports.tryouts") ||
      can("reports.followups") ||
      can("reports.attendance")
    ) {
      const [counts] = await tx.query<{
        prospects: number;
        registrations: number;
        followups: number;
        attended: number;
      }>(
        `select count(*) filter(where r.kind='team-inquiry')::int as prospects,count(*) filter(where r.kind='tryout')::int as registrations,count(*) filter(where w.follow_up in ('new','follow-up-needed') or w.follow_up is null)::int as followups,count(*) filter(where r.kind='tryout' and w.follow_up='attended')::int as attended from club_requests r left join office_request_work w on w.request_id=r.id where r.kind in ('tryout','team-inquiry') and lower(r.payload->>'sport')=$1 and ($2='' or r.payload->>'preferredTeamId'=$2) and ${classifiedRequest}`,
        [input.sport, input.teamId],
      );
      if (can("reports.recruiting")) report.prospects = counts.prospects;
      if (can("reports.tryouts")) report.registrations = counts.registrations;
      if (can("reports.followups")) report.followups = counts.followups;
      if (can("reports.attendance")) report.attended = counts.attended;
    }
    if (can("reports.openings")) {
      const [r] = await tx<{
        openings: number;
      }>`select coalesce(sum(o.openings),0)::int as openings from coordinator_team_operations o join club_state c on c.id='oklahoma-prospects' and not c.demo cross join lateral jsonb_array_elements(c.payload->'teams') t where t->>'id'=o.team_id and t->>'sport'=${input.sport} and coalesce(t->>'closed','false')<>'true' and (${input.teamId}='' or o.team_id=${input.teamId})`;
      report.openings = r.openings;
    }
    if (can("reports.events")) {
      const [r] = await tx<{
        events: number;
      }>`select count(*)::int as events from team_activities a join club_state c on c.id='oklahoma-prospects' and not c.demo cross join lateral jsonb_array_elements(c.payload->'teams') t where t->>'id'=a.team_id and t->>'sport'=${input.sport} and coalesce(t->>'closed','false')<>'true' and (${input.teamId}='' or a.team_id=${input.teamId}) and coalesce(a.payload->>'status','')<>'cancelled'`;
      report.events = r.events;
    }
    if (can("reports.events") || can("reports.attendance")) {
      // Team-bound operational events only. Counts never include commerce or household data.
      const [r] = await tx<{
        programEvents: number;
        participants: number;
        checkedIn: number;
      }>`select count(distinct e.id)::int as "programEvents",count(n.athlete_id) filter(where n.status='enrolled')::int as participants,count(n.athlete_id) filter(where n.status='enrolled' and b.checked_in_at is not null)::int as "checkedIn"
      from coordinator_event_scopes s join operational_event_records e on e.id=s.event_id
      join club_state c on c.id='oklahoma-prospects' and not c.demo cross join lateral jsonb_array_elements(c.payload->'teams') t
      left join operational_event_enrollments n on n.event_id=e.id left join operational_booking_schedule b on b.id=n.booking_id
      where t->>'id'=s.team_id and t->>'sport'=${input.sport} and lower(e.sport)=${input.sport}
      and coalesce(t->>'closed','false')<>'true' and (${input.teamId}='' or s.team_id=${input.teamId})`;
      if (can("reports.events")) {
        report.programEvents = r.programEvents;
        report.eventParticipants = r.participants;
      }
      if (can("reports.attendance")) report.eventCheckedIn = r.checkedIn;
    }
    await audit(
      tx,
      userId,
      "reports.read",
      "",
      "allowed",
      { metrics: Object.keys(report) },
      input.sport,
      input.teamId,
    );
    return report;
  });
}
export async function ownActivity(sql: Sql, userId: string, raw: z.infer<typeof scopeInput>) {
  const input = scopeInput.parse(raw);
  return secured(sql, userId, "activity.read", async (tx) => {
    await checkScope(tx, userId, "activity.read", input.sport, input.teamId);
    return tx<{
      action: string;
      target_id: string;
      result: string;
      created_at: Date;
    }>`select action,target_id,result,created_at from coordinator_audit where actor_id=${userId} and sport=${input.sport} and (${input.teamId}='' or team_id=${input.teamId}) order by id desc limit 100`;
  });
}
