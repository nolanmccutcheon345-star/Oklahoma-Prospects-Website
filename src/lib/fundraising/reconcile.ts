import { body, requireAdmin, db, json, fail, paymentReady, AppError, rateLimit } from "./server";
import { syncContribution } from "./square";
export async function POST(req: Request) {
  try {
    await body(req);
    const { user } = await requireAdmin();
    if (!paymentReady()) throw new AppError("Connect Square before checking payments.", 503);
    await rateLimit("reconcile:" + user.userId, 2, 60);
    const rows = await db()
      .prepare(
        "SELECT id FROM fundraising_contributions WHERE order_id IS NOT NULL ORDER BY COALESCE(checked,created) ASC LIMIT 50",
      )
      .all<{ id: string }>();
    let checked = 0,
      errors = 0;
    for (const row of rows.results) {
      try {
        await syncContribution(row.id);
        checked++;
      } catch {
        errors++;
      }
    }
    return json({ checked, errors });
  } catch (e) {
    return fail(e);
  }
}
