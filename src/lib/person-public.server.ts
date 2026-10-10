import { getSql, type Sql } from "./db";
import { readWorkingFile } from "./pd/desk-impl.server";
import { newCoachId } from "./coach-id.server";
import { coachesWithAvailability, bookableCoaches } from "./commerce/coach-services.server";
import { approvedProducts } from "./commerce/catalog";
import type { Product } from "./commerce/contracts";
import { teamSeasons } from "./teams/seasons";
import {
  emptySharedProfile,
  normEmail,
  type PublicPerson,
  type SharedProfile,
} from "./person-contracts";
import type { ClubRecord } from "./teams/types";
export async function publicPeopleFor(sql: Sql) {
  const [users, shared, oldProfiles, directory, clubRows, file, products] = await Promise.all([
    sql<{
      id: string;
      email: string;
      name: string;
      disabledAt: Date | null;
    }>`select id,email,name,"disabledAt" from "user"`,
    sql<{
      user_id: string;
      instructor: boolean;
      publish_coach: boolean;
      publish_instructor: boolean;
      profile: SharedProfile;
    }>`select user_id,instructor,publish_coach,publish_instructor,profile from person_profiles`,
    sql<{
      user_id: string;
      profile: Record<string, unknown>;
    }>`select user_id,profile from coach_profiles where published=true`,
    sql<{
      email: string;
      name: string;
      bio: string;
      program: string;
    }>`select email,name,bio,program from staff_directory where published=true`,
    sql<{
      payload: ClubRecord;
      demo: boolean;
    }>`select payload,demo from club_state where id='oklahoma-prospects'`,
    readWorkingFile(sql),
    sql<Product>`select id,kind,name,price,minutes,credits,remote,expires_days,hours,discipline,active from club_services where active=true`,
  ]);
  const club =
    clubRows[0] && !clubRows[0].demo
      ? typeof clubRows[0].payload === "string"
        ? (JSON.parse(clubRows[0].payload) as ClubRecord)
        : clubRows[0].payload
      : null;
  const eligible = await bookableCoaches(sql, file.coaches);
  const available = await coachesWithAvailability(
    sql,
    file.coaches,
    file.availability,
    approvedProducts(products),
  );
  const cards = new Map<string, PublicPerson>();
  function get(email: string, name: string) {
    email = normEmail(email);
    if (!email) return undefined;
    const user = users.find((u) => normEmail(u.email) === email);
    if (user?.disabledAt) return undefined;
    const id = newCoachId(email);
    let c = cards.get(email);
    if (!c) {
      const coach = file.coaches.find((c) => normEmail(c.email) === email);
      c = {
        ...emptySharedProfile(name),
        id,
        coachId: coach?.id || id,
        instructor: false,
        bookable: false,
        serviceIds: [],
        teams: [],
      };
      cards.set(email, c);
    }
    return c;
  }
  for (const d of directory) {
    const c = get(d.email, d.name);
    if (c) {
      c.instructor = eligible.some((e) => e.id === c.coachId);
      c.bio = d.bio;
      c.sports =
        d.program === "Baseball" ? ["baseball"] : d.program === "Softball" ? ["softball"] : [];
    }
  }
  for (const p of oldProfiles) {
    const u = users.find((u) => u.id === p.user_id);
    if (!u) continue;
    const c = get(u.email, String(p.profile.name || u.name));
    if (c) {
      Object.assign(c, {
        name: String(p.profile.name || u.name),
        bio: String(p.profile.career || ""),
        ages: String(p.profile.ages || ""),
        approach: String(p.profile.approach || ""),
        achievements: String(p.profile.achievements || ""),
        welcome: String(p.profile.welcome || ""),
        specialties: Array.isArray(p.profile.specialties) ? p.profile.specialties : [],
      });
      c.instructor = eligible.some((e) => e.id === c.coachId);
    }
  }
  for (const t of club?.teams || []) {
    if (t.closed) continue;
    const members = [
      ...(t.coachEmail
        ? [
            {
              email: t.coachEmail,
              name: t.headCoach,
              role: "Head Coach",
              bio: t.headCoachBio,
              photo: t.headCoachPhoto,
            },
          ]
        : []),
      ...t.staff,
    ];
    for (const m of members) {
      const c = get(m.email, m.name);
      if (!c) continue;
      if (!c.teams.some((x) => x.id === t.id))
        c.teams.push({
          id: t.id,
          name: t.name,
          role: m.role,
          sport: t.sport,
          seasons: teamSeasons(t),
        });
      if (!c.bio) c.bio = m.bio || "";
      if (!c.photo) c.photo = m.photo || "";
      c.sports = [...new Set([...c.sports, t.sport])];
    }
  }
  for (const s of shared) {
    const u = users.find((u) => u.id === s.user_id);
    if (!u) continue;
    const c = get(u.email, s.profile.name);
    if (!c) continue;
    Object.assign(c, s.profile);
    c.instructor = s.instructor && s.publish_instructor;
    if (!s.publish_coach) c.teams = [];
  }
  return [...cards.values()]
    .filter((c) => c.teams.length || c.instructor)
    .map((c) => {
      const a = available.find((a) => a.id === c.coachId);
      return {
        ...c,
        bookable: c.instructor && Boolean(a),
        serviceIds: c.instructor ? a?.serviceIds || [] : [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function publicPeople() {
  return publicPeopleFor(await getSql());
}
