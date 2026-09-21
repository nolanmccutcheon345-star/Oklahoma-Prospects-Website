import {
  body,
  requireUser,
  playerInput,
  db,
  json,
  fail,
  AppError,
  publicPlayer,
  paymentReady,
} from "./server";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const player = await publicPlayer(id);
    if (!player)
      throw new AppError(
        "This player page is not available yet. It may be awaiting approval or paused.",
        404,
      );
    return json({ player, paymentReady: paymentReady() });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await body(req);
    const { user, admin } = await requireUser();
    const p = await db()
      .prepare("SELECT * FROM fundraising_players WHERE id=$1")
      .bind(id)
      .first<any>();
    if (!p) throw new AppError("Player not found.", 404);
    if (!admin && p.owner_id !== user.userId)
      throw new AppError("You cannot edit this player.", 403);
    if (b.action === "share") {
      await db()
        .prepare("UPDATE fundraising_players SET shares=shares+1 WHERE id=$1")
        .bind(id)
        .run();
    } else if (b.action === "approve" || b.action === "pause" || b.action === "resume") {
      if (!admin) throw new AppError("Only Prospects owners can approve or pause pages.", 403);
      await db()
        .prepare(
          b.action === "approve"
            ? "UPDATE fundraising_players SET approved=1 WHERE id=$1"
            : "UPDATE fundraising_players SET active=$1 WHERE id=$2",
        )
        .bind(...(b.action === "approve" ? [id] : [b.action === "resume" ? 1 : 0, id]))
        .run();
    } else {
      const v = playerInput(b);
      await db()
        .prepare(
          "UPDATE fundraising_players SET name=$1,team=$2,number=$3,goal=$4,story=$5,approved=$6 WHERE id=$7",
        )
        .bind(v.name, v.team, v.number, v.goal, v.story, admin ? 1 : 0, id)
        .run();
    }
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
