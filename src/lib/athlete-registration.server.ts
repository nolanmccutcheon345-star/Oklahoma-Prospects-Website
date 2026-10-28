import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import {
  athleteRegistrationInput,
  type AthleteRegistrationInput,
} from "./athlete-registration-contracts";
import { calculateEligibility, eligibilityRules } from "./athlete-eligibility";

export type FamilyAthlete = {
  id: string;
  name: string;
  birthDate: string;
  schoolStatus: string;
  school: string;
  graduationYear: string;
  revision: number;
};
export async function familyAthletesFor(sql: Sql, userId: string): Promise<FamilyAthlete[]> {
  const me = await resolveIdentity(sql, userId);
  // A player may not select siblings. Reuse explicit player links; never names.
  return sql<FamilyAthlete>`select a.id,a.name,coalesce(a.birth_date::text,'') as "birthDate",a.school_status as "schoolStatus",a.school,coalesce(a.graduation_year::text,'unknown') as "graduationYear",a.registration_revision as revision
 from club_athletes a where (${me.role !== "player"} and a.household_id=any(${me.billingHouseholdIds}::text[])) or (${me.role === "player"} and a.id=any(${me.playerIds}::text[])) order by a.name,a.id`;
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function prepareAthleteRegistration(
  sql: Sql,
  userId: string | null,
  raw: AthleteRegistrationInput,
) {
  const data = athleteRegistrationInput.parse(raw);
  const me = userId ? await resolveIdentity(sql, userId) : null;
  if (
    data.athleteId &&
    (!userId || !(await familyAthletesFor(sql, userId)).some((a) => a.id === data.athleteId))
  )
    throw new Error("Choose an athlete you are authorized to manage.");
  if (me?.role === "player" && !data.athleteId)
    throw new Error("Ask your parent or guardian to add your athlete profile.");
  return { data, me };
}
// Called inside the registration transaction after repeat-request verification.
export async function saveRegistrationProfile(
  tx: Sql,
  requestId: string,
  userId: string | null,
  data: AthleteRegistrationInput,
  name: string,
  email: string,
  sport: string,
  season: string,
  requested: string,
  householdEmail: string | null,
) {
  if (userId) {
    const { requireUnrestrictedLegacyAccess } = await import("./coordinator/access.server");
    await requireUnrestrictedLegacyAccess(tx, userId);
    const [actor] = await tx<{
      email: string;
      role: string;
    }>`select lower(trim(u.email)) email,coalesce(p.role,'parent') role from "user" u left join profiles p on p.user_id=u.id where u.id=${userId} and u."emailVerified" and u."disabledAt" is null for share of u`;
    if (!actor || actor.email !== householdEmail)
      throw new Error("Refresh your verified account before registering.");
    if (actor.role === "player" && !data.athleteId)
      throw new Error("A parent or guardian must add an athlete.");
    if (data.athleteId) {
      const [owned] =
        await tx`select a.id from club_athletes a where a.id=${data.athleteId} and (( ${actor.role === "player"} and exists(select 1 from person_player_links l where l.user_id=${userId} and l.player_id=a.id)) or (${actor.role !== "player"} and (exists(select 1 from person_guardian_links g where g.user_id=${userId} and g.household_id=a.household_id) or exists(select 1 from household_members m where m.user_id=${userId} and m.household_id=a.household_id)))) for update of a`;
      if (!owned) throw new Error("Choose an athlete you are authorized to manage.");
    }
  } else if (data.athleteId) throw new Error("Sign in to use a saved athlete.");
  let athleteId = data.athleteId;
  const year = data.graduationYear === "unknown" ? null : Number(data.graduationYear);
  if (athleteId) {
    const [old] = await tx<{
      birth_date: string;
      school: string;
      school_status: string;
      graduation_year: number | null;
      registration_revision: number;
    }>`select birth_date::text,school,school_status,graduation_year,registration_revision from club_athletes where id=${athleteId} for update`;
    if (!old || old.registration_revision !== data.revision)
      throw new Error("This athlete profile changed. Refresh and confirm the latest details.");
    const changed: string[] = [];
    if (old.birth_date !== data.birthDate) changed.push("birthDate");
    if (old.school !== data.school || old.school_status !== data.schoolStatus)
      changed.push("school");
    if (old.graduation_year !== year) changed.push("graduationYear");
    if (changed.includes("birthDate") && old.birth_date && userId) {
      const [actor] = await tx<{ role: string }>`select role from profiles where user_id=${userId}`;
      if (actor?.role === "player")
        throw new Error("Ask your parent or guardian to correct an existing birthdate.");
    }
    if (changed.includes("birthDate") && old.birth_date && !data.correctionReason)
      throw new Error("Explain the birthdate correction before saving.");
    await tx`update club_athletes set birth_date=${data.birthDate}::date,school=${data.school},school_status=${data.schoolStatus},graduation_year=${year},education_confirmed_at=now(),registration_revision=registration_revision+1 where id=${athleteId}`;
    if (changed.length) {
      await tx`insert into athlete_profile_changes(id,athlete_id,actor_id,fields,reason) values(${randomUUID()},${athleteId},${userId!},${changed}::text[],${data.correctionReason || "Family confirmed updated registration profile"})`;
      // Historical snapshots remain unchanged; only open work is flagged.
      if (!changed.includes("birthDate"))
        await tx`update club_requests r set payload=payload||'{"eligibilityStatus":"Needs review","eligibilityExplanation":"Athlete profile changed after submission. Review the current profile before placement."}'::jsonb where r.id in (select request_id from athlete_registration_profiles where athlete_id=${athleteId}) and r.status not in ('accepted','declined','closed','resolved')`;
    }
  } else if (userId && householdEmail) {
    athleteId = `athlete:${userId}:${requestId}`;
    await tx`insert into club_athletes(id,user_id,household_email,name,birth_date,profile,school,school_status,graduation_year,education_confirmed_at) values(${athleteId},${userId},${householdEmail},${name},${data.birthDate}::date,${JSON.stringify({ sport: sport.toLowerCase() })}::jsonb,${data.school},${data.schoolStatus},${year},now())`;
  }
  if (athleteId) await syncAthleteEducation(tx, athleteId);
  const eligibility = calculateEligibility(
    data.birthDate,
    sport,
    season,
    requested,
    eligibilityRules,
    data.eligibilityOrganization,
  );
  const snapshot = {
    ...eligibility,
    athleteId,
    currentGrade: data.currentGrade,
    birthMonthYear: data.birthDate.slice(0, 7),
    birthYear: data.birthDate.slice(0, 4),
    school: data.school,
    schoolStatus: data.schoolStatus,
    graduationYear: data.graduationYear,
    profileConfirmedAt: new Date().toISOString(),
  };
  const claimToken = athleteId ? "" : randomBytes(32).toString("hex");
  await tx`insert into athlete_registration_profiles(request_id,athlete_id,submitted_by,birth_date,school_status,school,graduation_year,snapshot,claim_hash) values(${requestId},${athleteId || null},${userId},${data.birthDate}::date,${data.schoolStatus},${data.school},${year},${JSON.stringify({ ...snapshot, ruleset: eligibilityRules.find((r) => r.id === eligibility.eligibilityRule) || null, sport, season, requestedDivision: requested, eligibilityOrganization: data.eligibilityOrganization })}::jsonb,${claimToken ? hash(claimToken) : null})`;
  await tx`update club_requests set user_id=${userId},payload=payload||${JSON.stringify(snapshot)}::jsonb where id=${requestId}`;
  return { claimToken };
}
export async function claimRegistrationFor(
  sql: Sql,
  userId: string,
  requestId: string,
  token: string,
  athleteId: string,
) {
  const me = await resolveIdentity(sql, userId);
  if (me.role === "player")
    throw new Error("A verified parent or guardian must link this registration.");
  if (athleteId && !(await familyAthletesFor(sql, userId)).some((a) => a.id === athleteId))
    throw new Error("Choose an athlete in your household.");
  return sql.transaction(async (tx) => {
    const { lockFinancialExecution } = await import("./finance/execution.server");
    await lockFinancialExecution(tx);
    const [row] = await tx<{
      birth_date: string;
      school: string;
      school_status: string;
      graduation_year: number | null;
      name: string;
      sport: string;
    }>`select p.birth_date::text,p.school,p.school_status,p.graduation_year,r.payload->>'player' as name,r.payload->>'sport' as sport from athlete_registration_profiles p join club_requests r on r.id=p.request_id where p.request_id=${requestId} and p.athlete_id is null and p.claim_hash=${hash(token)} and lower(r.payload->>'email')=${me.email} for update of p`;
    if (!row)
      throw new Error(
        "This claim is unavailable. Use the verified email from the registration and its private claim code.",
      );
    const id = athleteId || `athlete:${userId}:${requestId}`;
    if (athleteId) {
      const [existing] = await tx<{
        name: string;
        birth_date: string;
      }>`select name,birth_date::text from club_athletes where id=${id} for share`;
      if (
        existing.name.trim().toLowerCase() !== row.name.trim().toLowerCase() ||
        existing.birth_date !== row.birth_date
      )
        throw new Error(
          "Athlete details differ. Ask an owner to review the identity; no records were merged.",
        );
    } else
      await tx`insert into club_athletes(id,user_id,household_email,name,birth_date,profile,school,school_status,graduation_year,education_confirmed_at) values(${id},${userId},${me.email},${row.name},${row.birth_date}::date,${JSON.stringify({ sport: row.sport.toLowerCase() })}::jsonb,${row.school},${row.school_status},${row.graduation_year},now())`;
    const [registration] = await tx<{
      payload: { teamId?: string; rosterPlayerId?: string };
    }>`select payload from club_requests where id=${requestId}`;
    if (registration?.payload.rosterPlayerId && registration.payload.teamId) {
      await tx`insert into recruiting_roster_links(athlete_id,team_id,roster_id,linked_by) values(${id},${registration.payload.teamId},${registration.payload.rosterPlayerId},${userId}) on conflict do nothing`;
    }
    await syncAthleteEducation(tx, id);
    await tx`update athlete_registration_profiles set athlete_id=${id},claim_hash=null where request_id=${requestId}`;
    await tx`update club_requests set user_id=${userId},payload=payload||${JSON.stringify({ athleteId: id })}::jsonb where id=${requestId}`;
    await tx`insert into athlete_profile_changes(id,athlete_id,actor_id,fields,reason) values(${randomUUID()},${id},${userId},array['registrationLink'],'Verified family linked registration using private claim code')`;
    return { ok: true };
  });
}

/** Synchronize current education onto explicitly linked rosters; no DOB or publication flags. */
export async function syncAthleteEducation(tx: Sql, athleteId: string) {
  const [a] = await tx<{
    school: string;
    graduation_year: number | null;
    education_confirmed_at: unknown;
  }>`select school,graduation_year,education_confirmed_at from club_athletes where id=${athleteId}`;
  if (!a?.education_confirmed_at) return;
  const links = await tx<{
    team_id: string;
    roster_id: string;
  }>`select team_id,roster_id from recruiting_roster_links where athlete_id=${athleteId}`;
  if (!links.length) return;
  const [row] = await tx<{
    payload: import("./teams/types").ClubRecord;
  }>`select payload from club_state where id='oklahoma-prospects' and not demo for update`;
  if (!row) return;
  let changed = false;
  for (const link of links) {
    const p = row.payload.teams
      .find((t) => t.id === link.team_id)
      ?.roster.find((p) => p.id === link.roster_id);
    if (p && (p.school !== a.school || p.gradYear !== (a.graduation_year?.toString() || ""))) {
      p.school = a.school;
      p.gradYear = a.graduation_year?.toString() || "";
      changed = true;
    }
  }
  if (changed)
    await tx`update club_state set payload=${JSON.stringify(row.payload)}::jsonb,rev=rev+1,updated_at=now() where id='oklahoma-prospects'`;
}

/** Apply only education edits that passed the existing roster merge authorization. */
export async function reconcileRosterEducation(
  tx: Sql,
  userId: string,
  before: import("./teams/types").ClubRecord,
  after: import("./teams/types").ClubRecord,
) {
  const links = await tx<{
    athlete_id: string;
    team_id: string;
    roster_id: string;
  }>`select athlete_id,team_id,roster_id from recruiting_roster_links`;
  const changed = new Map<string, { school: string; year: string }>();
  for (const link of links) {
    const old = before.teams
      .find((t) => t.id === link.team_id)
      ?.roster.find((p) => p.id === link.roster_id);
    const next = after.teams
      .find((t) => t.id === link.team_id)
      ?.roster.find((p) => p.id === link.roster_id);
    if (old && next && (old.school !== next.school || old.gradYear !== next.gradYear)) {
      const prior = changed.get(link.athlete_id);
      if (prior && (prior.school !== next.school || prior.year !== next.gradYear))
        throw new Error(
          "Linked rosters have conflicting education edits. Update one athlete profile at a time.",
        );
      changed.set(link.athlete_id, { school: next.school, year: next.gradYear });
    }
  }
  for (const [id, value] of changed) {
    if (value.year && !/^\d{4}$/.test(value.year))
      throw new Error("Enter a four-digit graduation year or leave it unknown.");
    await tx`update club_athletes set school=${value.school},school_status=case when ${Boolean(value.school)} then 'school' else school_status end,graduation_year=${value.year ? Number(value.year) : null},education_confirmed_at=now(),registration_revision=registration_revision+1 where id=${id}`;
    await tx`insert into athlete_profile_changes(id,athlete_id,actor_id,fields,reason) values(${randomUUID()},${id},${userId},array['school','graduationYear'],'Authorized roster education update')`;
    for (const link of links.filter((l) => l.athlete_id === id)) {
      const player = after.teams
        .find((t) => t.id === link.team_id)
        ?.roster.find((p) => p.id === link.roster_id);
      if (player) {
        player.school = value.school;
        player.gradYear = value.year;
      }
    }
  }
}

export async function reviewEligibilityFor(sql:Sql,userId:string,raw:import('zod').z.infer<typeof import('./athlete-registration-contracts').eligibilityReviewInput>){
 const {eligibilityReviewInput}=await import('./athlete-registration-contracts');const v=eligibilityReviewInput.parse(raw);
 const {secured,authority,audit}=await import('./coordinator/access.server');
 return secured(sql,userId,'staff.eligibility.review',async tx=>{
  await authority(tx,userId,'staff_approvals.review');
  const [r]=await tx<{coordinator_revision:number;status:string;payload:Record<string,string>}>`select coordinator_revision,status,payload from club_requests where id=${v.requestId} and kind in ('tryout','team-inquiry') for update`;
  if(!r||r.coordinator_revision!==v.revision)throw new Error('This registration changed. Refresh before reviewing.');
  if(['accepted','declined','resolved','closed'].includes(r.status))throw new Error('Review an open registration; settled placement history cannot be rewritten.');
  const [profile]=await tx`select request_id from athlete_registration_profiles where request_id=${v.requestId}`;
  if(!profile)throw new Error('The family must complete missing athlete information before eligibility review.');
  await tx`insert into athlete_eligibility_reviews(id,request_id,actor_id,decision,reason,rule_reference,registration_revision) values(${randomUUID()},${v.requestId},${userId},${v.decision},${v.reason},${v.ruleReference},${v.revision})`;
  await tx`update club_requests set coordinator_revision=coordinator_revision+1,payload=payload||${JSON.stringify({eligibilityStatus:v.decision==='approved'?'Reviewed — approved':'Needs review',eligibilityExplanation:`Staff review: ${v.reason} Rule: ${v.ruleReference}. Team placement remains a separate decision.`})}::jsonb where id=${v.requestId}`;
  await audit(tx,userId,'staff.eligibility.review',v.requestId,'allowed',{decision:v.decision,reason:v.reason,rule:v.ruleReference,calculationRule:r.payload.eligibilityRule||'',registrationRevision:v.revision});
  return {ok:true};
 });
}
