import { getSql } from "./db";
import { isOwnerEmail, isStaffEmail } from "./owners";
import type { ClubRole } from "./club-data";

/** Email ownership is verified by Better Auth, never by a profile form. */
export async function clubIdentity(userId: string) {
  const sql = await getSql();
  const [user] = await sql<{ id: string; email: string; name: string; emailVerified: boolean }>`
    select id, email, name, "emailVerified" from "user" where id = ${userId}
  `;
  if (!user) throw new Error("Unauthorized");
  if (!user.emailVerified) throw new Error("Verify your email before opening your household records.");
  const email = user.email.trim().toLowerCase();
  const [profile] = await sql<{ role: string; family_id: string; player_name: string; name: string }>`
    select role, family_id, player_name, name from profiles where user_id = ${userId}
  `;
  const role: ClubRole = isOwnerEmail(email) ? "admin" : isStaffEmail(email) ? "coach"
    : profile?.role === "admin" || profile?.role === "coach" || profile?.role === "player" ? profile.role : "parent";
  return { userId, email, name: profile?.name || user.name, role,
    familyId: profile?.family_id || `fam-${userId}`, playerName: profile?.player_name || "" };
}
