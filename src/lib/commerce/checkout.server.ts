import { bookableCoaches, requireCoachService } from "./coach-services.server";
import { checkoutLessonService } from "./coach-services";
import { createHash, randomUUID } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { getSql } from "../db";
import { getSessionUser } from "../auth/verify.server";
import { assertSameSiteRequest } from "../auth/isolation.server";
import { clubIdentity } from "../identity.server";
import { readWorkingFile, loadDeskForUser } from "../pd/desk-impl.server";
import { calculateQuote, type CheckoutInput, type Product, type Quote } from "./contracts";
import { slotsFor, validateWindow, validDate } from "../scheduling";
import { coachAvailable } from "./availability";
import { paymentMode, squarePublicConfig, squareConfig, planVariation } from "./square.server";
import { approvedProducts, CATALOG_VERSION } from "./catalog";
import { assertSquareCheckoutScope } from "./square-config";
import { expireHolds } from "./store.server";

export async function rateLimit(bucket: string, maximum = 30) {
  const request = getRequest();
  const address =
    request?.headers.get("x-nf-client-connection-ip") ||
    request?.headers.get("x-forwarded-for")?.split(",")[0] ||
    "unknown";
  const key = createHash("sha256").update(`${bucket}:${address}`).digest("hex");
  const sql = await getSql();
  const [row] = await sql<{ count: number }>`insert into api_rate_limits (key,count,resets_at)
    values (${key},1,now() + interval '10 minutes') on conflict (key) do update
    set count = case when api_rate_limits.resets_at <= now() then 1 else api_rate_limits.count + 1 end,
    resets_at = case when api_rate_limits.resets_at <= now() then now() + interval '10 minutes' else api_rate_limits.resets_at end returning count`;
  if (row.count > maximum)
    throw new Error("Too many requests. Please wait a few minutes and try again.");
}

export async function checkoutContext(verifiedUserId?: string) {
  const session = verifiedUserId ? { id: verifiedUserId } : await getSessionUser();
  const me = session ? await clubIdentity(session.id) : null;
  const sql = await getSql();
  const file = session ? (await loadDeskForUser(session.id)).data : await readWorkingFile();
  const [products, assessments] = await Promise.all([
    sql<Product>`select id,kind,name,price,minutes,credits,remote,expires_days,hours,discipline,active from club_services where active = true`,
    session
      ? sql<{ athlete_id: string }>`select distinct a.athlete_id from athlete_assessments a
      join club_athletes c on c.id = a.athlete_id where c.household_id = any(${me!.billingHouseholdIds}::text[])`
      : Promise.resolve([]),
  ]);
  const done = new Set(assessments.map((a) => a.athlete_id));
  // Guest callers receive only coach names/specialties and the public catalog.
  return {
    mode: paymentMode(),
    square: squarePublicConfig(),
    products: approvedProducts(products),
    athletes: session
      ? file.athletes.map((a) => ({
          id: a.id,
          name: `${a.firstName} ${a.lastName}`,
          assessmentComplete: done.has(a.id),
        }))
      : [],
    coaches: await bookableCoaches(sql, (await readWorkingFile()).coaches),
  };
}

export async function quoteForRequest(
  input: CheckoutInput,
  requireConsent = true,
  verifiedUserId?: string,
) {
  // Retired lesson alias resolves to the authoritative monthly product.
  if (input.productId === "s6") input = { ...input, productId: "m4", kind: "membership" };
  assertSameSiteRequest();
  const session = verifiedUserId ? { id: verifiedUserId } : await getSessionUser();
  if (!session) throw new Error("Sign in to your verified account before checkout.");
  const me = await clubIdentity(session.id);
  const sql = await getSql();
  const products = approvedProducts(
    await sql<Product>`select id,kind,name,price,minutes,credits,remote,expires_days,hours,discipline,active from club_services where active = true`,
  );
  const product = products.find((p) => p.id === input.productId);
  if (!product) throw new Error("This product is unavailable.");
  const file = await readWorkingFile();
  let athleteId: string | null = null;
  let completed = false;
  if (input.athleteId) {
    if (!me) throw new Error("Sign in to select an athlete on your account.");
    const desk = await loadDeskForUser(me.userId);
    const athlete = desk.data.athletes.find((a) => a.id === input.athleteId);
    if (
      !athlete ||
      (me.role !== "admin" &&
        !desk.data.families.some(
          (f) =>
            f.id === athlete.familyId &&
            (me.householdEmails.includes(f.email.toLowerCase()) ||
              f.email.toLowerCase() === me.email),
        ))
    )
      throw new Error("This athlete is not in your household.");
    athleteId = athlete.id;
    const [result] = await sql<{
      done: boolean;
    }>`select exists(select 1 from athlete_assessments where athlete_id = ${athleteId}) as done`;
    completed = result.done;
  }
  if (input.productId === "all-star") {
    const { requirePriorityPolicy } = await import("./booking-policy.server");
    await requirePriorityPolicy(sql);
  }
  if (input.kind === "cage" && input.date) {
    const { checkCageBookingWindow } = await import("./booking-policy.server");
    await checkCageBookingWindow(me.billingHouseholdIds, input.date);
  }
  const quote = calculateQuote(
    input,
    product,
    completed,
    products.filter((p) => p.kind === "cage"),
    requireConsent,
  );
  if (quote.kind !== "cage" && quote.kind !== "cage-plan" && !athleteId) {
    throw new Error("Add your athlete in the family portal, then select that athlete to continue.");
  }
  if (quote.productId === "m5" && !completed)
    throw new Error(
      "Complete an assessment before starting remote coaching. Contact the coach to arrange a remote assessment.",
    );
  if (quote.needsSlot && quote.kind !== "cage") {
    const spaceProduct = checkoutLessonService(quote);
    await requireCoachService(sql, file.coaches, input.coachId, spaceProduct);
    const { lessonResources } = await import("./operations.server");
    quote.resources = [`coach:${input.coachId}`, ...(await lessonResources(spaceProduct, sql))];
  }
  if (athleteId && quote.needsSlot) quote.resources.push(`athlete:${athleteId}`);
  return { me, quote, athleteId, file };
}

export async function availableSlots(input: CheckoutInput, verifiedUserId?: string) {
  const { quote, file } = await quoteForRequest(input, false, verifiedUserId);
  if (!quote.needsSlot || !input.date || !validDate(input.date)) return { quote, slots: [] };
  const sql = await getSql();
  const occupied = await sql<{
    resource_id: string;
    slot_at: Date;
  }>`select resource_id,slot_at from booking_occupancy b join booking_records r on r.id=b.booking_id left join commerce_orders o on o.id=r.order_id
    where r.status in ('confirmed','completed') and resource_id = any(${quote.resources}::text[]) and slot_at >= ${input.date}::date - interval '1 day' and slot_at < ${input.date}::date + interval '2 days'`;
  const slots = slotsFor(input.date, quote.duration).filter((slot) => {
    if (
      quote.kind !== "cage" &&
      !coachAvailable(file.availability, input.coachId!, input.date!, slot.value, quote.duration)
    )
      return false;
    const { start, end } = validateWindow(input.date!, slot.value, quote.duration);
    return !occupied.some((row) => new Date(row.slot_at) >= start && new Date(row.slot_at) < end);
  });
  return { quote, slots };
}

export async function beginCheckout(input: CheckoutInput, verifiedUserId?: string) {
  const { assertPaymentRequest } = await import("./square-payments.server");
  assertPaymentRequest();
  await rateLimit("checkout", 20);
  const config = squareConfig();
  if (input.productId === "m4" || input.productId === "s6")
    throw new Error("Small-group enrollment opens when the office publishes the group schedule.");
  const { me, quote, athleteId, file } = await quoteForRequest(input, true, verifiedUserId);
  assertSquareCheckoutScope(config, quote);
  if (quote.recurring) {
    const { validateSquarePlan } = await import("./square-payments.server");
    await validateSquarePlan(await planVariation(quote.productId), quote.regularCents);
  }
  const sql = await getSql();
  const fingerprint = JSON.stringify({
    quote,
    athleteId,
    userId: me.userId,
    date: input.date,
    time: input.time,
    coachId: input.coachId,
    household: input.household,
    athleteCount: input.athleteCount,
    consent: input.consent,
  });
  return sql.transaction(async (tx) => {
    await expireHolds(tx);
    const [existing] = await tx<{
      id: string;
      snapshot: { fingerprint: string };
      status: string;
      hold_until: Date;
      total_cents: number;
      user_id: string;
    }>`select * from commerce_orders where request_key=${input.requestId} for update`;
    if (existing) {
      if (existing.user_id !== me.userId || existing.snapshot.fingerprint !== fingerprint)
        throw new Error("Your order changed. Start a new checkout.");
      if (existing.status !== "pending" || new Date(existing.hold_until).getTime() <= Date.now())
        throw new Error("This checkout has ended. Check billing history before starting another.");
      return {
        orderId: existing.id,
        totalCents: existing.total_cents,
        chargeCents: quote.regularCents,
        holdUntil: new Date(existing.hold_until).toISOString(),
        recurring: quote.recurring,
      };
    }
    const id = randomUUID(),
      holdUntil = new Date(Date.now() + 10 * 60_000);
    const snapshot = {
      ...quote,
      fingerprint,
      catalogVersion: CATALOG_VERSION,
      input: {
        date: input.date,
        time: input.time,
        coachId: input.coachId,
        athleteCount: input.athleteCount,
      },
      consentAt: input.consent ? new Date().toISOString() : null,
      bookingWindow: null as null | {
        start: string;
        end: string;
        coachId?: string;
        participantCount: number;
      },
    };
    if (quote.needsSlot) {
      if (!input.date || !input.time) throw new Error("Choose a date and available start time.");
      const window = validateWindow(input.date, input.time, quote.duration);
      if (
        quote.kind !== "cage" &&
        !coachAvailable(file.availability, input.coachId!, input.date, input.time, quote.duration)
      )
        throw new Error("Your coach is unavailable for the full session.");
      snapshot.bookingWindow = {
        start: window.start.toISOString(),
        end: window.end.toISOString(),
        coachId: input.coachId,
        participantCount: quote.kind === "cage" ? input.athleteCount : 1,
      };
      const occupied =
        await tx`select b.booking_id from booking_occupancy b join booking_records r on r.id=b.booking_id where r.status in ('confirmed','completed') and b.resource_id=any(${quote.resources}::text[]) and b.slot_at>=${window.start.toISOString()} and b.slot_at<${window.end.toISOString()} limit 1`;
      if (occupied.length)
        throw new Error("That time is already booked. Choose another available time.");
    }
    // Save only a payment session. No booking record or occupancy exists before payment.
    await tx`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment)
      values(${id},${input.requestId},${me.userId},${me.email},${athleteId},${quote.productId},${quote.kind},${JSON.stringify(snapshot)}::jsonb,${quote.totalCents},${holdUntil.toISOString()},'square',${config.environment})`;

    return {
      orderId: id,
      totalCents: quote.totalCents,
      chargeCents: quote.regularCents,
      holdUntil: holdUntil.toISOString(),
      recurring: quote.recurring,
    };
  });
}

export async function orderStatus(orderId: string, verifiedUserId?: string) {
  const session = verifiedUserId ? { id: verifiedUserId } : await getSessionUser();
  if (!session) throw new Error("Sign in to see payment status.");
  const me = await clubIdentity(session.id),
    sql = await getSql();
  const [row] = await sql<{
    status: string;
    total_cents: number;
    product_id: string;
    receipt_url: string | null;
    subscription_setup_status: string | null;
    hold_until: Date;
    snapshot: Quote;
    square_payment_id: string | null;
    square_fee_payment_id: string | null;
  }>`
    select status,total_cents,product_id,receipt_url,subscription_setup_status,hold_until,snapshot,square_payment_id,square_fee_payment_id from commerce_orders where id=${orderId} and household_id=any(${me.billingHouseholdIds}::text[])`;
  if (!row) throw new Error("Order not found.");
  return {
    status: row.status,
    total_cents: row.total_cents,
    product_id: row.product_id,
    receipt_url: row.receipt_url,
    subscription_setup_status: row.subscription_setup_status,
    bookingConfirmed:
      row.status === "paid" &&
      Boolean(
        (
          await sql`select id from booking_records where order_id=${orderId} and status='confirmed' limit 1`
        ).length,
      ),
    holdUntil: new Date(row.hold_until).toISOString(),
    feeDue: row.status === "pending_fee" ? row.snapshot.setupCents : 0,
    square: squarePublicConfig(),
  };
}
export type { Quote };
export async function cageAvailability(input: {
  date: string;
  duration: number;
  laneIds: string[];
}) {
  assertSameSiteRequest();
  const sql = await getSql();
  const resources = [...new Set(input.laneIds)].map((id) => `lane:${id}`);
  const occupied = await sql<{
    slot_at: Date;
  }>`select b.slot_at from booking_occupancy b join booking_records r on r.id=b.booking_id left join commerce_orders o on o.id=r.order_id
   where b.resource_id=any(${resources}::text[]) and r.status in ('confirmed','completed')`;
  return slotsFor(input.date, input.duration).filter((slot) => {
    const { start, end } = validateWindow(input.date, slot.value, input.duration);
    return !occupied.some((row) => new Date(row.slot_at) >= start && new Date(row.slot_at) < end);
  });
}
