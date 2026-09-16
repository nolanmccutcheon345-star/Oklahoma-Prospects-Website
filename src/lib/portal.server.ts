import {randomUUID} from 'node:crypto';
import {getRequest} from '@tanstack/react-start/server';
import {validateWaiverSigner} from './waiver-validation';
import type {z} from 'zod';
import {getSql} from './db';
import {clubIdentity} from './identity.server';
import {assertSameSiteRequest} from './auth/isolation.server';
import {rateLimit} from './commerce/checkout.server';
import {TRYOUT_DAYS,TRYOUT_AGES} from './club';
import {validDate,chicagoDate} from './scheduling';
import {loadDeskForUser} from './pd/desk-impl.server';
import {WAIVER_TEXT,WAIVER_VERSION} from './waiver-content';
import type {inquiryInput,athleteInput,waiverInput} from './portal-contracts';
export async function submitInquiry(input:z.infer<typeof inquiryInput>) {
 assertSameSiteRequest();await rateLimit('inquiry',10);
 if(input.kind==='tryout'){
  const sessions=TRYOUT_DAYS.flatMap(d=>d.sessions.map(s=>({age:s.age,value:`${d.weekday} ${d.date} · ${s.age} · ${s.time}`})));
  if(input.sport!=='Baseball'||!TRYOUT_AGES.includes(input.age as typeof TRYOUT_AGES[number])||!sessions.some(s=>s.age===input.age&&s.value===input.session))throw new Error('Other ages and softball: use the team inquiry form.');
  if(chicagoDate()>'2026-11-15')throw new Error('These tryouts have ended. Send a team inquiry for the next opportunity.');
 }
 const sql=await getSql();await sql`insert into club_requests(id,user_id,kind,payload) values(${input.requestId},null,${input.kind},${JSON.stringify(input)}::jsonb) on conflict(id) do nothing`;
 return {ok:true,reference:input.requestId};
}
export async function addAthlete(userId:string,input:z.infer<typeof athleteInput>){
 const me=await clubIdentity(userId);
 if(!validDate(input.birthDate)||input.birthDate>chicagoDate())throw new Error('Enter a valid date of birth.');
 await loadDeskForUser(userId);const sql=await getSql();const id=`athlete:${userId}:${input.requestId}`;
 await sql`insert into club_athletes(id,user_id,household_email,name,birth_date,profile) values(${id},${userId},${me.email},${input.name},${input.birthDate},${JSON.stringify({sport:input.sport,throws:input.throws,bats:input.bats})}::jsonb) on conflict(id) do nothing`;
 return {id};
}
export async function myWaivers(userId:string){await clubIdentity(userId);const sql=await getSql();return sql<{id:string;athlete_id:string;athlete_name:string;signer_name:string;signed_at:Date;expires_at:Date}>`select w.id,w.athlete_id,a.name as athlete_name,w.signer_name,w.signed_at,w.signed_at+interval '1 year' as expires_at from club_waivers w join club_athletes a on a.id=w.athlete_id where w.user_id=${userId} and w.signed_at+interval '1 year'>now() order by signed_at desc`;}
export async function signWaiver(userId:string,input:z.infer<typeof waiverInput>){
 const me=await clubIdentity(userId);const sql=await getSql();const [athlete]=await sql<{id:string;name:string;birth_date:string}>`select id,name,birth_date from club_athletes where id=${input.athleteId} and user_id=${userId}`;
 if(!athlete)throw new Error('Choose an athlete in your household.');
 validateWaiverSigner(athlete.birth_date,input.participantType,input.relationship);
 if(input.participantType==='adult' && (input.signerName.trim().toLowerCase()!==athlete.name.trim().toLowerCase() || me.name.trim().toLowerCase()!==athlete.name.trim().toLowerCase()))throw new Error('Adult athletes must sign in to their own account to sign.');
 const details={...input,ipAddress:getRequest()?.headers.get('x-nf-client-connection-ip')||null};
 const version=`${WAIVER_VERSION}:${chicagoDate().slice(0,4)}`;
 await sql`insert into club_waivers(id,user_id,athlete_id,version,signer_name,consent_text,details) values(${randomUUID()},${userId},${input.athleteId},${version},${input.signerName},${WAIVER_TEXT},${JSON.stringify(details)}::jsonb) on conflict(athlete_id,version) do nothing`;
 return {ok:true};
}
export async function officeRequests(userId:string){
 const me=await clubIdentity(userId);if(me.role!=='admin')throw new Error('Front-office access required.');const sql=await getSql();
 const rows=await sql<{id:string;kind:string;payload:Record<string,unknown>;status:string;created_at:Date}>`select id,kind,payload,status,created_at from club_requests order by created_at desc limit 500`;
 return rows.map(row=>({...row,payload:Object.fromEntries(Object.entries(row.payload).map(([key,value])=>[key,typeof value==='string'?value:JSON.stringify(value)??'']))}));
}
export async function resolveRequest(userId:string,id:string){const me=await clubIdentity(userId);if(me.role!=='admin')throw new Error('Front-office access required.');const sql=await getSql();await sql`update club_requests set status='resolved' where id=${id}`;return {ok:true};}
