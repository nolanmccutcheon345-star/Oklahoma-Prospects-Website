import { coachNotDeactivated } from "../teams/coach-status.server";
import type { Sql } from "../db";
import {
  grants,
  permits,
  financiallyRestricted,
  verifiedAccount,
} from "../coordinator/access.server";
import type { EnrollmentTeam } from "./contracts";

// Deliberately projects operational identity only. Never returns raw club JSON or financial fields.
export async function enrollmentScope(tx: Sql, actor: string) {
  const user = await verifiedAccount(tx, actor, true);
  const restricted = await financiallyRestricted(tx, actor);
  const [profile] = await tx<{
    role: string;
  }>`select role from profiles where user_id=${actor} for share`;
  const [ownerGrant] =
    await tx`select user_id from owner_grants where user_id=${actor} and email=${user.email} and revoked_at is null for share`;
  const owner = !restricted && profile?.role === "admin" && Boolean(ownerGrant);
  const assignments = await grants(tx, actor, true);
  const homes =
    restricted || profile?.role === "player"
      ? []
      : await tx<{
          id: string;
        }>`select household_id as id from household_members where user_id=${actor} union select household_id as id from person_guardian_links where user_id=${actor}`;
  const self = restricted
    ? []
    : await tx<{
        id: string;
      }>`select player_id as id from person_player_links where user_id=${actor}`;
  const rows = await tx<{
    id: string;
    name: string;
    sport: "baseball" | "softball";
    season: string;
    coach: boolean;
    roster: { id: string; familyId: string }[];
  }>`
    select t->>'id' as id,t->>'name' as name,t->>'sport' as sport,coalesce(t->>'seasonLabel','') as season,
      (lower(trim(t->>'coachEmail'))=${user.email} or exists(select 1 from jsonb_array_elements(coalesce(t->'staff','[]')) s where lower(trim(s->>'email'))=${user.email} and s->>'role' ~* 'coach')) as coach,
      coalesce((select jsonb_agg(jsonb_build_object('id',p->>'id','familyId',p->>'familyId')) from jsonb_array_elements(coalesce(t->'roster','[]')) p where coalesce(p->>'withdrawn','false')<>'true'),'[]') as roster
    from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t
    where c.id='oklahoma-prospects' and not c.demo and coalesce(t->>'closed','false')<>'true' and t->>'sport' in ('baseball','softball') for share of c`;
  const coachEligible =
    !restricted && profile?.role !== "player" && (await coachNotDeactivated(tx, actor, user.email));
  const teams: EnrollmentTeam[] = rows
    .map((t) => {
      const coach = coachEligible && t.coach === true;
      const guardianPlayerIds = t.roster
        .filter((p) => homes.some((h) => h.id === p.familyId))
        .map((p) => p.id);
      const playerIds = t.roster.filter((p) => self.some((s) => s.id === p.id)).map((p) => p.id);
      return {
        id: t.id,
        name: t.name,
        sport: t.sport,
        season: t.season,
        coach,
        guardianPlayerIds,
        playerIds,
        canRead: owner || coach || permits(assignments, "enrollment.read", t.sport, t.id),
        canManage: owner || coach || permits(assignments, "enrollment.manage", t.sport, t.id),
        canDraft: owner || coach || permits(assignments, "standards.draft", t.sport, t.id),
      };
    })
    .filter(
      (t) =>
        t.canRead || t.canManage || t.canDraft || t.guardianPlayerIds.length || t.playerIds.length,
    );
  return { owner, restricted, teams, actor, user };
}
export function teamAccess(scope: Awaited<ReturnType<typeof enrollmentScope>>, teamId: string) {
  const team = scope.teams.find((t) => t.id === teamId);
  if (!team) throw new Error("This team is not available to your account.");
  return team;
}
