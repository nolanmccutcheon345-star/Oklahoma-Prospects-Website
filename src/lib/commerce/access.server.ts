import { getSql, type Sql } from "../db";
import { resolveIdentity } from "../identity.server";

export function assertCommerceRole(identity: { role: string; guardianHouseholdIds?:string[] }) {
  if (!["parent", "coach", "admin"].includes(identity.role) && !(identity.role === "player" && identity.guardianHouseholdIds?.length))
    throw new Error(
      "Player accounts cannot book or access payments. Use a parent or guardian account.",
    );
}
export async function commerceIdentityFor(sql: Sql, userId: string) {
  const identity = await resolveIdentity(sql, userId);
  assertCommerceRole(identity);
  return {...identity,role:identity.role==='player'&&identity.guardianHouseholdIds.length?'parent' as const:identity.role};
}
export async function commerceIdentity(userId: string) {
  return commerceIdentityFor(await getSql(), userId);
}
