import {z} from 'zod';
export const TRACKS=['Pitching','Hitting','Fielding','Catching','Softball'] as const;
export const profileInput=z.object({name:z.string().trim().min(1).max(120),specialties:z.array(z.string().max(60)).max(8),career:z.string().trim().max(3000),approach:z.string().trim().max(2000),ages:z.string().trim().max(500),achievements:z.string().trim().max(2000),welcome:z.string().trim().max(1000),published:z.boolean()}).strict().refine(profile => !profile.published || profile.career.length > 0, {message:"Add a short bio in Career & background before publishing.",path:["career"]});
const availabilityClock=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const availabilityWindow=z.object({weekday:z.enum(['Mon','Tue','Wed','Thu','Fri','Sat','Sun']),start:availabilityClock,end:availabilityClock}).strict().refine(w=>{
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end))return true;
  const minutes=(clock:string)=>Number(clock.slice(0,2))*60+Number(clock.slice(3));
  const start=minutes(w.start),end=minutes(w.end),open=['Sat','Sun'].includes(w.weekday)?13*60:16*60;
  return start>=open&&end<=20*60&&start<end;
},{message:'Availability must fit the club’s opening hours.',path:['start']});
export const availabilityInput=z.object({windows:z.array(availabilityWindow).max(28)}).strict().refine(({windows}) =>
  windows.every((window,index) => !windows.slice(index+1).some(other =>
    window.weekday===other.weekday && window.start<other.end && other.start<window.end)),
  {message:'Availability windows on the same day cannot overlap.',path:['windows']});
const athleteId=z.string().min(1).max(150),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const trackInput=z.object({athleteId,track:z.enum(TRACKS),level:z.number().int().min(1).max(7),evidence:z.string().trim().min(10).max(5000)}).strict();
export const metricInput=z.object({id:z.string().uuid(),athleteId,track:z.enum(TRACKS),day,successes:z.number().int().min(0).max(10000),attempts:z.number().int().min(1).max(10000),notes:z.string().trim().min(3).max(2000)}).strict().refine(v=>v.successes<=v.attempts);
export const dayInput=z.object({athleteId,day,focus:z.string().trim().min(3).max(300),gameNotes:z.string().max(1000),items:z.array(z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(150),track:z.enum([...TRACKS,'Strength','Recovery']),sets:z.number().int().min(1).max(100),reps:z.string().min(1).max(80),instructions:z.string().trim().min(5).max(3000),videoUrl:z.union([z.literal(''),z.url().startsWith('https://')])}).strict()).max(20).refine(items=>new Set(items.map(item=>item.id)).size===items.length,{message:"Each drill must have a unique ID."})}).strict();
export const logInput=z.object({athleteId,day,itemId:z.string().uuid(),completed:z.boolean(),reps:z.number().int().min(0).max(10000).optional(),weight:z.number().min(0).max(1500).optional(),rpe:z.number().int().min(1).max(10).optional(),notes:z.string().max(1000)}).strict();
