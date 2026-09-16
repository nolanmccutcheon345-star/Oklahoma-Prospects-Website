/** Server-only owner policy. Approved grants are persisted by migration. */
export async function isOwnerEmail(email: string | null | undefined) {
  const { getSql } = await import('./db');
  const sql = await getSql();
  const rows = await sql.query("select email from owner_grants where email=$1 and revoked_at is null",[(email || '').trim().toLowerCase()]);
  return rows.length > 0;
}
