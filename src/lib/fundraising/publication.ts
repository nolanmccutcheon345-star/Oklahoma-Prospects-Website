import type { Sql } from "../db";
export const consentVersion = "player-publication-v1";
export const publicationGate = `p.approved=1 AND p.active=1 AND EXISTS (SELECT 1 FROM fundraising_publication_consent pc WHERE pc.player_id=p.id AND pc.actor_id=p.owner_id AND pc.revoked_at IS NULL)`;
export function publicFields(p: Record<string, unknown>) {
  return {
    id: p.id,
    name: p.name,
    team: p.team,
    goal: p.goal,
    story: p.story,
    raised: p.raised,
    sponsors: p.sponsors,
  };
}
/** Run with the player's mutation in the same transaction. Only its owner can accept. */
export async function recordConsent(
  sql: Sql,
  playerId: string,
  actorId: string,
  action: "accept" | "withdraw" | "invalidate",
) {
  if (action === "withdraw") {
    const rows = await sql.query("SELECT id FROM fundraising_players WHERE id=$1 AND owner_id=$2", [
      playerId,
      actorId,
    ]);
    if (!rows.length) throw new Error("Only the page owner can withdraw consent.");
  }
  if (action === "accept") {
    const rows = await sql.query(
      `INSERT INTO fundraising_publication_consent(player_id,actor_id,accepted_at,revoked_at,version)
      SELECT id,$2,now(),NULL,$3 FROM fundraising_players WHERE id=$1 AND owner_id=$2
      ON CONFLICT(player_id) DO UPDATE SET actor_id=excluded.actor_id,accepted_at=excluded.accepted_at,revoked_at=NULL,version=excluded.version RETURNING player_id`,
      [playerId, actorId, consentVersion],
    );
    if (!rows.length) throw new Error("Only the page owner can confirm publication consent.");
  } else {
    await sql.query(
      "UPDATE fundraising_publication_consent SET revoked_at=now() WHERE player_id=$1",
      [playerId],
    );
  }
  await sql.query(
    "INSERT INTO fundraising_consent_events(player_id,actor_id,action,version) VALUES($1,$2,$3,$4)",
    [playerId, actorId, action, consentVersion],
  );
}

const projection = `p.id,p.name,p.team,p.number,p.goal,p.story,p.approved,p.active,COALESCE(SUM(CASE WHEN c.status='completed' THEN GREATEST(0,c.amount-c.refunded) ELSE 0 END),0) AS raised,COUNT(CASE WHEN c.status='completed' AND c.amount>c.refunded THEN 1 END) AS sponsors`;
export async function publicationPlayers(
  sql: Sql,
  scope: "home" | "my" | "office",
  userId?: string,
): Promise<Record<string, unknown>[]> {
  const where = scope === "home" ? publicationGate : scope === "my" ? "p.owner_id=$1" : "1=1";
  const fields =
    scope === "home"
      ? ""
      : `,p.parent_email,p.shares,p.created,p.team_id,p.roster_player_id,(${publicationGate}) AS publication_allowed`;
  const rows = await sql.query(
    `SELECT ${projection}${fields} FROM fundraising_players p LEFT JOIN fundraising_contributions c ON c.player_id=p.id WHERE ${where} GROUP BY p.id ORDER BY p.created DESC`,
    scope === "my" ? [userId] : [],
  );
  return scope === "home" ? rows.map(publicFields) : rows;
}
export async function publishedPlayer(sql: Sql, id: string) {
  const [row] = await sql.query(
    `SELECT ${projection} FROM fundraising_players p LEFT JOIN fundraising_contributions c ON c.player_id=p.id WHERE p.id=$1 AND ${publicationGate} GROUP BY p.id`,
    [id],
  );
  return row ? publicFields(row) : null;
}
