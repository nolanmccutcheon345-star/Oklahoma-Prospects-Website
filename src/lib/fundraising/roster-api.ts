import { getSql } from "../db";
import { json, fail, requireUser, paymentReady } from "./server";
import { rosterChoicesFor, publicRoster } from "./roster-links";
export async function GET(req: Request) {
  try {
    const url = new URL(req.url),
      sql = await getSql();
    if (url.searchParams.get("scope") === "my") {
      const { user } = await requireUser();
      return json({ choices: await rosterChoicesFor(sql, user.userId) });
    }
    return json({
      ...(await publicRoster(
        sql,
        url.searchParams.get("teamId") || undefined,
        url.searchParams.get("rosterPlayerId") || undefined,
      )),
      paymentReady: paymentReady(),
    });
  } catch (e) {
    return fail(e);
  }
}
