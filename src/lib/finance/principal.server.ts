import type { Sql } from "../db";
import type { FinancialInputs } from "./basis.server";

export type FinancialPrincipal = {
  userId: string;
  email: string;
  name: string;
  currentEmail: string;
  currentName: string;
  role: "admin" | "coach" | "parent" | "player";
  familyId: string;
  familyIds: string[];
  guardianHouseholdIds: string[];
  playerIds: string[];
  owner: boolean;
  admittedAgreementIds?: string[];
  admittedTeamIds?: string[];
};

/** Current security, without resolveIdentity's owner claim or household writes.
 * Call only after lockFinancialExecution, inside the caller's transaction. */
export async function financialPrincipalInTransaction(
  tx: Sql,
  userId: string,
  billing?: FinancialInputs["billing"],
): Promise<FinancialPrincipal> {
  if (typeof window !== "undefined") throw new Error("Financial principal is server-only.");
  await tx.query("lock table organization_operational_access in share mode");
  const [user] = await tx.query<{
    id: string;
    email: string;
    name: string;
  }>(
    `select id,email,name from "user" where id=$1 and "emailVerified"=true and "disabledAt" is null for share`,
    [userId],
  );
  const [restricted] =
    await tx`select user_id from organization_operational_access where user_id=${userId} and financial_restricted=true`;
  if (!user || restricted) throw new Error("Current financial account access is unavailable.");
  const [profile] = await tx<{
    role: string;
    family_id: string;
    name: string;
  }>`select role,family_id,name from profiles where user_id=${userId} for share`;
  const currentEmail = user.email.trim().toLowerCase();
  const [grant] =
    await tx`select user_id from owner_grants where user_id=${userId} and email=${currentEmail} and revoked_at is null for share`;
  const owner = profile?.role === "admin" && Boolean(grant);
  const savedAccount = billing?.accounts.find((a) => a.id === userId);
  const sourceRole = billing ? savedAccount?.role : profile?.role;
  const role = owner
    ? "admin"
    : sourceRole === "coach" || sourceRole === "player"
      ? sourceRole
      : "parent";
  const email = billing ? savedAccount?.email.trim().toLowerCase() || "" : currentEmail;
  let familyIds: string[], guardianHouseholdIds: string[], playerIds: string[];
  if (billing) {
    guardianHouseholdIds = billing.guardians
      .filter((r) => r.user_id === userId)
      .map((r) => r.household_id);
    familyIds = [
      ...new Set([
        ...billing.members.filter((r) => r.user_id === userId).map((r) => r.household_id),
        ...guardianHouseholdIds,
        ...billing.households
          .filter((r) => Boolean(email) && r.primary_email === email)
          .map((r) => r.id),
      ]),
    ];
    playerIds = billing.playerLinks.filter((r) => r.user_id === userId).map((r) => r.player_id);
    // A new account cannot inherit a captured binding by email alone.
    if (!savedAccount || savedAccount.admittedAgreementIds || savedAccount.admittedTeamIds) {
      familyIds = [];
      guardianHouseholdIds = [];
      playerIds = [];
    }
  } else {
    guardianHouseholdIds = (
      await tx<{
        household_id: string;
      }>`select household_id from person_guardian_links where user_id=${userId}`
    ).map((r) => r.household_id);
    familyIds = [
      ...new Set([
        ...(
          await tx<{
            household_id: string;
          }>`select household_id from household_members where user_id=${userId}`
        ).map((r) => r.household_id),
        ...guardianHouseholdIds,
        ...(
          await tx<{
            id: string;
          }>`select id from club_households where primary_email=${currentEmail}`
        ).map((r) => r.id),
      ]),
    ];
    playerIds = (
      await tx<{
        player_id: string;
      }>`select player_id from person_player_links where user_id=${userId}`
    ).map((r) => r.player_id);
  }
  return {
    userId,
    email,
    name: savedAccount?.profileName || savedAccount?.name || profile?.name || user.name,
    currentEmail,
    currentName: user.name,
    role,
    owner,
    familyId: profile?.family_id || "fam-" + userId,
    familyIds,
    guardianHouseholdIds,
    playerIds,
    ...(savedAccount?.admittedAgreementIds
      ? { admittedAgreementIds: [...savedAccount.admittedAgreementIds] }
      : {}),
    ...(savedAccount?.admittedTeamIds
      ? { admittedTeamIds: [...savedAccount.admittedTeamIds] }
      : {}),
  };
}
