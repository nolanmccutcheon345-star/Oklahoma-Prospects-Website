import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Sql } from "../db";
import { enrollmentScope, teamAccess } from "../enrollment/access.server";
import { audit, grants, permits, secured } from "../coordinator/access.server";
import { lockFinancialExecution, publishedTeamPriceInTransaction } from "../finance/context.server";

export const teamInvitationInput = z
  .object({
    teamId: z.string().min(1).max(150),
    playerId: z.string().min(1).max(150),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
  })
  .strict();

async function invitationTeam(tx: Sql, actor: string, teamId: string) {
  const scope = await enrollmentScope(tx, actor);
  const team = teamAccess(scope, teamId);
  const [profile] = await tx<{ role: string }>`select role from profiles where user_id=${actor}`;
  if (
    profile?.role === "player" ||
    !team.canManage ||
    (!scope.owner &&
      !team.coach &&
      !permits(await grants(tx, actor, true), "contacts.read", team.sport, teamId))
  )
    throw Error("Assigned coach or authorized enrollment coordinator access required.");
  return team;
}

/** SQL projection intentionally excludes balances, agreements, medical data and budgets. */
async function roster(tx: Sql, teamId: string) {
  return tx<{
    id: string;
    name: string;
    familyId: string;
    guardians: { name: string; email: string }[];
  }>`select p->>'id' as id,p->>'name' as name,p->>'familyId' as "familyId",
    coalesce((select jsonb_agg(jsonb_build_object('name',g->>'name','email',lower(trim(g->>'email'))))
      from jsonb_array_elements(coalesce(p->'parents','[]')) g where trim(coalesce(g->>'email',''))<>''),'[]') as guardians
    from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t
    cross join lateral jsonb_array_elements(coalesce(t->'roster','[]')) p
    where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${teamId}
      and coalesce(t->>'closed','false')<>'true' and coalesce(p->>'withdrawn','false')<>'true'`;
}

/** Rechecked at creation, delivery and acceptance. Never accept arbitrary household/email pairs. */
export async function authorizedTeamInvitation(
  tx: Sql,
  actor: string,
  invite: {
    role: string;
    team_id?: string | null;
    family_id: string | null;
    email?: string;
  },
) {
  if (invite.role !== "parent" || !invite.team_id || !invite.family_id || !invite.email)
    return false;
  try {
    await invitationTeam(tx, actor, invite.team_id);
  } catch {
    return false;
  }
  const rows = await roster(tx, invite.team_id);
  return rows.some(
    (p) =>
      p.familyId === invite.family_id &&
      p.guardians.some((g) => g.email === invite.email!.trim().toLowerCase()),
  );
}

export async function teamInvitationWorkspace(sql: Sql, actor: string, teamId: string) {
  return secured(
    sql,
    actor,
    "team.invitation.list",
    async (tx) => {
      const team = await invitationTeam(tx, actor, teamId);
      const players = await roster(tx, teamId);
      const invitations = await tx<{
        id: string;
        email: string;
        familyId: string;
        status: string;
        expiresAt: Date;
        emailStatus: string;
        delivery: string;
      }>`select i.id,i.email,i.family_id as "familyId",i.status,i.expires_at as "expiresAt",
      coalesce(d.status,'not requested') as "emailStatus",coalesce(d.delivery_event,'not confirmed') as delivery
      from club_invites i left join invitation_delivery d on d.invitation_id=i.id
      where i.team_id=${teamId} and i.role='parent' order by i.created_at desc limit 500`;
      const homes = await tx<{
        id: string;
        email: string;
      }>`select h.id,lower(trim(u.email)) as email
      from club_households h join household_members m on m.household_id=h.id join "user" u on u.id=m.user_id join profiles p on p.user_id=u.id
      where h.id=any(${players.map((p) => p.familyId)}::text[]) and u."emailVerified" and u."disabledAt" is null and p.role<>'player'
      and not exists(select 1 from organization_operational_access a where a.user_id=u.id and a.financial_restricted)`;
      const published = await publishedTeamPriceInTransaction(tx, teamId);
      return {
        name: team.name,
        published: Boolean(published),
        players: players.map((p) => ({
          id: p.id,
          name: p.name,
          guardians: p.guardians.map((g) => ({
            ...g,
            linked: homes.some((h) => h.id === p.familyId && h.email === g.email),
            invitation:
              invitations.find((i) => i.familyId === p.familyId && i.email === g.email) || null,
          })),
        })),
      };
    },
    lockFinancialExecution,
  );
}

export async function issueTeamInvitation(
  sql: Sql,
  actor: string,
  raw: z.input<typeof teamInvitationInput>,
) {
  const input = teamInvitationInput.parse(raw);
  return secured(sql, actor, "team.invitation.create", async (tx) => {
    const team = await invitationTeam(tx, actor, input.teamId);
    const player = (await roster(tx, team.id)).find((p) => p.id === input.playerId);
    if (!player || !player.guardians.some((g) => g.email === input.email))
      throw Error("Select a listed guardian of an active athlete on this team.");
    const [home] = await tx`select id from club_households where id=${player.familyId} for share`;
    if (!home)
      throw Error("Front Office must link this athlete to a household before sending access.");
    await tx.query("select pg_advisory_xact_lock(hashtext($1))", [
      `team-invite:${team.id}:${player.familyId}:${input.email}`,
    ]);
    const [existing] = await tx<{
      id: string;
      invited_by: string;
    }>`select id,invited_by from club_invites
      where team_id=${team.id} and family_id=${player.familyId} and lower(email)=${input.email}
      and role='parent' and status='pending' and expires_at>now() order by created_at desc limit 1 for update`;
    if (
      existing &&
      (await authorizedTeamInvitation(tx, existing.invited_by, {
        role: "parent",
        team_id: team.id,
        family_id: player.familyId,
        email: input.email,
      }))
    )
      return { id: existing.id, reused: true };
    await tx`update club_invites set status='revoked' where team_id=${team.id} and family_id=${player.familyId}
      and lower(email)=${input.email} and role='parent' and status='pending'`;
    const id = randomUUID();
    const hash = createHash("sha256").update(randomUUID()).digest("hex");
    await tx`insert into club_invites(id,token_hash,email,team_id,family_id,invited_by,role,expires_at)
      values(${id},${hash},${input.email},${team.id},${player.familyId},${actor},'parent',now()+interval '7 days')`;
    await audit(
      tx,
      actor,
      "team.invitation.create",
      id,
      "allowed",
      { playerId: player.id },
      team.sport,
      team.id,
    );
    return { id, reused: false };
  });
}
