export const OWNER_EMAILS = [
  "stevemccutcheon89@gmail.com",
  "nolanmccutcheon@icloud.com",
  "oklahomaprospectsbaseball@gmail.com",
] as const;

export const STAFF_EMAILS = ["lane@prospectsbaseball.club"] as const;

function norm(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase();
}

export function isOwnerEmail(email: string | null | undefined) {
  return OWNER_EMAILS.includes(norm(email) as (typeof OWNER_EMAILS)[number]);
}

export function isStaffEmail(email: string | null | undefined) {
  const value = norm(email);
  return isOwnerEmail(value) || STAFF_EMAILS.includes(value as (typeof STAFF_EMAILS)[number]);
}