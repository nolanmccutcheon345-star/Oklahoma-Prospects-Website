import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import type { TeamDevSeedRecord } from "./contracts";
import type { ClubRecord } from "@/lib/teams/types";
import { chicagoDate } from "@/lib/scheduling";
import { lateCompletionDecision } from "./states";

const teamId = z.string().trim().min(1).max(150);
const athleteId = z.string().trim().min(1).max(150);
const rosterPlayerId = z.string().trim().min(1).max(150);

export const getAdminTeamDevelopment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { resolveIdentity } = await import("@/lib/identity.server");
    const sql = await getSql();
    const me = await resolveIdentity(sql, context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    const [programs, versions, exercises, drills, config, links, athletes, settings] = await Promise.all([
      sql.query<{id:string;name:string;sport:string;category:string;current_version:number;disabled_at:string|null}>(
        "select id,name,sport,category,current_version,disabled_at::text from team_dev_programs order by category,name",
      ),
      sql.query<{program_id:string;version:number;status:string;data_label:string;blocked_fields:string[];approved_by:string|null;approved_at:string|null}>(
        "select program_id,version,status,data_label,blocked_fields,approved_by,approved_at::text from team_dev_program_versions order by program_id,version desc",
      ),
      sql.query<{id:string;version:number;name:string;category:string;status:string;data_label:string}>(
        "select id,version,name,category,status,data_label from team_dev_exercises order by category,name",
      ),
      sql.query<{id:string;version:number;name:string;sport:string;category:string;status:string;data_label:string}>(
        "select id,version,name,sport,category,status,data_label from team_dev_drills order by sport,category,name",
      ),
      sql.query<{id:string;version:number;kind:string;label:string;active:boolean;data_label:string}>(
        "select id,version,kind,label,active,data_label from team_dev_config_items order by kind,label",
      ),
      sql.query<{id:string;team_id:string;roster_player_id:string;athlete_id:string;linked_at:string;ended_at:string|null}>(
        "select id,team_id,roster_player_id,athlete_id,linked_at::text,ended_at::text from team_dev_roster_links order by linked_at desc",
      ),
      sql.query<{ id: string; profile: { firstName?: string; lastName?: string; sport?: string } }>(
        "select id,profile from club_athletes order by id",
      ),
      sql.query<{athlete_id:string;self_complete_enabled:boolean}>(
        "select athlete_id,self_complete_enabled from team_dev_player_settings order by athlete_id",
      ),
    ]);
    return {
      programs,
      versions,
      exercises,
      drills,
      config,
      links,
      settings,
      athletes: athletes.map((a) => ({
        id: a.id,
        name: [a.profile?.firstName, a.profile?.lastName].filter(Boolean).join(" ") || a.id,
        sport: a.profile?.sport || "",
      })),
    };
  });

export const getCoachTeamDevelopment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ teamId }).strict())
  .handler(async ({ context, data }) => {
    const { devScope, assertTeamDevelopmentCoach } = await import("./access.server");
    const { getSql } = await import("@/lib/db");
    const scope = await devScope(context.userId);
    assertTeamDevelopmentCoach(scope, data.teamId);
    const sql = await getSql();
    const templates = await sql.query<{id:string;name:string;sport:string;category:string;version:number}>(
      "select p.id,p.name,p.sport,p.category,v.version from team_dev_programs p join team_dev_program_versions v on v.program_id=p.id where v.status='ACTIVE' and p.disabled_at is null order by p.category,p.name",
    );
    const assignments = await sql.query<{id:string;program_type:string;scope:string;program_id:string;program_version:number;start_date:string;end_date:string|null;status:string;inherit_new_players:boolean}>(
      "select id,program_type,scope,program_id,program_version,start_date::text,end_date::text,status,inherit_new_players from team_dev_assignments where team_id=$1 order by created_at desc",
      [data.teamId],
    );
    const links = await sql.query<{athlete_id:string;roster_player_id:string}>(
      "select athlete_id,roster_player_id from team_dev_roster_links where team_id=$1 and ended_at is null",
      [data.teamId],
    );
    return { templates, assignments, links };
  });

export const getAthleteTeamDevelopment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ athleteId }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { devScope, assertTeamDevelopmentAthlete } = await import("./access.server");
    const { effectiveTeamDevelopmentForAthlete } = await import("./runtime.server");
    const sql = await getSql();
    const scope = await devScope(context.userId);
    assertTeamDevelopmentAthlete(scope, data.athleteId);
    const links = await sql.query<{ team_id: string }>(
      "select distinct team_id from team_dev_roster_links where athlete_id=$1 and ended_at is null",
      [data.athleteId],
    );
    const effective = [];
    for (const link of links) {
      const assignments = await effectiveTeamDevelopmentForAthlete(
        context.userId,
        link.team_id,
        data.athleteId,
      );
      effective.push(...assignments.map((assignment) => ({
        id: assignment.id,
        program_type: assignment.program_type,
        scope: assignment.scope,
        teamId: link.team_id,
      })));
    }
    const items = await sql.query<{id:string;assignment_id:string;state:string;due_date:string;is_late:boolean}>(
      "select id,assignment_id,state,due_date::text,is_late from team_dev_items where athlete_id=$1 order by due_date,id",
      [data.athleteId],
    );
    const notes = await sql.query<{id:string;assignment_id:string|null;body:string;created_at:string}>(
      "select id,assignment_id,body,created_at::text from team_dev_notes where athlete_id=$1 and hidden=false order by created_at desc",
      [data.athleteId],
    );
    const reassessments = await sql.query<{id:string;assignment_id:string|null;scheduled_on:string|null;performed_on:string|null;note:string}>(
      "select id,assignment_id,scheduled_on::text,performed_on::text,note from team_dev_reassessments where athlete_id=$1 order by coalesce(performed_on,scheduled_on) desc nulls last",
      [data.athleteId],
    );
    const [settings] = await sql.query<{self_complete_enabled:boolean}>(
      "select self_complete_enabled from team_dev_player_settings where athlete_id=$1",
      [data.athleteId],
    );
    return { assignments: effective, items, notes, reassessments, selfCompleteEnabled: settings?.self_complete_enabled === true };
  });

export const getFamilyTeamDevelopment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ teamId, rosterPlayerId }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { devScope, assertTeamDevelopmentAthlete } = await import("./access.server");
    const { effectiveTeamDevelopmentForAthlete } = await import("./runtime.server");
    const sql = await getSql();
    const [link] = await sql.query<{ athlete_id: string }>(
      "select athlete_id from team_dev_roster_links where team_id=$1 and roster_player_id=$2 and ended_at is null limit 1",
      [data.teamId, data.rosterPlayerId],
    );
    if (!link) return { linked: false as const, assignments: [], items: [], notes: [] };
    const scope = await devScope(context.userId);
    assertTeamDevelopmentAthlete(scope, link.athlete_id);
    const resolved = await effectiveTeamDevelopmentForAthlete(
      context.userId,
      data.teamId,
      link.athlete_id,
    );
    const assignments = resolved.map((assignment) => ({
      id: assignment.id,
      program_type: assignment.program_type,
      scope: assignment.scope,
    }));
    const items = await sql.query<{id:string;assignment_id:string;state:string;due_date:string;is_late:boolean}>(
      "select id,assignment_id,state,due_date::text,is_late from team_dev_items where athlete_id=$1 order by due_date,id",
      [link.athlete_id],
    );
    const notes = await sql.query<{id:string;assignment_id:string|null;body:string;created_at:string}>(
      "select id,assignment_id,body,created_at::text from team_dev_notes where athlete_id=$1 and hidden=false order by created_at desc",
      [link.athlete_id],
    );
    return { linked: true as const, athleteId: link.athlete_id, assignments, items, notes };
  });

export const assignTeamDevelopment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        teamId,
        programType: z.string().trim().min(1).max(80),
        scope: z.enum(["team", "position", "selected", "override"]),
        programId: z.string().trim().min(1).max(180),
        programVersion: z.number().int().positive(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        inheritNewPlayers: z.boolean().optional(),
        position: z.string().trim().max(40).optional(),
        athleteIds: z.array(athleteId).max(100).optional(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) =>
    (await import("./runtime.server")).createTeamDevelopmentAssignment(context.userId, data),
  );

export const endTeamDevelopment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assignmentId: z.string().uuid() }).strict())
  .handler(async ({ context, data }) =>
    (await import("./runtime.server")).endTeamDevelopmentAssignment(context.userId, data.assignmentId),
  );

export const linkTeamDevelopmentRoster = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ teamId, rosterPlayerId, athleteId }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { resolveIdentity } = await import("@/lib/identity.server");
    const { randomUUID } = await import("node:crypto");
    const sql = await getSql();
    const me = await resolveIdentity(sql, context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    return sql.transaction(async (tx) => {
      await tx.query("select set_config('app.actor_id',$1,true)", [context.userId]);
      const [clubRow] = await tx.query<{ payload: ClubRecord | string; demo: boolean }>(
        "select payload,demo from club_state where id='oklahoma-prospects' for update",
      );
      if (!clubRow || clubRow.demo) throw new Error("Club is not open.");
      const club =
        typeof clubRow.payload === "string"
          ? (JSON.parse(clubRow.payload) as ClubRecord)
          : clubRow.payload;
      const player = club.teams
        .find((t) => t.id === data.teamId)
        ?.roster.find((p) => p.id === data.rosterPlayerId);
      if (!player) throw new Error("Roster player not found on that team.");
      const athlete = await tx.query<{ id: string }>(
        "select id from club_athletes where id=$1",
        [data.athleteId],
      );
      if (!athlete.length) throw new Error("Athlete record not found.");
      await tx.query(
        "update team_dev_roster_links set ended_at=now(),ended_by=$1 where team_id=$2 and roster_player_id=$3 and ended_at is null",
        [context.userId, data.teamId, data.rosterPlayerId],
      );
      const id = randomUUID();
      await tx.query(
        "insert into team_dev_roster_links(id,team_id,roster_player_id,athlete_id,linked_by) values($1,$2,$3,$4,$5)",
        [id, data.teamId, data.rosterPlayerId, data.athleteId, context.userId],
      );
      await tx.query(
        "insert into team_dev_events(actor_id,athlete_id,team_id,entity_type,entity_id,action,after_json) values($1,$2,$3,'roster_link',$4,'linked',$5::jsonb)",
        [
          context.userId,
          data.athleteId,
          data.teamId,
          id,
          JSON.stringify({ rosterPlayerId: data.rosterPlayerId }),
        ],
      );
      return { ok: true as const, id };
    });
  });

export const setTeamDevelopmentSelfComplete = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ athleteId, enabled: z.boolean() }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { resolveIdentity } = await import("@/lib/identity.server");
    const sql = await getSql();
    const me = await resolveIdentity(sql, context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    await sql.query(
      "insert into team_dev_player_settings(athlete_id,self_complete_enabled) values($1,$2) on conflict(athlete_id) do update set self_complete_enabled=excluded.self_complete_enabled",
      [data.athleteId, data.enabled],
    );
    await sql.query(
      "insert into team_dev_events(actor_id,athlete_id,entity_type,entity_id,action,after_json) values($1,$2,'player_settings',$2,'self_complete_changed',$3::jsonb)",
      [context.userId, data.athleteId, JSON.stringify({ selfCompleteEnabled: data.enabled })],
    );
    return { ok: true as const };
  });

export const updateTeamDevelopmentItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      itemId: z.string().uuid(),
      state: z.enum(["started","completed","skipped_by_coach","modified"]),
      ceilingApproved: z.boolean().optional(),
      restSatisfied: z.boolean().optional(),
    }).strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { devScope } = await import("./access.server");
    const sql = await getSql();
    const scope = await devScope(context.userId);
    return sql.transaction(async (tx) => {
      const [item] = await tx.query<{
        id:string; athlete_id:string; state:string; due_date:string; phase_end_date:string;
        late_credit_window_end:string; paused_reason:string|null; assignment_scope:string;
        payload:{programType?:string}; team_id:string;
      }>(
        "select i.id,i.athlete_id,i.state,i.due_date::text,i.phase_end_date::text,i.late_credit_window_end::text,i.paused_reason,i.assignment_scope,i.payload,a.team_id from team_dev_items i join team_dev_assignments a on a.id=i.assignment_id where i.id=$1 for update",
        [data.itemId],
      );
      if (!item) throw new Error("Development item not found.");
      const coach = scope.admin || scope.coachTeamIds.has(item.team_id);
      const self = scope.selfAthleteId === item.athlete_id || scope.guardianAthleteIds.has(item.athlete_id);
      if (!coach && !self) throw new Error("Forbidden");
      if (item.paused_reason) throw new Error("This development item is on hold.");
      if (["completed","expired"].includes(item.state)) throw new Error("This item is already closed.");

      if (!coach) {
        if (data.state !== "completed") throw new Error("Only coaches can change this item state.");
        const [settings] = await tx.query<{self_complete_enabled:boolean}>(
          "select self_complete_enabled from team_dev_player_settings where athlete_id=$1",
          [item.athlete_id],
        );
        if (!settings?.self_complete_enabled) throw new Error("Self-completion is not enabled for this athlete.");
      }

      const today = chicagoDate();
      const late = today > item.due_date;
      if (late && data.state === "completed") {
        const throwing = ["throwing","arm_care"].includes(item.payload?.programType || "");
        const decision = lateCompletionDecision({
          today,
          phaseEndDate:item.phase_end_date,
          lateCreditWindowEnd:item.late_credit_window_end,
          throwing,
          ceilingApproved:data.ceilingApproved === true,
          restSatisfied:data.restSatisfied === true,
        });
        if (!decision.ok) throw new Error(
          decision.reason === "ceiling_block"
            ? "Late throwing completion requires explicit approved ceiling and rest checks."
            : "The late-credit window for this item is closed.",
        );
      }

      await tx.query(
        "update team_dev_items set state=$1,is_late=$2,late_attempt_on=case when $2 then $3::date else late_attempt_on end,revision=revision+1,updated_at=now() where id=$4",
        [data.state, late && data.state === "completed", today, item.id],
      );
      await tx.query(
        "insert into team_dev_events(actor_id,athlete_id,team_id,entity_type,entity_id,action,before_json,after_json,metadata) values($1,$2,$3,'item',$4,'state_changed',$5::jsonb,$6::jsonb,$7::jsonb)",
        [
          context.userId,item.athlete_id,item.team_id,item.id,
          JSON.stringify({state:item.state}),
          JSON.stringify({state:data.state,isLate:late && data.state==="completed"}),
          JSON.stringify({actorKind:coach?"coach":"athlete"}),
        ],
      );
      return { ok:true as const, state:data.state, isLate:late && data.state==="completed" };
    });
  });

export const importTeamDevelopmentSeedRecords = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ records: z.array(z.record(z.string(), z.unknown())).max(1000) }).strict(),
  )
  .handler(async ({ context, data }) =>
    (await import("./store.server")).importTeamDevelopmentSeed(
      context.userId,
      data.records as TeamDevSeedRecord[],
    ),
  );
