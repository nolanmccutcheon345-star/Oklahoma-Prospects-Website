import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import type {Sql} from '../db';
import {assertAthleteMayPurchase,assertYouthAge,assertStoredOrderAllowed} from './assessment-gate.server';
import {approvedProducts} from './catalog';
import {calculateQuote,checkoutInput,type Product} from './contracts';
import {loadServices,buildPublicCatalog} from '../ops';
import {replaceCoachServices,bookableCoaches} from './coach-services.server';
import {checkoutLessonService} from './coach-services';

test('youth age boundary is enforced on session date, including missing or invalid birthdays',()=>{
  assert.doesNotThrow(()=>assertYouthAge('2015-10-11','2027-10-10'));
  assert.throws(()=>assertYouthAge('2015-10-10','2027-10-10'),/11U/);
  for(const birthday of [null,'','2028-01-01','2017-02-30']) assert.throws(()=>assertYouthAge(birthday,'2027-10-10'),/date of birth/);
});

test('stored youth assignments, renamed services and edited prices feed public catalog and checkout',async()=>{
  const db=new PGlite();
  const sql=(async(parts:TemplateStringsArray,...values:unknown[])=>(await db.query(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows) as Sql;
  try{
    for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(`migrations/${name}`,'utf8'));
    await sql`insert into club_athletes(id,name,birth_date,household_email) values('young','Young','2017-01-01','family@example.invalid'),('older','Older','2010-01-01','family@example.invalid'),('unknown','Unknown',null,'family@example.invalid')`;
    const gate=(id:string,service='youth-pitching')=>assertAthleteMayPurchase(sql,{athleteId:id,productId:service,kind:'lesson',billingHouseholdIds:[],role:'admin',date:'2027-10-10'});
    assert.equal((await gate('young')).assessed,false);
    await assert.rejects(assertStoredOrderAllowed(sql,{athlete_id:'young',kind:'lesson',product_id:'youth-pitching',snapshot:{kind:'lesson',productId:'youth-pitching',bookingWindow:{start:'2030-10-10T22:00:00Z'}}},{billingHouseholdIds:[],role:'admin'}),/11U/);
    await assert.rejects(gate('older'),/11U/);
    await assert.rejects(gate('unknown'),/date of birth/);
    await assert.rejects(gate('young','s2'),/Complete your assessment/);
    await assert.rejects(assertAthleteMayPurchase(sql,{athleteId:'young',productId:'youth-pitching',kind:'lesson',billingHouseholdIds:[],role:'parent'}),/not in your household/);
    await sql`insert into club_staff(id,name,email,role,active) values('instructor','Instructor','instructor@example.invalid','coach',true)`;
    await replaceCoachServices(sql,'instructor',[{serviceId:'youth-pitching',profitSplit:60}]);
    assert.deepEqual((await bookableCoaches(sql,[]))[0].serviceIds,['youth-pitching']);
    await sql`update club_services set name='Junior pitching',price=42.75 where id='youth-pitching'`;
    await sql`update club_services set name='Family practice',price=58.25 where id='individual'`;
    await sql`update club_services set name='Monthly progress',price=281.25 where id='m1'`;
    await sql`update club_services set price=27.50 where id='assessment-setup'`;
    const services=await loadServices(sql),publicCatalog=buildPublicCatalog(services);
    assert.equal(publicCatalog.lessons.find(p=>p.id==='youth-pitching')?.name,'Junior pitching');
    assert.equal(publicCatalog.lessons.find(p=>p.id==='youth-pitching')?.price,42.75);
    assert.equal(publicCatalog.lessons.find(p=>p.id==='youth-pitching')?.requiresAssessment,false);
    assert.equal(publicCatalog.cages.find(p=>p.id==='individual')?.price,58.25);
    assert.equal(publicCatalog.memberships.find(p=>p.id==='m1')?.price,281.25);
    assert.equal(publicCatalog.setupFee,27.5);
    const products=approvedProducts(await sql<Product>`select * from club_services`);
    const input=(id:string,kind:string)=>checkoutInput.parse({requestId:'00000000-0000-4000-8000-000000000001',productId:id,kind,email:'family@example.invalid',name:'Family',consent:true,household:true,laneIds:['1'],duration:60});
    const youth=calculateQuote(input('youth-pitching','lesson'),products.find(p=>p.id==='youth-pitching')!,false,products);
    assert.equal(youth.totalCents,4275);assert.equal(youth.title,'Junior pitching');assert.equal(youth.setupCents,0);
    const cage=calculateQuote(input('individual','cage'),products.find(p=>p.id==='individual')!,false,products);
    assert.equal(cage.totalCents,5825);
    const member=calculateQuote(input('m1','membership'),products.find(p=>p.id==='m1')!,false,products);
    assert.equal(member.totalCents,30875);assert.equal(member.regularCents,28125);assert.equal(member.title,'Monthly progress');
    const noFee=products.map(p=>p.id==='assessment-setup'?{...p,price:0}:p);
    const freeAssessment=calculateQuote(input('m1','membership'),products.find(p=>p.id==='m1')!,false,noFee);
    assert.equal(freeAssessment.assessment,true);assert.equal(freeAssessment.duration,75);assert.equal(checkoutLessonService(freeAssessment),'s1');
    assert.deepEqual(buildPublicCatalog([]).lessons,[],'no stale hardcoded prices during load failure');
  }finally{await db.close();}
});
