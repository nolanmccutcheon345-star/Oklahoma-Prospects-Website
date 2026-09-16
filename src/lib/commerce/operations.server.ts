import { getSql } from '../db';
import { clubIdentity } from '../identity.server';
import { readWorkingFile } from '../pd/desk-impl.server';
import { BOOKABLE_LANES } from '../club';

export async function setParticipants(userId:string,id:string,athleteIds:string[]) {
 const me=await clubIdentity(userId);const sql=await getSql();
 return sql.transaction(async tx=>{
  const [booking]=await tx<{id:string;participant_count:number;starts_at:Date;ends_at:Date;athlete_id:string|null}>`select * from booking_records where id=${id} and (user_id=${userId} or ${me.role==='admin'}) and status='confirmed' and checked_in_at is null for update`;
  if(!booking)throw new Error('Choose an upcoming confirmed reservation that has not been checked in.');
  if(new Date(booking.ends_at)<=new Date())throw new Error('This reservation has ended.');
  const ids=[...new Set(athleteIds)];
  if(ids.length!==booking.participant_count)throw new Error(`Choose all ${booking.participant_count} participating athletes.`);
  if(booking.athlete_id&&!ids.includes(booking.athlete_id))throw new Error('The booked athlete must participate.');
  const athletes=await tx`select id from club_athletes where id=any(${ids}::text[]) and (user_id=${userId} or ${me.role==='admin'})`;
  if(athletes.length!==ids.length)throw new Error('Choose athletes in your household.');
  await tx`delete from booking_occupancy where booking_id=${id} and resource_id like 'athlete:%'`;
  await tx`delete from booking_participants where booking_id=${id}`;
  for(const athleteId of ids.sort()) {
   await tx`insert into booking_participants(booking_id,athlete_id) values(${id},${athleteId})`;
   for(let ms=new Date(booking.starts_at).getTime();ms<new Date(booking.ends_at).getTime();ms+=300000)
    await tx`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${'athlete:'+athleteId},${new Date(ms).toISOString()},${id})`;
  }
  await tx`update booking_records set participants_verified=true where id=${id}`;
  return {ok:true};
 });
}

export async function earnings(userId:string) {
 const me=await clubIdentity(userId);
 if(me.role!=='admin'&&me.role!=='coach')throw new Error('Coach access required.');
 const file=await readWorkingFile();const coach=file.coaches.find(c=>c.email.trim().toLowerCase()===me.email);
 const sql=await getSql();
 const rows=await sql<{booking_id:string;coach_id:string;amount_cents:number;gross_cents:number;split_pct:string;status:string;transfer_id:string|null;updated_at:Date}>`select * from contractor_earnings where coach_id=${coach?.id||''} or ${me.role==='admin'} order by updated_at desc limit 500`;
 return {canSettle:me.role==='admin',rows};
}

/** Records a payment already made outside the site. Never initiates a transfer. */
export async function recordSettlement(userId:string,bookingId:string,reference:string) {
 const me=await clubIdentity(userId);if(me.role!=='admin')throw new Error('Owner access required.');
 const sql=await getSql();
 return sql.transaction(async tx=>{
  const [row]=await tx<{status:string;transfer_id:string|null}>`select status,transfer_id from contractor_earnings where booking_id=${bookingId} for update`;
  const key='external:'+reference;
  if(row?.status==='paid'&&row.transfer_id===key)return {ok:true};
  if(row?.status!=='payable')throw new Error('Only an unpaid, payable earning can be settled.');
  const [order]=await tx`select o.id from commerce_orders o join booking_records b on b.order_id=o.id where b.id=${bookingId} and o.status='paid' and b.status='completed' for update of o`;
  if(!order)throw new Error('Review this booking and its payment before settlement.');
  await tx`update contractor_earnings set status='paid',transfer_id=${key},updated_at=now() where booking_id=${bookingId}`;
  return {ok:true};
 });
}

export async function officeOperations(userId:string) {
 const me=await clubIdentity(userId);if(me.role!=='admin')throw new Error('Owner access required.');
 const sql=await getSql();
 const [bookings,resources,counts,events]=await Promise.all([
  sql<{id:string;product_id:string;starts_at:Date;status:string;checked_in_at:Date|null;participant_count:number;participant_names:string|null;missing_waivers:number}>`select b.id,b.product_id,b.starts_at,b.status,b.checked_in_at,b.participant_count,
   string_agg(a.name,', ') as participant_names,
   count(*) filter(where a.id is null or not exists(select 1 from club_waivers w where w.athlete_id=a.id and w.signed_at+interval '1 year'>now()))::integer as missing_waivers
   from booking_records b left join booking_participants p on p.booking_id=b.id left join club_athletes a on a.id=p.athlete_id
   where b.starts_at>now()-interval '1 day' and b.starts_at<now()+interval '14 days' and b.status='confirmed' group by b.id order by b.starts_at limit 200`,
  sql<{service_id:string;name:string;lane_ids:string[]|null}>`select s.id as service_id,s.name,r.lane_ids from club_services s left join service_resources r on r.service_id=s.id where s.kind='lesson' and s.active and s.id not in ('s5','s6') order by s.sort_order`,
  sql<{legacy_reservations:number;legacy_assessments:number;confirmed_bookings:number;verified_assessments:number;paid_cents:number;open_review:number}>`select
   (select count(*)::integer from reservations) as legacy_reservations,
   (select count(*)::integer from profiles where assessment_complete=true) as legacy_assessments,
   (select count(*)::integer from booking_records where status in ('confirmed','completed')) as confirmed_bookings,
   (select count(*)::integer from athlete_assessments) as verified_assessments,
   (select coalesce(sum(total_cents),0) from commerce_orders where status='paid') as paid_cents,
   (select count(*)::integer from commerce_orders where status='payment_review') as open_review`,
  sql<{id:number;actor_id:string;action:string;target_table:string;target_id:string;created_at:Date}>`select id,actor_id,action,target_table,target_id,created_at from audit_events order by id desc limit 100`,
 ]);
 return {bookings,resources,counts:counts[0],events};
}
export async function saveServiceResources(userId:string,serviceId:string,laneIds:string[]) {
 const me=await clubIdentity(userId);if(me.role!=='admin')throw new Error('Owner access required.');
 if(!laneIds.length||laneIds.some(id=>!BOOKABLE_LANES.some(l=>l.id===id)))throw new Error('Choose the physical space this lesson needs.');
 const sql=await getSql();
 await sql`insert into service_resources(service_id,lane_ids) values(${serviceId},${JSON.stringify([...new Set(laneIds)])}::jsonb) on conflict(service_id) do update set lane_ids=excluded.lane_ids`;
 return {ok:true};
}

export async function lessonResources(serviceId:string,sql:Awaited<ReturnType<typeof getSql>>) {
 const [row]=await sql<{lane_ids:string[]}>`select lane_ids from service_resources where service_id=${serviceId}`;
 if(!row?.lane_ids.length)throw new Error('The front desk must assign a facility space for this lesson before online booking opens. Please call to reserve.');
 return row.lane_ids.map(id=>'lane:'+id);
}
