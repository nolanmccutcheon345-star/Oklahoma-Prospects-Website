import {pageHead} from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { parsePaySearch, parseLaneIds } from "@/lib/pay";
import { getCheckoutContext, getCheckoutQuote, startCheckout } from "@/lib/commerce/api";
import { calculateQuote, type CheckoutInput, type Quote } from "@/lib/commerce/contracts";
import { eligibility, formatMoney } from "@/lib/pricing";
import { chicagoDate, slotsFor } from "@/lib/scheduling";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { CANCEL_POLICY } from "@/lib/club";

export const Route = createFileRoute("/pay")({head:()=>pageHead("/pay","Checkout","Review your server-calculated order and payment details.",true), validateSearch: parsePaySearch, component: PayPage });
function PayPage() {
  const search = Route.useSearch(); const user = useCurrentUser();
  const [context, setContext] = useState<Awaited<ReturnType<typeof getCheckoutContext>> | null>(null);
  const [athleteId, setAthleteId] = useState(""); const [coachId, setCoachId] = useState("");
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [playerName, setPlayerName] = useState(""); const [birthDate, setBirthDate] = useState("");
  const [date, setDate] = useState(search.date || chicagoDate()); const [time, setTime] = useState(search.time || "");
  const [household, setHousehold] = useState(false); const [count, setCount] = useState(search.use === "team" ? 3 : 1);
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [slotError, setSlotError] = useState("");
  const [slots, setSlots] = useState<{value:string;label:string}[]>([]); const [loadingSlots, setLoadingSlots] = useState(false);
  const requestId = useRef(crypto.randomUUID()); const paymentLock = useRef(false);
  useEffect(() => { setName(user?.displayName || ""); setEmail(user?.primaryEmail || ""); }, [user?.id, user?.displayName, user?.primaryEmail]);
  useEffect(() => {
    let active = true;
    getCheckoutContext().then(value => { if (active) { setContext(value); if (value.athletes.length === 1) setAthleteId(value.athletes[0].id); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Checkout could not load. Please try again."); });
    return () => { active = false; };
  }, [user?.id]);
  const product = context?.products.find(p => p.id === search.id);
  const assessed = context?.athletes.find(a => a.id === athleteId)?.assessmentComplete === true;
  const kind = (search.kind || "lesson") as CheckoutInput["kind"];
  const enrollmentHelp = product?.id === "m4" || product?.id === "s6"
    ? "Contact the front desk for the published small-group schedule before enrolling."
    : product?.id === "m5" && !assessed
      ? "Contact your coach to arrange a remote assessment before starting remote coaching." : "";
  const locked = product ? eligibility(kind, product.id, assessed).locked : false;
  const input = useMemo<CheckoutInput>(() => ({ requestId: requestId.current, productId: search.id || "", kind,
    athleteId: athleteId || undefined, coachId: coachId || undefined, date, time,
    duration: kind === "cage" ? search.minutes || 60 : undefined, laneIds: parseLaneIds(search.cages),
    athleteCount: count, household, consent, email, name, playerName: playerName || undefined, playerBirthDate: birthDate || undefined,
  }), [search.id, kind, athleteId, coachId, date, time, search.minutes, search.cages, count, household, consent, email, name, playerName, birthDate]);
  const quote = useMemo<Quote | null>(() => {
    if (!product || !context || locked || enrollmentHelp) return null;
    try { return calculateQuote(input, product, assessed, context.products.filter(p=>p.kind === "cage"), false); }
    catch { return null; }
  }, [product, context, input, assessed, locked, enrollmentHelp]);
  useEffect(() => { requestId.current = crypto.randomUUID(); }, [athleteId, coachId, date, time, count, household, email, name, playerName, birthDate, search.id, search.minutes, search.cages]);
  useEffect(() => {
    let cancelled = false;
    setSlots([]); setSlotError(""); setLoadingSlots(false);
    if (!quote?.needsSlot || !email.includes("@") || !name || (kind !== "cage" && !coachId)) return;
    setLoadingSlots(true);
    const timer = window.setTimeout(() => {
      getCheckoutQuote({ data: { ...input, requestId: requestId.current } }).then(result => {
        if (!cancelled) setSlots(result.slots);
      }).catch(e => { if (!cancelled) setSlotError(e instanceof Error ? e.message : "Available times could not load."); })
        .finally(() => { if (!cancelled) setLoadingSlots(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // Time selection and consent do not change which slots are available.
  }, [context, quote?.duration, quote?.needsSlot, date, coachId, athleteId, name, email, playerName, birthDate, count, household, kind, search.cages]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (paymentLock.current) return;
    paymentLock.current = true; setBusy(true); setError("");
    try {
      const result = await startCheckout({data:{...input,requestId:requestId.current}});
      window.location.assign(result.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Checkout did not open. Please retry."); setBusy(false); paymentLock.current = false; }
  }
  const needsAthlete = kind !== "cage" && kind !== "cage-plan";
  const recurring = quote?.recurring || kind === "membership" || kind === "cage-plan";
  return <main id="main" className="mx-auto max-w-3xl px-5 py-8">
    <p className="eyebrow">Oklahoma Prospects</p>
    <h1 className="mt-2 text-4xl">{recurring ? "Start your membership" : "Review your booking"}</h1>
    {!context && !error ? <p role="status" className="py-6">Loading secure checkout…</p> : null}
    {error ? <p role="alert" className="my-4 rounded-xl border border-maroon p-4 text-maroon">{error}</p> : null}
    {context && !product ? <p className="py-6">Choose a product on <Link className="underline" to="/book">Book</Link> or <Link className="underline" to="/training">Train</Link> to continue.</p> : null}
    {product ? <form onSubmit={submit} className="mt-6 grid gap-5">
      <article className="rounded-2xl bg-ink p-5 text-white">
        <h2 className="text-3xl">{product.name}</h2>
        <p className="mt-2">{quote ? formatMoney(quote.totalCents) : formatMoney(Math.round(product.price*100))}{recurring ? enrollmentHelp ? " per month" : " first month" : ""}</p>
        {quote?.lines.slice(1).map(line => <p key={line.label} className="mt-2 text-powder">{line.label}: {formatMoney(line.cents)}</p>)}
        {quote?.teamRate ? <p className="mt-2 text-powder">Team rate applies to three or more athletes, three or more spaces, or non-household use. Fielding is always $75/hour.</p> : null}
        {recurring && quote ? <p className="mt-3">Then {formatMoney(quote.regularCents)} per month, renewing monthly until you cancel. Your billing cycle starts when payment succeeds; the next billing date is one month later and appears in your billing history.</p> : null}
      </article>
      {!user ? <p>Checkout as a guest, <Link to="/login" search={{next:`/pay?kind=${kind}&id=${search.id || ""}`}} className="underline">sign in or create an account</Link>. You can claim your purchase later by verifying this email.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1">Parent / account name<input className="rounded-lg border p-3" autoComplete="name" required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
        <label className="grid gap-1">Email<input className="rounded-lg border p-3" type="email" autoComplete="email" required value={email} readOnly={Boolean(user?.primaryEmail)} onChange={e=>setEmail(e.target.value)}/></label>
      </div>
      {needsAthlete && context?.athletes.length ? <label className="grid gap-1">Athlete<select className="rounded-lg border p-3" value={athleteId} onChange={e=>setAthleteId(e.target.value)} required>
        <option value="">Select your athlete</option>{context.athletes.map(a=><option key={a.id} value={a.id}>{a.name}{a.assessmentComplete ? " · assessment completed" : " · assessment needed"}</option>)}</select></label> : null}
      {needsAthlete && !athleteId ? <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1">Athlete name<input className="rounded-lg border p-3" required value={playerName} onChange={e=>setPlayerName(e.target.value)} maxLength={120}/></label>
        <label className="grid gap-1">Athlete date of birth<input className="rounded-lg border p-3" required type="date" max={chicagoDate()} value={birthDate} onChange={e=>setBirthDate(e.target.value)}/></label>
      </div> : null}
      {enrollmentHelp ? <div className="rounded-xl border p-4" role="status"><p>{enrollmentHelp}</p><a className="inline-flex min-h-11 items-center underline" href="tel:+19189228114">Call (918) 922-8114</a></div> : null}
      {locked ? <div className="rounded-xl border border-maroon p-4" role="status"><p>Ordinary lessons and packages unlock after your coach records your assessment as completed. Booking or paying for an assessment does not complete it.</p><Button className="mt-3" asChild><Link to="/training">Choose an assessment</Link></Button></div> : null}
      {kind === "cage" || kind === "cage-plan" ? <fieldset className="grid gap-3"><legend className="font-semibold">Who is training?</legend>
        <label className="grid gap-1">Number of athletes<input className="rounded-lg border p-3" type="number" min={1} max={100} value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={household} onChange={e=>setHousehold(e.target.checked)}/><span>This is for one or two athletes from our household. Cage passes cannot be used for team practices.</span></label>
      </fieldset> : null}
      {quote?.needsSlot && !locked ? <fieldset className="grid gap-4"><legend className="font-semibold">Choose your available time · {quote.duration} minutes</legend>
        {kind !== "cage" ? <label className="grid gap-1">Coach<select className="rounded-lg border p-3" required value={coachId} onChange={e=>{setCoachId(e.target.value);setTime("");}}><option value="">Select a coach</option>{context?.coaches.filter(c=>c.specialties.some(s=>s.toLowerCase()===quote.discipline.toLowerCase())).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : null}
        <label className="grid gap-1">Date · America/Chicago<input className="rounded-lg border p-3" type="date" min={chicagoDate()} required value={date} onChange={e=>{setDate(e.target.value);setTime("");}}/></label>
        {loadingSlots ? <p role="status">Checking available times…</p> : slotError ? <p role="alert" className="text-maroon">{slotError}</p> : slots.length ? <div className="grid grid-cols-3 gap-2" aria-label="Available start times">{slots.map(s=><button type="button" key={s.value} className={`min-h-11 rounded-lg border p-2 ${time === s.value ? "bg-ink text-white" : "bg-paper"}`} aria-pressed={time===s.value} onClick={()=>setTime(s.value)}>{s.label}</button>)}</div> : <p>Enter your details and choose a coach and date to see available times. {slotsFor(date,quote.duration).length === 0 ? "No times remain on this date." : "If no times appear, choose another date."}</p>}
      </fieldset> : null}
      {recurring && quote ? <label className="flex min-h-11 items-start gap-3"><input className="mt-1 size-5" type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I agree to the first-month total and the regular monthly amount shown above. My membership renews monthly until I cancel. <Link to="/family" className="underline">Stop auto-renew in the family portal</Link>.</span></label> : <p className="text-sm">{CANCEL_POLICY.copy}</p>}
      {context?.mode === "test" ? <p role="status" className="rounded-lg bg-paper-2 p-3 font-semibold">Stripe test checkout · use test cards only. No real payment will be collected.</p> : null}
      {context?.mode === "disabled" ? <p className="rounded-lg bg-paper-2 p-3">Reserve now, pay at the desk. Online card checkout is not active yet. <a className="underline" href="tel:+19189228114">Call (918) 922-8114</a> to reserve.</p> : <Button type="submit" className="w-full" disabled={busy || locked || !quote || (quote.needsSlot && !slots.some(s=>s.value===time)) || (recurring && !consent)}>{busy ? "Opening secure checkout…" : recurring ? "Start membership" : "Continue to secure payment"}</Button>}
    </form> : null}
  </main>;
}
