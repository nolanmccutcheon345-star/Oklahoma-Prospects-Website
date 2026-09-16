import type { Sql } from '../db';
import { chicagoDate } from '../scheduling';

/** Runs under the booking row lock; both the family and desk use this gate. */
export async function enforceVisitWaivers(sql:Sql, booking:{id:string;participant_count:number;participants_verified:boolean;starts_at:Date;ends_at:Date}, now=new Date()) {
 if (!booking.participants_verified) throw new Error('Confirm every participating athlete before check-in.');
 const participants=await sql<{name:string;current:boolean}>`select a.name, exists(
   select 1 from club_waivers w where w.athlete_id=a.id and w.signed_at <= ${now.toISOString()}
   and w.signed_at+interval '1 year' > ${now.toISOString()}) as current
   from booking_participants p join club_athletes a on a.id=p.athlete_id where p.booking_id=${booking.id}`;
 if(participants.length!==booking.participant_count)throw new Error('Add every participating athlete before check-in.');
 const missing=participants.filter(p=>!p.current);
 if(missing.length)throw new Error(`A current annual waiver is required for: ${missing.map(p=>p.name).join(', ')}. Open Annual waiver to sign.`);
 if(chicagoDate(new Date(booking.starts_at))!==chicagoDate(now)||new Date(booking.ends_at)<=now)throw new Error('Check in on the date of your reservation, before it ends.');
}
