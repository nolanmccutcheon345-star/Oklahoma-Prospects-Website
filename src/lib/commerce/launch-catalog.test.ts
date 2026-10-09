import test from 'node:test';
import assert from 'node:assert/strict';
import type {SquareClient} from 'square';
import type {Sql} from '../db';
import {PRICES} from '../pricing';
import {prepareLaunchCatalog} from './launch-catalog.server';
import {resolveSquareConfig,type SquareSettings} from './square-config';

test('owner launch opens full catalog only with isolated valid production credentials',()=>{
  const env={CONTEXT:'production',SQUARE_ENVIRONMENT:'production',SQUARE_LIVE_ENABLED:'true',
    SQUARE_CHECKOUT_SCOPE:'cages',SQUARE_OWNER_FULL_CATALOG_LAUNCH:'true',APP_BASE_URL:'https://site.example',
    SQUARE_PRODUCTION_APPLICATION_ID:'sq0idp-fixture',SQUARE_PRODUCTION_LOCATION_ID:'location',SQUARE_PRODUCTION_MERCHANT_ID:'merchant',
    SQUARE_PRODUCTION_ACCESS_TOKEN:'offline-fixture',SQUARE_PRODUCTION_WEBHOOK_SIGNATURE_KEY:'signature',SQUARE_PRODUCTION_WEBHOOK_URL:'https://site.example/api/square/webhook'};
  assert.equal(resolveSquareConfig(env)?.checkoutScope,'all');
  assert.equal(resolveSquareConfig({...env,CONTEXT:'deploy-preview'}),null);
  assert.equal(resolveSquareConfig({...env,SQUARE_PRODUCTION_ACCESS_TOKEN:''}),null);
  assert.equal(resolveSquareConfig({...env,SQUARE_OWNER_FULL_CATALOG_LAUNCH:'false'}),null);
  assert.equal(resolveSquareConfig({...env,SQUARE_LIVE_ENABLED:'false'}),null);
});
test('launch verifies webhook identity, preserves existing events and validates each monthly price',async()=>{
  const c={environment:'production',checkoutScope:'all',applicationId:'app',locationId:'location',merchantId:'merchant',token:'offline',signatureKey:'signature',webhookUrl:'https://site.example/api/square/webhook',origin:'https://site.example'} as SquareSettings;
  let events=['payment.updated','existing.event'],updates=0,reads=0,signature='signature';
  const sql=(async()=>[]) as unknown as Sql;
  const client={webhooks:{subscriptions:{list:async function*(){yield {id:'hook',notificationUrl:c.webhookUrl};},get:async()=>({subscription:{enabled:true,signatureKey:signature,notificationUrl:c.webhookUrl,eventTypes:events}}),update:async({subscription}:{subscription:{eventTypes:string[]}})=>{updates++;events=subscription.eventTypes;}}},
    locations:{get:async()=>({location:{merchantId:'merchant',status:'ACTIVE',currency:'USD',timezone:'America/Chicago',capabilities:['CREDIT_CARD_PROCESSING']}})},
    catalog:{object:{get:async({objectId}:{objectId:string})=>{reads++;return {object:{type:'SUBSCRIPTION_PLAN_VARIATION',subscriptionPlanVariationData:{phases:[{cadence:'MONTHLY',pricing:{type:'STATIC',priceMoney:{currency:'USD',amount:BigInt(PRICES[objectId as keyof typeof PRICES])}}}]}}};}}}} as unknown as SquareClient;
  const result=await prepareLaunchCatalog(sql,client,c,id=>id);
  assert.equal(result.filter(r=>r.ready).length,8);assert.equal(updates,1);assert.equal(reads,8);
  assert.ok(events.includes('existing.event'));assert.ok(events.includes('subscription.updated'));assert.ok(events.includes('invoice.payment_made'));
  await prepareLaunchCatalog(sql,client,c,id=>id);assert.equal(updates,1);
  signature='wrong';await assert.rejects(prepareLaunchCatalog(sql,client,c,id=>id),/do not match/);
  assert.equal(updates,1);assert.equal(reads,16);
});
