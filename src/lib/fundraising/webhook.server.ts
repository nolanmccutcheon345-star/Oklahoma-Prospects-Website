import { squareWebhook } from "../commerce/square-webhook.server";
import { square, syncPayment } from "./square";
/** The existing handler verifies the original signature and merchant first.
 * A failed fundraising update returns 503 so Square retries both ledgers safely.
 */
export async function fundraisingSquareWebhook(request: Request) {
  const copy = request.clone();
  const response = await squareWebhook(request);
  if (response.status !== 200 || process.env.FUNDRAISING_LEDGER_ENABLED !== "true") return response;
  try {
    const event = await copy.json();
    if (["payment.created", "payment.updated"].includes(event.type))
      await syncPayment(event.data.id);
    else if (["refund.created", "refund.updated"].includes(event.type)) {
      const { refund } = await square("/refunds/" + encodeURIComponent(event.data.id));
      if (refund?.id !== event.data.id) throw new Error("Refund identity mismatch");
      if (refund.payment_id) await syncPayment(refund.payment_id);
    }
    return response;
  } catch {
    return new Response("Fundraising update pending; retry", { status: 503 });
  }
}
