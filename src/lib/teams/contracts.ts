import {z} from 'zod';
import type {ClubRecord} from './types';
const id=z.string().max(150),text=z.string().max(5000),short=z.string().max(200);
const money=z.number().finite().min(0).max(10000000),count=z.number().int().min(0).max(100000);
const strings=z.array(short).max(200),numbers=z.record(short,z.number().finite());
const staff=z.object({id,name:short,role:short,monthly:money,childId:id,applyAmount:money,w9:z.boolean(),backgroundCheck:z.boolean(),safeSport:z.boolean(),expires:short,email:short}).strict();
const player=z.object({
 id,teamId:id,familyId:id,name:short,number:short,positions:strings,bats:short,throws:short,gradYear:short,school:short,height:short,weight:short,email:short,
 parents:z.array(z.object({name:short,rel:short,phone:short,email:short}).strict()).max(10),roleType:z.enum(['full','po']),coachChild:z.boolean(),joinedOn:short,withdrawn:z.boolean(),
 agreement:z.object({version:short,signedBy:short,signedAt:short}).strict(),
 feeLock:z.object({amount:money,lockedAt:short,policyVersion:short,components:numbers}).strict().nullable().optional(),
 planLock:z.object({dep:money,deadline:short,planType:short,rows:z.array(z.object({date:short,amount:money}).strict()).max(100)}).strict().nullable().optional(),
 credits:z.array(z.object({label:short,amount:money}).strict()).max(1000).optional(),
 payments:z.array(z.object({date:short,amount:money,fee:money,charged:money,method:short,label:short,receipt:short}).strict()).max(2000).optional(),
 cards:z.array(z.object({brand:short,last4:z.string().max(4),exp:short,primary:z.boolean()}).strict()).max(20).optional(),
 planType:short,depositPaid:z.boolean(),uniformWaived:z.boolean(),
 order:z.object({number:z.string().max(3),sizes:z.record(short,z.string().max(30)),submitted:z.boolean()}).strict(),
 docs:z.object({waiver:z.boolean(),birthCert:z.boolean(),insurance:z.boolean(),physical:z.boolean()}).strict(),
 emergency:z.object({allergies:text,conditions:text,insurer:short,policyNo:short,physician:short,pickup:strings,notes:text}).strict(),
 publicProfile:z.object({enabled:z.boolean(),bio:text,slug:short}).strict(),prefs:z.object({email:z.boolean(),sms:z.boolean()}).strict(),reenroll:z.boolean(),cageOverage:money,stats:numbers,
 rsvp:z.record(id,z.enum(['going','maybe','cant',''])),
}).strict();
const team=z.object({
 id,name:short,sport:z.enum(['baseball','softball']),age:short,level:short,seasonLabel:short,seasonStart:short,seasonEnd:short,months:count,headCoach:short,coachEmail:short,staff:z.array(staff).max(100),
 uniformPackageId:id,uniformDeadline:short,orgFee:money,coachMonthly:money,eventBudget:money,tournamentIds:strings,
 otherCosts:z.object({insurance:money,balls:money,fields:money,admin:money,travel:money}).strict(),teamCageHoursPerWeek:money,playerCageHoursPerWeek:money,
 record:z.object({w:count,l:count,t:count}).strict(),roster:z.array(player).max(500),
 practices:z.array(z.object({id,date:short,time:short,where:short,cageHours:money,status:z.enum(['set','delayed','moved','cancelled','on'])}).strict()).max(2000),
 messages:z.array(z.object({id,at:short,from:short,body:text}).strict()).max(5000),
 announcements:z.array(z.object({id,title:short,body:text,pin:z.boolean(),arrive:short,uniform:short,hotel:short}).strict()).max(1000),
 attendance:z.record(id,z.record(id,z.enum(['present','late','excused','absent']))),
 pitchLog:z.array(z.object({id,playerId:id,date:short,pitches:count}).strict()).max(5000),closed:z.boolean(),notes:text,
}).strict();
const club=z.object({
 settings:z.object({contingencyPct:money,membershipMonthly:money,facilityMonthly:money,fundingPlayers:count,cardFeePct:money,orgFeeFloor:money,orgFeeCeiling:money,coachPayMin:money,coachPayMax:money,cageHourly:money,roundTo:money,policyVersion:short}).strict(),
 teams:z.array(team).max(200),
 catalog:z.array(z.object({id,org:short,name:short,city:short,state:short,start:short,end:short,ages:strings,levels:strings,fee:money,sport:short,type:z.enum(['tournament','showcase']),stayToPlay:z.boolean(),verifiedOn:short}).strict()).max(3000),
 uniforms:z.array(z.object({id,name:short,sport:z.enum(['baseball','softball']),price:money,items:strings,colourways:strings,sizeFields:strings}).strict()).max(100),
 leads:z.array(z.object({id,name:short,age:short,stage:z.enum(['lead','registered','evaluated','offer','accepted','waitlist']),grades:numbers,teamId:id}).strict()).max(5000),
 alumni:z.array(z.object({id,name:short,kind:z.enum(['college','draft','pro']),detail:text}).strict()).max(2000),
 notifications:z.array(z.object({id,ts:short,teamId:id,kind:short,title:short,body:text,audience:z.enum(['admin','coach','family','all'])}).strict()).max(5000),
 audit:z.array(z.object({at:short,action:short,detail:text}).strict()).max(5000),onboarding:z.object({started:z.boolean()}).strict(),_rev:count,_savedAt:short,_demo:z.boolean(),
}).strict();
export function parseClubSave(input:{club:ClubRecord;baseRev:number}) {
 if(JSON.stringify(input).length>5000000)throw new Error('Club record is too large.');
 const parsed=z.object({club,baseRev:count}).strict().parse(input);
 const ids=parsed.club.teams.flatMap(t=>t.roster.map(p=>p.id));
 if(new Set(ids).size!==ids.length)throw new Error('Player identifiers must be unique.');
 for(const t of parsed.club.teams)if(t.roster.some(p=>p.teamId!==t.id))throw new Error('Player team does not match its roster.');
 return parsed as {club:ClubRecord;baseRev:number};
}
