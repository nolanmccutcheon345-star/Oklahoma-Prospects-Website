import type { Sql } from "./db";
import type { ClubRecord, Team } from "./teams/types";

export type PublicTryoutCoach = { id: string; name: string };
export type PublicTryoutTeam = {
  id: string;
  name: string;
  sport: "Baseball" | "Softball";
  age: string;
  coaches: PublicTryoutCoach[];
};
type PublishedStaff = {
  id: string;
  name: string;
  email: string;
  program: string;
};
const normal = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Team and coach *preferences*, not roster spots. Only explicitly published
 * staff who are currently assigned to a non-closed, real team may appear.
 * Never return roster members, child data, staff contacts or staff pay.
 */
export function listedTryoutTeams(teams: readonly Team[], staff: readonly PublishedStaff[]): PublicTryoutTeam[] {
  return teams.flatMap((team) => {
    if (team.closed || !team.id || !team.name || !team.age) return [];
    if (team.sport !== "baseball" && team.sport !== "softball") return [];
    const sport = team.sport === "baseball" ? "Baseball" as const : "Softball" as const;
    const assigned = new Set([normal(team.coachEmail || ""), ...(team.staff || []).map(person => normal(person.email || ""))].filter(Boolean));
    const seen = new Set<string>();
    const coaches = staff
      .filter(person =>
        person.id && person.name && person.email &&
        assigned.has(normal(person.email)) &&
        (person.program === sport || person.program === "Organization")
      )
      .filter(person => !seen.has(person.id) && Boolean(seen.add(person.id)))
      .map(({ id, name }) => ({ id, name }));
    // A private/incomplete staff assignment is not a public team advertisement.
    return coaches.length ? [{ id: team.id, name: team.name, sport, age: team.age, coaches }] : [];
  });
}

export async function publicTryoutTeamsFor(sql: Sql): Promise<PublicTryoutTeam[]> {
  const [row] = await sql<{ payload: ClubRecord | string; demo: boolean }>`
    select payload,demo from club_state where id='oklahoma-prospects'`;
  if (!row || row.demo) return [];
  const raw = typeof row.payload === "string" ? JSON.parse(row.payload) as ClubRecord : row.payload;
  if (!Array.isArray(raw.teams)) return [];
  const staff = await sql<PublishedStaff>`
    select id,name,email,program from staff_directory where published=true order by name,id`;
  return listedTryoutTeams(raw.teams, staff);
}

export function assertTryoutPreference(
  teams: readonly PublicTryoutTeam[],
  input: {
    sport: string;
    age: string;
    preferredTeamId?: string;
    preferredCoachId?: string;
    autoEnroll?: boolean;
  },
) {
  const teamId = input.preferredTeamId?.trim() || "";
  const coachId = input.preferredCoachId?.trim() || "";
  if (!teamId && coachId) throw new Error("Choose a preferred team before choosing a coach.");
  if (!teamId) return;
  const team = teams.find(t => t.id === teamId && t.sport === input.sport && normal(t.age) === normal(input.age));
  if (!team) throw new Error("That preferred team is no longer available for this sport and age. Choose No preference or reload.");
  if (coachId && !team.coaches.some(coach => coach.id === coachId))
    throw new Error("That coach is not published and assigned to the selected team. Reload and choose again.");
  if (input.autoEnroll)
    throw new Error("Automatic group enrollment cannot be combined with a specific team or coach preference.");
}
