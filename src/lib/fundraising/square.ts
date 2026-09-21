import { validatePayment } from "./payment-validation";
import { config, db, AppError } from "./server";
export async function square(path: string, method = "GET", payload?: unknown) {
  const c = config();
  if (!c.SQUARE_ACCESS_TOKEN || !["production", "sandbox"].includes(c.SQUARE_ENVIRONMENT))
    throw new AppError("Online sponsorships are not open yet.", 503);
  const host =
    c.SQUARE_ENVIRONMENT === "sandbox"
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";
  const res = await fetch(host + "/v2" + path, {
    method,
    headers: {
      Authorization: "Bearer " + c.SQUARE_ACCESS_TOKEN,
      "Square-Version": "2026-09-16",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!res.ok)
    throw new AppError(
      "Square is temporarily unavailable. Please try again; no sponsorship has been confirmed.",
      503,
    );
  return res.json() as Promise<any>;
}
export async function syncPayment(paymentId: string) {
  const { payment: p } = await square("/payments/" + encodeURIComponent(paymentId));
  if (!p?.order_id) return;
  if (p.id !== paymentId) throw new AppError("Payment identity mismatch.", 409);
  const row = await db()
    .prepare("SELECT * FROM fundraising_contributions WHERE order_id=$1")
    .bind(p.order_id)
    .first<any>();
  if (!row) return;
  const checked = validatePayment(p, row, config().SQUARE_LOCATION_ID);
  const receipt =
    typeof p.receipt_url === "string" &&
    /^https:\/\/(squareup\.com|squareupsandbox\.com)\//.test(p.receipt_url)
      ? p.receipt_url
      : null;
  await db()
    .prepare(
      "UPDATE fundraising_contributions SET status=CASE WHEN status='completed' THEN status ELSE $1 END,refunded=GREATEST(refunded,$2),payment_id=$3,receipt_url=$4,checked=$5 WHERE id=$6 AND (payment_id IS NULL OR payment_id=$7)",
    )
    .bind(checked.status, checked.refunded, p.id, receipt, new Date().toISOString(), row.id, p.id)
    .run();
}
export async function syncContribution(id: string) {
  const row = await db()
    .prepare("SELECT * FROM fundraising_contributions WHERE id=$1")
    .bind(id)
    .first<any>();
  if (!row) return null;
  if (row.payment_id) await syncPayment(row.payment_id);
  else if (row.order_id) {
    const { order } = await square("/orders/" + encodeURIComponent(row.order_id));
    if (
      order?.id !== row.order_id ||
      order?.reference_id !== row.id ||
      order?.location_id !== config().SQUARE_LOCATION_ID
    )
      throw new AppError("Order verification failed.", 409);
    for (const t of order.tenders || []) if (t.payment_id) await syncPayment(t.payment_id);
  }
  return db()
    .prepare(
      "SELECT id,player_id,amount,refunded,status,receipt_url FROM fundraising_contributions WHERE id=$1",
    )
    .bind(id)
    .first();
}
