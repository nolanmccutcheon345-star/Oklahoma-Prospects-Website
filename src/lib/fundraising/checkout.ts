import { validCheckoutUrl } from "./payment-validation";
import {
  body,
  db,
  json,
  fail,
  AppError,
  amount,
  text,
  publicPlayer,
  paymentReady,
  config,
  rateLimit,
} from "./server";
import { square } from "./square";
export async function POST(req: Request) {
  try {
    const b = await body(req);
    if (!paymentReady())
      throw new AppError(
        "Online sponsorships are not open yet. Prospects is finishing the Square connection.",
        503,
      );
    const cents = amount(b.amount, 500, 1000000);
    const donor = text(b.donor, 80);
    const email = text(b.email, 150);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new AppError("Enter a valid email address.");
    const id = text(b.id, 36);
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new AppError("Refresh the page before trying again.");
    const player = await publicPlayer(text(b.playerId, 36));
    if (!player) throw new AppError("This player fundraiser is not accepting sponsorships.", 404);
    await rateLimit(
      "checkout:" + (req.headers.get("x-nf-client-connection-ip") || "unknown"),
      30,
      600,
    );
    const c = config();
    const { location } = await square("/locations/" + encodeURIComponent(c.SQUARE_LOCATION_ID));
    if (
      location?.merchant_id !== c.SQUARE_MERCHANT_ID ||
      location?.status !== "ACTIVE" ||
      location?.currency !== "USD"
    )
      throw new AppError("The Prospects payment account needs verification.", 503);
    await db()
      .prepare(
        "INSERT INTO fundraising_contributions(id,player_id,donor,email,amount,status,refunded,created) VALUES($1,$2,$3,$4,$5,'pending',0,$6) ON CONFLICT DO NOTHING",
      )
      .bind(id, player.id, donor, email, cents, new Date().toISOString())
      .run();
    const existing = await db()
      .prepare("SELECT * FROM fundraising_contributions WHERE id=$1")
      .bind(id)
      .first<any>();
    if (
      existing.player_id !== player.id ||
      existing.amount !== cents ||
      existing.email !== email ||
      existing.donor !== donor
    )
      throw new AppError(
        "This checkout already has different details. Refresh to start a new sponsorship.",
        409,
      );
    if (existing.status === "completed")
      throw new AppError("This sponsorship has already been paid.", 409);
    if (existing.checkout_url) return json({ url: existing.checkout_url });
    const result = await square("/online-checkout/payment-links", "POST", {
      idempotency_key: id,
      order: {
        location_id: c.SQUARE_LOCATION_ID,
        reference_id: id,
        line_items: [
          {
            name: `Sponsor ${player.name} • Oklahoma Prospects ${player.team}`,
            quantity: "1",
            base_price_money: { amount: cents, currency: "USD" },
          },
        ],
      },
      checkout_options: {
        allow_tipping: false,
        ask_for_shipping_address: false,
        redirect_url: c.SITE_ORIGIN.replace(/\/$/, "") + "/fundraising/thank-you?id=" + id,
      },
      pre_populated_data: { buyer_email: email },
      payment_note: `Prospects fundraiser ${id}; player ${player.id}`,
    });
    const link = result.payment_link;
    if (!link?.order_id || !validCheckoutUrl(link.url, c.SQUARE_ENVIRONMENT))
      throw new AppError("Square could not open a verified checkout.", 503);
    await db()
      .prepare("UPDATE fundraising_contributions SET order_id=$1,checkout_url=$2 WHERE id=$3")
      .bind(link.order_id, link.url, id)
      .run();
    return json({ url: link.url });
  } catch (e) {
    return fail(e);
  }
}
