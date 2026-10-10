import { getSql, type Sql } from "./db";
import { randomUUID } from "node:crypto";
import type { ClubRole } from "./club-data";

export async function clubIdentity(userId: string) {
  return resolveIdentity(await getSql(), userId);
}
export async function resolveIdentity(sql: Sql, userId: string) {
  const [user] = await sql.query<{
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    disabledAt: Date | null;
  }>('select id,email,name,"emailVerified","disabledAt" from "user" where id=$1', [userId]);
  if (!user || user.disabledAt) throw new Error("Unauthorized");
  if (!user.emailVerified)
    throw new Error("Verify your email before opening your household records.");
  const email = user.email.trim().toLowerCase();
  // A migration authorizes exactly two owner emails. Claim once, only after verification.
  await sql.transaction(async (tx) => {
    const claimed = await tx.query(
      "update owner_grants set user_id=$1 where email=$2 and user_id is null and revoked_at is null returning email",
      [userId, email],
    );
    if (claimed.length)
      await tx.query(
        "insert into profiles(user_id,name,email,role,family_id) values($1,$2,$3,'admin',$4) on conflict(user_id) do update set role='admin'",
        [userId, user.name, email, "fam-" + userId],
      );
  });
  const [profile] = await sql.query<{
    role: string;
    family_id: string;
    player_name: string;
    name: string;
  }>("select role,family_id,player_name,name from profiles where user_id=$1", [userId]);
  let role: ClubRole =
    profile?.role === "coach" || profile?.role === "player" ? profile.role : "parent";
  if (profile?.role === "admin") {
    const grants = await sql.query(
      "select email from owner_grants where user_id=$1 and email=$2 and revoked_at is null",
      [userId, email],
    );
    if (grants.length) role = "admin";
  }
  await sql.transaction(async (tx) => {
    await tx`insert into club_households(id,primary_email) values(${"fam-" + randomUUID()},${email}) on conflict(primary_email) do nothing`;
    await tx`insert into household_members(household_id,user_id) select id,${userId} from club_households where primary_email=${email} on conflict do nothing`;
  });
  const [person] = await sql<{
    instructor: boolean;
  }>`select instructor from person_profiles where user_id=${userId}`;
  const [staffAssignment] = await sql<{
    assigned: boolean;
  }>`select exists(select 1 from club_staff s join club_staff_services o on o.staff_id=s.id where s.active=true and (s.user_id=${userId} or (s.user_id='' and lower(trim(s.email))=${email}))) as assigned`;
  const canInstruct = person?.instructor ?? Boolean(staffAssignment?.assigned);
  const [teamRecord] = await sql<{
    payload: { teams?: { closed?: boolean; coachEmail?: string; staff?: { email?: string }[] }[] };
    demo: boolean;
  }>`select payload,demo from club_state where id='oklahoma-prospects'`;
  const teamPayload =
    typeof teamRecord?.payload === "string" ? JSON.parse(teamRecord.payload) : teamRecord?.payload;
  const canTeamCoach = Boolean(
    teamRecord &&
    !teamRecord.demo &&
    teamPayload?.teams?.some(
      (t: { closed?: boolean; coachEmail?: string; staff?: { email?: string }[] }) =>
        !t.closed &&
        (t.coachEmail?.trim().toLowerCase() === email ||
          t.staff?.some((s) => s.email?.trim().toLowerCase() === email)),
    ),
  );
  const guardians = await sql<{
    id: string;
    primary_email: string;
  }>`select h.id,h.primary_email from club_households h join person_guardian_links g on g.household_id=h.id where g.user_id=${userId}`;
  const playerLinks = await sql<{
    player_id: string;
  }>`select player_id from person_player_links where user_id=${userId}`;
  const homes = await sql<{
    id: string;
    primary_email: string;
  }>`select h.id,h.primary_email from club_households h join household_members m on m.household_id=h.id where m.user_id=${userId}`;
  const linkedHomes = [...new Map([...homes, ...guardians].map((h) => [h.id, h])).values()];
  const familyIds = linkedHomes.map((h) => h.id),
    householdEmails = (role === "player" ? guardians : linkedHomes).map((h) => h.primary_email);
  const members = await sql<{
    user_id: string;
  }>`select distinct user_id from household_members where household_id=any(${familyIds}::text[])`;
  const householdUserIds =
    role === "player" ? [userId] : [...new Set([userId, ...members.map((m) => m.user_id)])];
  const billingHouseholdIds =
    role === "player"
      ? [
          ...new Set([
            ...homes.filter((h) => h.primary_email === email).map((h) => h.id),
            ...guardians.map((h) => h.id),
          ]),
        ]
      : familyIds;
  return {
    canInstruct,
    canTeamCoach,
    playerIds: playerLinks.map((p) => p.player_id),
    guardianHouseholdIds: guardians.map((g) => g.id),
    userId,
    email,
    familyIds,
    householdEmails,
    householdUserIds,
    billingHouseholdIds,
    name: profile?.name || user.name,
    role,
    familyId: profile?.family_id || "fam-" + userId,
    playerName: profile?.player_name || "",
  };
}
