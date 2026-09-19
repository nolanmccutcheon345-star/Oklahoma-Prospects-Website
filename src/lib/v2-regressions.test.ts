import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {Sql} from './db';
import {revokeStaffAccess} from './staff-access.server';
import {resolveIdentity} from './identity.server';
import {enforceVisitWaivers} from './commerce/waivers.server';
import {holdWindow} from './commerce/store.server';
import {readFamilyBilling} from './commerce/portal.server';
import {validateWaiverSigner} from './waiver-validation';
import {wrapMigration} from '../../scripts/netlify-migrations.mjs';

function wrap(db:PGlite):Sql {
 const client=(query:PGlite['query']):Sql=>{
  const sql=(async(parts:TemplateStringsArray,...values:unknown[])=>(await query(parts.reduce((out,p,i)=>out+(i?`$${i}`:'')+p,''),values)).rows) as Sql;
  sql.query=(async(text:string,values:unknown[]=[]) => (await query(text,values)).rows) as Sql['query'];
  sql.transaction=work=>db.transaction(tx=>work(client(tx.query.bind(tx) as PGlite['query'])));
  return sql;
 };
 return client(db.query.bind(db));
}
test('v2 migrations, owner authority, households, audit events and visit gates',async t=>{
 const db=new PGlite();const sql=wrap(db);
 try {
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort()) {
   if(name.startsWith('0013')) {
    for(const [id,email,verified] of [['owner-a',' STEVEMCCUTCHEON89@gmail.com ',true],['owner-b','nolanmccutcheon@icloud.com',false],['third','other-owner@example.invalid',true],['guardian-a','similar.household.name+a@example.invalid',true],['guardian-b','similar.household.name+b@example.invalid',true]] as const)
     await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${id},${id},${email},${verified},now(),now())`;
    await sql`insert into profiles(user_id,email,role) values('third','other-owner@example.invalid','admin')`;
    const payload={teams:[{roster:[{familyId:'collision',parents:[{email:'similar.household.name+a@example.invalid'}]},{familyId:'collision',parents:[{email:'similar.household.name+b@example.invalid'}]}]}]};
    await sql`insert into club_state(id,payload) values('migration-fixture',${JSON.stringify(payload)}::jsonb)`;
    await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status) values('historic','historic','fixture@example.invalid','p2','package','{}',38500,'paid')`;
   }
   // Exercise the same wrapper Netlify applies, including nested function definitions.
   await db.exec(wrapMigration(name,await readFile('migrations/'+name,'utf8')));
  }
  await t.test('explicit prices change new purchases while paid history stays unchanged',async()=>{
   const prices=await sql<{id:string;price:number}>`select id,price from club_services where id in ('m1','p2','p3','s9') order by id`;
   assert.deepEqual(prices,[{id:'m1',price:239},{id:'p2',price:385},{id:'p3',price:740},{id:'s9',price:150}]);
   assert.equal((await sql<{total_cents:number}>`select total_cents from commerce_orders where id='historic'`)[0].total_cents,38500);
  });
  await t.test('only the two approved verified owners qualify; revocation and deactivation take effect',async()=>{
   assert.equal((await resolveIdentity(sql,'owner-a')).role,'admin');
   await assert.rejects(resolveIdentity(sql,'owner-b'),/Verify your email/);
   await sql`update "user" set "emailVerified"=true where id='owner-b'`;
   assert.equal((await resolveIdentity(sql,'owner-b')).role,'admin');
   assert.equal((await resolveIdentity(sql,'third')).role,'parent');
   await sql`update profiles set role='admin' where user_id='third'`;
   assert.equal((await resolveIdentity(sql,'third')).role,'parent');
   await sql`update owner_grants set revoked_at=now() where user_id='owner-a'`;
   assert.equal((await resolveIdentity(sql,'owner-a')).role,'parent');
   await sql`update "user" set "disabledAt"=now() where id='third'`;
   await assert.rejects(resolveIdentity(sql,'third'),/Unauthorized/);
  });
  await t.test('collision migration separates households; explicit membership shares only the linked household',async()=>{
   const a=await resolveIdentity(sql,'guardian-a'),b=await resolveIdentity(sql,'guardian-b');
   assert.notEqual(a.familyIds[0],b.familyIds[0]);
   assert.deepEqual(a.householdUserIds,['guardian-a']);
   assert.deepEqual(b.householdUserIds,['guardian-b']);
   await sql`insert into household_members(household_id,user_id) values(${a.familyIds[0]},'guardian-b')`;
   await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status) values('household-a','ha','guardian-a','similar.household.name+a@example.invalid','p1','package','{}',22000,'paid'),('household-b','hb','guardian-b','similar.household.name+b@example.invalid','p1','package','{}',22000,'paid')`;
   const linked=await resolveIdentity(sql,'guardian-b');
   assert.deepEqual((await readFamilyBilling(sql,await resolveIdentity(sql,'guardian-a'))).orders.map(o=>o.id),['household-a']);
   assert.deepEqual(new Set((await readFamilyBilling(sql,linked)).orders.map(o=>o.id)),new Set(['household-a','household-b']));
   assert.deepEqual(new Set(linked.householdUserIds),new Set(['guardian-a','guardian-b']));
   await sql`delete from household_members where household_id=${a.familyIds[0]} and user_id='guardian-b'`;
   assert.deepEqual((await resolveIdentity(sql,'guardian-b')).householdUserIds,['guardian-b']);
  });
  await t.test('staff deactivation revokes existing sessions and pending coach invitations',async()=>{
   await sql`insert into profiles(user_id,email,role) values('guardian-b','similar.household.name+b@example.invalid','coach') on conflict(user_id) do update set role='coach'`;
   await sql`insert into "session"(id,"userId",token,"expiresAt","createdAt","updatedAt") values('staff-session','guardian-b','synthetic-staff-session',now()+interval '1 day',now(),now())`;
   await sql`insert into club_invites(id,invited_by,token_hash,email,role,expires_at) values('pending-staff','owner-b','synthetic-hash','similar.household.name+b@example.invalid','coach',now()+interval '1 day')`;
   await sql.transaction(tx=>revokeStaffAccess(tx,{user_id:'guardian-b',email:'similar.household.name+b@example.invalid'}));
   assert.equal((await sql<{status:string}>`select status from club_invites where id='pending-staff'`)[0].status,'revoked');
   assert.equal((await sql`select id from "session" where id='staff-session'`).length,0);
   assert.equal((await resolveIdentity(sql,'guardian-b')).role,'parent');
  });
  await t.test('administrative events are attributed, atomic and append-only',async()=>{
   await sql.transaction(async tx=>{await tx`select set_config('app.actor_id','fixture-owner',true)`;await tx`update club_services set price=371 where id='p2'`;});
   const [event]=await sql<{actor_id:string;before_state:{price:number};after_state:{price:number};id:number}>`select * from audit_events where target_table='club_services' and target_id='p2' order by id desc limit 1`;
   assert.equal(event.actor_id,'fixture-owner');assert.equal(event.before_state.price,385);assert.equal(event.after_state.price,371);
   await assert.rejects(sql`update audit_events set actor_id='forged' where id=${event.id}`,/append-only/);
   await assert.rejects(sql`delete from audit_events where id=${event.id}`,/append-only/);
   const before=(await sql`select id from audit_events`).length;
   await assert.rejects(sql.transaction(async tx=>{await tx`update club_services set price=372 where id='p2'`;throw new Error('rollback');}));
   assert.equal((await sql`select id from audit_events`).length,before);
  });
  await sql`insert into club_athletes(id,user_id,household_email,name,birth_date) values('a','guardian-a','fixture@example.invalid','Fixture A','2012-01-01'),('b','guardian-a','fixture@example.invalid','Fixture B','2013-01-01')`;
  const starts=new Date('2026-10-10T21:00:00Z'),ends=new Date('2026-10-10T22:00:00Z'),now=new Date('2026-10-10T21:30:00Z');
  const id=await sql.transaction(tx=>holdWindow(tx,{orderId:null,userId:'guardian-a',athleteId:'a',productId:'individual',start:starts,end:ends,resources:['lane:fixture'],participantCount:2}));
  const booking={id,participant_count:2,participants_verified:true,starts_at:starts,ends_at:ends};
  await t.test('all participants need current waivers; exact annual expiry is rejected',async()=>{
   await assert.rejects(enforceVisitWaivers(sql,booking,now),/every participating athlete/);
   await sql`insert into booking_participants(booking_id,athlete_id) values(${id},'b')`;
   await assert.rejects(enforceVisitWaivers(sql,booking,now),/Fixture A, Fixture B/);
   await sql`insert into club_waivers(id,user_id,athlete_id,version,signer_name,signed_at,consent_text) values('wa','guardian-a','a','fixture','Guardian','2026-10-10T20:00:00Z','fixture'),('wb','guardian-a','b','fixture','Guardian','2025-10-10T21:30:00Z','fixture')`;
   await assert.rejects(enforceVisitWaivers(sql,booking,now),/Fixture B/);
   await sql`update club_waivers set signed_at='2026-10-10T20:00:00Z' where id='wb'`;
   await enforceVisitWaivers(sql,booking,now);
   await assert.rejects(enforceVisitWaivers(sql,{...booking,participants_verified:false},now),/Confirm every/);
   await assert.rejects(enforceVisitWaivers(sql,booking,ends),/before it ends/);
  });
  await t.test('an athlete cannot occupy simultaneous coach or cage reservations',async()=>{
   await assert.rejects(sql.transaction(tx=>holdWindow(tx,{orderId:null,userId:'guardian-a',athleteId:'a',productId:'s1',coachId:'another-coach',start:starts,end:ends,resources:['coach:another-coach','lane:another-lane']})));
   assert.equal((await sql`select id from booking_records`).length,1);
  });
 } finally {await db.close();}
});
test('waiver signer type follows date of birth and guardian relationship',()=>{
 const now=new Date('2026-10-10T18:00:00Z');
 assert.throws(()=>validateWaiverSigner('2012-01-01','adult','self',now),/date of birth/);
 assert.throws(()=>validateWaiverSigner('2012-01-01','minor','self',now),/parent or legal guardian/);
 assert.throws(()=>validateWaiverSigner(null,'minor','parent',now),/valid athlete/);
 assert.throws(()=>validateWaiverSigner('2008-10-10','adult','parent',now),/own waiver/);
 validateWaiverSigner('2008-10-10','adult','self',now);
 validateWaiverSigner('2008-10-11','minor','legal-guardian',now);
});
