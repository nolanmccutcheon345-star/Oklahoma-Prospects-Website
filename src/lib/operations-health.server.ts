import { getSql, type Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import { hasPublicRosterConsent } from "./roster-consent";
import type { ClubRecord } from "./teams/types";

export function rosterPublicationCounts(club: ClubRecord | null) {
  const counts = { active: 0, published: 0, withheld: 0, revoked: 0, withdrawn: 0 };
  for (const team of club && !club._demo ? club.teams : []) {
    if (team.closed) continue;
    for (const player of team.roster) {
      if (player.withdrawn) {
        counts.withdrawn++;
        continue;
      }
      counts.active++;
      if (hasPublicRosterConsent(player.rosterConsent)) counts.published++;
      else {
        counts.withheld++;
        if (player.rosterConsent?.revokedAt) counts.revoked++;
      }
    }
  }
  return counts;
}
export async function operationsHealthFor(sql: Sql, userId: string) {
  if ((await resolveIdentity(sql, userId)).role !== "admin")
    throw new Error("Owner access required.");
  const [clubs, outcomes, queues] = await Promise.all([
    sql<{
      payload: ClubRecord | string;
      demo: boolean;
    }>`select payload,demo from club_state where id='oklahoma-prospects'`,
    sql<{ tryouts: number; paidOrders: number; bookings: number }>`select
      (select count(*)::int from club_requests where kind='tryout' and created_at>=now()-interval '30 days') as tryouts,
      (select count(*)::int from commerce_orders where status='paid' and payment_environment='production' and created_at>=now()-interval '30 days') as "paidOrders",
      (select count(*)::int from booking_records b join commerce_orders o on o.id=b.order_id where b.status in ('confirmed','completed') and o.payment_environment='production' and b.created_at>=now()-interval '30 days') as bookings`,
    sql<{ paymentReview: number; pendingEvents: number; pendingRefunds: number }>`select
      (select count(*)::int from commerce_orders where status='payment_review' and payment_environment='production') as "paymentReview",
      (select count(*)::int from square_events where status='pending' and environment='production') as "pendingEvents",
      (select count(*)::int from commerce_refunds r join square_payments p on p.id=r.square_payment_id where r.status in ('pending','unknown') and p.environment='production') as "pendingRefunds"`,
  ]);
  const row = clubs[0];
  const club =
    row && !row.demo
      ? typeof row.payload === "string"
        ? (JSON.parse(row.payload) as ClubRecord)
        : row.payload
      : null;
  console.info("Owner operational summary viewed", { actorId: userId });
  return {
    checkedAt: new Date().toISOString(),
    roster: rosterPublicationCounts(club),
    outcomes: outcomes[0],
    queues: queues[0],
  };
}
export async function operationsHealth(userId: string) {
  return operationsHealthFor(await getSql(), userId);
}
