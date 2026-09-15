import type { DevelopmentData, Athlete, Booking } from '../pd/types';
import type { Sql } from '../db';
import { chicagoDate } from '../scheduling';

/** Overlay payment/completion facts. The editable coaching file is never financial authority. */
export async function withCommerceRecords(sql: Sql, data: DevelopmentData): Promise<DevelopmentData> {
  const [athletes, completed, bookings, credits] = await Promise.all([
    sql<{id:string;user_id:string|null;household_email:string;name:string;birth_date:string|null;coach_ids:string[];profile:Partial<Athlete>}>`select * from club_athletes`,
    sql<{athlete_id:string}>`select distinct athlete_id from athlete_assessments`,
    sql<{id:string;athlete_id:string;coach_id:string;product_id:string;starts_at:Date;status:string;total_cents:number}>`select b.id,b.athlete_id,b.coach_id,b.product_id,b.starts_at,b.status,coalesce(o.total_cents,0) as total_cents from booking_records b left join commerce_orders o on o.id=b.order_id where b.athlete_id is not null`,
    sql<{athlete_id:string;remaining:number}>`select athlete_id,sum(remaining)::integer as remaining from credit_grants where kind='lesson' and expires_at>now() and starts_at<=now() group by athlete_id`,
  ]);
  const families = data.families.map(f=>({...f,athleteIds:[...f.athleteIds]}));
  const all = [...data.athletes];
  for (const row of athletes) {
    // Guest purchases remain private until a verified account claims them.
    if (!row.user_id) continue;
    let family = families.find(f=>f.email.toLowerCase()===row.household_email.toLowerCase());
    if (!family) { family={id:`fam-${row.user_id}`,name:'Your household',parentName:'',email:row.household_email,phone:'',athleteIds:[]}; families.push(family); }
    if (!family.athleteIds.includes(row.id)) family.athleteIds.push(row.id);
    const existing = all.find(a=>a.id===row.id);
    if (existing) { existing.familyId=family.id; existing.coachIds=row.coach_ids; continue; }
    const [firstName,...last] = row.name.trim().split(/\s+/);
    all.push({id:row.id,firstName,lastName:last.join(' '),birthDate:row.birth_date?.slice(0,10)||'',familyId:family.id,
      sport:row.profile?.sport||'',throws:row.profile?.throws||'',bats:row.profile?.bats||'',graduationYear:0,position:'',coachIds:row.coach_ids,opLevel:0,assessmentComplete:false,
      school:'',city:'',notes:'',tags:['complete-profile']} as Athlete);
  }
  const assessmentIds = new Set(completed.map(a=>a.athlete_id));
  const ledger = bookings.map(row=>({id:row.id,athleteId:row.athlete_id,coachId:row.coach_id,serviceId:row.product_id,
    date:chicagoDate(new Date(row.starts_at)),time:new Intl.DateTimeFormat('en-GB',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(row.starts_at)),
    status:row.status==='confirmed'?'paid':row.status==='completed'?'completed':row.status==='cancelled'?'cancelled':'unconfirmed',price:row.total_cents/100} as Booking));
  const known = new Set(ledger.map(b=>b.id));
  return {...data,families:families.map(f=>({...f,plan:{...f.plan,type:f.plan?.type||'none',lessonCredits:credits.filter(c=>f.athleteIds.includes(c.athlete_id)).reduce((n,c)=>n+c.remaining,0)}})),
    athletes:all.map(a=>({...a,assessmentComplete:assessmentIds.has(a.id)})),
    bookings:[...data.bookings.filter(b=>!known.has(b.id)).map(b=>({...b,status:b.status==='cancelled'?'cancelled':'unconfirmed'} as Booking)),...ledger]};
}
