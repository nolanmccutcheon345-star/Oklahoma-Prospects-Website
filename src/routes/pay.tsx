import { checkoutLessonService } from "@/lib/commerce/coach-services";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { checkoutParty, checkoutReturnPath, parsePaySearch, parseLaneIds } from "@/lib/pay";
import {
  getCheckoutContext,
  getCheckoutQuote,
  startCheckout,
  submitSquarePayment,
} from "@/lib/commerce/api";
import { calculateQuote, type CheckoutInput, type Quote } from "@/lib/commerce/contracts";
import { eligibility, formatMoney } from "@/lib/pricing";
import { chicagoDate, slotsFor } from "@/lib/scheduling";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { SquareCard } from "@/components/commerce/square-card";
import { CANCEL_POLICY } from "@/lib/club";

export const Route = createFileRoute("/pay")({
  head: () =>
    pageHead("/pay", "Checkout", "Review your server-calculated order and payment details.", true),
  validateSearch: parsePaySearch,
  component: PayPage,
});
function PayPage() {
  const search = Route.useSearch();
  const user = useCurrentUser();
  const [context, setContext] = useState<Awaited<ReturnType<typeof getCheckoutContext>> | null>(
    null,
  );
  const [athleteId, setAthleteId] = useState("");
  const [coachId, setCoachId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const playerName = "",
    birthDate = "";
  const [date, setDate] = useState(search.date || chicagoDate());
  const [time, setTime] = useState(search.time || "");
  const [household, setHousehold] = useState(checkoutParty(search).household);
  const [count, setCount] = useState(checkoutParty(search).count);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [slotError, setSlotError] = useState("");
  const [slots, setSlots] = useState<{ value: string; label: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof startCheckout>> | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const paymentLock = useRef(false);
  useEffect(() => {
    setName(user?.displayName || "");
    setEmail(user?.primaryEmail || "");
  }, [user?.id, user?.displayName, user?.primaryEmail]);
  useEffect(() => {
    let active = true;
    getCheckoutContext()
      .then((value) => {
        if (active) {
          setContext(value);
          if (value.athletes.length === 1) setAthleteId(value.athletes[0].id);
        }
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Checkout could not load. Please try again.");
      });
    return () => {
      active = false;
    };
  }, [user?.id]);
  const product = context?.products.find((p) => p.id === search.id);
  const assessed = context?.athletes.find((a) => a.id === athleteId)?.assessmentComplete === true;
  const kind = (search.kind || "lesson") as CheckoutInput["kind"];
  const enrollmentHelp =
    product?.id === "m4" || product?.id === "s6"
      ? "Small-group enrollment opens when the weekly schedule is published."
      : product?.id === "m5" && !assessed
        ? "Contact your coach to arrange a remote assessment before starting remote coaching."
        : "";
  const locked = product ? eligibility(kind, product.id, assessed).locked : false;
  const input = useMemo<CheckoutInput>(
    () => ({
      requestId: requestId.current,
      productId: search.id || "",
      kind,
      athleteId: athleteId || undefined,
      coachId: coachId || undefined,
      date,
      time,
      duration: kind === "cage" ? search.minutes || 60 : undefined,
      laneIds: parseLaneIds(search.cages),
      athleteCount: count,
      household,
      consent,
      email,
      name,
      playerName: playerName || undefined,
      playerBirthDate: birthDate || undefined,
    }),
    [
      search.id,
      kind,
      athleteId,
      coachId,
      date,
      time,
      search.minutes,
      search.cages,
      count,
      household,
      consent,
      email,
      name,
      playerName,
      birthDate,
    ],
  );
  const quote = useMemo<Quote | null>(() => {
    if (!product || !context || locked || enrollmentHelp) return null;
    try {
      return calculateQuote(
        input,
        product,
        assessed,
        context.products.filter((p) => p.kind === "cage"),
        false,
      );
    } catch {
      return null;
    }
  }, [product, context, input, assessed, locked, enrollmentHelp]);
  useEffect(() => {
    requestId.current = crypto.randomUUID();
  }, [
    athleteId,
    coachId,
    date,
    time,
    count,
    household,
    email,
    name,
    playerName,
    birthDate,
    search.id,
    search.minutes,
    search.cages,
  ]);
  useEffect(() => {
    let cancelled = false;
    setSlots([]);
    setSlotError("");
    setLoadingSlots(false);
    if (!quote?.needsSlot || !email.includes("@") || !name || (kind !== "cage" && !coachId)) return;
    setLoadingSlots(true);
    const timer = window.setTimeout(() => {
      getCheckoutQuote({ data: { ...input, requestId: requestId.current } })
        .then((result) => {
          if (!cancelled) setSlots(result.slots);
        })
        .catch((e) => {
          if (!cancelled)
            setSlotError(e instanceof Error ? e.message : "Available times could not load.");
        })
        .finally(() => {
          if (!cancelled) setLoadingSlots(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Time selection and consent do not change which slots are available.
  }, [
    context,
    quote?.duration,
    quote?.needsSlot,
    date,
    coachId,
    athleteId,
    name,
    email,
    playerName,
    birthDate,
    count,
    household,
    kind,
    search.cages,
  ]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (paymentLock.current) return;
    paymentLock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await startCheckout({ data: { ...input, requestId: requestId.current } });
      setPrepared(result);
      setBusy(false);
      paymentLock.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout did not open. Please retry.");
      setBusy(false);
      paymentLock.current = false;
    }
  }
  const needsAthlete = kind !== "cage" && kind !== "cage-plan";
  const recurring = quote?.recurring || kind === "membership" || kind === "cage-plan";
  return (
    <main id="main" className="mx-auto max-w-3xl px-5 py-8">
      <p className="eyebrow">Oklahoma Prospects</p>
      <h1 className="mt-2 text-4xl">
        {recurring ? "Start your membership" : "Review your booking"}
      </h1>
      {!context && !error ? (
        <p role="status" className="py-6">
          Loading secure checkout…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="my-4 rounded-xl border border-maroon p-4 text-maroon">
          {error}
        </p>
      ) : null}
      {context && !product ? (
        <p className="py-6">
          Choose a product on{" "}
          <Link className="underline" to="/book">
            Book
          </Link>{" "}
          or{" "}
          <Link className="underline" to="/training">
            Train
          </Link>{" "}
          to continue.
        </p>
      ) : null}
      {prepared && prepared.totalCents > prepared.chargeCents ? (
        <p className="my-4">
          First pay {formatMoney(prepared.chargeCents)} for the membership, then the separate{" "}
          {formatMoney(prepared.totalCents - prepared.chargeCents)} first-month fee. Both payments
          must succeed before booking confirmation.
        </p>
      ) : null}
      {prepared && context?.square ? (
        <SquareCard
          config={context.square}
          amountCents={prepared.chargeCents}
          recurring={prepared.recurring}
          expiresAt={prepared.holdUntil}
          email={email}
          name={name}
          onToken={async (sourceId, attemptId) => {
            const result = await submitSquarePayment({
              data: { orderId: prepared.orderId, sourceId, attemptId },
            });
            if (result.url) window.location.assign(result.url);
            return result;
          }}
        />
      ) : null}
      {product && !prepared ? (
        <form onSubmit={submit} className="mt-6 grid gap-5">
          <article className="rounded-2xl bg-ink p-5 text-white">
            <h2 className="text-3xl">{product.name}</h2>
            <p className="mt-2">
              {quote ? formatMoney(quote.totalCents) : formatMoney(Math.round(product.price * 100))}
              {recurring ? (enrollmentHelp ? " per month" : " first month") : ""}
            </p>
            {quote?.lines.map((line) => (
              <p key={line.label} className="mt-2 text-powder">
                {line.label}: {formatMoney(line.cents)}
              </p>
            ))}
            {quote?.teamRate ? (
              <p className="mt-2 text-powder">
                Team rate applies to three or more athletes, three or more spaces, or non-household
                use. Fielding is always $75/hour.
              </p>
            ) : null}
            {recurring && quote ? (
              <p className="mt-3">
                Then {formatMoney(quote.regularCents)} per month, renewing monthly until you cancel.
                Your billing cycle starts when payment succeeds; the next billing date is one month
                later and appears in your billing history.
              </p>
            ) : null}
          </article>
          {!user ? (
            <p>
              Please{" "}
              <Link
                to="/login"
                search={{
                  next: checkoutReturnPath({
                    ...search,
                    kind,
                    date,
                    time,
                    use: household ? "household" : "team",
                    athleteCount: count,
                  }),
                }}
                className="underline"
              >
                sign in or create an account
              </Link>
              . A verified account is required before payment.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              Parent / account name
              <input
                className="rounded-lg border p-3"
                autoComplete="name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="grid gap-1">
              Email
              <input
                className="rounded-lg border p-3"
                type="email"
                autoComplete="email"
                required
                value={email}
                readOnly={Boolean(user?.primaryEmail)}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </div>
          {needsAthlete && context?.athletes.length ? (
            <label className="grid gap-1">
              Athlete
              <select
                className="rounded-lg border p-3"
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
                required
              >
                <option value="">Select your athlete</option>
                {context.athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.assessmentComplete ? " · assessment completed" : " · assessment needed"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {needsAthlete && !context?.athletes.length ? (
            <p>
              <Link to="/family" className="underline">
                Add your athlete in the family portal
              </Link>{" "}
              before checkout. Assessment history stays with that athlete’s account.
            </p>
          ) : null}
          {enrollmentHelp ? (
            <div className="rounded-xl border p-4" role="status">
              <p>{enrollmentHelp}</p>
            </div>
          ) : null}
          {locked ? (
            <div className="rounded-xl border border-maroon p-4" role="status">
              <p>
                Ordinary lessons and packages unlock after your coach records your assessment as
                completed. Booking or paying for an assessment does not complete it.
              </p>
              <Button className="mt-3" asChild>
                <Link to="/training">Choose an assessment</Link>
              </Button>
            </div>
          ) : null}
          {kind === "cage" || kind === "cage-plan" ? (
            <fieldset className="grid gap-3">
              <legend className="font-semibold">Who is training?</legend>
              <label className="grid gap-1">
                Number of athletes
                <input
                  className="rounded-lg border p-3"
                  type="number"
                  min={1}
                  max={100}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={household}
                  onChange={(e) => setHousehold(e.target.checked)}
                />
                <span>
                  This is for one or two athletes from our household. Cage passes cannot be used for
                  team practices.
                </span>
              </label>
            </fieldset>
          ) : null}
          {quote?.needsSlot && !locked ? (
            <fieldset className="grid gap-4">
              <legend className="font-semibold">
                Choose your available time · {quote.duration} minutes
              </legend>
              {kind !== "cage" ? (
                <label className="grid gap-1">
                  Coach
                  <select
                    className="rounded-lg border p-3"
                    required
                    value={coachId}
                    onChange={(e) => {
                      setCoachId(e.target.value);
                      setTime("");
                    }}
                  >
                    <option value="">Select a coach</option>
                    {context?.coaches
                      .filter((c) => c.serviceIds.includes(checkoutLessonService(quote)))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              <label className="grid gap-1">
                Date · America/Chicago
                <input
                  className="rounded-lg border p-3"
                  type="date"
                  min={chicagoDate()}
                  required
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setTime("");
                  }}
                />
              </label>
              {loadingSlots ? (
                <p role="status">Checking available times…</p>
              ) : slotError ? (
                <p role="alert" className="text-maroon">
                  {slotError}
                </p>
              ) : slots.length ? (
                <div className="grid grid-cols-3 gap-2" aria-label="Available start times">
                  {slots.map((s) => (
                    <button
                      type="button"
                      key={s.value}
                      className={`min-h-11 rounded-lg border p-2 ${time === s.value ? "bg-ink text-white" : "bg-paper"}`}
                      aria-pressed={time === s.value}
                      onClick={() => setTime(s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p>
                  {!user
                    ? "Sign in to check available times."
                    : kind === "cage"
                      ? "Choose a date to check available cage times."
                      : "Choose a coach and date to see available times."}{" "}
                  {slotsFor(date, quote.duration).length === 0
                    ? "No times remain on this date."
                    : "If no times appear, choose another date."}
                </p>
              )}
            </fieldset>
          ) : null}
          {recurring ? (
            <label className="flex min-h-11 items-start gap-3">
              <input
                className="mt-1 size-5"
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I agree to the first-month total and the regular monthly amount shown above. My
                membership renews monthly until I cancel.{" "}
                <Link to="/family" className="underline">
                  Stop auto-renew in the family portal
                </Link>
                .
              </span>
            </label>
          ) : (
            <p className="text-sm">{CANCEL_POLICY.copy}</p>
          )}
          {context?.mode === "test" ? (
            <p role="status" className="rounded-lg bg-paper-2 p-3 font-semibold">
              Square Sandbox checkout · use test cards only. No real payment will be collected.
            </p>
          ) : null}
          <p className="text-sm">
            <Link to="/terms" className="underline">
              Booking terms
            </Link>{" "}
            ·{" "}
            <Link to="/privacy" className="underline">
              Privacy
            </Link>
          </p>
          {context?.square?.checkoutScope === "cages" && product.kind !== "cage" ? (
            <p role="status" className="rounded-lg bg-paper-2 p-3">
              Online checkout is open for one-time cage bookings. Memberships, lessons and packages
              are not yet available for purchase.
            </p>
          ) : context?.mode === "disabled" ? (
            <p className="rounded-lg bg-paper-2 p-3">
              Online payment is temporarily unavailable. No booking is created until payment
              succeeds. Please try again later.
            </p>
          ) : (
            <Button
              type="submit"
              className="w-full"
              disabled={
                !user ||
                (needsAthlete && !athleteId) ||
                busy ||
                locked ||
                !quote ||
                (quote.needsSlot && !slots.some((s) => s.value === time)) ||
                (recurring && !consent)
              }
            >
              {busy
                ? "Opening secure checkout…"
                : `Continue to payment${quote ? " · " + formatMoney(quote.totalCents) : ""}`}
            </Button>
          )}
        </form>
      ) : null}
    </main>
  );
}
