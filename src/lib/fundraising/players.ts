import { withActiveRosterChoice } from "./roster-links";
import { getSql } from "../db";
import { recordConsent } from "./publication";
import { body, requireUser, playerInput, json, fail, rateLimit, AppError } from "./server";
export async function POST(req: Request) {
  try {
    const b = await body(req);
    const { user } = await requireUser();
    if (user.role === "player")
      throw new AppError("A parent or guardian must create this page.", 403);
    await rateLimit("create:" + user.userId, 15, 3600);
    const sql = await getSql();
    const id = crypto.randomUUID();
    const approved = await withActiveRosterChoice(sql, user.userId, b.teamId, b.rosterPlayerId, async (tx, choice) => {
      const p = playerInput({ ...b, team: choice.teamName });
      await tx.query(
        "INSERT INTO fundraising_players(id,owner_id,parent_email,name,team,number,goal,story,approved,active,shares,created,team_id,roster_player_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,0,$10,$11,$12)",
        [
          id,
          user.userId,
          user.email,
          p.name,
          p.team,
          p.number,
          p.goal,
          p.story,
          choice.admin ? 1 : 0,
          new Date().toISOString(),
          choice.teamId,
          choice.rosterPlayerId,
        ],
      );
      await recordConsent(tx, id, user.userId, "accept");
      return choice.admin;
    });
    return json({ id, approved }, 201);
  } catch (e) {
    return fail(e);
  }
}
