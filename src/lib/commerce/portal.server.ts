import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db";
import { clubIdentity } from "../identity.server";
import { ASSESSMENT_PRODUCTS } from "../pricing";
import {
  changeRenewal,
  squareRefundPreview,
  cancelSquareBooking,
} from "./square-management.server";
import { rateLimit } from "./checkout.server";
import { assertPaymentRequest } from "./square-payments.server";
import { readWorkingFile } from "../pd/desk-impl.server";
import type { Quote } from "./contracts";

export async function familyBilling(userId: string, page = 0) {
  const me = await clubIdentity(userId);
  const sql = await getSql();
  return readFamilyBilling(sql, me, page);
}
export async function readFamilyBilling(
  sql: Sql,
  me: Awaited<ReturnType<typeof clubIdentity>>,
  page = 0,
) {
  const [orders, bookings, subscriptions, invoices, credits, athletes, requests, payments] =
    await Promise.all([
      sql<{
        id: string;
        product_id: string;
        snapshot: Quote;
        total_cents: number;
        status: string;
        receipt_url: string | null;
        created_at: Date;
      }>`select id,product_id,snapshot,total_cents,status,receipt_url,created_at from commerce_orders where household_id = any(${me.billingHouseholdIds}::text[]) order by created_at desc,id desc limit 50 offset ${page * 50}`,
      sql<{
        id: string;
        order_id: string;
        product_id: string;
        starts_at: Date;
        ends_at: Date;
        status: string;
        participant_count: number;
        completion_recap: string | null;
        checked_in_at: Date | null;
      }>`select id,order_id,product_id,starts_at,ends_at,status,participant_count,completion_recap,checked_in_at from booking_records where household_id = any(${me.billingHouseholdIds}::text[]) order by starts_at desc,id desc limit 50 offset ${page * 50}`,
      sql<{
        id: string;
        product_id: string;
        amount_cents: number;
        status: string;
        period_end: Date;
        cancel_at_period_end: boolean;
        pause_requested_at: Date | null;
        scheduled_action: string | null;
        action_effective_date: string | null;
      }>`select id,product_id,amount_cents,status,period_end,cancel_at_period_end,pause_requested_at,scheduled_action,action_effective_date from club_subscriptions where household_id = any(${me.billingHouseholdIds}::text[]) order by period_end desc`,
      sql<{
        id: string;
        amount_cents: number;
        status: string;
        invoice_url: string | null;
        pdf_url: string | null;
        created_at: Date;
      }>`select id,amount_cents,status,invoice_url,pdf_url,created_at from billing_invoices where household_id = any(${me.billingHouseholdIds}::text[]) order by created_at desc,id desc limit 50 offset ${page * 50}`,
      sql<{
        id: string;
        kind: string;
        minutes: number;
        remaining: number;
        expires_at: Date;
        rollover: boolean;
        athlete_id: string;
      }>`select id,kind,minutes,remaining,expires_at,rollover,athlete_id from credit_grants where household_id = any(${me.billingHouseholdIds}::text[]) and remaining > 0 and starts_at <= now() and expires_at > now() and order_id in (select id from commerce_orders where status='paid') order by expires_at`,
      sql<{
        id: string;
        name: string;
        birth_date: string | null;
        assessment_complete: boolean;
      }>`select id,name,birth_date,exists(select 1 from athlete_assessments a where a.athlete_id = c.id) as assessment_complete from club_athletes c where household_id = any(${me.billingHouseholdIds}::text[])`,
      sql<{
        id: string;
        kind: string;
        status: string;
        created_at: Date;
      }>`select id,kind,status,created_at from club_requests where user_id = ${me.userId} order by created_at desc limit 100`,
      sql<{
        id: string;
        amount_cents: number;
        refunded_cents: number;
        receipt_url: string | null;
        purpose: string;
        created_at: Date;
      }>`select p.id,p.amount_cents,p.refunded_cents,p.receipt_url,p.purpose,p.created_at from square_payments p join commerce_orders o on o.id=p.order_id where o.household_id=any(${me.billingHouseholdIds}::text[]) order by p.created_at desc,p.id desc limit 50 offset ${page * 50}`,
    ]);
  return {
    orders,
    bookings,
    subscriptions,
    invoices,
    credits,
    athletes,
    requests,
    payments,
    historyHasMore:
      orders.length === 50 ||
      bookings.length === 50 ||
      invoices.length === 50 ||
      payments.length === 50,
  };
}

export async function claimGuestOrders(userId: string) {
  const me = await clubIdentity(userId);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const orders = await tx<{ id: string }>`update commerce_orders set user_id = ${userId}
      where user_id is null and lower(email) = ${me.email} and status in ('paid','payment_review','refunded','cancelled') returning id`;
    const ids = orders.map((o) => o.id);
    await tx`update club_athletes set user_id = ${userId} where user_id is null and id in (select athlete_id from commerce_orders where id = any(${ids}::text[]))`;
    await tx`update booking_records set user_id = ${userId} where order_id = any(${ids}::text[])`;
    await tx`update club_subscriptions set user_id = ${userId} where order_id = any(${ids}::text[])`;
    await tx`update credit_grants set user_id = ${userId} where order_id = any(${ids}::text[])`;
    await tx`update billing_invoices set user_id = ${userId} where subscription_id in (select id from club_subscriptions where user_id = ${userId})`;
    return { claimed: ids.length };
  });
}

export async function cancelRenewal(userId: string, id: string) {
  return changeRenewal(userId, id, "cancel");
}
export async function billingPortal(userId: string, id: string) {
  const { ownedSubscription } = await import("./square-management.server");
  await ownedSubscription(userId, id, true);
  return { url: "/family" };
}

export async function requestPause(userId: string, id: string, reason: string) {
  assertPaymentRequest();
  await rateLimit("pause-request", 10);
  const me = await clubIdentity(userId);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const [sub] =
      await tx`update club_subscriptions set pause_requested_at = now() where id = ${id} and household_id = any(${me.billingHouseholdIds}::text[]) returning id`;
    if (!sub) throw new Error("Membership not found.");
    await tx`insert into club_requests (id,user_id,kind,payload) values (${randomUUID()},${userId},'membership-pause',${JSON.stringify({ subscriptionId: id, reason })}::jsonb)`;
    return { ok: true };
  });
}

export async function previewRefund(userId: string, bookingId: string) {
  return squareRefundPreview(userId, bookingId);
}
export async function cancelAndRefund(userId: string, bookingId: string) {
  return cancelSquareBooking(userId, bookingId);
}

export async function checkIn(userId: string, bookingId: string) {
  const me = await clubIdentity(userId);
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const [row] = await tx<{
      id: string;
      participant_count: number;
      participants_verified: boolean;
      starts_at: Date;
      ends_at: Date;
    }>`select id,participant_count,participants_verified,starts_at,ends_at from booking_records
      where id=${bookingId} and (household_id=any(${me.billingHouseholdIds}::text[]) or ${me.role === "admin"}) and status='confirmed' for update`;
    if (!row) throw new Error("Only your confirmed reservations can be checked in.");
    const { enforceVisitWaivers } = await import("./waivers.server");
    await enforceVisitWaivers(tx, row);
    await tx`update booking_records set checked_in_at=coalesce(checked_in_at,now()) where id=${bookingId}`;
    return { ok: true };
  });
}

export async function coachBookings(userId: string) {
  const me = await clubIdentity(userId);
  if (me.role !== "admin" && me.role !== "coach") throw new Error("Coach access required.");
  const file = await readWorkingFile();
  const coachId = file.coaches.find((c) => c.email.toLowerCase() === me.email)?.id || "";
  const sql = await getSql();
  return sql<{
    id: string;
    athlete_id: string;
    athlete_name: string;
    product_id: string;
    starts_at: Date;
    ends_at: Date;
    status: string;
  }>`
    select b.id,b.athlete_id,a.name as athlete_name,b.product_id,b.starts_at,b.ends_at,b.status
    from booking_records b join club_athletes a on a.id = b.athlete_id
    where (b.coach_id = ${coachId} or ${me.role === "admin"}) and b.status in ('confirmed','completed') order by b.starts_at desc limit 200`;
}
export async function completeSession(userId: string, bookingId: string, notes: string) {
  const me = await clubIdentity(userId);
  if (me.role !== "coach" && me.role !== "admin") throw new Error("Coach access required.");
  const file = await readWorkingFile();
  const coachId = file.coaches.find((c) => c.email.toLowerCase() === me.email)?.id || "";
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const [booking] = await tx<{
      id: string;
      athlete_id: string;
      coach_id: string;
      product_id: string;
      order_id: string;
      ends_at: Date;
    }>`
      update booking_records set status = 'completed', completed_at = coalesce(completed_at,now()), completion_recap=coalesce(completion_recap,${notes}), completed_by=coalesce(completed_by,${userId})
      where id = ${bookingId} and (coach_id = ${coachId} or ${me.role === "admin"}) and status in ('confirmed','completed') and ends_at <= now() returning *`;
    if (!booking)
      throw new Error("Only an assigned coach can complete a confirmed session after it ends.");
    const [order] = await tx<{
      snapshot: Quote;
      total_cents: number;
      status: string;
    }>`select snapshot,total_cents,status from commerce_orders where id = ${booking.order_id}`;
    if (ASSESSMENT_PRODUCTS.has(booking.product_id)) {
      await tx`insert into athlete_assessments (id,athlete_id,discipline,coach_user_id,completed_at,notes,booking_id,delivery)
        values (${"assessment:" + booking.id},${booking.athlete_id},${order?.snapshot.discipline || "Pitching"},${userId},now(),${notes},${booking.id},${order?.snapshot.productId === "m5" ? "remote" : "in-person"})
        on conflict (id) do nothing`;
    }
    const assignedCoach = file.coaches.find((c) => c.id === booking.coach_id);
    const [configured] = await tx<{
      profit_split: number;
    }>`select offers.profit_split from club_staff_services offers join club_staff staff on staff.id=offers.staff_id where lower(staff.email)=${assignedCoach?.email.trim().toLowerCase() || ""} and offers.service_id=${booking.product_id} and staff.active=true`;
    const split =
      configured?.profit_split ??
      file.coachPayouts.find(
        (p) => p.coachId === booking.coach_id && p.serviceId === booking.product_id,
      )?.splitPct;
    // No invented split or transfer recipient. Earnings require an actual configured split.
    if (order?.status === "paid" && split !== undefined) {
      const gross =
        order.snapshot.recurring || order.snapshot.kind === "package"
          ? Math.round(order.snapshot.regularCents / Math.max(1, order.snapshot.credits))
          : order.total_cents;
      await tx`insert into contractor_earnings (booking_id,coach_id,gross_cents,split_pct,amount_cents,status)
        values (${booking.id},${booking.coach_id},${gross},${split},${Math.round((gross * split) / 100)},'payable') on conflict (booking_id) do nothing`;
    }
    return { ok: true, assessmentCompleted: ASSESSMENT_PRODUCTS.has(booking.product_id) };
  });
}
