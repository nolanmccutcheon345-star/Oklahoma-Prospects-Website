import test from 'node:test';
import assert from 'node:assert/strict';
import redirect from '../netlify/edge-functions/canonical-domain.js';
import {resolveSquareConfig} from '../src/lib/commerce/square-config.ts';

test('legacy visitor redirects preserve path and query without redirecting provider callbacks',()=>{
  for(const host of ['prospectsbaseball.club','www.prospectsbaseball.club','www.prospectssports.club']) {
    const result=redirect(new Request(`https://${host}/pay?kind=lesson&service=s1`));
    assert.equal(result.status,301);
    assert.equal(result.headers.get('location'),'https://prospectssports.club/pay?kind=lesson&service=s1');
  }
  for(const path of ['/api/square/webhook','/api/auth/verify-email?token=example','/.netlify/functions/tryout-notifications'])
    assert.equal(redirect(new Request('https://prospectsbaseball.club'+path)),undefined);
  assert.equal(redirect(new Request('https://prospectsbaseball.club/pay',{method:'POST'})),undefined);
  assert.equal(redirect(new Request('https://prospectssports.club/pay')),undefined);
  assert.equal(redirect(new Request('https://preview.example.invalid/pay')),undefined);
});
test('only the exact production migration pairing retains the original signed webhook URL',()=>{
 const env={CONTEXT:'production',SQUARE_ENVIRONMENT:'production',SQUARE_LIVE_ENABLED:'true',SQUARE_OWNER_FULL_CATALOG_LAUNCH:'true',
 APP_BASE_URL:'https://prospectssports.club',SQUARE_PRODUCTION_APPLICATION_ID:'production-app',SQUARE_PRODUCTION_LOCATION_ID:'location',
 SQUARE_PRODUCTION_MERCHANT_ID:'merchant',SQUARE_PRODUCTION_ACCESS_TOKEN:'fixture',SQUARE_PRODUCTION_WEBHOOK_SIGNATURE_KEY:'fixture',
 SQUARE_PRODUCTION_WEBHOOK_URL:'https://prospectsbaseball.club/api/square/webhook'};
 const result=resolveSquareConfig(env);
 assert.equal(result?.origin,env.APP_BASE_URL);
 assert.equal(result?.webhookUrl,env.SQUARE_PRODUCTION_WEBHOOK_URL);
 for(const url of ['https://other.example/api/square/webhook','http://prospectsbaseball.club/api/square/webhook','https://prospectsbaseball.club/api/square/webhook?token=x'])
   assert.equal(resolveSquareConfig({...env,SQUARE_PRODUCTION_WEBHOOK_URL:url}),null);
 assert.equal(resolveSquareConfig({...env,CONTEXT:'deploy-preview'}),null);
});
