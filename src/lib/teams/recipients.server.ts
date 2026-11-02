import type { Sql } from "../db";
import type { Player, Team } from "./types";

/**
 * t136u: the one definition of "an active member of this team" used by fee-ready
 * notices and team announcements.
 *
 * A player is active only when they are on the live roster of an open team, are
 * not withdrawn, and their Front Office assignment (migration 0119) is `active`.
 * A roster entry without an assignment row is a placement recorded before 0119
 * or by another existing roster tool and is treated as active, so existing fee
 * notices are not silently dropped. An `invited`, `accepted` or `removed`
 * assignment always excludes the player.
 */
export type AssignmentStatus = "invited" | "accepted" | "active" | "removed";

export async function assignmentStatusByPlayer(tx: Sql, teamId: string) {
  const rows = await tx<{
    roster_player_id: string;
    status: AssignmentStatus;
  }>`select roster_player_id,status from roster_assignments where team_id=${teamId} and roster_player_id is not null`;
  return new Map(rows.map((r) => [r.roster_player_id, r.status]));
}

export function isActiveRosterMember(
  team: Pick<Team, "closed" | "roster">,
  playerId: string,
  statuses: Map<string, AssignmentStatus>,
) {
  if (team.closed) return false;
  const player = team.roster.find((p) => p.id === playerId);
  if (!player || player.withdrawn) return false;
  const status = statuses.get(playerId);
  return status === undefined || status === "active";
}

export async function activeRosterMembers(
  tx: Sql,
  team: Pick<Team, "id" | "closed" | "roster">,
): Promise<Player[]> {
  const statuses = await assignmentStatusByPlayer(tx, team.id);
  return team.roster.filter((p) => isActiveRosterMember(team, p.id, statuses));
}

const norm = (e: string | undefined) => (e || "").trim().toLowerCase();

/**
 * Verified guardian accounts of active members only. Never player accounts, and
 * never a coach/staff household unless that household is an active member's.
 */
export async function activeRosterGuardianUserIds(
  tx: Sql,
  team: Pick<Team, "id" | "closed" | "roster">,
) {
  const members = await activeRosterMembers(tx, team);
  const families = [...new Set(members.map((p) => p.familyId).filter(Boolean))];
  const parentEmails = [
    ...new Set(members.flatMap((p) => p.parents.map((g) => norm(g.email))).filter(Boolean)),
  ];
  if (!families.length && !parentEmails.length) return [];
  const rows = await tx<{
    id: string;
  }>`select distinct u.id from "user" u left join profiles p on p.user_id=u.id
     where u."emailVerified" and u."disabledAt" is null and coalesce(p.role,'parent')<>'player'
       and not exists(select 1 from organization_operational_access o where o.user_id=u.id and o.financial_restricted)
       and (lower(trim(u.email))=any(${parentEmails}::text[])
         or exists(select 1 from club_households h where (h.id=any(${families}::text[]) or lower(trim(h.primary_email))=any(${parentEmails}::text[]))
           and (exists(select 1 from person_guardian_links g where g.user_id=u.id and g.household_id=h.id)
             or exists(select 1 from household_members m where m.user_id=u.id and m.household_id=h.id))))
     order by u.id`;
  return rows.map((r) => r.id);
}

/**
 * In-app team announcement audience: the team's own coach/staff accounts (by
 * their own verified email only, no household reach-in), active owners, guardians
 * of active members, and the active members' own linked player accounts.
 * Announcements are delivered in authenticated team conversations, not email.
 */
export async function teamAnnouncementRecipientIds(
  tx: Sql,
  team: Pick<Team, "id" | "closed" | "roster" | "coachEmail" | "staff">,
) {
  const members = await activeRosterMembers(tx, team);
  const staffEmails = [team.coachEmail, ...team.staff.map((s) => s.email)]
    .map(norm)
    .filter(Boolean);
  const playerIds = members.map((p) => p.id);
  const playerEmails = members.map((p) => norm(p.email)).filter(Boolean);
  const guardians = await activeRosterGuardianUserIds(tx, team);
  const rows = await tx<{
    id: string;
  }>`select distinct u.id from "user" u left join profiles p on p.user_id=u.id
     where u."emailVerified" and u."disabledAt" is null
       and not exists(select 1 from organization_operational_access o where o.user_id=u.id and o.financial_restricted)
       and (lower(trim(u.email))=any(${staffEmails}::text[])
         or u.id=any(${guardians}::text[])
         or exists(select 1 from person_player_links l where l.user_id=u.id and l.player_id=any(${playerIds}::text[]))
         or (p.role='player' and lower(trim(u.email))=any(${playerEmails}::text[]))
         or exists(select 1 from owner_grants o where o.user_id=u.id and o.email=lower(trim(u.email)) and o.revoked_at is null))
     order by u.id`;
  return rows.map((r) => r.id);
}
