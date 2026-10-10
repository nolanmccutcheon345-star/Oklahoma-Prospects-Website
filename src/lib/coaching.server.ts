import {coachesWithAvailability} from "./commerce/coach-services.server";
import {approvedProducts} from "./commerce/catalog";
import type {Product} from "./commerce/contracts";
import type {z} from 'zod';
import {getSql} from './db';
import {publicCoachProfilesFor} from './coach-public-profiles.server';
import {clubIdentity} from './identity.server';
import {readWorkingFile,writeWorkingFile,loadDeskForUser} from './pd/desk-impl.server';
import {scopeForViewer,assertAthleteAccess,canCoachAthlete} from './pd/access';
import {validDate,chicagoDate} from './scheduling';
import {profileInput,availabilityInput,metricInput,trackInput,dayInput,logInput} from './coaching-contracts';
import {recordSessionMetric} from './session-metrics.server';
async function coach(userId:string){const me=await clubIdentity(userId);if(!['admin','coach'].includes(me.role)&&!me.canInstruct)throw new Error('Coach access required.');const {data}=await loadDeskForUser(userId);const row=data.coaches.find(c=>c.email.toLowerCase()===me.email);if(!row)throw new Error('Coach profile is not assigned.');if(me.role==='coach'&&row.active===false)throw new Error('Coach access is inactive. Contact the club administrator.');return {me,row};}
async function access(userId:string,athleteId:string,coached=false){const me=await clubIdentity(userId),file=await readWorkingFile();const scope=scopeForViewer(me,file);assertAthleteAccess(scope,athleteId);if(coached&&!canCoachAthlete(scope,athleteId))throw new Error('Only an assigned coach can change the plan or OP level.');return me;}
function validateDay(day:string){if(!validDate(day))throw new Error('Invalid date.');}
export async function publicCoaches(){
 const file=await readWorkingFile();
 const sql=await getSql();
 const coaches=file.coaches.filter(c=>c.active!==false);
 const profiles=await publicCoachProfilesFor(sql,coaches.map(c=>c.id));
 const products=await sql<Product>`select id,kind,name,price,minutes,credits,remote,expires_days,hours,discipline,active from club_services where active=true`;
 const bookable=await coachesWithAvailability(sql,coaches,file.availability,approvedProducts(products));
 const {publicTeamLinksFor}=await import("./coach-team-links.server");
 const [record]=await sql<{payload:unknown;demo:boolean}>`select payload,demo from club_state where id='oklahoma-prospects'`;
 let club:unknown=record?.payload;
 if(typeof club==="string"){try{club=JSON.parse(club);}catch{club=null;}}
 return profiles.map(p=>({...p,bookable:bookable.some(c=>c.id===p.id),teams:publicTeamLinksFor(p.id,coaches,club,record?.demo!==false)}));
}
export async function myCoach(userId:string){const {row}=await coach(userId);const sql=await getSql();const [profile]=await sql<{profile:z.infer<typeof profileInput>}>`select profile from coach_profiles where user_id=${userId}`;const file=await readWorkingFile();return {coach:row,profile:profile?.profile,availability:file.availability.filter(a=>a.coachId===row.id)};}
export async function saveCoach(userId:string,input:z.infer<typeof profileInput>){input=profileInput.parse(input);const {row}=await coach(userId);const sql=await getSql();const file=await readWorkingFile();await sql.transaction(async tx=>{await tx`update person_profiles set profile=profile || ${JSON.stringify({name:input.name,bio:input.career,specialties:input.specialties,ages:input.ages,approach:input.approach,achievements:input.achievements,welcome:input.welcome})}::jsonb,revision=revision+1,updated_at=now() where user_id=${userId}`;await tx`insert into coach_profiles(id,user_id,profile,published) values(${row.id},${userId},${JSON.stringify(input)}::jsonb,${input.published}) on conflict(user_id) do update set profile=excluded.profile,published=excluded.published,updated_at=now()`;await writeWorkingFile({...file,coaches:file.coaches.map(c=>c.id===row.id?{...c,name:input.name,specialties:input.specialties}:c)},tx);});return {ok:true};}
export async function saveAvailability(userId:string,input:z.infer<typeof availabilityInput>){input=availabilityInput.parse(input);const {row}=await coach(userId);const file=await readWorkingFile();await writeWorkingFile({...file,availability:[...file.availability.filter(a=>a.coachId!==row.id),...input.windows.map((w,i)=>({id:`availability:${row.id}:${i}`,coachId:row.id,weekday:w.weekday,window:`${w.start}–${w.end}`}))]});return {ok:true};}
export async function developmentProgress(userId:string,athleteId:string){await access(userId,athleteId);const sql=await getSql();const [tracks,days,logs,metrics]=await Promise.all([
 sql<{track:string;level:number;evidence:string;updated_at:Date}>`select track,level,evidence,updated_at from athlete_track_progress where athlete_id=${athleteId}`,
 sql<{day:string;focus:string;game_notes:string;items:z.infer<typeof dayInput>['items']}>`select day::text,focus,game_notes,items from athlete_training_days where athlete_id=${athleteId} and day>=${chicagoDate()}::date and day<${chicagoDate()}::date+30 order by day`,
 sql<{day:string;item_id:string;completed:boolean;reps:number;weight:number;rpe:number;notes:string}>`select day::text,item_id,completed,reps,weight,rpe,notes from athlete_training_logs where athlete_id=${athleteId} order by day desc limit 600`,
 sql<{id:string;track:string;day:string;successes:number;attempts:number;notes:string;verified:boolean}>`select id,track,day::text,successes,attempts,notes,verified from athlete_session_metrics where athlete_id=${athleteId} order by day desc limit 100`,
 ]);return {tracks,days,logs,metrics};}
export async function setTrack(userId:string,input:z.infer<typeof trackInput>){input=trackInput.parse(input);await access(userId,input.athleteId,true);const sql=await getSql();await sql`insert into athlete_track_progress(athlete_id,track,level,coach_user_id,evidence) values(${input.athleteId},${input.track},${input.level},${userId},${input.evidence}) on conflict(athlete_id,track) do update set level=excluded.level,coach_user_id=excluded.coach_user_id,evidence=excluded.evidence,updated_at=now()`;return {ok:true};}
export async function setTrainingDay(userId:string,input:z.infer<typeof dayInput>){input=dayInput.parse(input);await access(userId,input.athleteId,true);validateDay(input.day);const sql=await getSql();await sql`insert into athlete_training_days(athlete_id,day,coach_user_id,focus,game_notes,items) values(${input.athleteId},${input.day},${userId},${input.focus},${input.gameNotes},${JSON.stringify(input.items)}::jsonb) on conflict(athlete_id,day) do update set coach_user_id=excluded.coach_user_id,focus=excluded.focus,game_notes=excluded.game_notes,items=excluded.items,updated_at=now()`;return {ok:true};}
export async function logTraining(userId:string,input:z.infer<typeof logInput>){input=logInput.parse(input);await access(userId,input.athleteId);validateDay(input.day);if(input.day>chicagoDate())throw new Error('A training completion cannot be dated in the future.');const sql=await getSql();await sql.transaction(async tx=>{const [plan]=await tx<{items:z.infer<typeof dayInput>['items']}>`select items from athlete_training_days where athlete_id=${input.athleteId} and day=${input.day} for update`;if(!Array.isArray(plan?.items)||!plan.items.some(i=>i.id===input.itemId))throw new Error('This drill is not on the assigned plan.');await tx`insert into athlete_training_logs(athlete_id,day,item_id,user_id,completed,reps,weight,rpe,notes) values(${input.athleteId},${input.day},${input.itemId},${userId},${input.completed},${input.reps??null},${input.weight??null},${input.rpe??null},${input.notes}) on conflict(athlete_id,day,item_id) do update set user_id=excluded.user_id,completed=excluded.completed,reps=excluded.reps,weight=excluded.weight,rpe=excluded.rpe,notes=excluded.notes,updated_at=now()`;});return {ok:true};}
export async function saveMetric(userId:string,input:z.infer<typeof metricInput>){input=metricInput.parse(input);const me=await access(userId,input.athleteId);validateDay(input.day);if(input.day>chicagoDate())throw new Error('A session log cannot be dated in the future.');return recordSessionMetric(await getSql(),userId,input,canCoachAthlete(scopeForViewer(me,await readWorkingFile()),input.athleteId));}
