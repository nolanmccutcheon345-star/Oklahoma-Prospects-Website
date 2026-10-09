import { teamSeasons } from "./seasons";
import type { ClubRecord, Team } from "./types";

const norm = (value: string | undefined) => value?.trim().toLowerCase() || "";
type Viewer = {role: string; email: string; familyId?: string; familyIds?: string[]; householdEmails?: string[]};

/** Membership authorizes statistics only; never full financial/medical player records. */
export function canReadTeamStats(team: Team, me: Viewer): boolean {
  if (team.closed) return false;
  if (me.role === "admin") return true;
  const email = norm(me.email);
  if (!email) return false;
  if (norm(team.coachEmail) === email || team.staff.some(s => norm(s.email) === email)) return true;
  const families = new Set([me.familyId, ...(me.familyIds || [])].filter(Boolean));
  const emails = new Set([email, ...(me.householdEmails || []).map(norm)]);
  return team.roster.some(p => !p.withdrawn && (
    norm(p.email) === email || families.has(p.familyId) || p.parents.some(parent => emails.has(norm(parent.email)))
  ));
}

export function teamCoaches(team: Team) {
  const rows = [
    ...(team.headCoach?.trim() ? [{name: team.headCoach, role: "Head coach", bio: team.headCoachBio || "", photo: team.headCoachPhoto || "", email: team.coachEmail}] : []),
    ...team.staff.map(s => ({name: s.name, role: s.role, bio: s.bio || "", photo: s.photo || "", email: s.email})),
  ];
  const seen = new Set<string>();
  return rows.filter(c => {
    const key = norm(c.email) || norm(c.name);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).map(({email: _, ...c}) => c);
}

export function aggregateTeamStats(team: Team) {
  // Sum counting stats only. Rates require denominators, never averages of averages.
  const keys = ["ab", "h", "r", "hr", "rbi", "sb", "bb", "so"] as const;
  const totals: Record<string, number> = {};
  const players = team.roster.filter(p => !p.withdrawn);
  for (const key of keys) {
    const values = players.flatMap(p => Number.isFinite(p.stats?.[key]) ? [p.stats[key]] : []);
    if (values.length) totals[key] = values.reduce((a,b) => a+b, 0);
  }
  if (totals.ab > 0 && totals.h !== undefined) totals.avg = totals.h / totals.ab;
  return totals;
}

export function publicTeamView(team: Team) {
  return {
    id: team.id, name: team.name, sport: team.sport, age: team.age, season: team.seasonLabel,
    seasons: teamSeasons(team),
    record: {w: team.record.w, l: team.record.l, t: team.record.t},
    stats: aggregateTeamStats(team), coaches: teamCoaches(team),
    players: team.roster.filter(p => !p.withdrawn).map(p => ({id: p.id, name: p.name, number: p.number})),
  };
}

export function publicTeamsView(club: ClubRecord) {
  return club._demo ? [] : club.teams.filter(t => !t.closed).map(publicTeamView);
}

export function playerStatsView(team: Team, playerId: string, me: Viewer) {
  if (!canReadTeamStats(team, me)) throw new Error("Individual player stats are available only to this team's players, parents and coaches.");
  const p = team.roster.find(p => p.id === playerId && p.teamId === team.id && !p.withdrawn);
  if (!p) throw new Error("Player not found on this team.");
  return {id: p.id, name: p.name, number: p.number, teamId: team.id, teamName: team.name,
    stats: Object.fromEntries(Object.entries(p.stats || {}).filter(([,v]) => Number.isFinite(v)))};
}
