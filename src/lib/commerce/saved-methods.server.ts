import { getSql } from "../db";
import { commerceIdentity } from "./access.server";
import { ownedSubscription } from "./square-management.server";
import { squareClient, squareConfig } from "./square.server";
import { assertPaymentRequest } from "./square-payments.server";
export async function savedMethods(userId: string) {
  const me = await commerceIdentity(userId),
    sql = await getSql();
  return sql<{
    subscription_id: string;
    primary_display: { brand: string; last4: string } | null;
    backup_display: { brand: string; last4: string } | null;
  }>`select p.subscription_id,p.primary_display,p.backup_display from customer_payment_preferences p join club_subscriptions s on s.id=p.subscription_id where s.household_id=any(${me.billingHouseholdIds}::text[])`;
}
export async function activateBackup(userId: string, id: string) {
  assertPaymentRequest();
  const { rateLimit } = await import("./checkout.server");
  await rateLimit("activate-backup", 8);
  const { sub, sql } = await ownedSubscription(userId, id, true),
    client = squareClient();
  const [pref] =
    await sql<any>`select * from customer_payment_preferences where subscription_id=${id}`;
  if (!pref?.backup_card_id) throw Error("No backup card has been saved.");
  const { card } = await client.cards.get({ cardId: pref.backup_card_id });
  const { subscription } = await client.subscriptions.get({ subscriptionId: id });
  if (
    !card?.enabled ||
    card.customerId !== sub.customer_id ||
    subscription?.customerId !== sub.customer_id ||
    subscription.locationId !== squareConfig().locationId
  )
    throw Error("Backup card could not be verified for this membership.");
  await client.subscriptions.update({
    subscriptionId: id,
    subscription: { version: subscription.version, cardId: card.id },
  });
  await sql.transaction(async (tx) => {
    await tx`select set_config('app.actor_id',${userId},true)`;
    await tx`update commerce_orders set square_card_id=${card.id!} where subscription_id=${id}`;
    await tx`update customer_payment_preferences set primary_card_id=${card.id!},primary_display=${JSON.stringify({ brand: card.cardBrand || "Card", last4: card.last4 || "" })}::jsonb,backup_card_id=case when backup_card_id=${pref.backup_card_id} then null else backup_card_id end,backup_display=case when backup_card_id=${pref.backup_card_id} then null else backup_display end,authorized_by=${userId},authorized_at=now(),consent_text='Customer explicitly made backup card primary for Square renewal billing',updated_at=now() where subscription_id=${id}`;
  });
  return { ok: true };
}
