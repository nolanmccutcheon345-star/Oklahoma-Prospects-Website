import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { secured } from "../coordinator/access.server";
import { lockFinancialExecution } from "../finance/context.server";
import { caseFor, packetFor, pilots, rollout } from "./enrollment.server";
import { enrollmentScope, teamAccess } from "./access.server";
import { recordEnrollment } from "./handbooks.server";
import { caseInput, pilotInput } from "./enrollment-contracts";
import { progressInput, checklistTasks, pilotReviewInput, expandInput } from "./progress-contracts";

type Activity = {
  key: string;
  id: string;
  title: string;
  kind: string;
  date: string;
  time: string;
  startsAt: string;
  attendance: string;
};
async function activities(tx: Sql, teamId: string, playerId: string): Promise<Activity[]> {
  return tx<Activity>`with team as (select t from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${teamId}), events as (
 select 'activity:'||a.id::text as key,a.id::text as id,a.payload->>'title' as title,a.payload->>'kind' as kind,a.payload->>'date' as date,a.payload->>'startTime' as time from team_activities a where team_id=${teamId} and a.payload->>'status'<>'cancelled'
 union all select 'practice:'||(p->>'id'),p->>'id','Team practice','practice',p->>'date',p->>'time' from team cross join lateral jsonb_array_elements(coalesce(t->'practices','[]')) p where p->>'status'<>'cancelled'
 union all select 'event:'||(e->>'id'),e->>'id',e->>'name','tournament',e->>'start','00:00' from club_state c cross join lateral jsonb_array_elements(coalesce(c.payload->'catalog','[]')) e,team where c.id='oklahoma-prospects' and t->'tournamentIds' ? (e->>'id')
 ) select key,id,title,kind,date,time,((date||' '||case when time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then time else '00:00' end)::timestamp at time zone 'America/Chicago')::text as "startsAt",coalesce(t->'attendance'->id->>${playerId},'') as attendance from events,team where date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' order by date,time`;
}
const dayInChicago = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
async function athleteLink(tx: Sql, teamId: string, playerId: string) {
  const links = await tx<{
    athlete_id: string;
  }>`select athlete_id from team_dev_roster_links where team_id=${teamId} and roster_player_id=${playerId} and ended_at is null`;
  return links.length === 1 ? links[0].athlete_id : null;
}
export async function seasonProgress(sql: Sql, actor: string, raw: unknown) {
  const i = caseInput.parse(raw);
  return secured(sql, actor, "enrollment.progress.read", async (tx) => {
    const c = await caseFor(tx, actor, i),
      packet = await packetFor(tx, c.team.id, c.team.sport),
      standards = packet.documents.find((d) => d.kind === "team")?.standards;
    const events = await activities(tx, i.teamId, i.playerId);
    const notices = await tx<{
      activityKey: string;
      availability: string;
      noticeKind: string;
      directContact: boolean;
      revision: number;
      submittedAt: string;
      acknowledgedAt: string | null;
    }>`select activity_key as "activityKey",availability,notice_kind as "noticeKind",direct_contact as "directContact",revision,submitted_at::text as "submittedAt",acknowledged_at::text as "acknowledgedAt" from enrollment_absence_notices where case_id=${c.row.id}`;
    const detailed = c.scope.owner || c.team.coach || c.guardian || c.self;
    const checkpoints = await tx<{
      id: string;
      kind: string;
      dueOn: string;
      completedOn: string | null;
      feedback: string;
      assessmentId: string | null;
      revision: number;
    }>`select id,kind,due_on::text as "dueOn",completed_on::text as "completedOn",case when ${detailed} then feedback else '' end as feedback,case when ${detailed} then assessment_id else null end as "assessmentId",revision from enrollment_checkpoints where case_id=${c.row.id} order by due_on,id`;
    const checks = await tx<{
      key: string;
      completed: boolean;
      revision: number;
      updatedAt: string;
    }>`select task_key as key,completed,revision,updated_at::text as "updatedAt" from enrollment_checklist where case_id=${c.row.id}`;
    const [travel] = await tx<{
      adultName: string;
      adultPhone: string;
      revision: number;
    }>`select adult_name as "adultName",adult_phone as "adultPhone",revision from enrollment_travel_contacts where case_id=${c.row.id} and ${c.guardian || c.scope.owner || c.team.coach}`;
    const athleteId = await athleteLink(tx, i.teamId, i.playerId);
    const assessments =
      detailed && athleteId
        ? await tx<{
            id: string;
            discipline: string;
            completedOn: string;
          }>`select id,discipline,completed_at::date::text as "completedOn" from athlete_assessments where athlete_id=${athleteId} and completed_at<=now() order by completed_at desc limit 30`
        : [];
    const checklist = checklistTasks.map((t) => {
      const record = checks.find((c) => c.key === t.key);
      return {
        ...t,
        dueOn: new Date(+c.row.created_at + t.day * 86400000).toISOString().slice(0, 10),
        completed: record?.completed || false,
        revision: record?.revision || 0,
        updatedAt: record?.updatedAt || null,
      };
    });
    return {
      events: events.map((e) => {
        const n = notices.find((n) => n.activityKey === e.key);
        const hours =
          e.kind === "practice"
            ? standards?.practiceNoticeHours || 48
            : (standards?.tournamentNoticeDays || 14) * 24;
        return {
          ...e,
          notice: n || null,
          noticeDueAt: new Date(+new Date(e.startsAt) - hours * 3600000).toISOString(),
          lateNotice:
            !!n &&
            n.noticeKind === "planned" &&
            n.availability !== "going" &&
            +new Date(n.submittedAt) > +new Date(e.startsAt) - hours * 3600000,
        };
      }),
      checkpoints,
      checklist,
      assessments,
      athleteLinked: !!athleteId,
      travel: travel || null,
      canManage: c.team.canManage,
      canEvaluate: c.scope.owner || c.team.coach,
      canSeeTravel: c.guardian || c.scope.owner || c.team.coach,
      guardian: c.guardian,
      requiredUpdates: standards?.inSeasonUpdates || 1,
      rsvpIsNotice: standards?.rsvpIsNotice || false,
      today: dayInChicago(),
    };
  });
}
export async function saveProgress(sql: Sql, actor: string, raw: unknown) {
  const i = progressInput.parse(raw);
  return secured(sql, actor, "enrollment.progress.save", async (tx) => {
    // Same order as existing operational writers; no financial context or financial fields are read.
    await lockFinancialExecution(tx);
    const c = await caseFor(tx, actor, i);
    if (i.action === "notice" || i.action === "acknowledge" || i.action === "attendance") {
      const e = (await activities(tx, i.teamId, i.playerId)).find((e) => e.key === i.activityKey);
      if (!e) throw Error("Choose a current activity from this team’s schedule.");
      if (i.action === "attendance") {
        if (!c.team.canManage) throw Error("Enrollment-management permission required.");
        if (e.attendance !== i.expected) throw Error("Attendance changed. Reload.");
        if (e.date > dayInChicago())
          throw Error("Attendance is recorded on or after the activity date.");
        const [index] = await tx<{
          n: number;
        }>`select (n-1)::int as n from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') with ordinality as t(value,n) where c.id='oklahoma-prospects' and value->>'id'=${i.teamId} for update of c`;
        // JSONB setters preserve every financial key and every other athlete’s attendance.
        await tx`update club_state set payload=jsonb_set(payload,array['teams',${String(index.n)},'attendance'],coalesce(payload->'teams'->(${index.n}::int)->'attendance','{}')||jsonb_build_object(${e.id}::text,coalesce(payload->'teams'->(${index.n}::int)->'attendance'->${e.id},'{}')||jsonb_build_object(${i.playerId}::text,${i.status}::text))),rev=rev+1 where id='oklahoma-prospects'`;
      } else {
        const [old] = await tx<{
          revision: number;
        }>`select revision from enrollment_absence_notices where case_id=${c.row.id} and activity_key=${e.key} for update`;
        if ((old?.revision || 0) !== i.revision) throw Error("Attendance notice changed. Reload.");
        if (i.action === "notice") {
          if (!c.guardian) throw Error("Only the linked guardian submits availability notices.");
          await tx`insert into enrollment_absence_notices(case_id,activity_key,availability,notice_kind,direct_contact,submitted_by) values(${c.row.id},${e.key},${i.availability},${i.noticeKind},${i.directContact},${actor}) on conflict(case_id,activity_key) do update set availability=excluded.availability,notice_kind=excluded.notice_kind,direct_contact=excluded.direct_contact,submitted_by=excluded.submitted_by,submitted_at=now(),acknowledged_by=null,acknowledged_at=null,revision=enrollment_absence_notices.revision+1`;
        } else {
          if (!c.team.canManage) throw Error("Enrollment-management permission required.");
          if (!old) throw Error("No notice to acknowledge.");
          await tx`update enrollment_absence_notices set acknowledged_by=${actor},acknowledged_at=now(),revision=revision+1 where case_id=${c.row.id} and activity_key=${e.key}`;
        }
      }
    } else if (i.action === "checklist") {
      const task = checklistTasks.find((t) => t.key === i.task)!;
      if (task.guardian ? !c.guardian : !c.team.canManage)
        throw Error(
          task.guardian
            ? "This task must be confirmed by the guardian."
            : "Enrollment-management permission required.",
        );
      const [old] = await tx<{
        revision: number;
      }>`select revision from enrollment_checklist where case_id=${c.row.id} and task_key=${i.task} for update`;
      if ((old?.revision || 0) !== i.revision) throw Error("Checklist changed. Reload.");
      await tx`insert into enrollment_checklist(case_id,task_key,completed,updated_by) values(${c.row.id},${i.task},${i.complete},${actor}) on conflict(case_id,task_key) do update set completed=excluded.completed,updated_by=excluded.updated_by,updated_at=now(),revision=enrollment_checklist.revision+1`;
    } else if (i.action === "checkpoint") {
      if (!c.scope.owner && !c.team.coach)
        throw Error("Assigned coach or owner access required for development feedback.");
      const athleteId = await athleteLink(tx, i.teamId, i.playerId);
      if (!athleteId) throw Error("Link the athlete in the existing development workspace first.");
      if (i.completedOn && (i.completedOn > dayInChicago() || i.feedback.length < 20))
        throw Error(
          "Completed feedback needs a real past/today date and meaningful observations and next steps.",
        );
      if (i.assessmentId) {
        const [a] =
          await tx`select id from athlete_assessments where id=${i.assessmentId} and athlete_id=${athleteId} and completed_at<=now()`;
        if (!a) throw Error("Assessment must belong to this linked athlete and be completed.");
      }
      const [old] = i.id
        ? await tx<{
            revision: number;
            case_id: string;
          }>`select revision,case_id from enrollment_checkpoints where id=${i.id} for update`
        : [];
      if ((i.id && (!old || old.case_id !== c.row.id)) || (old?.revision || 0) !== i.revision)
        throw Error("Checkpoint changed or unavailable. Reload.");
      const id = i.id || randomUUID();
      await tx`insert into enrollment_checkpoints(id,case_id,kind,due_on,completed_on,feedback,athlete_id,assessment_id,updated_by) values(${id},${c.row.id},${i.kind},${i.dueOn},${i.completedOn || null},${i.feedback},${athleteId},${i.assessmentId || null},${actor}) on conflict(id) do update set kind=excluded.kind,due_on=excluded.due_on,completed_on=excluded.completed_on,feedback=excluded.feedback,assessment_id=excluded.assessment_id,updated_by=excluded.updated_by,updated_at=now(),revision=enrollment_checkpoints.revision+1`;
    } else {
      if (!c.guardian) throw Error("Only the linked guardian may authorize a travel adult.");
      const [old] = await tx<{
        revision: number;
      }>`select revision from enrollment_travel_contacts where case_id=${c.row.id} for update`;
      if ((old?.revision || 0) !== i.revision) throw Error("Travel contact changed. Reload.");
      await tx`insert into enrollment_travel_contacts(case_id,adult_name,adult_phone,guardian_id) values(${c.row.id},${i.adultName},${i.adultPhone},${actor}) on conflict(case_id) do update set adult_name=excluded.adult_name,adult_phone=excluded.adult_phone,guardian_id=excluded.guardian_id,updated_at=now(),revision=enrollment_travel_contacts.revision+1`;
    }
    await recordEnrollment(tx, actor, "progress." + i.action, c.row.id, { action: i.action });
    return { ok: true };
  });
}

async function requireObservedPilot(tx: Sql, teamId: string) {
  const [e] =
    await tx`select c.id from enrollment_cases c where c.team_id=${teamId} and c.cleared_at is not null and c.created_at<=now()-interval '30 days' and (select count(*) from enrollment_checklist k where k.case_id=c.id and k.completed)=5 and exists(select 1 from enrollment_checkpoints d where d.case_id=c.id and d.completed_on is not null) and exists(select 1 from enrollment_absence_notices n where n.case_id=c.id and n.acknowledged_at is not null) and exists(select 1 from club_state s cross join lateral jsonb_array_elements(s.payload->'teams') t cross join lateral jsonb_each(coalesce(t->'attendance','{}')) a where s.id='oklahoma-prospects' and not s.demo and t->>'id'=c.team_id and a.value->>c.player_id in ('present','late','excused','absent')) limit 1`;
  if (!e)
    throw Error(
      "Complete and observe the full 30-day pilot for at least one cleared athlete, including all checklist tasks, development feedback, an acknowledged notice and recorded attendance.",
    );
}
export async function reviewPilot(sql: Sql, actor: string, raw: unknown) {
  const i = pilotReviewInput.parse(raw);
  return secured(sql, actor, "enrollment.pilot.review", async (tx) => {
    const s = await enrollmentScope(tx, actor);
    if (!s.owner) throw Error("Owner access required.");
    teamAccess(s, i.teamId);
    await tx`select id from enrollment_rollout where id='academy' for update`;
    const [p] = await tx<{
      revision: number;
    }>`select revision from enrollment_pilots where team_id=${i.teamId} for update`;
    if (!p || p.revision !== i.revision) throw Error("Pilot changed. Reload.");
    if (i.passed) {
      await requireObservedPilot(tx, i.teamId);
    }
    await tx`update enrollment_pilots set pilot_passed=${i.passed},pilot_review=${i.evidence},revision=revision+1,updated_by=${actor},updated_at=now() where team_id=${i.teamId}`;
    // Withdrawing a pilot approval stops expansion and closes additional-team signatures.
    if (!i.passed) {
      await tx`update enrollment_rollout set mode='pilot',revision=revision+1 where id='academy'`;
      await tx`update enrollment_additional_teams set signatures_open=false,revision=revision+1`;
    }
    await recordEnrollment(tx, actor, "pilot.review", i.teamId, {
      passed: i.passed,
      evidence: i.evidence,
    });
    return { ok: true };
  });
}
export async function expandEnrollment(sql: Sql, actor: string, raw: unknown) {
  const i = expandInput.parse(raw);
  return secured(sql, actor, "enrollment.expand", async (tx) => {
    if (!(await enrollmentScope(tx, actor)).owner) throw Error("Owner access required.");
    await tx`select id from enrollment_rollout where id='academy' for update`;
    const p = await pilots(tx);
    if (p.length !== 2 || p.some((p) => !p.pilotPassed))
      throw Error("Both baseball and softball pilots must pass owner review first.");
    for (const pilot of p) await requireObservedPilot(tx, pilot.teamId);
    const r =
      await tx`update enrollment_rollout set mode='organization',revision=revision+1,updated_by=${actor},updated_at=now() where id='academy' and revision=${i.revision} returning id`;
    if (!r.length) throw Error("Rollout changed. Reload.");
    await recordEnrollment(tx, actor, "rollout.organization", "academy", { evidence: i.evidence });
    return { ok: true };
  });
}
export async function configureAdditionalTeam(sql: Sql, actor: string, raw: unknown) {
  const i = pilotInput.parse(raw);
  return secured(sql, actor, "enrollment.team.activate", async (tx) => {
    const s = await enrollmentScope(tx, actor);
    if (!s.owner) throw Error("Owner access required.");
    const t = teamAccess(s, i.teamId);
    await tx`select id from enrollment_rollout where id='academy' for update`;
    if ((await rollout(tx)).mode !== "organization")
      throw Error("Complete both pilots before adding teams.");
    if ((await pilots(tx)).some((p) => p.teamId === t.id))
      throw Error("Use the existing pilot controls for this team.");
    const [old] = await tx<{
      revision: number;
      season_key: string;
    }>`select revision,season_key from enrollment_additional_teams where team_id=${t.id} for update`;
    if ((old?.revision || 0) !== i.revision) throw Error("Team settings changed. Reload.");
    if (old && old.season_key !== i.seasonKey) throw Error("Keep this enrollment season identity.");
    if (i.signaturesOpen) {
      const p = await packetFor(tx, t.id, t.sport);
      if (!p.ready) throw Error(p.blockers.join(" "));
    }
    await tx`insert into enrollment_additional_teams(team_id,sport,season_key,signatures_open,updated_by) values(${t.id},${t.sport},${i.seasonKey},${i.signaturesOpen},${actor}) on conflict(team_id) do update set signatures_open=excluded.signatures_open,revision=enrollment_additional_teams.revision+1,updated_by=excluded.updated_by,updated_at=now()`;
    await recordEnrollment(tx, actor, "rollout.team", t.id, { open: i.signaturesOpen });
    return { ok: true };
  });
}
