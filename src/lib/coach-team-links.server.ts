/** Never return the private coach email, staff account, roster, or team finances to visitors. */
export type PublicTeamCoachLink = {
  id: string;
  name: string;
  sport: "baseball" | "softball";
  age: string;
};

type Staff = { id: string; email: string; active?: boolean };

/**
 * Team assignment is owner-managed in the club desk. Until the canonical-ID
 * migration, an exact normalized approved coach sign-in email is the join key.
 * Only signed-off public coach profiles invoke this mapper.
 */
export function publicTeamLinksFor(
  coachId: string,
  staff: readonly Staff[],
  rawClub: unknown,
  demo: boolean,
): PublicTeamCoachLink[] {
  if (demo || !rawClub || typeof rawClub !== "object") return [];
  const coach = staff.find((row) => row.id === coachId && row.active !== false);
  const email = coach?.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) return [];
  const club = rawClub as { teams?: unknown };
  if (!Array.isArray(club.teams)) return [];
  const found: PublicTeamCoachLink[] = [];
  const seen = new Set<string>();
  for (const raw of club.teams) {
    if (!raw || typeof raw !== "object") continue;
    const team = raw as Record<string, unknown>;
    if (team.closed === true) continue;
    const isHeadCoach = typeof team.coachEmail === "string" && team.coachEmail.trim().toLowerCase() === email && typeof team.headCoach === "string" && Boolean(team.headCoach.trim());
    const isAssignedStaff = Array.isArray(team.staff) && team.staff.some((person: unknown) => person !== null && typeof person === "object" && "email" in person && typeof person.email === "string" && person.email.trim().toLowerCase() === email);
    if (!isHeadCoach && !isAssignedStaff) continue;
    const { id, name, sport, age } = team;
    if (
      typeof id !== "string" || !id || id.length > 150 ||
      typeof name !== "string" || name.trim().length < 2 || name.length > 160 ||
      (sport !== "baseball" && sport !== "softball") ||
      typeof age !== "string" || age.length > 30 ||
      seen.has(id)
    ) continue;
    seen.add(id);
    found.push({ id, name: name.trim(), sport, age: age.trim() });
  }
  return found.sort((a, b) => a.sport.localeCompare(b.sport) || a.age.localeCompare(b.age) || a.name.localeCompare(b.name));
}
