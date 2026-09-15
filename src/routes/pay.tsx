import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { CheckoutSchedule } from "@/components/pd/checkout";
import { CancelNote, OrderLines, SquarePayButton } from "@/components/square-pay";
import { CANCEL_POLICY, CLUB } from "@/lib/club";
import { applyPurchase, getProfile } from "@/lib/club-data";
import { MEMBERSHIP_RULES } from "@/lib/pd";
import { parsePaySearch, quoteCheckout } from "@/lib/pay";
import { newReceiptId, receiptFromItem, saveReceipt } from "@/lib/receipt";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useLiveCatalog } from "@/lib/use-catalog";
import { useDevelopment } from "@/lib/pd/context";
import { findLesson, findDevelopmentPlan } from "@/lib/catalog";
import type { ProposedSession } from "@/lib/pd/commerce-engine";
import { serviceIdForCheckout } from "@/lib/pd/commerce-engine";

export const Route = createFileRoute("/pay")({
  validateSearch: parsePaySearch,
  component: PayPage,
});

function PayPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const catalog = useLiveCatalog();
  const { confirmSessions, emptyAthleteId, listAthletes } = useDevelopment();
  const [hasAssessment, setHasAssessment] = useState(search.assessed === "1");
  const [attest, setAttest] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasAssessment(false);
      return;
    }
    getProfile()
      .then((profile) => setHasAssessment(Boolean(profile?.assessment_complete)))
      .catch(() => setHasAssessment(false));
  }, [user]);

  const item = useMemo(
    () => quoteCheckout({ ...search, assessed: hasAssessment ? "1" : "0" }, catalog, hasAssessment),
    [search, catalog, hasAssessment],
  );
  const lesson = item && item.kind === "lesson" ? findLesson(item.id) : undefined;
  const membership = item && item.kind === "membership" ? findDevelopmentPlan(item.id) : undefined;
  const athleteId = listAthletes("parent")[0]?.id ?? emptyAthleteId;
  const needsSchedule =
    item && (item.kind === "lesson" || item.kind === "package" || item.kind === "membership");
  const needsHouseholdAttest = item?.kind === "cage" && item.use === "household";

  if (!item) {
    return (
      <main id="main">
        <PageHero
          eyebrow="Oklahoma Prospects checkout"
          title="Choose what to book."
          accent="Then pay with card."
          copy="Pick a lesson, monthly plan, cage, or membership, then come back here to pay."
          actions={
            <Button asChild>
              <Link to="/training">Open player development</Link>
            </Button>
          }
        />
      </main>
    );
  }

  if (item.error) {
    return (
      <main id="main">
        <PageHero
          eyebrow="Oklahoma Prospects checkout"
          title="This isn’t the right plan."
          accent="Team workouts pay the team rate."
          copy={item.error}
          actions={
            <Button asChild>
              <Link to="/book" search={{ space: "team" }}>
                Book team cages
              </Link>
            </Button>
          }
        />
      </main>
    );
  }

  const paid = item;

  async function finish(sessions: ProposedSession[]) {
    setError("");
    setBusy(true);
    const first = sessions[0];
    if (user) {
      try {
        await applyPurchase({
          data: {
            kind: paid.id,
            title: paid.title,
            date: first?.date || search.date || new Date().toISOString().slice(0, 10),
            startTime: first?.time || search.time || "plan",
            durationMin: paid.minutes,
            price: paid.price,
            credits: paid.credits,
            remote: paid.remote,
            planName: paid.planName,
          },
        });
      } catch (err) {
        setBusy(false);
        setError(err instanceof Error ? err.message : "Could not keep this on your account.");
        return;
      }
    }
    confirmSessions({
      athleteId,
      serviceId: serviceIdForCheckout(paid.kind, paid.id, paid.minutes),
      price: paid.price,
      sessions,
      planName: paid.planName,
      planType: membership?.tier,
      lessons: membership?.lessons ?? paid.credits,
      remote: membership?.remote ?? paid.remote,
    });
    const receipt = saveReceipt(
      receiptFromItem(
        paid,
        { ...search, date: first?.date || search.date, time: first?.time || search.time },
        newReceiptId(),
      ),
    );
    setBusy(false);
    void navigate({
      to: "/paid",
      search: {
        kind: paid.kind,
        id: paid.id,
        date: first?.date || search.date,
        time: first?.time || search.time,
        minutes: search.minutes ?? paid.minutes,
        receipt: receipt.id,
        cages: search.cages,
        use: search.use,
        assessed: hasAssessment ? "1" : "0",
      },
    });
  }

  const kindLabel =
    item.kind === "cage"
      ? "Cage reservation"
      : item.kind === "membership"
        ? "Monthly development"
        : item.kind === "cage-plan"
          ? "Cage membership"
          : item.kind;

  return (
    <main id="main">
      <PageHero
        compact
        eyebrow="Oklahoma Prospects checkout"
        title="Review the order."
        accent="Pay the total on the card."
        copy="Debit or credit only. Square charges the same total as this receipt — not a leftover $50 cage link."
      />
      <div className="mx-auto max-w-3xl px-5 py-8">
        <ol className="mb-6 grid grid-cols-3 gap-2 text-center text-xs font-semibold tracking-wide uppercase">
          <li className="rounded-lg bg-maroon px-2 py-2 text-fg-inverse">1 · Order</li>
          <li className="rounded-lg bg-paper-2 px-2 py-2">2 · Card</li>
          <li className="rounded-lg bg-paper-2 px-2 py-2">3 · Receipt</li>
        </ol>
        <article className="rounded-2xl bg-ink p-5 text-fg-inverse">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">{kindLabel}</p>
          <h2 className="mt-2 text-3xl italic">{item.title}</h2>
          <p className="mt-2 text-sm text-fg-soft">{item.detail}</p>
          {search.date || search.time ? (
            <p className="mt-2 text-sm text-fg-soft">
              {[search.date, search.time].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <OrderLines lines={item.lines} total={item.price} />
        </article>

        <div className="mt-4 rounded-2xl bg-paper-2 p-4 shadow-border">
          <CancelNote />
        </div>

        {needsHouseholdAttest ? (
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={attest}
              onChange={(event) => setAttest(event.target.checked)}
              data-household-attest="true"
            />
            <span>
              I confirm this reservation is for one or two household athletes — not a team
              practice of three or more. Team workouts pay the team cage rate.
            </span>
          </label>
        ) : null}

        {needsSchedule ? (
          <div className="mt-6">
            <CheckoutSchedule
              item={{
                kind: item.kind,
                id: item.id,
                title: item.title,
                price: item.price,
                minutes: item.minutes,
                credits: item.credits,
                remote: item.remote,
                planName: item.planName,
                detail: item.detail,
                discipline: lesson?.discipline,
                tier: membership?.tier,
                lessons: membership?.lessons,
              }}
              athleteId={athleteId}
              initialDate={item.kind === "lesson" ? search.date : undefined}
              initialTime={item.kind === "lesson" ? search.time : undefined}
              busy={busy}
              search={{ ...search, assessed: hasAssessment ? "1" : "0" }}
              hasAssessment={hasAssessment}
              onApproved={finish}
            />
          </div>
        ) : (
          <div className="mt-6">
            <SquarePayButton
              amount={item.price}
              title={item.title}
              lines={item.lines}
              search={{ ...search, assessed: hasAssessment ? "1" : "0" }}
              hasAssessment={hasAssessment}
              busy={busy}
              disabled={needsHouseholdAttest && !attest}
              onPay={() => finish([])}
            />
          </div>
        )}

        <p className="mt-4 text-sm text-muted">
          {CANCEL_POLICY.short}. {MEMBERSHIP_RULES[3]}
        </p>

        {error ? <p className="mt-3 text-sm text-maroon">{error}</p> : null}

        <SignedOut>
          <p className="mt-4 text-center text-sm">
            <Link to="/login" search={{ next: "/account" }}>
              Sign in
            </Link>{" "}
            to keep this on your development schedule. Guests still get a club
            receipt on this phone.
          </p>
        </SignedOut>
        <SignedIn>
          <p className="mt-4 text-center text-sm">
            <Link to="/account">Back to my development</Link>
          </p>
        </SignedIn>
        <p className="mt-6 text-center text-xs text-muted">
          {CLUB.addressLine1}, {CLUB.city}. Questions after it is booked: {CLUB.phoneDisplay}.
        </p>
      </div>
    </main>
  );
}
