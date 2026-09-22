import { body, requireAdmin, db, json, fail, paymentReady, AppError, rateLimit } from "./server";
import { syncContribution } from "./square";
export async function reconcileContributions(deps = { db, syncContribution }) {
  const rows = await deps
    .db()
    .prepare(
      "SELECT id FROM fundraising_contributions WHERE order_id IS NOT NULL ORDER BY COALESCE(checked,created) ASC,id ASC LIMIT 50",
    )
    .all<{ id: string }>();
  let checked = 0,
    errors = 0;
  for (const row of rows.results) {
    // Advance every attempted checkout, including unpaid orders and provider errors.
    // Otherwise the same oldest 50 rows can permanently hide newer payments.
    await deps
      .db()
      .prepare("UPDATE fundraising_contributions SET checked=$1 WHERE id=$2")
      .bind(new Date().toISOString(), row.id)
      .run();
    try {
      await deps.syncContribution(row.id);
      checked++;
    } catch {
      errors++;
    }
  }
  return { checked, errors };
}
export async function POST(req: Request) {
  try {
    await body(req);
    const { user } = await requireAdmin();
    if (!paymentReady()) throw new AppError("Connect Square before checking payments.", 503);
    await rateLimit("reconcile:" + user.userId, 2, 60);
    return json(await reconcileContributions());
  } catch (e) {
    return fail(e);
  }
}
