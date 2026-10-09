import { getSql } from "../db";
import type { ClubRecord } from "./types";
import type { publicTeamsView } from "./public-view";

export async function loadPublicClub(): Promise<ClubRecord | null> {
  const sql = await getSql();
  const [row] = await sql<{payload: ClubRecord; rev: number; demo: boolean}>`select payload,rev,demo from club_state where id='oklahoma-prospects'`;
  if (!row || row.demo) return null;
  const raw: ClubRecord = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return {...raw, _rev: row.rev, _demo: row.demo};
}

export async function enrichPublicCoaches(teams: ReturnType<typeof publicTeamsView>) {
  if (!teams.length) return teams;
  const { publicCoaches } = await import("../coaching.server");
  const profiles = await publicCoaches();
  return teams.map(team => ({...team, coaches: team.coaches.map(coach => {
    const profile = profiles.find(p => p.teams.some(t => t.id === team.id) && p.profile.name.trim().toLowerCase() === coach.name.trim().toLowerCase())?.profile;
    return {...coach, bio: coach.bio || (profile ? [profile.career, profile.approach, profile.ages, profile.achievements, profile.welcome].filter(Boolean).join("\n\n") : "")};
  })}));
}
