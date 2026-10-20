import { operationalPersonSettings } from "./operational-person.server";
import { publicPhotoLink } from "./public-coach-photo.server";
import { getSql, type Sql } from "./db";
import { readWorkingFile } from "./pd/desk-impl.server";
import { newCoachId } from "./coach-id.server";
import { coachesWithAvailability, bookableCoaches } from "./commerce/coach-services.server";
import { approvedProducts } from "./commerce/catalog";
import type { Product } from "./commerce/contracts";
import { teamSeasons } from "./teams/seasons";
import {
  emptySharedProfile,
  sharedProfileInput,
  normEmail,
  type PublicPerson,
  type SharedProfile,
} from "./person-contracts";
import type { ClubRecord } from "./teams/types";
export async function publicPeopleFor(sql: Sql) {
  const settings = await operationalPersonSettings(sql);
  const [users, shared, oldProfiles, directory, clubRows, file, products, leadership] =
    await Promise.all([
      sql<{
        id: string;
        email: string;
        name: string;
        disabledAt: Date | null;
      }>`select id,email,name,"disabledAt" from "user"`,
      sql<{
        user_id: string;
        revision: number;
        instructor: boolean;
        publish_coach: boolean;
        publish_instructor: boolean;
        profile: SharedProfile;
      }>`select user_id,revision,instructor,publish_coach,publish_instructor,profile from person_profiles`,
      sql<{
        user_id: string;
        profile: Record<string, unknown>;
      }>`select user_id,profile from coach_profiles where published=true`,
      sql<{
        email: string;
        directoryId: string;
        unlinked: boolean;
        name: string;
        bio: string;
        program: string;
        title: string;
      }>`select coalesce(u.email,d.identity_email,d.email) as email,d.id::text as "directoryId",(d.identity_email is not null and d.identity_user_id is null) as unlinked,d.name,d.bio,d.program,d.title from staff_directory d left join "user" u on u.id=d.identity_user_id where d.published=true`,
      sql<{
        payload: ClubRecord;
        demo: boolean;
      }>`select payload,demo from club_state where id='oklahoma-prospects'`,
      readWorkingFile(sql),
      sql<Product>`select id,kind,name,price,minutes,credits,remote,expires_days,hours,discipline,active from club_services where active=true`,
      sql<{
        user_id: string;
        titles: string[];
        display_order: number;
      }>`select user_id,titles,display_order from public_leadership where enabled=true`,
    ]);
  const club =
    clubRows[0] && !clubRows[0].demo
      ? typeof clubRows[0].payload === "string"
        ? (JSON.parse(clubRows[0].payload) as ClubRecord)
        : clubRows[0].payload
      : null;
  const eligible = await bookableCoaches(sql, file.coaches, { operational: false });
  const available = await coachesWithAvailability(
    sql,
    file.coaches,
    file.availability,
    approvedProducts(products),
  );
  const cards = new Map<string, PublicPerson>();
  function get(email: string, name: string, unlinkedKey?: string) {
    email = normEmail(email);
    if (!email) return undefined;
    const user = unlinkedKey ? undefined : users.find((u) => normEmail(u.email) === email);
    if (user?.disabledAt || settings.some((s) => s.user_id === user?.id && !s.directory_active))
      return undefined;
    const key = unlinkedKey || email;
    const id = newCoachId(key);
    let c = cards.get(key);
    if (!c) {
      const coach = unlinkedKey
        ? undefined
        : file.coaches.find((c) => normEmail(c.email) === email);
      c = {
        ...emptySharedProfile(name),
        id,
        coachId: coach?.id || id,
        coach: false,
        instructor: false,
        bookable: false,
        serviceIds: [],
        teams: [],
      };
      cards.set(key, c);
    }
    return c;
  }
  for (const d of directory) {
    const c = get(d.email, d.name, d.unlinked ? `directory:${d.directoryId}` : undefined);
    if (c) {
      c.instructor = eligible.some((e) => e.id === c.coachId);
      c.coach = true;
      c.title = d.title;
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
      c.coach = true;
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
      c.coach = true;
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
    const publicFields = Object.fromEntries(
      Object.keys(emptySharedProfile()).map((key) => [key, s.profile[key as keyof SharedProfile]]),
    );
    const parsed = sharedProfileInput.safeParse(publicFields);
    if (!parsed.success) {
      cards.delete(normEmail(u.email));
      continue;
    }
    Object.assign(c, parsed.data);
    c.coach = s.publish_coach;
    const reviewed = settings.some(
      (o) => o.user_id === s.user_id && o.classified_profile_revision === s.revision,
    );
    c.instructor =
      s.publish_instructor &&
      (s.instructor || (reviewed && eligible.some((e) => e.id === c.coachId)));
    if (!s.publish_coach) c.teams = [];
  }
  for (const leader of leadership) {
    const user = users.find((u) => u.id === leader.user_id);
    if (!user || !leader.titles.length) continue;
    const card = get(user.email, user.name);
    if (!card) continue;
    card.coach = true;
    card.title = [...new Set([...(card.title ? [card.title] : []), ...leader.titles])].join(" · ");
    card.sports = [
      ...new Set([
        ...card.sports,
        ...leader.titles.map((t) =>
          t === "Baseball Coordinator" ? ("baseball" as const) : ("softball" as const),
        ),
      ]),
    ];
    card.displayOrder = leader.display_order;
  }
  return [...cards.values()]
    .filter((c) => c.coach || c.instructor)
    .map((c) => {
      const a = available.find((a) => a.id === c.coachId);
      return {
        ...c,
        bookable: c.instructor && Boolean(a),
        serviceIds: c.instructor ? a?.serviceIds || [] : [],
      };
    })
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || a.name.localeCompare(b.name));
}
export async function publicPeople() {
  return (await publicPeopleFor(await getSql())).map((person) => ({
    ...person,
    photo: publicPhotoLink(person),
  }));
}
