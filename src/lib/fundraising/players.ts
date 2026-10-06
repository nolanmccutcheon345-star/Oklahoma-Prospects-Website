import { getSql } from "../db";
import { recordConsent } from "./publication";
import { body, requireUser, playerInput, json, fail, rateLimit, AppError } from "./server";
export async function POST(req: Request) {
  try {
    const b = await body(req);
    const { user, admin } = await requireUser();
    if (user.role === "player")
      throw new AppError("A parent or guardian must create this page.", 403);
    await rateLimit("create:" + user.userId, 15, 3600);
    const p = playerInput(b);
    const id = crypto.randomUUID();
    await (
      await getSql()
    ).transaction(async (tx) => {
      await tx.query(
        "INSERT INTO fundraising_players(id,owner_id,parent_email,name,team,number,goal,story,approved,active,shares,created) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,0,$10)",
        [
          id,
          user.userId,
          user.email,
          p.name,
          p.team,
          p.number,
          p.goal,
          p.story,
          admin ? 1 : 0,
          new Date().toISOString(),
        ],
      );
      await recordConsent(tx, id, user.userId, "accept");
    });
    return json({ id, approved: admin }, 201);
  } catch (e) {
    return fail(e);
  }
}
