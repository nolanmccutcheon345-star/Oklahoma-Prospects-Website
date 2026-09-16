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
import { stripeClient, paymentMode, checkoutOrigin } from "./stripe.server";
import { expireHolds, holdWindow } from "./store.server";

export async function rateLimit(bucket: string, maximum = 30) {
  const request = getRequest();
  const address = request?.headers.get("x-nf-client-connection-ip") || request?.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const key = createHash("sha256").update(`${bucket}:${address}`).digest("hex");
  const sql = await getSql();
  const [row] = await sql<{ count: number }>`insert into api_rate_limits (key,count,resets_at)
    values (${key},1,now() + interval '10 minutes') on conflict (key) do update
    set count = case when api_rate_limits.resets_at <= now() then 1 else api_rate_limits.count + 1 end,
    resets_at = case when api_rate_limits.resets_at <= now() then now() + interval '10 minutes' else api_rate_limits.resets_at end returning count`;
  if (row.count > maximum) throw new Error("Too many requests. Please wait a few minutes and try again.");
}

export async function checkoutContext() {
  const session = await getSessionUser();
  const me=session?await clubIdentity(session.id):null;
  const sql = await getSql();
  const file = session ? (await loadDeskForUser(session.id)).data : await readWorkingFile();
  const [products, assessments] = await Promise.all([
    sql<Product>`select id,kind,name,price,minutes,credits,remote,expires_days,hours,discipline,active from club_services where active = true`,
    session ? sql<{ athlete_id: string }>`select distinct a.athlete_id from athlete_assessments a
      join club_athletes c on c.id = a.athlete_id where c.household_id = any(${me!.billingHouseholdIds}::text[])` : Promise.resolve([]),
  ]);
  const done = new Set(assessments.map(a => a.athlete_id));
  // Guest callers receive only coach names/specialties and the public catalog.
  return { mode: paymentMode(), products,
    athletes: session ? file.athletes.map(a => ({ id: a.id, name: `${a.firstName} ${a.lastName}`, assessmentComplete: done.has(a.id) })) : [],
    coaches: file.coaches.filter(c => c.active).map(c => ({ id: c.id, name: c.name, specialties: c.specialties })) };
}

export async function quoteForRequest(input: CheckoutInput, requireConsent = true) {
  // Retired lesson alias resolves to the authoritative monthly product.
  if (input.productId === "s6") input = {...input, productId: "m4", kind: "membership"};
  assertSameSiteRequest();
  const session = await getSessionUser();
  const me = session ? await clubIdentity(session.id) : null;
  const sql = await getSql();
  const products = await sql<Product>`select id,kind,name,price,minutes,credits,remote,expires_days,hours,discipline,active from club_services where active = true`;
  const product = products.find(p => p.id === input.productId);
  if (!product) throw new Error("This product is unavailable.");
  const file = await readWorkingFile();
  let athleteId: string | null = null;
  let completed = false;
  if (input.athleteId) {
    if (!me) throw new Error("Sign in to select an athlete on your account.");
    const desk = await loadDeskForUser(me.userId);
    const athlete = desk.data.athletes.find(a => a.id === input.athleteId);
    if (!athlete || (me.role !== "admin" && !desk.data.families.some(f => f.id === athlete.familyId && (me.householdEmails.includes(f.email.toLowerCase()) || f.email.toLowerCase() === me.email)))) throw new Error("This athlete is not in your household.");
    athleteId = athlete.id;
    const [result] = await sql<{ done: boolean }>`select exists(select 1 from athlete_assessments where athlete_id = ${athleteId}) as done`;
    completed = result.done;
  }
  const quote = calculateQuote(input, product, completed, products.filter(p => p.kind === "cage"), requireConsent);
  if (quote.kind !== "cage" && quote.kind !== "cage-plan" && !athleteId) {
    if (!input.playerName || !input.playerBirthDate || !validDate(input.playerBirthDate) || input.playerBirthDate > new Date().toISOString().slice(0,10)) throw new Error("Enter your athlete’s name and date of birth.");
  }
  if (quote.productId === "m5" && !completed) throw new Error("Complete an assessment before starting remote coaching. Contact the coach to arrange a remote assessment.");
  if (quote.needsSlot && quote.kind !== "cage") {
    if (!input.coachId || !file.coaches.some(c => c.id === input.coachId && c.active)) throw new Error("Choose an available coach.");
    const selectedCoach = file.coaches.find(c => c.id === input.coachId)!;
    if (!selectedCoach.specialties.some(s => s.toLowerCase() === quote.discipline.toLowerCase())) throw new Error("This coach does not offer the selected discipline.");
    const {lessonResources}=await import('./operations.server');
    const spaceProduct=quote.setupCents>0?(quote.discipline==='Hitting'?'s9':'s1'):quote.kind==='membership'?(quote.sessionMinutes===30?'s2':'s3'):quote.productId;
    quote.resources = [`coach:${input.coachId}`,...await lessonResources(spaceProduct,sql)];
  }
  if(athleteId && quote.needsSlot)quote.resources.push(`athlete:${athleteId}`);
  return { me, quote, athleteId, file };
}

export async function availableSlots(input: CheckoutInput) {
  const { quote, file } = await quoteForRequest(input, false);
  if (!quote.needsSlot || !input.date || !validDate(input.date)) return { quote, slots: [] };
  const sql = await getSql();
  const occupied = await sql<{ resource_id: string; slot_at: Date }>`select resource_id,slot_at from booking_occupancy b join booking_records r on r.id=b.booking_id left join commerce_orders o on o.id=r.order_id
    where (r.status in ('confirmed','completed') or o.hold_until > now()) and resource_id = any(${quote.resources}::text[]) and slot_at >= ${input.date}::date - interval '1 day' and slot_at < ${input.date}::date + interval '2 days'`;
  const slots = slotsFor(input.date, quote.duration).filter(slot => {
    if (quote.kind !== "cage" && !coachAvailable(file.availability, input.coachId!, input.date!, slot.value, quote.duration)) return false;
    const { start, end } = validateWindow(input.date!, slot.value, quote.duration);
    return !occupied.some(row => new Date(row.slot_at) >= start && new Date(row.slot_at) < end);
  });
  return { quote, slots };
}

export async function beginCheckout(input: CheckoutInput) {
  await rateLimit("checkout", 20);
  const stripe = stripeClient();
  if (input.productId === "m4" || input.productId === "s6") throw new Error("Contact the front desk for the published small-group schedule before enrolling.");
  const { me, quote, athleteId: existingAthlete, file } = await quoteForRequest(input);
  const sql = await getSql();
  const email = me?.email || input.email.toLowerCase();
  const fingerprint = JSON.stringify({ quote, athlete: existingAthlete, email, date: input.date, time: input.time, coach: input.coachId, name: input.name, playerName: input.playerName, birthDate: input.playerBirthDate, household: input.household, athleteCount: input.athleteCount });
  let [order] = await sql<{ id: string; checkout_url: string; snapshot: { fingerprint: string }; status: string; hold_until: Date }>`select id,checkout_url,snapshot,status,hold_until from commerce_orders where request_key = ${input.requestId}`;
  if (order && order.snapshot.fingerprint !== fingerprint) throw new Error("Your order changed. Start a new checkout.");
  if (order?.checkout_url && order.status === "pending" && new Date(order.hold_until).getTime() > Date.now()) return { url: order.checkout_url };
  if (order && order.status !== "pending") throw new Error("This order has already been processed. Open billing history.");
  const id = order?.id || randomUUID();
  const holdUntil = order ? new Date(order.hold_until) : new Date(Date.now() + 35 * 60_000);
  if (holdUntil.getTime() <= Date.now()) throw new Error("This checkout expired. Choose an available time again.");
  if (!order) {
    await sql.transaction(async tx => {
      await expireHolds(tx);
      let athleteId = existingAthlete;
      if (quote.kind !== "cage" && quote.kind !== "cage-plan") {
        const athlete = file.athletes.find(a => a.id === athleteId);
        athleteId ||= randomUUID();
        await tx`insert into club_athletes (id,user_id,household_email,name,birth_date,coach_ids)
          values (${athleteId},${me?.userId || null},${email},${athlete ? `${athlete.firstName} ${athlete.lastName}` : input.playerName!},
            ${athlete?.birthDate || input.playerBirthDate || null},${JSON.stringify(athlete?.coachIds || (input.coachId ? [input.coachId] : []))}::jsonb)
          on conflict (id) do nothing`;
      }
      const snapshot = { ...quote, fingerprint, input: { date: input.date, time: input.time, coachId: input.coachId, athleteCount: input.athleteCount }, consentAt: input.consent ? new Date().toISOString() : null };
      await tx`insert into commerce_orders (id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,hold_until)
        values (${id},${input.requestId},${me?.userId || null},${email},${athleteId},${quote.productId},${quote.kind},${JSON.stringify(snapshot)}::jsonb,${quote.totalCents},${holdUntil.toISOString()})`;
      if (quote.needsSlot) {
        if (!input.date || !input.time) throw new Error("Choose a date and available start time.");
        const window = validateWindow(input.date, input.time, quote.duration);
        if (quote.kind !== "cage" && !coachAvailable(file.availability, input.coachId!, input.date, input.time, quote.duration)) throw new Error("Your coach is unavailable for the full session.");
        await holdWindow(tx, { orderId: id, userId: me?.userId || null, athleteId, coachId: input.coachId,
          productId: quote.setupCents > 0 ? (quote.discipline === "Hitting" ? "s9" : "s1") : quote.productId,
          ...window, resources: quote.resources, participantCount: quote.kind === "cage" ? input.athleteCount : 1 });
      }
    });
    [order] = await sql`select id,checkout_url,snapshot,status,hold_until from commerce_orders where id = ${id}`;
  }
  const origin = checkoutOrigin();
  const session = await stripe.checkout.sessions.create({
    mode: quote.recurring ? "subscription" : "payment", payment_method_types: ["card"],
    customer_email: email, client_reference_id: id,
    metadata: { order_id: id },
    ...(quote.recurring ? { subscription_data: { metadata: { order_id: id } } } : { payment_intent_data: { metadata: { order_id: id } }, invoice_creation: { enabled: true } }),
    line_items: quote.lines.map((line, index) => ({ quantity: 1, price_data: { currency: "usd", unit_amount: line.cents,
      product_data: { name: line.label }, ...(quote.recurring && index === 0 ? { recurring: { interval: "month" as const } } : {}) } })),
    success_url: `${origin}/paid?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pay?kind=${encodeURIComponent(quote.kind)}&id=${encodeURIComponent(quote.productId)}`,
    expires_at: Math.floor(holdUntil.getTime() / 1000),
    ...(quote.recurring ? { custom_text: { submit: { message: `First charge $${(quote.totalCents / 100).toFixed(2)}. Then $${(quote.regularCents / 100).toFixed(2)} every month until you cancel online in your family portal.` } } } : {}),
  }, { idempotencyKey: `checkout:${id}` });
  if (!session.url) throw new Error("Checkout did not open. Please retry.");
  await sql`update commerce_orders set checkout_session_id = ${session.id}, checkout_url = ${session.url}, updated_at = now() where id = ${id}`;
  return { url: session.url };
}

export async function orderStatus(sessionId: string) {
  // Possession of the opaque Stripe session id allows status only, never household data.
  const sql = await getSql();
  const [row] = await sql<{ status: string; total_cents: number; product_id: string }>`
    select status,total_cents,product_id from commerce_orders where checkout_session_id = ${sessionId}`;
  return row || { status: "pending", total_cents: 0, product_id: "" };
}
export type { Quote };
export async function cageAvailability(input:{date:string;duration:number;laneIds:string[]}) {
 assertSameSiteRequest();const sql=await getSql();
 const resources=[...new Set(input.laneIds)].map(id=>`lane:${id}`);
 const occupied=await sql<{slot_at:Date}>`select b.slot_at from booking_occupancy b join booking_records r on r.id=b.booking_id left join commerce_orders o on o.id=r.order_id
   where b.resource_id=any(${resources}::text[]) and (r.status in ('confirmed','completed') or o.hold_until>now())`;
 return slotsFor(input.date,input.duration).filter(slot=>{const {start,end}=validateWindow(input.date,slot.value,input.duration);return !occupied.some(row=>new Date(row.slot_at)>=start&&new Date(row.slot_at)<end);});
}
