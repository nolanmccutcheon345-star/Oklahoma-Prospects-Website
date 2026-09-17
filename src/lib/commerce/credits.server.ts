import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql } from "../db";
import { clubIdentity } from "../identity.server";
import { readWorkingFile } from "../pd/desk-impl.server";
import { validateWindow, slotsFor } from "../scheduling";
import { ASSESSMENT_PRODUCTS } from "../pricing";
import { BOOKABLE_LANES } from "../club";
import { coachAvailable } from "./availability";
import { expireHolds, holdWindow } from "./store.server";
import type { Product } from "./contracts";
import { redemptionInput } from "./redemption";
type Input = z.infer<typeof redemptionInput>;
type Grant = {
  id: string;
  user_id: string;
  athlete_id: string;
  order_id: string;
  kind: string;
  minutes: number;
  remaining: number;
  starts_at: Date;
  expires_at: Date;
  product_id: string;
};
async function context(userId: string, input: Input) {
  const me = await clubIdentity(userId);
  const sql = await getSql();
  const [grant] =
    await sql<Grant>`select g.*,o.product_id from credit_grants g join commerce_orders o on o.id=g.order_id
    where g.id=${input.grantId} and g.household_id=any(${me.billingHouseholdIds}::text[]) and g.remaining>0 and g.starts_at<=now() and g.expires_at>now() and o.status='paid'`;
  if (!grant) throw new Error("This credit is unavailable or has expired.");
  const file = await readWorkingFile();
  let minutes = grant.minutes,
    resources: string[],
    quantity = 1;
  if (grant.kind === "cage-minutes") {
    const { checkCageBookingWindow } = await import("./booking-policy.server");
    await checkCageBookingWindow(me.billingHouseholdIds, input.date);
    if (!input.household) throw new Error("Confirm this is for household athletes only.");
    if (
      !input.duration ||
      !BOOKABLE_LANES.some((l) => l.id === input.laneId && l.group !== "field")
    )
      throw new Error(
        "Choose a cage and duration. The fielding area is billed separately at its listed rate.",
      );
    minutes = input.duration;
    quantity = minutes;
    resources = [`lane:${input.laneId}`];
  } else {
    const [assessment] =
      await sql`select id from athlete_assessments where athlete_id=${grant.athlete_id} limit 1`;
    if (!assessment)
      throw new Error("Complete your assessment with your coach before booking ordinary lessons.");
    if (grant.product_id === "m4")
      throw new Error(
        "Small-group credits require a published group session. Contact your coach for the weekly group schedule.",
      );
    const [service] =
      await sql<Product>`select * from club_services where id=${input.serviceId} and active=true`;
    if (
      !service ||
      service.kind !== "lesson" ||
      ASSESSMENT_PRODUCTS.has(service.id) ||
      service.id === "s6" ||
      (grant.kind !== "film-review" && service.minutes !== minutes) ||
      ["remote-review", "film-review"].includes(grant.kind) !== (service.id === "s5")
    )
      throw new Error("Choose a service included with this credit.");
    if (!input.coachId || !file.coaches.some((c) => c.id === input.coachId && c.active))
      throw new Error("Choose your coach.");
    if (
      !file.coaches
        .find((c) => c.id === input.coachId)!
        .specialties.some((s) => s.toLowerCase() === service.discipline.toLowerCase())
    )
      throw new Error("This coach does not offer the selected discipline.");
    const { lessonResources } = await import("./operations.server");
    resources = [
      `coach:${input.coachId}`,
      `athlete:${grant.athlete_id}`,
      ...(["remote-review", "film-review"].includes(grant.kind)
        ? []
        : await lessonResources(service.id, sql)),
    ];
  }
  if (quantity > grant.remaining) throw new Error("Not enough credits for this booking.");
  return { sql, grant, file, minutes, quantity, resources, me };
}
export async function creditSlots(userId: string, input: Input) {
  const { sql, grant, file, minutes, resources } = await context(userId, input);
  if (["remote-review", "film-review"].includes(grant.kind)) return [];
  const occupied = await sql<{
    slot_at: Date;
  }>`select b.slot_at from booking_occupancy b join booking_records r on r.id=b.booking_id left join commerce_orders o on o.id=r.order_id
    where b.resource_id=any(${resources}::text[]) and (r.status in ('confirmed','completed') or o.hold_until>now())`;
  return slotsFor(input.date, minutes).filter((s) => {
    const { start, end } = validateWindow(input.date, s.value, minutes);
    return (
      end <= new Date(grant.expires_at) &&
      start >= new Date(grant.starts_at) &&
      (grant.kind === "cage-minutes" ||
        coachAvailable(file.availability, input.coachId!, input.date, s.value, minutes)) &&
      !occupied.some((b) => new Date(b.slot_at) >= start && new Date(b.slot_at) < end)
    );
  });
}
export async function redeemCredit(userId: string, input: Input) {
  const { rateLimit } = await import("./checkout.server");
  await rateLimit("credit-booking", 30);
  await clubIdentity(userId);
  const read = await getSql();
  const prior =
    await read`select id from club_requests where id=${`redeem:${input.requestId}`} and user_id=${userId}`;
  if (prior.length) return { ok: true };
  const { sql, grant, file, minutes, quantity, resources, me } = await context(userId, input);
  return sql.transaction(async (tx) => {
    const key = `redeem:${input.requestId}`;
    const previous = await tx`select id from club_requests where id=${key} and user_id=${userId}`;
    if (previous.length) return { ok: true };
    const [paid] =
      await tx`select id from commerce_orders where id=${grant.order_id} and status='paid' for update`;
    if (!paid) throw new Error("This purchase is no longer available for credit booking.");
    await tx`insert into club_requests(id,user_id,kind,payload,status) values(${key},${userId},'credit-redemption',${JSON.stringify({ grantId: grant.id })}::jsonb,'completed')`;
    const rows =
      await tx`update credit_grants set remaining=remaining-${quantity} where id=${grant.id} and household_id=any(${me.billingHouseholdIds}::text[]) and remaining>=${quantity} and expires_at>now() returning id`;
    if (!rows.length)
      throw new Error("This credit was used in another booking. Reload your account.");
    if (["remote-review", "film-review"].includes(grant.kind)) {
      if (!input.videoUrl || !input.videoUrl.startsWith("https://"))
        throw new Error("Add a secure video link for your coach.");
      await tx`insert into club_requests(id,user_id,kind,payload) values(${randomUUID()},${userId},${grant.kind === "film-review" ? "film-review" : "video-review"},${JSON.stringify({ athleteId: grant.athlete_id, coachId: input.coachId, videoUrl: input.videoUrl, grantId: grant.id })}::jsonb)`;
    } else {
      if (!input.time) throw new Error("Choose an available start time.");
      const window = validateWindow(input.date, input.time, minutes);
      if (window.end > new Date(grant.expires_at) || window.start < new Date(grant.starts_at))
        throw new Error("Choose a date within this credit period.");
      if (
        grant.kind !== "cage-minutes" &&
        !coachAvailable(file.availability, input.coachId!, input.date, input.time, minutes)
      )
        throw new Error("Your coach is unavailable for the full session.");
      await expireHolds(tx);
      const bookingId = await holdWindow(tx, {
        orderId: grant.order_id,
        userId,
        athleteId: grant.athlete_id || null,
        coachId: input.coachId,
        productId: grant.kind === "cage-minutes" ? "individual" : input.serviceId,
        ...window,
        resources,
        participantCount: grant.kind === "cage-minutes" ? input.athleteCount : 1,
      });
      await tx`update booking_records set status='confirmed' where id=${bookingId}`;
      await tx`insert into credit_uses(id,grant_id,booking_id,quantity) values(${randomUUID()},${grant.id},${bookingId},${quantity})`;
    }
    return { ok: true };
  });
}
