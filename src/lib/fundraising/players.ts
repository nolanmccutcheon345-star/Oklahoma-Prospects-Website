import { body, requireUser, playerInput, db, json, fail, rateLimit, AppError } from "./server";
export async function POST(req: Request) {
  try {
    const b = await body(req);
    const { user, admin } = await requireUser();
    if (user.role === "player")
      throw new AppError("A parent or guardian must create this page.", 403);
    await rateLimit("create:" + user.userId, 15, 3600);
    const p = playerInput(b);
    const id = crypto.randomUUID();
    await db()
      .prepare(
        "INSERT INTO fundraising_players(id,owner_id,parent_email,name,team,number,goal,story,approved,active,shares,created) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,0,$10)",
      )
      .bind(
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
      )
      .run();
    return json({ id, approved: admin }, 201);
  } catch (e) {
    return fail(e);
  }
}
