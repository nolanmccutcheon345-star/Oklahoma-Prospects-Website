import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db";
import { clubIdentity } from "../identity.server";
import { refundCents, ASSESSMENT_PRODUCTS } from "../pricing";
import { stripeClient, checkoutOrigin } from "./stripe.server";
import { readWorkingFile } from "../pd/desk-impl.server";
import type { Quote } from "./contracts";
import { prepareCancellation } from "./store.server";

export async function familyBilling(userId: string,page=0) {
  const me = await clubIdentity(userId); const sql = await getSql();
  return readFamilyBilling(sql,me,page);
}
export async function readFamilyBilling(sql:Sql,me:Awaited<ReturnType<typeof clubIdentity>>,page=0) {
  const [orders, bookings, subscriptions, invoices, credits, athletes, requests] = await Promise.all([
    sql<{ id:string; product_id:string; snapshot:Quote; total_cents:number; status:string; receipt_url:string|null; created_at:Date }>`select id,product_id,snapshot,total_cents,status,receipt_url,created_at from commerce_orders where household_id = any(${me.billingHouseholdIds}::text[]) order by created_at desc,id desc limit 50 offset ${page*50}`,
    sql<{ id:string; order_id:string; product_id:string; starts_at:Date; ends_at:Date; status:string; participant_count:number; completion_recap:string|null; checked_in_at:Date|null }>`select id,order_id,product_id,starts_at,ends_at,status,participant_count,completion_recap,checked_in_at from booking_records where household_id = any(${me.billingHouseholdIds}::text[]) order by starts_at desc,id desc limit 50 offset ${page*50}`,
    sql<{ id:string; product_id:string; amount_cents:number; status:string; period_end:Date; cancel_at_period_end:boolean; pause_requested_at:Date|null }>`select id,product_id,amount_cents,status,period_end,cancel_at_period_end,pause_requested_at from club_subscriptions where household_id = any(${me.billingHouseholdIds}::text[]) order by period_end desc`,
    sql<{ id:string; amount_cents:number; status:string; invoice_url:string|null; pdf_url:string|null; created_at:Date }>`select id,amount_cents,status,invoice_url,pdf_url,created_at from billing_invoices where household_id = any(${me.billingHouseholdIds}::text[]) order by created_at desc,id desc limit 50 offset ${page*50}`,
    sql<{ id:string; kind:string; minutes:number; remaining:number; expires_at:Date; rollover:boolean; athlete_id:string }>`select id,kind,minutes,remaining,expires_at,rollover,athlete_id from credit_grants where household_id = any(${me.billingHouseholdIds}::text[]) and remaining > 0 and starts_at <= now() and expires_at > now() and order_id in (select id from commerce_orders where status='paid') order by expires_at`,
    sql<{ id:string; name:string; birth_date:string|null; assessment_complete:boolean }>`select id,name,birth_date,exists(select 1 from athlete_assessments a where a.athlete_id = c.id) as assessment_complete from club_athletes c where household_id = any(${me.billingHouseholdIds}::text[])`,
    sql<{ id:string; kind:string; status:string; created_at:Date }>`select id,kind,status,created_at from club_requests where user_id = ${me.userId} order by created_at desc limit 100`,
  ]);
  return { orders, bookings, subscriptions, invoices, credits, athletes, requests, historyHasMore:orders.length===50||bookings.length===50||invoices.length===50 };
}

export async function claimGuestOrders(userId: string) {
  const me = await clubIdentity(userId); const sql = await getSql();
  return sql.transaction(async tx => {
    const orders = await tx<{id:string}>`update commerce_orders set user_id = ${userId}
      where user_id is null and lower(email) = ${me.email} and status in ('paid','payment_review','refunded','cancelled') returning id`;
    const ids = orders.map(o=>o.id);
    await tx`update club_athletes set user_id = ${userId} where user_id is null and id in (select athlete_id from commerce_orders where id = any(${ids}::text[]))`;
    await tx`update booking_records set user_id = ${userId} where order_id = any(${ids}::text[])`;
    await tx`update club_subscriptions set user_id = ${userId} where order_id = any(${ids}::text[])`;
    await tx`update credit_grants set user_id = ${userId} where order_id = any(${ids}::text[])`;
    await tx`update billing_invoices set user_id = ${userId} where subscription_id in (select id from club_subscriptions where user_id = ${userId})`;
    return { claimed: ids.length };
  });
}

export async function cancelRenewal(userId: string, subscriptionId: string) {
  const me = await clubIdentity(userId); const sql = await getSql();
  const [sub] = await sql<{id:string;period_end:Date}>`select id,period_end from club_subscriptions where id = ${subscriptionId} and household_id = any(${me.billingHouseholdIds}::text[])`;
  if (!sub) throw new Error("Membership not found.");
  const current = await stripeClient().subscriptions.update(sub.id, {cancel_at_period_end:true}, {idempotencyKey:`stop-renewal:${sub.id}:${new Date(sub.period_end).toISOString()}`});
  await sql`update club_subscriptions set cancel_at_period_end = ${current.cancel_at_period_end}, updated_at = now() where id = ${sub.id}`;
  return { ok:true };
}

export async function billingPortal(userId: string, subscriptionId: string) {
  await clubIdentity(userId); const sql = await getSql();
  const [sub] = await sql<{customer_id:string}>`select customer_id from club_subscriptions where id = ${subscriptionId} and user_id = ${userId}`;
  if (!sub) throw new Error("Only the original purchaser can manage saved payment methods.");
  const session = await stripeClient().billingPortal.sessions.create({customer:sub.customer_id,return_url:`${checkoutOrigin()}/family`});
  return { url:session.url };
}

export async function requestPause(userId: string, id: string, reason: string) {
  const me = await clubIdentity(userId); const sql = await getSql();
  return sql.transaction(async tx=>{
    const [sub] = await tx`update club_subscriptions set pause_requested_at = now() where id = ${id} and household_id = any(${me.billingHouseholdIds}::text[]) returning id`;
    if (!sub) throw new Error("Membership not found.");
    await tx`insert into club_requests (id,user_id,kind,payload) values (${randomUUID()},${userId},'membership-pause',${JSON.stringify({subscriptionId:id,reason})}::jsonb)`;
    return {ok:true};
  });
}

async function refundableOrder(userId: string, orderId: string) {
  const me = await clubIdentity(userId); const sql = await getSql();
  const [order] = await sql<{id:string;total_cents:number;status:string;payment_intent_id:string|null;snapshot:Quote}>`
    select id,total_cents,status,payment_intent_id,snapshot from commerce_orders where id = ${orderId} and (household_id = any(${me.billingHouseholdIds}::text[]) or ${me.role === "admin"})`;
  if (!order) throw new Error("Order not found.");
  const [booking] = await sql<{id:string;starts_at:Date;ends_at:Date;status:string}>`select id,starts_at,ends_at,status from booking_records where order_id = ${orderId} order by starts_at limit 1`;
  if (booking?.status === "completed" || (booking && new Date(booking.ends_at).getTime() <= Date.now() && booking.status !== "cancelled")) throw new Error("Completed and past sessions require front-office review.");
  const manual = order.snapshot.recurring || order.snapshot.kind === "package" || !booking;
  const [existing] = await sql<{amount_cents:number}>`select amount_cents from commerce_refunds where order_id=${orderId}`;
  const amount = existing?.amount_cents ?? (manual ? null : refundCents(order.total_cents,new Date(booking.starts_at)));
  return {order,booking,amount,manual};
}
export async function previewRefund(userId:string,orderId:string) {
  const {order,amount,manual} = await refundableOrder(userId,orderId);
  return {orderId:order.id,paidCents:order.total_cents,refundCents:amount,requiresReview:manual};
}
export async function cancelAndRefund(userId:string,orderId:string) {
  const {order,booking,amount,manual} = await refundableOrder(userId,orderId);
  const sql = await getSql();
  if (manual) {
    await sql`insert into club_requests (id,user_id,kind,payload) values (${"refund-review:"+order.id},${userId},'refund-review',${JSON.stringify({orderId:order.id})}::jsonb) on conflict do nothing`;
    return {status:"review_requested",refundCents:null};
  }
  if (!booking || amount === null) throw new Error("Booking not found.");
  const refund = await sql.transaction(tx => prepareCancellation(tx,order.id,userId));
  if (refund.status === "succeeded") return {status:"succeeded",refundCents:refund.amount_cents};
  if (refund.amount_cents > 0 && !order.payment_intent_id) throw new Error("Your payment needs front-office review before refunding.");
  let result;
  try {
    result = refund.amount_cents > 0 ? await stripeClient().refunds.create({payment_intent:order.payment_intent_id!,amount:refund.amount_cents},{idempotencyKey:`refund:${refund.id}`}) : null;
  } catch {
    throw new Error("Your reservation is cancelled. The refund is awaiting confirmation; retry it from billing history or contact the front desk.");
  }
  await sql.transaction(async tx=>{
    await tx`update commerce_refunds set stripe_refund_id = ${result?.id || null}, status = ${result?.status || "succeeded"} where id = ${refund.id}`;
    await tx`update commerce_orders set status = ${(result && result.status !== "succeeded") ? "refunding" : refund.amount_cents === order.total_cents ? "refunded" : "cancelled"}, updated_at = now() where id = ${order.id}`;
  });
  return {status:result?.status || "succeeded",refundCents:refund.amount_cents};
}

export async function checkIn(userId:string,bookingId:string) {
  const me = await clubIdentity(userId); const sql = await getSql();
  return sql.transaction(async tx=>{
    const [row]=await tx<{id:string;participant_count:number;participants_verified:boolean;starts_at:Date;ends_at:Date}>`select id,participant_count,participants_verified,starts_at,ends_at from booking_records
      where id=${bookingId} and (household_id=any(${me.billingHouseholdIds}::text[]) or ${me.role==='admin'}) and status='confirmed' for update`;
    if(!row)throw new Error('Only your confirmed reservations can be checked in.');
    const {enforceVisitWaivers}=await import('./waivers.server');
    await enforceVisitWaivers(tx,row);
    await tx`update booking_records set checked_in_at=coalesce(checked_in_at,now()) where id=${bookingId}`;
    return {ok:true};
  });
}

export async function coachBookings(userId:string) {
  const me = await clubIdentity(userId);
  if (me.role !== "admin" && me.role !== "coach") throw new Error("Coach access required.");
  const file = await readWorkingFile(); const coachId = file.coaches.find(c=>c.email.toLowerCase()===me.email)?.id || "";
  const sql = await getSql();
  return sql<{id:string;athlete_id:string;athlete_name:string;product_id:string;starts_at:Date;ends_at:Date;status:string}>`
    select b.id,b.athlete_id,a.name as athlete_name,b.product_id,b.starts_at,b.ends_at,b.status
    from booking_records b join club_athletes a on a.id = b.athlete_id
    where (b.coach_id = ${coachId} or ${me.role === "admin"}) and b.status in ('confirmed','completed') order by b.starts_at desc limit 200`;
}
export async function completeSession(userId:string,bookingId:string,notes:string) {
  const me = await clubIdentity(userId);
  if (me.role !== "coach" && me.role !== "admin") throw new Error("Coach access required.");
  const file = await readWorkingFile(); const coachId = file.coaches.find(c=>c.email.toLowerCase()===me.email)?.id || "";
  const sql = await getSql();
  return sql.transaction(async tx=>{
    const [booking] = await tx<{id:string;athlete_id:string;coach_id:string;product_id:string;order_id:string;ends_at:Date}>`
      update booking_records set status = 'completed', completed_at = coalesce(completed_at,now()), completion_recap=coalesce(completion_recap,${notes}), completed_by=coalesce(completed_by,${userId})
      where id = ${bookingId} and (coach_id = ${coachId} or ${me.role === "admin"}) and status in ('confirmed','completed') and ends_at <= now() returning *`;
    if (!booking) throw new Error("Only an assigned coach can complete a confirmed session after it ends.");
    const [order] = await tx<{snapshot:Quote;total_cents:number;status:string}>`select snapshot,total_cents,status from commerce_orders where id = ${booking.order_id}`;
    if (ASSESSMENT_PRODUCTS.has(booking.product_id)) {
      await tx`insert into athlete_assessments (id,athlete_id,discipline,coach_user_id,completed_at,notes,booking_id,delivery)
        values (${"assessment:"+booking.id},${booking.athlete_id},${order?.snapshot.discipline || "Pitching"},${userId},now(),${notes},${booking.id},${order?.snapshot.productId === "m5" ? "remote" : "in-person"})
        on conflict (id) do nothing`;
    }
    const assignedCoach=file.coaches.find(c=>c.id===booking.coach_id);
    const [configured]=await tx<{profit_split:number}>`select offers.profit_split from club_staff_services offers join club_staff staff on staff.id=offers.staff_id where lower(staff.email)=${assignedCoach?.email.trim().toLowerCase()||''} and offers.service_id=${booking.product_id} and staff.active=true`;
    const split = configured?.profit_split ?? file.coachPayouts.find(p=>p.coachId===booking.coach_id && p.serviceId===booking.product_id)?.splitPct;
    // No invented split or transfer recipient. Earnings require an actual configured split.
    if (order?.status === "paid" && split !== undefined) {
      const gross = order.snapshot.recurring || order.snapshot.kind === "package" ? Math.round(order.snapshot.regularCents / Math.max(1,order.snapshot.credits)) : order.total_cents;
      await tx`insert into contractor_earnings (booking_id,coach_id,gross_cents,split_pct,amount_cents,status)
        values (${booking.id},${booking.coach_id},${gross},${split},${Math.round(gross*split/100)},'payable') on conflict (booking_id) do nothing`;
    }
    return {ok:true,assessmentCompleted:ASSESSMENT_PRODUCTS.has(booking.product_id)};
  });
}
