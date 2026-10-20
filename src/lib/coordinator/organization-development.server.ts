/** Financially isolated port of existing player-development workflows.
 * Never load the commerce-backed working file, identities, private narratives or raw documents. */
import type { Sql } from "../db";
import { audit, CoordinatorDenied, requireOrganizationOperations, secured } from "./access.server";
import { trainingDrills, skillBands } from "../pd/training-catalog";
import { developmentPrograms } from "../pd/development-programs";
import { ageOnClubDay } from "../pd/engines";
import { pitchingRest } from "../pd/development-evidence";
import { chicagoDate, validDate } from "../scheduling";
import {
  organizationDevelopmentProfileInput,
  organizationDevelopmentMetricInput,
  organizationDevelopmentDayInput,
  organizationDevelopmentCurriculumInput,
  type OrganizationDevelopment,
  type OrganizationDevelopmentAthlete,
  type OrganizationDevelopmentMetric,
  type OrganizationDevelopmentDay,
  type OrganizationDevelopmentAssignment,
  type OrganizationDevelopmentControl,
  type OrganizationDevelopmentProfileInput,
  type OrganizationDevelopmentMetricInput,
  type OrganizationDevelopmentDayInput,
  type OrganizationDevelopmentCurriculumInput,
} from "./organization-development-contracts";

const changed = () => new Error("This development record changed. Reload before saving.");
const array = (path: string) =>
  `case when jsonb_typeof(${path})='array' then ${path} else '[]'::jsonb end`;
const string = (path: string) =>
  `case when jsonb_typeof(${path})='string' then ${path.replace(/->'([^']+)'$/, "->>'$1'")} else '' end`;
const integer = (path: string, max: number) =>
  `case when jsonb_typeof(${path})='number' then case when (${path})::numeric between 0 and ${max} and trunc((${path})::numeric)=(${path})::numeric then (${path})::int else null end else null end`;
const date = (path: string) =>
  `case when jsonb_typeof(${path})='string' and ${path.replace(/->'([^']+)'$/, "->>'$1'")} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then ${path.replace(/->'([^']+)'$/, "->>'$1'")} else '' end`;

const velocityValue = `case when jsonb_typeof(v->'mph')='number' then case when (v->'mph')::numeric between 0 and 150 then (v->'mph')::numeric else null end else null end`;
const pitchValue = `case when v->>'value' ~ '^-?[0-9]+([.][0-9]+)? (mph|rpm|in)$'
  and split_part(v->>'value',' ',2)=case v->>'name' when 'Avg velo' then 'mph' when 'Spin' then 'rpm' when 'IVB' then 'in' when 'HB' then 'in' else '' end
  then case when split_part(v->>'value',' ',1)::numeric between
    case when v->>'name' in ('IVB','HB') then -100 else 0 end and
    case v->>'name' when 'Avg velo' then 150 when 'Spin' then 10000 else 100 end
    then split_part(v->>'value',' ',1)::numeric else null end else null end`;

function publicCurriculum(controls: OrganizationDevelopmentControl[]) {
  // Reconstruct nested catalog content as well; added fields do not become implicitly visible.
  return {
    drills: trainingDrills.map((d) => ({
      id: d.id,
      version: d.version,
      name: d.name,
      discipline: d.discipline,
      sports: [...d.sports],
      purpose: d.purpose,
      equipment: d.equipment,
      steps: [...d.steps],
      cue: d.cue,
      correction: d.correction,
      regression: d.regression,
      progression: d.progression,
      measure: d.measure,
      minimumSkill: d.minimumSkill,
      minAge: d.minAge,
      supervision: d.supervision,
      safety: d.safety,
      dose: d.dose,
      review: d.review,
      provenance: d.provenance,
      demoUrl: d.demoUrl,
    })),
    programs: developmentPrograms.map((p) => ({
      id: p.id,
      version: p.version,
      name: p.name,
      sport: p.sport,
      discipline: p.discipline,
      minAge: p.minAge,
      minimumSkill: p.minimumSkill,
      objective: p.objective,
      baseline: p.baseline,
      equipment: p.equipment,
      phases: p.phases.map((s) => ({
        name: s.name,
        drillIds: [...s.drillIds],
        checkpoint: s.checkpoint,
        regression: s.regression,
      })),
      frequency: p.frequency,
      recovery: p.recovery,
      completion: p.completion,
      next: p.next,
      keywords: [...p.keywords],
    })),
    controls: controls.filter((c) =>
      (c.kind === "drill" ? trainingDrills : developmentPrograms).some((d) => d.id === c.id),
    ),
  };
}

export async function organizationDevelopment(
  sql: Sql,
  userId: string,
): Promise<OrganizationDevelopment> {
  return secured(sql, userId, "organization.development.read", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const [file] = await tx<{
      revision: number;
    }>`select revision from pd_working_file where id='club'`;
    const revision = file?.revision ?? 0;
    const athletes = await tx.query<OrganizationDevelopmentAthlete>(
      `
      select a.id as "athleteId",a.name,$1::int as revision,coalesce(p.editable,false) as "profileEditable",
        case when p.sport in ('baseball','softball') then p.sport when a.profile->>'sport' in ('baseball','softball') then a.profile->>'sport' else '' end as sport,
        coalesce(p.position,'') as position,coalesce(p.throws,'') as throws,coalesce(p.bats,'') as bats,
        coalesce(p.graduation_year,0) as "graduationYear",coalesce(p.school,'') as school,coalesce(p.city,'') as city
      from club_athletes a left join lateral (
        select true as editable,${string("v->'sport'")} as sport,${string("v->'position'")} as position,
          case when v->>'throws' in ('R','L') then v->>'throws' else '' end as throws,
          case when v->>'bats' in ('R','L') then v->>'bats' else '' end as bats,
          ${integer("v->'graduationYear'", 2200)} as graduation_year,${string("v->'school'")} as school,${string("v->'city'")} as city
        from pd_working_file w cross join lateral jsonb_array_elements(${array("w.payload::jsonb->'athletes'")}) v
        where w.id='club' and v->>'id'=a.id
          and (select count(*) from jsonb_array_elements(${array("w.payload::jsonb->'athletes'")}) duplicate where duplicate->>'id'=a.id)=1
      ) p on true order by a.name,a.id`,
      [revision],
    );
    const rawMetrics = await tx.query<OrganizationDevelopmentMetric>(`
      select v->>'id' as id,v->>'athleteId' as "athleteId",'velocity' as kind,${date("v->'date'")} as date,
        ${velocityValue} as value
      from pd_working_file w cross join lateral jsonb_array_elements(${array("w.payload::jsonb->'velocity'")}) v
      join club_athletes a on a.id=v->>'athleteId' where w.id='club' and jsonb_typeof(v->'id')='string'
      union all
      select v->>'id',v->>'athleteId',case v->>'name' when 'Avg velo' then 'average-velocity' when 'Spin' then 'spin' when 'IVB' then 'ivb' when 'HB' then 'hb' end,
        ${date("v->'date'")},
        ${pitchValue}
      from pd_working_file w cross join lateral jsonb_array_elements(${array("w.payload::jsonb->'metrics'")}) v
      join club_athletes a on a.id=v->>'athleteId' where w.id='club' and jsonb_typeof(v->'id')='string'
        and v->>'name' in ('Avg velo','Spin','IVB','HB') and v->>'value' ~ '^-?[0-9]+([.][0-9]+)? (mph|rpm|in)$'
        and split_part(v->>'value',' ',2)=case v->>'name' when 'Avg velo' then 'mph' when 'Spin' then 'rpm' else 'in' end`);
    const metrics = rawMetrics.flatMap((m) => {
      if (m.value === null) return [];
      const parsed = organizationDevelopmentMetricInput.safeParse({
        ...m,
        value: Number(m.value),
        revision,
      });
      if (!parsed.success) return [];
      const { id, athleteId, kind, date, value } = parsed.data;
      return [{ id, athleteId, kind, date, value }];
    });
    const sessionMetrics = await tx<OrganizationDevelopment["sessionMetrics"][number]>`
      select id,athlete_id as "athleteId",track,day::text,successes,attempts,verified from athlete_session_metrics
      where track in ('Pitching','Hitting','Fielding','Catching','Softball') and successes>=0 and attempts<=10000 and successes<=attempts
      order by day desc,id`;
    const days = await tx.query<OrganizationDevelopmentDay>(`
      select d.athlete_id as "athleteId",d.day::text,
        coalesce((select jsonb_agg(jsonb_build_object('id',${string("i->'id'")},
          'track',case when i->>'track' in ('Pitching','Hitting','Fielding','Catching','Softball','Strength','Recovery') then i->>'track' else '' end,
          'sets',${integer("i->'sets'", 100)},'reps',case when i->>'reps' ~ '^[0-9]{1,4}$' then (i->>'reps')::int else null end))
          from jsonb_array_elements(${array("d.items")}) i),'[]'::jsonb) as items
      from athlete_training_days d order by d.day desc,d.athlete_id`);
    const assignments = await tx.query<OrganizationDevelopmentAssignment>(`
      select a.id,a.athlete_id as "athleteId",a.revision,a.status,
        case when a.document->>'sport' in ('baseball','softball') then a.document->>'sport' else '' end as sport,
        case when a.document->>'discipline' in ('Pitching','Hitting','Fielding','Catching','Strength/Speed') then a.document->>'discipline' else '' end as discipline,
        ${date("a.document->'startDate'")} as "startDate",${date("a.document->'reviewDate'")} as "reviewDate",${integer("a.document->'phase'", 3)} as phase,
        coalesce((select jsonb_agg(jsonb_build_object('id',${string("t->'id'")},'drillId',${string("t->'drillId'")},'date',${date("t->'date'")},'phase',${integer("t->'phase'", 3)}))
          from jsonb_array_elements(${array("a.document->'tasks'")}) t),'[]'::jsonb) as tasks
      from training_assignments a order by a.created_at desc,a.id`);
    const controls = await tx<OrganizationDevelopmentControl>`
      select kind,content_id as id,content_version as version,status,recommended,revision from pd_curriculum_controls order by kind,content_id`;
    return {
      revision,
      athletes,
      metrics,
      sessionMetrics,
      days,
      assignments,
      curriculum: publicCurriculum(controls),
    };
  });
}

async function lockFile(tx: Sql, athleteId: string, revision: number) {
  // Match the legacy desk saver: working file first, authoritative athlete second.
  const [file] = await tx<{
    revision: number;
  }>`select revision from pd_working_file where id='club' for update`;
  if (!file || file.revision !== revision) throw changed();
  const [athlete] = await tx`select id from club_athletes where id=${athleteId} for update`;
  if (!athlete) throw new CoordinatorDenied();
}

export async function saveOrganizationDevelopmentProfile(
  sql: Sql,
  userId: string,
  raw: OrganizationDevelopmentProfileInput,
) {
  return secured(sql, userId, "organization.development.profile.save", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const input = organizationDevelopmentProfileInput.parse(raw);
    await lockFile(tx, input.athleteId, input.revision);
    const rows = await tx.query<{ index: number }>(
      `
      select (n-1)::int as index from pd_working_file w cross join lateral jsonb_array_elements(${array("w.payload::jsonb->'athletes'")}) with ordinality p(v,n)
      where w.id='club' and v->>'id'=$1`,
      [input.athleteId],
    );
    if (rows.length !== 1) throw new CoordinatorDenied();
    const patch = {
      position: input.position,
      throws: input.throws,
      bats: input.bats,
      graduationYear: input.graduationYear,
      school: input.school,
      city: input.city,
    };
    const path = ["athletes", String(rows[0].index)];
    const [saved] = await tx<{ revision: number }>`
      update pd_working_file set payload=jsonb_set(jsonb_set(payload::jsonb,${path}::text[],(payload::jsonb #> ${path}::text[]) || ${JSON.stringify(patch)}::jsonb),'{revision}',to_jsonb(revision+1))::text,
        revision=revision+1,updated_at=now() where id='club' returning revision`;
    await audit(tx, userId, "organization.development.profile.save", input.athleteId, "allowed");
    return { ok: true, revision: saved.revision };
  });
}

export async function saveOrganizationDevelopmentMetric(
  sql: Sql,
  userId: string,
  raw: OrganizationDevelopmentMetricInput,
) {
  return secured(sql, userId, "organization.development.metric.save", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const input = organizationDevelopmentMetricInput.parse(raw);
    if (input.date > chicagoDate()) throw new Error("A measurement cannot be dated in the future.");
    await lockFile(tx, input.athleteId, input.revision);
    const collection = input.kind === "velocity" ? "velocity" : "metrics";
    const [shape] = await tx<{
      valid: boolean;
    }>`select coalesce(jsonb_typeof(payload::jsonb->${collection})='array',true) as valid from pd_working_file where id='club'`;
    if (!shape.valid) throw new CoordinatorDenied();
    const rows = await tx.query<{ index: number; athleteId: string; name: string; valid: boolean }>(
      `
      select (n-1)::int as index,v->>'athleteId' as "athleteId",case when v->>'name' in ('Avg velo','Spin','IVB','HB') then v->>'name' else '' end as name,(${collection === "velocity" ? velocityValue : pitchValue}) is not null as valid
      from pd_working_file w cross join lateral jsonb_array_elements(${array("w.payload::jsonb->$1")}) with ordinality p(v,n)
      where w.id='club' and v->>'id'=$2`,
      [collection, input.id],
    );
    if (rows.length > 1 || rows.some((r) => r.athleteId !== input.athleteId || !r.valid))
      throw new CoordinatorDenied();
    const names = { "average-velocity": "Avg velo", spin: "Spin", ivb: "IVB", hb: "HB" };
    const name = input.kind === "velocity" ? "" : names[input.kind];
    if (rows.length && collection === "metrics" && rows[0].name !== name)
      throw new CoordinatorDenied();
    if (
      !rows.length &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)
    )
      throw new Error("Use a new measurement identifier.");
    const entry =
      collection === "velocity"
        ? { id: input.id, athleteId: input.athleteId, date: input.date, mph: input.value }
        : {
            id: input.id,
            athleteId: input.athleteId,
            date: input.date,
            name,
            value: `${input.value} ${input.kind === "spin" ? "rpm" : input.kind === "average-velocity" ? "mph" : "in"}`,
          };
    const path = [collection, ...(rows.length ? [String(rows[0].index)] : [])];
    // Update one row, preserving any private or future keys; append only a strict new row.
    const expression = rows.length
      ? `(payload::jsonb #> $1::text[]) || $2::jsonb`
      : `(${array("payload::jsonb->$3")}) || jsonb_build_array($2::jsonb)`;
    const [saved] = await tx.query<{ revision: number }>(
      `
      update pd_working_file set payload=jsonb_set(jsonb_set(payload::jsonb,$1::text[],${expression}),'{revision}',to_jsonb(revision+1))::text,
        revision=revision+1,updated_at=now() where id='club' returning revision`,
      rows.length ? [path, JSON.stringify(entry)] : [path, JSON.stringify(entry), collection],
    );
    await audit(tx, userId, "organization.development.metric.save", input.id, "allowed", {
      athleteId: input.athleteId,
    });
    return { ok: true, revision: saved.revision };
  });
}

export async function assignOrganizationDevelopmentDay(
  sql: Sql,
  userId: string,
  raw: OrganizationDevelopmentDayInput,
) {
  return secured(sql, userId, "organization.development.day.assign", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const input = organizationDevelopmentDayInput.parse(raw);
    if (input.day < chicagoDate()) throw new Error("Choose today or a future training day.");
    // Take the working-file lock first, matching legacy desk writes. This protects
    // recorded sport/workload and avoids reversing its file-to-athlete lock order.
    await tx`select revision from pd_working_file where id='club' for share`;
    // All established safety-state writers also lock this athlete before changing holds.
    const [athlete] = await tx<{ birthDate: string | null; sport: string; sports: string[] }>`
      select birth_date::text as "birthDate",case when profile->>'sport' in ('baseball','softball') then profile->>'sport' else '' end as sport,
        coalesce((select jsonb_agg(s) from jsonb_array_elements_text(case when jsonb_typeof(profile->'sports')='array' then profile->'sports' else '[]'::jsonb end) s where s in ('baseball','softball')),'[]'::jsonb) as sports
      from club_athletes where id=${input.athleteId} for update`;
    if (!athlete) throw new CoordinatorDenied();
    const [hold] =
      await tx`select id from training_assignments where athlete_id=${input.athleteId} and status='paused' limit 1`;
    if (hold)
      throw new Error(
        "This athlete's training needs review in the protected coaching workflow before a new plan can be assigned.",
      );
    if (!athlete.birthDate || !validDate(athlete.birthDate))
      throw new Error("A recorded birthday is required before assigning training.");
    const age = ageOnClubDay(athlete.birthDate, input.day);
    if (age < 5 || age > 100)
      throw new Error("This catalog requires an age of five or older and individual review.");
    const [existing] =
      await tx`select athlete_id from athlete_training_days where athlete_id=${input.athleteId} and day=${input.day}::date for update`;
    if (existing)
      throw new Error(
        "This day already has a plan. Review it in the protected coaching workflow; choose an unassigned day here.",
      );
    const sports = new Set([athlete.sport, ...athlete.sports]);
    const pdSports = await tx.query<{ sport: string }>(
      `
      select v->>'sport' as sport from pd_working_file w cross join lateral jsonb_array_elements(${array("w.payload::jsonb->'athletes'")}) v
      where w.id='club' and v->>'id'=$1 and v->>'sport' in ('baseball','softball') for share of w`,
      [input.athleteId],
    );
    pdSports.forEach((p) => sports.add(p.sport));
    const selected = input.items.map((i) => {
      const drill = trainingDrills.find((d) => d.id === i.drillId);
      if (
        !drill ||
        drill.minAge > age ||
        !drill.sports.some((s) => sports.has(s)) ||
        drill.minimumSkill > skillBands.indexOf(input.skill)
      )
        throw new Error(
          "A selected drill does not match the athlete's recorded age or sport, or reviewed skill.",
        );
      if (drill.version !== i.version)
        throw new Error(
          "Drill content changed. Reload and review the current version before assigning.",
        );
      return { input: i, drill };
    });
    if (
      selected.some(
        ({ drill }) =>
          drill.discipline === "Pitching" &&
          drill.sports.includes("baseball") &&
          sports.has("baseball"),
      )
    ) {
      // Reuse the established baseball rest rule without loading outing notes or
      // any medical narratives. Missing workload never means clinical clearance.
      const games = await tx.query<{ date: string; pitches: number | null }>(
        `
        select ${date("v->'date'")} as date,${integer("v->'pitches'", 10000)} as pitches
        from pd_working_file w cross join lateral jsonb_array_elements(${array("w.payload::jsonb->'outings'")}) v
        where w.id='club' and v->>'athleteId'=$1`,
        [input.athleteId],
      );
      const today = chicagoDate();
      const daily = new Map<string, number>();
      for (const game of games) {
        const ago = (Date.parse(today) - Date.parse(game.date)) / 86400000;
        if (validDate(game.date) && ago >= 0 && ago <= 14 && game.pitches !== null)
          daily.set(game.date, (daily.get(game.date) || 0) + game.pitches);
      }
      for (const [day, pitches] of daily) {
        const rest = pitchingRest(age, pitches);
        if (
          rest !== null &&
          rest > 0 &&
          input.day < new Date(Date.parse(day) + (rest + 1) * 86400000).toISOString().slice(0, 10)
        )
          throw new Error(
            "This athlete's training needs review in the protected coaching workflow before a new plan can be assigned.",
          );
      }
    }
    // Share the same advisory keys as existing curriculum review, including missing rows.
    for (const id of [...new Set(selected.map((s) => s.drill.id))].sort()) {
      await tx`select pg_advisory_xact_lock(hashtext(${"drill:" + id}))`;
      const [control] = await tx<{
        status: string;
      }>`select status from pd_curriculum_controls where kind='drill' and content_id=${id} for share`;
      if (control?.status === "retired")
        throw new Error(
          "A selected drill was retired. Reload the current curriculum before assigning.",
        );
    }
    const items = selected.map(({ input: i, drill: d }) => ({
      id: i.id,
      name: d.name,
      track: d.discipline === "Strength/Speed" ? "Strength" : d.discipline,
      sets: i.sets,
      reps: String(i.reps),
      instructions: [
        d.purpose,
        ...d.steps,
        `Cue: ${d.cue}`,
        `Safety: ${d.safety}`,
        `Supervision: ${d.supervision}`,
        `Dose: ${d.dose}`,
        `Reviewed rest between sets: ${i.restSeconds} seconds.`,
        `Easier version: ${d.regression}`,
      ].join("\n"),
      videoUrl: d.demoUrl || "",
    }));
    const focus = [...new Set(selected.map((s) => s.drill.discipline))].join(" / ");
    await tx`insert into athlete_training_days(athlete_id,day,coach_user_id,focus,game_notes,items) values(${input.athleteId},${input.day}::date,${userId},${focus},'',${JSON.stringify(items)}::jsonb)`;
    await audit(tx, userId, "organization.development.day.assign", input.athleteId, "allowed", {
      day: input.day,
      drillIds: selected.map((s) => s.drill.id),
      qualifiedReview: true,
      skill: input.skill,
    });
    return { ok: true };
  });
}

export async function reviewOrganizationDevelopmentCurriculum(
  sql: Sql,
  userId: string,
  raw: OrganizationDevelopmentCurriculumInput,
) {
  return secured(sql, userId, "organization.development.curriculum.review", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const input = organizationDevelopmentCurriculumInput.parse(raw);
    const content = (input.kind === "drill" ? trainingDrills : developmentPrograms).find(
      (d) => d.id === input.id,
    );
    if (!content || content.version !== input.version)
      throw new Error("Content changed. Reload and review the current version.");
    await tx`select pg_advisory_xact_lock(hashtext(${input.kind + ":" + input.id}))`;
    const [prior] = await tx<{
      revision: number;
    }>`select revision from pd_curriculum_controls where kind=${input.kind} and content_id=${input.id} for update`;
    if ((prior?.revision || 0) !== input.revision) throw changed();
    const [saved] = await tx<{ revision: number }>`
      insert into pd_curriculum_controls(kind,content_id,content_version,status,recommended,reviewed_by,review_note)
      values(${input.kind},${input.id},${input.version},${input.status},${input.recommended},${userId},${input.reason})
      on conflict(kind,content_id) do update set content_version=excluded.content_version,status=excluded.status,recommended=excluded.recommended,
        reviewed_by=excluded.reviewed_by,review_note=excluded.review_note,reviewed_at=now(),revision=pd_curriculum_controls.revision+1 returning revision`;
    await audit(tx, userId, "organization.development.curriculum.review", input.id, "allowed", {
      kind: input.kind,
      status: input.status,
      qualifiedReview: true,
    });
    return { ok: true, revision: saved.revision };
  });
}
