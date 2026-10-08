import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {Sql} from './db';
import {registrationAccessFor,registrationRowsFor,registrationReadersFor,setRegistrationReaderFor} from './registrations.server';
import {resolveIdentity} from './identity.server';
import {listDiscountsFor} from './commerce/discounts.server';

test('coordinator capability is read only, identity bound, owner managed and revocable', async () => {
 const db=new PGlite();
 const wrap=(query:PGlite['query']):Sql=>{
  const sql=(async(parts:TemplateStringsArray,...values:unknown[])=>(await query(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows) as Sql;
  sql.query=(async(text:string,values:unknown[]=[]) => (await query(text,values)).rows) as Sql['query'];
  sql.transaction=work=>db.transaction(tx=>work(wrap(tx.query.bind(tx) as PGlite['query'])));
  return sql;
 };
 try {
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort()) await db.exec(await readFile('migrations/'+name,'utf8'));
  const sql=wrap(db.query.bind(db));
  for(const id of ['owner','reader','parent','coach','player','fake-admin','disabled','unverified']){
   await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt","disabledAt") values(${id},${id+'@example.invalid'},${id},${id!=='unverified'},now(),now(),${id==='disabled'?'2026-09-28':null})`;
   await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id+'@example.invalid'},${id},${id==='owner'||id==='fake-admin'?'admin':['coach','player'].includes(id)?id:'parent'},${'fam-'+id})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  for(const id of ['parent','reader','coach','player','fake-admin','disabled','unverified','unknown']){
   await assert.rejects(()=>registrationRowsFor(sql,id));
   await assert.rejects(()=>registrationReadersFor(sql,id));
   await assert.rejects(()=>setRegistrationReaderFor(sql,id,{userId:'reader',enabled:true}));
  }
  for(const id of ['disabled','unverified','missing']) await assert.rejects(()=>setRegistrationReaderFor(sql,'owner',{userId:id,enabled:true}));
  for(const kind of ['tryout','team-inquiry','contact','membership-pause','refund-review','future-sensitive-kind'])
   await sql`insert into club_requests(id,kind,payload) values(${kind},${kind},${JSON.stringify({player:'Test Player',sport:'Softball',email:'parent@example.invalid',phone:'555-0100',notes:'Development',medicalNotes:'hidden',paymentId:'hidden',rosterPlayerId:'hidden'})}::jsonb)`;
  await assert.rejects(()=>setRegistrationReaderFor(sql,'owner',{userId:'player',enabled:true}),/non-player/);
  await sql`insert into registration_readers(user_id,email,active,granted_by) values('player','player@example.invalid',true,'owner')`;
  assert.deepEqual(await registrationAccessFor(sql,'player'),{allowed:false,owner:false});
  await assert.rejects(()=>registrationRowsFor(sql,'player'),/Registration viewing/);
  await setRegistrationReaderFor(sql,'owner',{userId:'player',enabled:false});
  await setRegistrationReaderFor(sql,'owner',{userId:'reader',enabled:true});
  assert.deepEqual(await registrationAccessFor(sql,'reader'),{allowed:true,owner:false});
  const rows=await registrationRowsFor(sql,'reader');
  assert.deepEqual(rows.map(r=>r.kind).sort(),['contact','team-inquiry','tryout']);
  for(const row of rows){assert.equal(row.payload.email,'parent@example.invalid');assert.equal(row.payload.medicalNotes,undefined);assert.equal(row.payload.paymentId,undefined);assert.equal(row.payload.rosterPlayerId,undefined);}
  assert.equal((await resolveIdentity(sql,'reader')).role,'parent');
  await assert.rejects(()=>listDiscountsFor(sql,'reader'),/Admin/);
  await assert.rejects(()=>registrationReadersFor(sql,'reader'),/Owner/);
  await assert.rejects(()=>setRegistrationReaderFor(sql,'reader',{userId:'parent',enabled:true}),/Owner/);
  assert.equal((await registrationReadersFor(sql,'owner')).find(r=>r.user_id==='reader')?.enabled,true);
  await sql`update "user" set email='changed@example.invalid' where id='reader'`;
  await assert.rejects(()=>registrationRowsFor(sql,'reader'));
  await sql`update "user" set email='reader@example.invalid',"disabledAt"=now() where id='reader'`;
  await assert.rejects(()=>registrationRowsFor(sql,'reader'));
  await sql`update "user" set "disabledAt"=null,"emailVerified"=false where id='reader'`;
  await assert.rejects(()=>registrationRowsFor(sql,'reader'));
  await sql`update "user" set "emailVerified"=true where id='reader'`;
  await setRegistrationReaderFor(sql,'owner',{userId:'reader',enabled:false});
  await assert.rejects(()=>registrationRowsFor(sql,'reader'));
  assert.equal((await registrationAccessFor(sql,'owner')).owner,true);
  assert.ok((await sql`select * from audit_events where target_table='registration_readers'`).length>=2);
 } finally {await db.close();}
});
