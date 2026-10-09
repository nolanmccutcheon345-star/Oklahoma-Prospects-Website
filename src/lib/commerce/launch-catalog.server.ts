import type { SquareClient } from 'square';
import type { Sql } from '../db';
import type { SquareSettings } from './square-config';
import { prepareMonthlyPlans } from './square-plans.server';

const membershipEvents = ['payment.updated','refund.updated','subscription.updated','invoice.payment_made',
  'invoice.scheduled_charge_failed','dispute.created','card.automatically_updated'];

/** Owner-authorized launch setup. No customers, cards, payments or subscriptions are created. */
export async function prepareLaunchCatalog(sql:Sql,client:SquareClient,c:SquareSettings,configured:(id:string)=>string|undefined) {
  const subscriptions=await client.webhooks.subscriptions.list({includeDisabled:true});
  let verified=false;
  for await (const listed of subscriptions) {
    if(listed.notificationUrl!==c.webhookUrl||!listed.id)continue;
    let {subscription}=await client.webhooks.subscriptions.get({subscriptionId:listed.id});
    if(!subscription?.enabled||subscription.signatureKey!==c.signatureKey||subscription.notificationUrl!==c.webhookUrl)
      throw new Error('Membership webhook settings do not match this site. No payment has been taken.');
    if(membershipEvents.some(type=>!subscription!.eventTypes?.includes(type))) {
      await client.webhooks.subscriptions.update({subscriptionId:listed.id,subscription:{eventTypes:[...new Set([...(subscription.eventTypes||[]),...membershipEvents])]}});
      ({subscription}=await client.webhooks.subscriptions.get({subscriptionId:listed.id}));
    }
    if(!subscription?.enabled||subscription.signatureKey!==c.signatureKey||subscription.notificationUrl!==c.webhookUrl||membershipEvents.some(type=>!subscription!.eventTypes?.includes(type)))
      throw new Error('Membership webhook setup could not be verified. No payment has been taken.');
    verified=true;break;
  }
  if(!verified)throw new Error('No webhook matches this site. No payment has been taken.');
  return prepareMonthlyPlans(sql,client,c,'owner-full-catalog-launch-2026-10-09',configured);
}
