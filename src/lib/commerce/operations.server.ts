import { lockFinancialExecution } from "../finance/execution.server";
import { clubIdentity as staffIdentity } from "../identity.server";
import { getSql } from "../db";
import { commerceIdentity as clubIdentity } from "./access.server";
import { readWorkingFile } from "../pd/desk-impl.server";
import { assignedCoachIdFor } from "./coach-access.server";
import { BOOKABLE_LANES } from "../club";

export async function setParticipants(userId: string, id: string, athleteIds: string[]) {
  const me = await clubIdentity(userId);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await tx`select id from booking_records where id=${id} for update`;
    const [booking] = await tx<{
      id: string;
      participant_count: number;
      starts_at: Date;
      ends_at: Date;
      athlete_id: string | null;
      household_id: string;
    }>`select * from operational_booking_schedule where id=${id} and (household_id=any(${me.billingHouseholdIds}::text[]) or ${me.role === "admin"}) and status='confirmed' and checked_in_at is null`;
    if (!booking) throw new Error("Choose an upcoming paid booking that has not been checked in.");
    if (new Date(booking.ends_at) <= new Date()) throw new Error("This booking has ended.");
    const ids = [...new Set(athleteIds)];
    if (ids.length !== booking.participant_count)
      throw new Error(`Choose all ${booking.participant_count} participating athletes.`);
    if (booking.athlete_id && !ids.includes(booking.athlete_id))
      throw new Error("The booked athlete must participate.");
    const athletes =
      await tx`select id from club_athletes where id=any(${ids}::text[]) and (household_id=${booking.household_id} or ${me.role === "admin"})`;
    if (athletes.length !== ids.length) throw new Error("Choose athletes in your household.");
    await tx`delete from booking_occupancy where booking_id=${id} and resource_id like 'athlete:%'`;
    await tx`delete from booking_participants where booking_id=${id}`;
    for (const athleteId of ids.sort()) {
      await tx`insert into booking_participants(booking_id,athlete_id) values(${id},${athleteId})`;
      for (
        let ms = new Date(booking.starts_at).getTime();
        ms < new Date(booking.ends_at).getTime();
        ms += 300000
      )
        await tx`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${"athlete:" + athleteId},${new Date(ms).toISOString()},${id})`;
    }
    await tx`update booking_records set participants_verified=true where id=${id}`;
    return { ok: true };
  });
}

export async function earnings(userId: string) {
  const sql = await getSql();
  const {
    lockFinancialExecution,
    financialSourceModeInTransaction,
    loadFinancialContextInTransaction,
  } = await import("../finance/context.server");
  const active = await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    if ((await financialSourceModeInTransaction(tx)) === "legacy") return null;
    const context = await loadFinancialContextInTransaction(tx, userId, "read");
    return (await import("../finance/self.server")).financialEarningsInTransaction(tx, context);
  });
  if (active) return active;
  const me = await staffIdentity(userId);
  if (me.role !== "admin" && me.role !== "coach" && !me.canInstruct)
    throw new Error("Coach access required.");
  const file = await readWorkingFile();
  const coachId = assignedCoachIdFor(me, file);
  const rows = await sql<{
    booking_id: string;
    coach_id: string;
    amount_cents: number;
    gross_cents: number;
    split_pct: string;
    status: string;
    transfer_id: string | null;
    updated_at: Date;
  }>`select * from contractor_earnings where coach_id=${coachId} or ${me.role === "admin"} order by updated_at desc limit 500`;
  return { canSettle: me.role === "admin", rows };
}

/** Records a payment already made outside the site. Never initiates a transfer. */
export async function recordSettlement(userId: string, bookingId: string, reference: string) {
  const me = await clubIdentity(userId);
  if (me.role !== "admin") throw new Error("Owner access required.");
  throw new Error(
    "Use Front Office → Finance → Payout Center to approve, record and reconcile this payment. Entering a reference alone does not mark it paid.",
  );
}

export async function officeOperations(userId: string) {
  const me = await clubIdentity(userId);
  if (me.role !== "admin") throw new Error("Owner access required.");
  const sql = await getSql();
  const [bookings, resources, counts, events, athletes] = await Promise.all([
    sql<{
      id: string;
      product_id: string;
      starts_at: Date;
      ends_at: Date;
      resources: string[];
      customer_email: string | null;
      total_cents: number | null;
      status: string;
      checked_in_at: Date | null;
      participant_count: number;
      participant_names: string | null;
      missing_waivers: number;
    }>`select b.id,b.product_id,b.starts_at,b.ends_at,b.resources,b.status,b.checked_in_at,b.participant_count,o.email as customer_email,o.total_cents,
   string_agg(a.name,', ') as participant_names,
   count(*) filter(where a.id is null or not exists(select 1 from club_waivers w where w.athlete_id=a.id and w.signed_at<=now() and w.signed_at+interval '1 year'>now()))::integer as missing_waivers
   from operational_booking_schedule b left join commerce_orders o on o.id=b.order_id left join booking_participants p on p.booking_id=b.id left join club_athletes a on a.id=p.athlete_id
   where b.starts_at>now()-interval '1 day' and b.starts_at<now()+interval '14 days' and b.status='confirmed' group by b.id,b.product_id,b.starts_at,b.ends_at,b.resources,b.status,b.checked_in_at,b.participant_count,o.id order by b.starts_at limit 200`,
    sql<{
      service_id: string;
      name: string;
      lane_ids: string[] | null;
    }>`select s.id as service_id,s.name,r.lane_ids from club_services s left join service_resources r on r.service_id=s.id where s.kind='lesson' and s.active and s.id not in ('s5','s6') order by s.sort_order`,
    sql<{
      claimed_athletes: number;
      guest_athletes: number;
      development_athletes: number;
      strength_versions: number;
      saved_bullpens: number;
      legacy_reservations: number;
      legacy_assessments: number;
      confirmed_bookings: number;
      verified_assessments: number;
      paid_cents: number;
      open_review: number;
    }>`select
   (select count(*)::integer from club_athletes where user_id is not null) as claimed_athletes,
   (select count(*)::integer from club_athletes where user_id is null) as guest_athletes,
   coalesce((select jsonb_array_length(payload::jsonb->'athletes') from pd_working_file where id='club'),0) as development_athletes,
   coalesce((select jsonb_array_length(payload::jsonb->'strengthAssignments') from pd_working_file where id='club'),0) as strength_versions,
   coalesce((select jsonb_array_length(payload::jsonb->'bullpens') from pd_working_file where id='club'),0) as saved_bullpens,
   (select count(*)::integer from reservations) as legacy_reservations,
   (select count(*)::integer from profiles where assessment_complete=true) as legacy_assessments,
   (select count(*)::integer from booking_records where status in ('confirmed','completed')) as confirmed_bookings,
   (select count(*)::integer from athlete_assessments) as verified_assessments,
   (select coalesce(sum(total_cents),0) from commerce_orders where status='paid') as paid_cents,
   (select count(*)::integer from commerce_orders where status='payment_review') as open_review`,
    sql<{
      id: number;
      actor_id: string;
      action: string;
      target_table: string;
      target_id: string;
      created_at: Date;
    }>`select id,actor_id,action,target_table,target_id,created_at from audit_events order by id desc limit 100`,
    sql<{
      id: string;
      name: string;
    }>`select id,name from club_athletes where user_id is not null order by name limit 2000`,
  ]);
  return { bookings, resources, counts: counts[0], events, athletes };
}
export async function saveServiceResources(userId: string, serviceId: string, laneIds: string[]) {
  if (!laneIds.length || laneIds.some((id) => !BOOKABLE_LANES.some((l) => l.id === id)))
    throw new Error("Choose the physical space this lesson needs.");
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const { requireOrganizationOperations, audit, CoordinatorDenied } =
      await import("../coordinator/access.server");
    try {
      await requireOrganizationOperations(tx, userId);
    } catch (error) {
      if (error instanceof CoordinatorDenied)
        throw new Error("Owner access or organization operations access required.");
      throw error;
    }
    const [service] =
      await tx`select id from club_services where id=${serviceId} and kind='lesson' and active for update`;
    if (!service) throw new Error("Choose an active lesson to assign its facility space.");
    await tx`insert into service_resources(service_id,lane_ids) values(${serviceId},${JSON.stringify([...new Set(laneIds)])}::jsonb) on conflict(service_id) do update set lane_ids=excluded.lane_ids`;
    await audit(tx, userId, "organization.facility.assign", serviceId, "allowed");
    return { ok: true };
  });
}

export async function operationalServiceResources(userId: string) {
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const { requireOrganizationOperations } = await import("../coordinator/access.server");
    await requireOrganizationOperations(tx, userId);
    return tx<{
      id: string;
      name: string;
      lane_ids: string[];
    }>`select s.id,s.name,coalesce(r.lane_ids,'[]'::jsonb) as lane_ids from club_services s left join service_resources r on r.service_id=s.id where s.kind='lesson' and s.active order by s.sort_order,s.id`;
  });
}

export async function lessonResources(serviceId: string, sql: Awaited<ReturnType<typeof getSql>>) {
  const [row] = await sql<{
    lane_ids: unknown;
  }>`select lane_ids from service_resources where service_id=${serviceId}`;
  if (
    !Array.isArray(row?.lane_ids) ||
    !row.lane_ids.length ||
    row.lane_ids.some(
      (id) => typeof id !== "string" || !BOOKABLE_LANES.some((lane) => lane.id === id),
    )
  )
    throw new Error(
      "This lesson is unavailable until a facility space is assigned. Choose another available service.",
    );
  return [...new Set(row.lane_ids as string[])].map((id) => "lane:" + id);
}
