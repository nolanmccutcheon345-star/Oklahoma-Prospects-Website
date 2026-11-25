import type { ClubRecord, Team } from "./types";

type StaffViewer = { role: string; email: string; canTeamCoach?: boolean };
const normalized = (email?: string) => email?.trim().toLowerCase() || "";

/** Shared server-only decision for roster identities, including player statistics. */
export function canReadStaffRoster(team: Team, me: StaffViewer | null): boolean {
  if (!me || team.closed) return false;
  const email = normalized(me.email);
  const assignedCoach = Boolean(
    email &&
    (me.role === "coach" || (me.role === "parent" && me.canTeamCoach)) &&
    (normalized(team.coachEmail) === email ||
      team.staff.some((staff) => normalized(staff.email) === email)),
  );
  return me.role === "admin" || assignedCoach;
}

/** Minimal private projection. Call only with a server-resolved identity. */
export function staffTeamRosterView(
  club: ClubRecord | null,
  teamId: string,
  me: StaffViewer | null,
) {
  if (!club || club._demo || !me) return null;
  const team = club.teams.find((row) => row.id === teamId && !row.closed);
  if (!team) return null;
  if (!canReadStaffRoster(team, me)) return null;
  return {
    teamId: team.id,
    teamName: team.name,
    // Withdrawal/consent govern public listing, not authorized staff's membership record.
    players: team.roster
      .filter((player) => player.teamId === team.id)
      .map((player) => ({
        id: player.id,
        name: player.name,
        number: player.number,
        withdrawn: player.withdrawn,
      })),
  };
}
