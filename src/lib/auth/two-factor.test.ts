import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {Kysely} from 'kysely';
import {betterAuth} from 'better-auth';
import {twoFactor} from 'better-auth/plugins';
import {base32} from '@better-auth/utils/base32';
import {pgliteDialect} from './pglite-dialect';

test('authenticator enrollment, challenge and one-time recovery work against the migrated schema',async()=>{
 const db=new PGlite();const database=new Kysely({dialect:pgliteDialect(()=>db)});
 try {
  for(const f of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('migrations/'+f,'utf8'));
  const auth=betterAuth({baseURL:'http://localhost:9009',secret:'offline-only-synthetic-auth-test-secret-2026',database:{db:database,type:'postgres'},emailAndPassword:{enabled:true},session:{cookieCache:{enabled:false}},plugins:[twoFactor({issuer:'Offline test'})],logger:{disabled:true}});
  let cookies='';
  async function post(path:string,body:unknown){
   const response=await auth.handler(new Request('http://localhost:9009/api/auth/'+path,{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:9009',cookie:cookies},body:JSON.stringify(body)}));
   const jar=new Map(cookies.split('; ').filter(Boolean).map(c=>{const at=c.indexOf('=');return [c.slice(0,at),c.slice(at+1)];}));
   for(const header of response.headers.getSetCookie()){const entry=header.split(';')[0],at=entry.indexOf('=');jar.set(entry.slice(0,at),entry.slice(at+1));}
   cookies=[...jar].map(([k,v])=>`${k}=${v}`).join('; ');
   return {status:response.status,data:await response.json()};
  }
  const credentials={email:'mfa-fixture@example.invalid',password:'synthetic-password-for-offline-test'};
  assert.equal((await post('sign-up/email',{...credentials,name:'MFA Fixture'})).status,200);
  const enabled=await post('two-factor/enable',{password:credentials.password});
  assert.equal(enabled.status,200);
  assert.ok(enabled.data.totpURI);assert.ok(enabled.data.backupCodes.length>0);
  const secret=new TextDecoder().decode(base32.decode(new URL(enabled.data.totpURI).searchParams.get('secret')!));
  const code=await auth.api.generateTOTP({body:{secret}});
  assert.equal((await post('two-factor/verify-totp',{code:code.code})).status,200);
  await post('sign-out',{});cookies='';
  const pending=await post('sign-in/email',credentials);
  assert.equal(pending.data.twoFactorRedirect,true);
  const session=await auth.api.getSession({headers:new Headers({cookie:cookies})});
  assert.equal(session,null);
  assert.equal((await post('two-factor/verify-backup-code',{code:enabled.data.backupCodes[0]})).status,200);
  assert.ok(await auth.api.getSession({headers:new Headers({cookie:cookies})}));
  await post('sign-out',{});cookies='';await post('sign-in/email',credentials);
  assert.notEqual((await post('two-factor/verify-backup-code',{code:enabled.data.backupCodes[0]})).status,200);
 } finally {await database.destroy();await db.close();}
});
