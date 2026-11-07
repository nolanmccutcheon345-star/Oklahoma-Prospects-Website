import {randomUUID} from 'node:crypto';
import {getRequest} from '@tanstack/react-start/server';
import {validateWaiverSigner} from './waiver-validation';
import type {z} from 'zod';
import {getSql} from './db';
import {clubIdentity} from './identity.server';
import {assertSameSiteRequest} from './auth/isolation.server';
import {rateLimit} from './commerce/checkout.server';
import {validateTryoutRegistration} from './tryout-registration';
import {validDate,chicagoDate} from './scheduling';
import {loadDeskForUser} from './pd/desk-impl.server';
import {WAIVER_TEXT,WAIVER_VERSION} from './waiver-content';
import {inquiryInput,athleteInput,waiverInput} from './portal-contracts';
export async function submitInquiry(input:z.infer<typeof inquiryInput>) {
 assertSameSiteRequest();await rateLimit('inquiry',10);
 input=inquiryInput.parse(input);
 if(input.kind==='tryout'){
  validateTryoutRegistration(input,chicagoDate());
 }
 const {recordInquiryFor}=await import('./tryout-enrollment.server');
 if(input.kind==='contact')return recordInquiryFor(await getSql(),input);
 if(!input.athleteProfile)throw new Error('Complete the athlete profile before submitting.');
 const {getSessionUser}=await import('./auth/verify.server');
 const {prepareAthleteRegistration}=await import('./athlete-registration.server');
 const {createHash}=await import('node:crypto');
 const sql=await getSql(),user=await getSessionUser();
 const prepared=await prepareAthleteRegistration(sql,user?.id||null,input.athleteProfile);
 const {athleteProfile,...safe}=input;
 if(athleteProfile.athleteId){const {familyAthletesFor}=await import('./athlete-registration.server');const a=(await familyAthletesFor(sql,user!.id)).find(a=>a.id===athleteProfile.athleteId);if(!a||a.name!==safe.player)throw new Error('The selected athlete name must match the saved profile.');}
 return recordInquiryFor(sql,{...safe,profileFingerprint:createHash('sha256').update(JSON.stringify(athleteProfile)).digest('hex')},{userId:user?.id||null,data:prepared.data,householdEmail:prepared.me?.email||null});
}
export async function addAthlete(userId:string,input:z.infer<typeof athleteInput>){
 input=athleteInput.parse(input);
 const me=await clubIdentity(userId);
 if(me.role==='player')throw new Error('A parent or guardian account is required to add athletes.');
 if(!validDate(input.birthDate)||input.birthDate>chicagoDate())throw new Error('Enter a valid date of birth.');
 const sql=await getSql();const id=`athlete:${userId}:${input.requestId}`;
 const [existing]=await sql`select id from club_athletes where id=${id}`;
 if(!existing)await loadDeskForUser(userId);
 await sql`insert into club_athletes(id,user_id,household_email,name,birth_date,profile) values(${id},${userId},${me.email},${input.name},${input.birthDate},${JSON.stringify({sport:input.sport,throws:input.throws,bats:input.bats})}::jsonb) on conflict(id) do nothing`;
 const [saved]=await sql`select id from club_athletes where id=${id} and user_id=${userId} and household_email=${me.email} and name=${input.name} and birth_date=${input.birthDate} and profile=${JSON.stringify({sport:input.sport,throws:input.throws,bats:input.bats})}::jsonb`;
 if(!saved)throw new Error('This athlete request was already used with different details. Start a new request.');
 return {id};
}
export async function myWaivers(userId:string){const me=await clubIdentity(userId);const sql=await getSql();return sql<{id:string;athlete_id:string;athlete_name:string;signer_name:string;signed_at:Date;expires_at:Date}>`select w.id,w.athlete_id,a.name as athlete_name,w.signer_name,w.signed_at,w.signed_at+interval '1 year' as expires_at from club_waivers w join club_athletes a on a.id=w.athlete_id where a.household_id=any(${me.billingHouseholdIds}::text[]) and w.signed_at<=now() and w.signed_at+interval '1 year'>now() order by signed_at desc`;}
export async function signWaiver(userId: string, input: z.infer<typeof waiverInput>) {
  input = waiverInput.parse(input);
  const me = await clubIdentity(userId);
  const sql = await getSql();
  const [athlete] = await sql<{
    id: string;
    name: string;
    birth_date: string;
  }>`select id,name,birth_date from club_athletes where id=${input.athleteId} and household_id=any(${me.billingHouseholdIds}::text[])`;
  if (!athlete) throw new Error("Choose an athlete in your household.");
  validateWaiverSigner(athlete.birth_date, input.participantType, input.relationship);
  if (
    input.participantType === "adult" &&
    (input.signerName.trim().toLowerCase() !== athlete.name.trim().toLowerCase() ||
      me.name.trim().toLowerCase() !== athlete.name.trim().toLowerCase())
  )
    throw new Error("Adult athletes must sign in to their own account to sign.");
  const details = {
    ...input,
    ipAddress: getRequest()?.headers.get("x-nf-client-connection-ip") || null,
  };
  const version = `${WAIVER_VERSION}:${chicagoDate().slice(0, 4)}`;
  const inserted =
    await sql`insert into club_waivers(id,user_id,athlete_id,version,signer_name,consent_text,details) values(${randomUUID()},${userId},${input.athleteId},${version},${input.signerName},${WAIVER_TEXT},${JSON.stringify(details)}::jsonb) on conflict(athlete_id,version) do nothing returning id`;
  const [saved] = await sql<{
    id: string;
    signed_at: Date;
    expires_at: Date;
    details: Record<string, unknown>;
  }>`select id,signed_at,signed_at+interval '1 year' as expires_at,details from club_waivers where athlete_id=${input.athleteId} and version=${version}`;
  if (!saved) throw new Error("Could not confirm the saved waiver. Refresh before trying again.");
  const same = Object.entries(input).every(([key, value]) => saved.details?.[key] === value);
  return {
    ok: true,
    outcome: inserted.length
      ? ("saved" as const)
      : same
        ? ("already-on-file" as const)
        : ("amendment-required" as const),
    receipt: {
      id: saved.id,
      athleteId: input.athleteId,
      signedAt: saved.signed_at.toISOString(),
      expiresAt: saved.expires_at.toISOString(),
    },
  };
}
export async function officeRequests(userId:string){
 const me=await clubIdentity(userId);if(me.role!=='admin')throw new Error('Front-office access required.');const sql=await getSql();
 const rows=await sql<{id:string;kind:string;payload:Record<string,unknown>;status:string;created_at:Date}>`select id,kind,payload,status,created_at from club_requests order by created_at desc`;
 return rows.map(row=>({...row,payload:Object.fromEntries(Object.entries(row.payload).filter(([key])=>key!=='profileFingerprint').map(([key,value])=>[key,typeof value==='string'?value:JSON.stringify(value)??'']))}));
}
export async function resolveRequest(userId:string,id:string){const me=await clubIdentity(userId);if(me.role!=='admin')throw new Error('Front-office access required.');const sql=await getSql();const [request]=await sql<{kind:string}>`select kind from club_requests where id=${id}`;if(request&&['membership-pause','refund-review'].includes(request.kind))throw new Error('Billing requests require a confirmed provider outcome before resolution.');await sql`update club_requests set status='resolved' where id=${id}`;return {ok:true};}
