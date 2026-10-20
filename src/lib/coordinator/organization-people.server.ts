import { organizationInstructionState } from "../operational-instruction.server";
import type { Sql } from "../db";
import {
  secured,
  requireOrganizationOperations,
  financiallyRestricted,
  audit,
} from "./access.server";
import { lockFinancialExecution } from "../finance/execution.server";
import {
  organizationPersonInput,
  type OrganizationPersonInput,
} from "./organization-people-contracts";
import { emptySharedProfile, publicSharedProfile, type SharedProfile } from "../person-contracts";
import { availabilityInput } from "../coaching-contracts";
import { coachAvailabilityFields } from "../coach-availability-form";
import { newCoachId } from "../coach-id.server";
import { availabilitySourceKey, type OperationalPersonSetting } from "../operational-person.server";
import type { Availability, Coach } from "../pd/types";
const changed = () => new Error("This person or availability changed. Refresh before saving.");
const profileKeys = Object.keys(emptySharedProfile());
function displayProfile(value: Partial<SharedProfile> | null, name: string): SharedProfile {
  const base = emptySharedProfile(name);
  if (!value) return base;
  for (const key of profileKeys as (keyof SharedProfile)[]) {
    const v = value[key];
    if (key === "sports")
      base.sports = Array.isArray(v)
        ? (v.filter(
            (s): s is "baseball" | "softball" => s === "baseball" || s === "softball",
          ) as SharedProfile["sports"])
        : [];
    else if (key === "specialties")
      base.specialties = Array.isArray(v)
        ? v.filter((s): s is string => typeof s === "string")
        : [];
    else if (typeof v === "string") base[key] = v;
  }
  return base;
}
export async function organizationPeople(sql: Sql, actorId: string) {
  return secured(sql, actorId, "organization.people.read", async (tx) => {
    await requireOrganizationOperations(tx, actorId);
    const rows = await tx<{
      userId: string;
      name: string;
      loginEmail: string;
      accountDisabled: boolean;
      active: boolean;
      revision: number;
      classified: boolean;
      candidate: Partial<SharedProfile> | null;
    }>`
      select u.id as "userId",u.name,lower(trim(u.email)) as "loginEmail",(u."disabledAt" is not null) as "accountDisabled",coalesce(o.directory_active,true) as active,coalesce(o.revision,0) as revision,coalesce(o.classified_profile_revision=pp.revision,false) as classified,
      case when ((u."disabledAt" is null and coalesce(o.directory_active,true) and (pp.publish_coach or (pp.publish_instructor and pp.instructor))) or o.classified_profile_revision=pp.revision) then (select jsonb_object_agg(k,pp.profile->k) from unnest(${profileKeys}::text[]) k) else null end as candidate
      from "user" u left join operational_person_settings o on o.user_id=u.id left join person_profiles pp on pp.user_id=u.id order by u.name,u.id`;
    const people = rows.map(({ candidate, classified, ...row }) => ({
      ...row,
      name:
        (classified && typeof candidate?.name === "string"
          ? candidate.name
          : publicSharedProfile(candidate)?.name) || row.name,
    }));
    return { people };
  });
}
async function personRecord(tx: Sql, actorId: string, userId: string) {
  const [user] = await tx<{
    id: string;
    name: string;
    email: string;
    disabled: boolean;
    verified: boolean;
    role: string;
  }>`select u.id,u.name,lower(trim(u.email)) as email,(u."disabledAt" is not null) as disabled,u."emailVerified" as verified,coalesce(p.role,'parent') as role from "user" u left join profiles p on p.user_id=u.id where u.id=${userId}`;
  if (!user) throw new Error("Account not found.");
  const [settings] =
    await tx<OperationalPersonSetting>`select user_id,revision,contact_email,phone,directory_active,coach_id,windows,availability_source,unavailable_service_ids,classified_profile_revision from operational_person_settings where user_id=${userId}`;
  const [saved] = await tx<{
    revision: number;
    instructor: boolean;
    publish_coach: boolean;
    publish_instructor: boolean;
  }>`select revision,instructor,publish_coach,publish_instructor from person_profiles where user_id=${userId}`;
  const restricted = await financiallyRestricted(tx, actorId);
  let profileWithheld = Boolean(
    saved &&
    restricted &&
    (!(saved.publish_coach || (saved.publish_instructor && saved.instructor)) ||
      user.disabled ||
      settings?.directory_active === false) &&
    settings?.classified_profile_revision !== saved.revision,
  );
  const [profileRow] = profileWithheld
    ? []
    : await tx<{
        profile: SharedProfile;
      }>`select coalesce((select jsonb_object_agg(k,profile->k) from unnest(${profileKeys}::text[]) k),'{}'::jsonb) as profile from person_profiles where user_id=${userId}`;
  if (
    saved &&
    restricted &&
    !profileWithheld &&
    settings?.classified_profile_revision !== saved.revision &&
    !publicSharedProfile(profileRow?.profile)
  )
    profileWithheld = true;
  const [pd] = await tx<{
    revision: number;
    coaches: Coach[];
    availability: Availability[];
  }>`select revision,coalesce(payload::jsonb->'coaches','[]'::jsonb) as coaches,coalesce(payload::jsonb->'availability','[]'::jsonb) as availability from pd_working_file where id='club'`;
  const coaches = (pd?.coaches || []).filter((c) => c.email.trim().toLowerCase() === user.email);
  if (coaches.length > 1) throw new Error("Multiple instructor identities need owner review.");
  const coachId = settings?.coach_id || coaches[0]?.id || newCoachId(user.email);
  if (settings?.coach_id && coaches[0] && settings.coach_id !== coaches[0].id)
    throw new Error("Instructor identity changed. Ask an owner to reconcile the profile.");
  const services = await tx<{
    id: string;
    name: string;
    minutes: number;
  }>`select distinct s.id,s.name,s.minutes from club_staff st join club_staff_services o on o.staff_id=st.id join club_services s on s.id=o.service_id where st.active and (st.user_id=${userId} or (st.user_id='' and lower(trim(st.email))=${user.email})) and s.kind='lesson' and s.active order by s.name,s.id`;
  const teams = await tx<{
    id: string;
    name: string;
    role: string;
  }>`select t->>'id' as id,t->>'name' as name,case when lower(trim(t->>'coachEmail'))=${user.email} then 'Head Coach' else m->>'role' end as role from club_state c cross join lateral jsonb_array_elements(coalesce(c.payload->'teams','[]'::jsonb)) t left join lateral (select s as m from jsonb_array_elements(coalesce(t->'staff','[]'::jsonb)) s where lower(trim(s->>'email'))=${user.email} limit 1) staff on true where not c.demo and c.id='oklahoma-prospects' and coalesce(t->>'closed','false')<>'true' and (lower(trim(t->>'coachEmail'))=${user.email} or m is not null)`;
  let profile = profileWithheld ? null : displayProfile(profileRow?.profile || null, user.name);
  let legacyPublished = false;
  if (!saved) {
    const [legacy] = await tx<{
      profile: Partial<SharedProfile>;
    }>`select jsonb_build_object('name',profile->>'name','bio',profile->>'career','specialties',profile->'specialties','ages',profile->>'ages','approach',profile->>'approach','achievements',profile->>'achievements','welcome',profile->>'welcome') as profile from coach_profiles where user_id=${userId} and published=true and ${!user.disabled && settings?.directory_active !== false}`;
    const [directory] = await tx<{
      name: string;
      bio: string;
    }>`select name,bio from staff_directory where (identity_user_id=${userId} or (identity_email is null and lower(trim(email))=${user.email})) and published=true and ${!user.disabled && settings?.directory_active !== false} order by id limit 1`;
    legacyPublished = Boolean(legacy || directory);
    if (legacy) profile = displayProfile(legacy.profile, user.name);
    else if (directory) profile = { ...emptySharedProfile(directory.name), bio: directory.bio };
  }
  const sourceWindows = (pd?.availability || []).filter((a) => a.coachId === coachId);
  const windows =
    (settings?.availability_source === availabilitySourceKey(sourceWindows)
      ? settings.windows
      : null) ??
    coachAvailabilityFields(sourceWindows)
      .filter((w) => w.available)
      .map(({ weekday, start, end }) => ({ weekday, start, end }));
  return {
    instruction: await organizationInstructionState(tx, actorId, userId),
    userId,
    revision: settings?.revision || 0,
    profileRevision: saved?.revision || 0,
    sourceRevision: pd?.revision || 0,
    loginEmail: user.email,
    accountDisabled: user.disabled,
    profileWithheld,
    profile,
    contactEmail: settings?.contact_email ?? user.email,
    phone: settings?.phone || "",
    active: settings?.directory_active ?? true,
    publishCoach: saved?.publish_coach ?? (legacyPublished || teams.length > 0),
    publishInstructor: saved?.publish_instructor ?? (legacyPublished && services.length > 0),
    canPublishInstructor:
      user.verified && !user.disabled && user.role !== "player" && services.length > 0,
    coachId,
    windows: availabilityInput.parse({ windows }).windows,
    services: services.map((s) => ({
      ...s,
      available: !settings?.unavailable_service_ids.includes(s.id),
    })),
    teams,
  };
}
export async function organizationPerson(sql: Sql, actorId: string, userId: string) {
  return secured(
    sql,
    actorId,
    "organization.person.read",
    async (tx) => {
      await requireOrganizationOperations(tx, actorId);
      return personRecord(tx, actorId, userId);
    },
    lockFinancialExecution,
  );
}
export async function saveOrganizationPerson(
  sql: Sql,
  actorId: string,
  raw: OrganizationPersonInput,
) {
  const input = organizationPersonInput.parse(raw);
  availabilityInput.parse({ windows: input.windows });
  return secured(
    sql,
    actorId,
    "organization.person.save",
    async (tx) => {
      await requireOrganizationOperations(tx, actorId);
      await tx`select id from "user" where id=${input.userId} for update`;
      await tx`select user_id from person_profiles where user_id=${input.userId} for update`;
      await tx`select user_id from operational_person_settings where user_id=${input.userId} for update`;
      await tx`select id from pd_working_file where id='club' for share`;
      await tx`lock table club_staff,club_staff_services,club_services in share mode`;
      const current = await personRecord(tx, actorId, input.userId);
      if (
        current.revision !== input.revision ||
        current.profileRevision !== input.profileRevision ||
        current.sourceRevision !== input.sourceRevision
      )
        throw changed();
      if (input.unavailableServiceIds.some((id) => !current.services.some((s) => s.id === id)))
        throw new Error("Choose an existing approved service.");
      if (!current.services.length && input.windows.length)
        throw new Error("An existing approved instructor assignment is required for availability.");
      if (
        current.profileWithheld &&
        (input.profile !== null ||
          input.publishCoach !== current.publishCoach ||
          input.publishInstructor !== current.publishInstructor)
      )
        throw new Error(
          "An owner must review this private profile before editing or publishing it.",
        );
      if (!current.profileWithheld && !input.profile)
        throw new Error("Provide the profile to save.");
      let profileRevision = current.profileRevision;
      const profileChanged =
        input.profile !== null &&
        (JSON.stringify(input.profile) !== JSON.stringify(current.profile) ||
          input.publishCoach !== current.publishCoach ||
          input.publishInstructor !== current.publishInstructor);
      if (
        !current.active &&
        input.active &&
        !current.accountDisabled &&
        (await financiallyRestricted(tx, actorId))
      ) {
        // Restoring directory status must not turn hidden historical publication into a disclosure.
        // Read booleans only; the actor never receives the withheld legacy text.
        await tx`lock table coach_profiles,staff_directory,public_leadership in share mode`;
        const [hiddenPublication] = await tx<{
          directory: boolean;
          directoryPublished: boolean;
          legacy: boolean;
          leadership: boolean;
          teamNarrative: boolean;
        }>`
          select exists(select 1 from staff_directory d where (d.identity_user_id=${input.userId} or (d.identity_email is null and lower(trim(d.email))=${current.loginEmail})) and d.published and d.operational_bio_version is distinct from d.version) as directory,
          exists(select 1 from staff_directory d where (d.identity_user_id=${input.userId} or (d.identity_email is null and lower(trim(d.email))=${current.loginEmail})) and d.published) as "directoryPublished",
          exists(select 1 from coach_profiles where user_id=${input.userId} and published) as legacy,
          exists(select 1 from public_leadership where user_id=${input.userId} and enabled and cardinality(titles)>0) as leadership,
          exists(select 1 from club_state c cross join lateral jsonb_array_elements(coalesce(c.payload->'teams','[]'::jsonb)) t where c.id='oklahoma-prospects' and not c.demo and coalesce(t->>'closed','false')<>'true' and ((lower(trim(t->>'coachEmail'))=${current.loginEmail} and (coalesce(t->>'headCoachBio','')<>'' or coalesce(t->>'headCoachPhoto','')<>'')) or exists(select 1 from jsonb_array_elements(coalesce(t->'staff','[]'::jsonb)) s where lower(trim(s->>'email'))=${current.loginEmail} and (coalesce(s->>'bio','')<>'' or coalesce(s->>'photo','')<>'')))) as "teamNarrative"`;
        const reviewedReplacement = Boolean(
          input.profile && profileChanged && input.reviewedPublication,
        );
        const sharedWithheld =
          current.profileRevision > 0 &&
          current.profileWithheld &&
          (current.publishCoach || current.publishInstructor || hiddenPublication.leadership);
        const legacyWithheld =
          current.profileRevision === 0 &&
          !reviewedReplacement &&
          (hiddenPublication.legacy || hiddenPublication.teamNarrative);
        if (
          current.publishCoach ||
          current.publishInstructor ||
          current.teams.length ||
          hiddenPublication.directoryPublished ||
          hiddenPublication.legacy ||
          hiddenPublication.leadership ||
          hiddenPublication.teamNarrative
        ) {
          const [target] = await tx<{
            verified: boolean;
            role: string;
            staff: boolean;
          }>`select u."emailVerified" as verified,coalesce(p.role,'parent') as role,(exists(select 1 from club_staff s where s.user_id=u.id or (s.user_id='' and lower(trim(s.email))=lower(trim(u.email)))) or exists(select 1 from owner_grants g where g.user_id=u.id and g.revoked_at is null) or exists(select 1 from organization_operational_access a where a.user_id=u.id and a.status='active')) as staff from "user" u left join profiles p on p.user_id=u.id where u.id=${input.userId}`;
          if (
            !target.verified ||
            target.role === "player" ||
            (!target.staff && !current.teams.length)
          )
            throw new Error("Publication requires an existing verified adult staff assignment.");
        }
        if (hiddenPublication.directory || sharedWithheld || legacyWithheld)
          throw new Error(
            "An owner must review hidden published content before reactivating this person.",
          );
      }
      if (input.profile && profileChanged) {
        const [target] = await tx<{
          role: string;
          verified: boolean;
          staff: boolean;
        }>`select coalesce(p.role,'parent') as role,u."emailVerified" as verified,(exists(select 1 from club_staff s where s.user_id=u.id or (s.user_id='' and lower(trim(s.email))=lower(trim(u.email)))) or exists(select 1 from owner_grants g where g.user_id=u.id and g.revoked_at is null) or exists(select 1 from organization_operational_access a where a.user_id=u.id and a.status='active')) as staff from "user" u left join profiles p on p.user_id=u.id where u.id=${input.userId}`;
        if (input.publishCoach || input.publishInstructor) {
          if (!input.reviewedPublication)
            throw new Error("Review the public profile before publishing.");
          if (
            current.accountDisabled ||
            !target.verified ||
            target.role === "player" ||
            (!target.staff && !current.teams.length)
          )
            throw new Error("Publication requires an existing verified adult staff assignment.");
          if (!input.profile.bio) throw new Error("Add a biography before publishing.");
          if (input.publishCoach && !input.profile.sports.length && !current.teams.length)
            throw new Error("Choose a sport before publishing on Coaches.");
          if (input.publishInstructor && !current.canPublishInstructor)
            throw new Error("An existing approved instructor assignment is required.");
        }
        profileRevision++;
        await tx`insert into person_profiles(user_id,revision,instructor,publish_coach,publish_instructor,profile) values(${input.userId},${profileRevision},false,${input.publishCoach},${input.publishInstructor},${JSON.stringify(input.profile)}::jsonb) on conflict(user_id) do update set revision=excluded.revision,publish_coach=excluded.publish_coach,publish_instructor=excluded.publish_instructor,profile=person_profiles.profile||excluded.profile,updated_at=now()`;
      }
      const [savedSettings] =
        await tx<OperationalPersonSetting>`select windows,availability_source from operational_person_settings where user_id=${input.userId}`;
      const [source] = await tx<{
        availability: Availability[];
      }>`select coalesce(payload::jsonb->'availability','[]'::jsonb) as availability from pd_working_file where id='club'`;
      const changedWindows = JSON.stringify(input.windows) !== JSON.stringify(current.windows);
      const classifyProfile =
        profileChanged &&
        ((await financiallyRestricted(tx, actorId)) ||
          ((input.publishCoach || input.publishInstructor) && input.reviewedPublication));
      const windows = changedWindows
        ? JSON.stringify(input.windows)
        : savedSettings?.windows
          ? JSON.stringify(savedSettings.windows)
          : null;
      const availabilitySource = changedWindows
        ? availabilitySourceKey(
            (source?.availability || []).filter((a) => a.coachId === current.coachId),
          )
        : savedSettings?.availability_source || "";
      await tx`insert into operational_person_settings(user_id,revision,contact_email,phone,directory_active,coach_id,windows,availability_source,unavailable_service_ids,classified_profile_revision,updated_by) values(${input.userId},${input.revision + 1},${input.contactEmail},${input.phone},${input.active},${current.coachId},${windows}::jsonb,${availabilitySource},${input.unavailableServiceIds},${classifyProfile ? profileRevision : null},${actorId}) on conflict(user_id) do update set revision=excluded.revision,contact_email=excluded.contact_email,phone=excluded.phone,directory_active=excluded.directory_active,coach_id=excluded.coach_id,windows=excluded.windows,availability_source=excluded.availability_source,unavailable_service_ids=excluded.unavailable_service_ids,classified_profile_revision=case when ${profileChanged} then excluded.classified_profile_revision else operational_person_settings.classified_profile_revision end,updated_by=excluded.updated_by,updated_at=now()`;
      await audit(tx, actorId, "organization.person.save", input.userId, "allowed", {
        revision: input.revision + 1,
        profileChanged,
        publicationReviewed: input.reviewedPublication,
      });
      return { ok: true, revision: input.revision + 1, profileRevision };
    },
    lockFinancialExecution,
  );
}
