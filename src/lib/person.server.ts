import { getSql, type Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import { readWorkingFile, writeWorkingFile } from "./pd/desk-impl.server";
import { newCoachId } from "./coach-id.server";
import { replaceCoachServices } from "./commerce/coach-services.server";
import { teamSeasons } from "./teams/seasons";
import { availabilityInput } from "./coaching-contracts";
import { coachAvailabilityFields } from "./coach-availability-form";
import {
  personSaveInput,
  ownProfileInput,
  emptySharedProfile,
  normEmail,
  type PersonSave,
  type SharedProfile,
} from "./person-contracts";
import type { ClubRecord } from "./teams/types";
import type { z } from "zod";
type PersonRow = {
  user_id: string;
  revision: number;
  instructor: boolean;
  publish_coach: boolean;
  publish_instructor: boolean;
  profile: SharedProfile;
};
export async function requirePeopleOwner(sql: Sql, userId: string) {
  if ((await resolveIdentity(sql, userId)).role !== "admin")
    throw new Error("Owner access required.");
}
async function clubFor(sql: Sql) {
  const [r] = await sql<{
    payload: ClubRecord;
    rev: number;
    demo: boolean;
  }>`select payload,rev,demo from club_state where id='oklahoma-prospects'`;
  return r
    ? {
        ...r,
        club: typeof r.payload === "string" ? (JSON.parse(r.payload) as ClubRecord) : r.payload,
      }
    : null;
}
export async function people(userId: string) {
  const sql = await getSql();
  await requirePeopleOwner(sql, userId);
  return sql<{
    id: string;
    name: string;
    email: string;
    role: string;
    instructor: boolean;
    disabled: boolean;
  }>`select u.id,u.name,u.email,coalesce(p.role,'parent') as role,coalesce(pp.instructor,false) as instructor,(u."disabledAt" is not null) as disabled from "user" u left join profiles p on p.user_id=u.id left join person_profiles pp on pp.user_id=u.id order by u.name,u.email`;
}
export async function personFor(sql: Sql, userId: string) {
  const [user] = await sql<{
    id: string;
    name: string;
    email: string;
    disabledAt: Date | null;
  }>`select id,name,email,"disabledAt" from "user" where id=${userId}`;
  if (!user) throw new Error("Account not found.");
  const email = normEmail(user.email);
  const [savedRows, oldProfiles, staff, listings, file, club, guardians, players] =
    await Promise.all([
      sql<PersonRow>`select * from person_profiles where user_id=${userId}`,
      sql<{
        profile: Record<string, unknown>;
        published: boolean;
      }>`select profile,published from coach_profiles where user_id=${userId}`,
      sql<{
        id: string;
        active: boolean;
        name: string;
      }>`select id,active,name from club_staff where (user_id=${userId} or (user_id='' and lower(trim(email))=${email})) order by id`,
      sql<{
        name: string;
        bio: string;
        program: string;
        published: boolean;
      }>`select name,bio,program,published from staff_directory where lower(trim(email))=${email}`,
      readWorkingFile(sql),
      clubFor(sql),
      sql<{
        household_id: string;
      }>`select household_id from person_guardian_links where user_id=${userId}`,
      sql<{ player_id: string }>`select player_id from person_player_links where user_id=${userId}`,
    ]);
  const saved = savedRows[0],
    legacy = oldProfiles[0];
  const ownCoach = file.coaches.find((c) => normEmail(c.email) === email);
  const coachId = ownCoach?.id || newCoachId(email);
  const assignments = (club?.demo ? [] : club?.club.teams || [])
    .filter((t) => !t.closed)
    .flatMap((t) => {
      const head = normEmail(t.coachEmail || "") === email;
      const s = t.staff.find((p) => normEmail(p.email) === email);
      return head || s ? [{ teamId: t.id, role: head ? "Head Coach" : s?.role || "Coach" }] : [];
    });
  const sources: { label: string; profile: SharedProfile }[] = [];
  if (legacy) {
    const p = legacy.profile;
    sources.push({
      label: "Existing lesson profile",
      profile: {
        ...emptySharedProfile(String(p.name || user.name)),
        bio: String(p.career || ""),
        specialties: Array.isArray(p.specialties) ? (p.specialties as string[]) : [],
        ages: String(p.ages || ""),
        approach: String(p.approach || ""),
        achievements: String(p.achievements || ""),
        welcome: String(p.welcome || ""),
      },
    });
  }
  for (const t of club?.club.teams || []) {
    if (t.closed) continue;
    const head = normEmail(t.coachEmail || "") === email;
    const s = t.staff.find((p) => normEmail(p.email) === email);
    if (head || s)
      sources.push({
        label: `Team: ${t.name}`,
        profile: {
          ...emptySharedProfile(head ? t.headCoach : s!.name),
          bio: head ? t.headCoachBio || "" : s!.bio || "",
          photo: head ? t.headCoachPhoto || "" : s!.photo || "",
          sports: [t.sport],
        },
      });
  }
  for (const s of listings)
    sources.push({
      label: "Staff directory",
      profile: {
        ...emptySharedProfile(s.name),
        bio: s.bio,
        sports:
          s.program === "Baseball" ? ["baseball"] : s.program === "Softball" ? ["softball"] : [],
      },
    });
  const base = sources[0]?.profile || emptySharedProfile(user.name);
  const draft = {
    ...base,
    photo: base.photo || sources.find((s) => s.profile.photo)?.profile.photo || "",
    sports: [...new Set(sources.flatMap((s) => s.profile.sports))],
  };
  const offerings = await sql<{
    serviceId: string;
    profitSplit: number;
  }>`select service_id as "serviceId",profit_split as "profitSplit" from club_staff_services where staff_id=any(${staff.filter((s) => s.active).map((s) => s.id)}::text[]) order by service_id`;
  const inferred = offerings.length > 0 && ownCoach?.active !== false;
  const windows = coachAvailabilityFields(file.availability.filter((a) => a.coachId === coachId))
    .filter((w) => w.available)
    .map((w) => ({ weekday: w.weekday, start: w.start, end: w.end }));
  return {
    user: { id: user.id, name: user.name, email, disabled: Boolean(user.disabledAt) },
    primaryRole:
      (await sql<{ role: string }>`select role from profiles where user_id=${userId}`)[0]?.role ||
      "parent",
    coachId,
    sources: saved ? [] : sources,
    value: {
      userId,
      revision: saved?.revision || 0,
      profile: saved?.profile || draft,
      instructor: saved?.instructor ?? inferred,
      publishCoach: saved?.publish_coach ?? assignments.length > 0,
      publishInstructor: saved?.publish_instructor ?? Boolean(legacy?.published && inferred),
      teams: assignments,
      offerings: [...new Map(offerings.map((o) => [o.serviceId, o])).values()],
      windows,
      guardianHouseholds: guardians.map((g) => g.household_id),
      playerIds: players.map((p) => p.player_id),
      reviewedSources: Boolean(saved),
    } as PersonSave,
  };
}
export async function person(viewerId: string, userId: string) {
  const sql = await getSql();
  await requirePeopleOwner(sql, viewerId);
  const [record, club, services, households, file] = await Promise.all([
    personFor(sql, userId),
    clubFor(sql),
    sql<{
      id: string;
      name: string;
      minutes: number;
      active: boolean;
    }>`select id,name,minutes,active from club_services where kind='lesson' order by sort_order,id`,
    sql<{
      id: string;
      primary_email: string;
    }>`select id,primary_email from club_households order by primary_email`,
    readWorkingFile(sql),
  ]);
  const teams = club?.club.teams.filter((t) => !t.closed) || [];
  const existingHouseholds = await sql<{
    id: string;
    primary_email: string;
  }>`select h.id,h.primary_email from club_households h join household_members m on m.household_id=h.id where m.user_id=${userId}`;
  return {
    ...record,
    options: {
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        seasons: teamSeasons(t),
        headCoach: t.headCoach,
      })),
      services,
      households,
      players: [
        ...new Map(
          [
            ...file.athletes.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` })),
            ...teams.flatMap((t) =>
              t.roster.map((p) => ({ id: p.id, name: `${p.name} · ${t.name}` })),
            ),
          ].map((p) => [p.id, p]),
        ).values(),
      ],
    },
    existingHouseholds,
  };
}
export async function savePersonFor(sql: Sql, actorId: string, raw: PersonSave) {
  await requirePeopleOwner(sql, actorId);
  const input = personSaveInput.parse(raw);
  availabilityInput.parse({ windows: input.windows });
  return sql.transaction(async (tx) => {
    const [user] = await tx<{
      id: string;
      email: string;
      name: string;
      disabledAt: Date | null;
    }>`select id,email,name,"disabledAt" from "user" where id=${input.userId} for update`;
    if (!user || user.disabledAt) throw new Error("Choose an active account.");
    const email = normEmail(user.email);
    const current = await personFor(tx, user.id);
    if (current.value.revision !== input.revision)
      throw new Error("This person changed. Reload before saving.");
    if (!input.revision && current.sources.length > 1 && !input.reviewedSources)
      throw new Error("Review the existing profiles before saving the shared profile.");
    if ((input.publishCoach || input.publishInstructor) && !input.profile.bio)
      throw new Error("Add a bio before publishing.");
    if (input.publishInstructor && !input.instructor)
      throw new Error("Enable the instructor assignment before publishing an instructor.");
    const club = await clubFor(tx);
    if (input.teams.length && !club) throw new Error("Create a team first.");
    if (new Set(input.teams.map((t) => t.teamId)).size !== input.teams.length)
      throw new Error("Choose each team once.");
    if (input.publishCoach && !input.teams.length)
      throw new Error("Assign a team before publishing on Coaches.");
    if (club) {
      for (const a of input.teams) {
        const t = club.club.teams.find((t) => t.id === a.teamId && !t.closed);
        if (!t) throw new Error("Choose an active team.");
        if (a.role === "Head Coach" && t.coachEmail && normEmail(t.coachEmail) !== email)
          throw new Error(
            `${t.name} already has a head coach. Change that assignment in Teams first.`,
          );
      }
      for (const t of club.club.teams) {
        if (t.closed) continue;
        const a = input.teams.find((a) => a.teamId === t.id);
        const head = normEmail(t.coachEmail || "") === email;
        const existing = t.staff.find((p) => normEmail(p.email) === email);
        if (head && a?.role !== "Head Coach") {
          t.headCoach = "";
          t.coachEmail = "";
          t.headCoachBio = "";
          t.headCoachPhoto = "";
        }
        t.staff = t.staff.filter((s) => normEmail(s.email) !== email);
        if (a?.role === "Head Coach") {
          t.headCoach = input.profile.name;
          t.coachEmail = email;
          t.headCoachBio = input.profile.bio;
          t.headCoachPhoto = input.profile.photo;
          if (existing)
            t.staff.push({
              ...existing,
              name: input.profile.name,
              bio: input.profile.bio,
              photo: input.profile.photo,
            });
        } else if (a)
          t.staff.push({
            ...existing,
            id: existing?.id || `staff:${user.id}:${t.id}`,
            name: input.profile.name,
            email,
            role: a.role,
            bio: input.profile.bio,
            photo: input.profile.photo,
            monthly: existing?.monthly || 0,
            childId: existing?.childId || "",
            applyAmount: existing?.applyAmount || 0,
            w9: existing?.w9 || false,
            backgroundCheck: existing?.backgroundCheck || false,
            safeSport: existing?.safeSport || false,
            expires: existing?.expires || "",
          });
      }
      const updated =
        await tx`update club_state set payload=${JSON.stringify({ ...club.club, _rev: club.rev + 1, _savedAt: new Date().toISOString() })}::jsonb,rev=rev+1,updated_at=now() where id='oklahoma-prospects' and rev=${club.rev} returning rev`;
      if (!updated.length) throw new Error("Teams changed. Reload before saving.");
    }
    const conflicts =
      await tx`select id from club_staff where lower(trim(email))=${email} and user_id<>'' and user_id<>${user.id}`;
    if (conflicts.length)
      throw new Error(
        "This staff email is linked to another account. Resolve the account link first.",
      );
    const staff = await tx<{
      id: string;
    }>`select id from club_staff where user_id=${user.id} or (user_id='' and lower(trim(email))=${email}) order by id for update`;
    if (staff.length > 1)
      throw new Error(
        "Multiple instructor records match this account. Contact the office to reconcile them before saving.",
      );
    const staffId = staff[0]?.id || `staff:${user.id}`;
    await tx`insert into club_staff(id,user_id,name,email,role,active) values(${staffId},${user.id},${input.profile.name},${email},'coach',${input.instructor || input.teams.length > 0}) on conflict(id) do update set user_id=excluded.user_id,name=excluded.name,email=excluded.email,active=excluded.active`;
    await replaceCoachServices(tx, staffId, input.instructor ? input.offerings : []);
    // Serialize profile/availability with existing PD writers and preserve stable booking IDs.
    await tx`select id from pd_working_file where id='club' for update`;
    const file = await readWorkingFile(tx);
    const oldCoach = file.coaches.find((c) => normEmail(c.email) === email);
    const coachId = oldCoach?.id || newCoachId(email);
    const nextCoach = {
      ...oldCoach,
      id: coachId,
      name: input.profile.name,
      email,
      specialties: input.profile.specialties,
      active: input.instructor || input.teams.length > 0,
    };
    file.coaches = [...file.coaches.filter((c) => c.id !== coachId), nextCoach];
    file.availability = [
      ...file.availability.filter((a) => a.coachId !== coachId),
      ...(input.instructor ? input.windows : []).map((w, i) => ({
        id: `availability:${coachId}:${i}`,
        coachId,
        weekday: w.weekday,
        window: `${w.start}–${w.end}`,
      })),
    ];
    await writeWorkingFile(file, tx);
    const homes = await tx<{
      id: string;
    }>`select id from club_households where id=any(${input.guardianHouseholds}::text[])`;
    if (homes.length !== new Set(input.guardianHouseholds).size)
      throw new Error("Choose existing households.");
    const knownPlayers = new Set([
      ...file.athletes.map((p) => p.id),
      ...(club?.club.teams.flatMap((t) => t.roster.map((p) => p.id)) || []),
    ]);
    if (input.playerIds.some((id) => !knownPlayers.has(id)))
      throw new Error("Choose existing player records.");
    await tx`delete from person_guardian_links where user_id=${user.id}`;
    for (const id of new Set(input.guardianHouseholds))
      await tx`insert into person_guardian_links(user_id,household_id) values(${user.id},${id})`;
    await tx`delete from person_player_links where user_id=${user.id}`;
    for (const id of new Set(input.playerIds))
      await tx`insert into person_player_links(user_id,player_id) values(${user.id},${id})`;
    await tx`insert into person_profiles(user_id,revision,instructor,publish_coach,publish_instructor,profile) values(${user.id},${input.revision + 1},${input.instructor},${input.publishCoach},${input.publishInstructor},${JSON.stringify(input.profile)}::jsonb) on conflict(user_id) do update set revision=excluded.revision,instructor=excluded.instructor,publish_coach=excluded.publish_coach,publish_instructor=excluded.publish_instructor,profile=excluded.profile,updated_at=now()`;
    return { ok: true, revision: input.revision + 1 };
  });
}
export async function savePerson(actorId: string, input: PersonSave) {
  return savePersonFor(await getSql(), actorId, input);
}
export async function myPerson(userId: string) {
  const sql = await getSql();
  const me = await resolveIdentity(sql, userId);
  if (me.role !== "admin" && !me.canInstruct && !me.canTeamCoach && me.role !== "coach")
    throw new Error("A coach or instructor assignment is required.");
  const p = await personFor(sql, userId);
  return { ...p, canManage: me.role === "admin" };
}
export async function saveMyPerson(userId: string, raw: z.infer<typeof ownProfileInput>) {
  return saveMyPersonFor(await getSql(), userId, raw);
}
export async function saveMyPersonFor(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof ownProfileInput>,
) {
  const input = ownProfileInput.parse(raw);
  const me = await resolveIdentity(sql, userId);
  if (me.role !== "admin" && !me.canInstruct && !me.canTeamCoach && me.role !== "coach")
    throw new Error("A coach or instructor assignment is required.");
  return sql.transaction(async (tx) => {
    await tx`select id from "user" where id=${userId} for update`;
    const p = await personFor(tx, userId);
    if (p.value.revision !== input.revision)
      throw new Error("Your profile changed. Reload before saving.");
    if (!input.revision && p.sources.length > 1 && !input.reviewedSources)
      throw new Error("Review existing profiles before saving.");
    if ((p.value.publishCoach || p.value.publishInstructor) && !input.profile.bio)
      throw new Error("A published profile needs a bio.");
    await tx`insert into person_profiles(user_id,revision,instructor,publish_coach,publish_instructor,profile) values(${userId},${input.revision + 1},${p.value.instructor},${p.value.publishCoach},${p.value.publishInstructor},${JSON.stringify(input.profile)}::jsonb) on conflict(user_id) do update set profile=excluded.profile,revision=excluded.revision,updated_at=now()`;
    return { ok: true };
  });
}
