import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { resolveIdentity } from "@/lib/identity.server";
import { devScope, assertTeamDevelopmentCoach, assertTeamDevelopmentAthlete } from "./access.server";
import {
  createTeamDevelopmentAssignment,
  effectiveTeamDevelopmentForAthlete,
  endTeamDevelopmentAssignment,
} from "./runtime.server";
import { importTeamDevelopmentSeed } from "./store.server";
import type { TeamDevSeedRecord } from "./contracts";
import type { ClubRecord } from "@/lib/teams/types";
import { randomUUID } from "node:crypto";

const teamId = z.string().trim().min(1).max(150);
const athleteId = z.string().trim().min(1).max(150);
const rosterPlayerId = z.string().trim().min(1).max(150);

export const getAdminTeamDevelopment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await resolveIdentity(sql, context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    const [programs, versions, exercises, drills, config, links, athletes] = await Promise.all([
      sql.query("select id,name,sport,category,current_version,disabled_at from team_dev_programs order by category,name"),
      sql.query("select program_id,version,status,data_label,blocked_fields,approved_by,approved_at from team_dev_program_versions order by program_id,version desc"),
      sql.query("select id,version,name,category,status,data_label from team_dev_exercises order by category,name"),
      sql.query("select id,version,name,sport,category,status,data_label from team_dev_drills order by sport,category,name"),
      sql.query("select id,version,kind,label,active,data_label from team_dev_config_items order by kind,label"),
      sql.query("select id,team_id,roster_player_id,athlete_id,linked_at,ended_at from team_dev_roster_links order by linked_at desc"),
      sql.query<{ id: string; profile: { firstName?: string; lastName?: string; sport?: string } }>(
        "select id,profile from club_athletes order by id",
      ),
    ]);
    return {
      programs,
      versions,
      exercises,
      drills,
      config,
      links,
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
    const scope = await devScope(context.userId);
    assertTeamDevelopmentCoach(scope, data.teamId);
    const sql = await getSql();
    const templates = await sql.query(
      "select p.id,p.name,p.sport,p.category,v.version,v.payload from team_dev_programs p join team_dev_program_versions v on v.program_id=p.id where v.status='ACTIVE' and p.disabled_at is null order by p.category,p.name",
    );
    const assignments = await sql.query(
      "select id,program_type,scope,program_id,program_version,start_date::text,end_date::text,status,inherit_new_players from team_dev_assignments where team_id=$1 order by created_at desc",
      [data.teamId],
    );
    const links = await sql.query(
      "select athlete_id,roster_player_id from team_dev_roster_links where team_id=$1 and ended_at is null",
      [data.teamId],
    );
    return { templates, assignments, links };
  });

export const getFamilyTeamDevelopment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ teamId, rosterPlayerId }).strict())
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const [link] = await sql.query<{ athlete_id: string }>(
      "select athlete_id from team_dev_roster_links where team_id=$1 and roster_player_id=$2 and ended_at is null limit 1",
      [data.teamId, data.rosterPlayerId],
    );
    if (!link) return { linked: false as const, assignments: [], items: [], notes: [] };
    const scope = await devScope(context.userId);
    assertTeamDevelopmentAthlete(scope, link.athlete_id);
    const assignments = await effectiveTeamDevelopmentForAthlete(
      context.userId,
      data.teamId,
      link.athlete_id,
    );
    const items = await sql.query(
      "select id,assignment_id,state,due_date::text,is_late,payload from team_dev_items where athlete_id=$1 order by due_date,id",
      [link.athlete_id],
    );
    const notes = await sql.query(
      "select id,assignment_id,body,created_at from team_dev_notes where athlete_id=$1 and hidden=false order by created_at desc",
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
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        inheritNewPlayers: z.boolean().optional(),
        position: z.string().trim().max(40).optional(),
        athleteIds: z.array(athleteId).max(100).optional(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) =>
    createTeamDevelopmentAssignment(context.userId, data),
  );

export const endTeamDevelopment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assignmentId: z.string().uuid() }).strict())
  .handler(async ({ context, data }) =>
    endTeamDevelopmentAssignment(context.userId, data.assignmentId),
  );

export const linkTeamDevelopmentRoster = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ teamId, rosterPlayerId, athleteId }).strict())
  .handler(async ({ context, data }) => {
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

export const importTeamDevelopmentSeedRecords = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ records: z.array(z.record(z.string(), z.unknown())).max(1000) }).strict(),
  )
  .handler(async ({ context, data }) =>
    importTeamDevelopmentSeed(context.userId, data.records as TeamDevSeedRecord[]),
  );
