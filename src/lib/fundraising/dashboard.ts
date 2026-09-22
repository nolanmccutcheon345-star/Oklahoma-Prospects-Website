import { identity, listPlayers, db, json, fail, AppError, paymentReady } from "./server";
export async function GET(req: Request) {
  try {
    const scope = new URL(req.url).searchParams.get("scope") || "home";
    if (!["home", "my", "office"].includes(scope)) throw new AppError("Invalid view.");
    const { user, admin } = await identity();
    if (scope !== "home" && !user) throw new AppError("Please sign in to view your players.", 401);
    if (scope === "office" && !admin)
      throw new AppError(
        "Office access is restricted to authorized Oklahoma Prospects owners.",
        403,
      );
    const players = await listPlayers(scope as any, user?.userId);
    let contributions: unknown[] = [];
    if (scope !== "home") {
      const stmt = db().prepare(
        `SELECT c.id,c.player_id,p.name AS player_name,p.team,c.donor,c.email,c.amount,c.refunded,c.status,c.created,c.receipt_url FROM fundraising_contributions c JOIN fundraising_players p ON p.id=c.player_id ${scope === "my" ? "WHERE p.owner_id=$1" : ""} ORDER BY c.created DESC LIMIT 200`,
      );
      contributions = (await (scope === "my" ? stmt.bind(user!.userId) : stmt).all()).results;
    }
    return json({
      players,
      contributions,
      user: user ? { name: user.displayName, email: user.email } : null,
      admin,
      paymentReady: paymentReady(),
    });
  } catch (e) {
    return fail(e);
  }
}
