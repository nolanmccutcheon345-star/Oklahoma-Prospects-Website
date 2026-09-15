import { createFileRoute, Link } from "@tanstack/react-router";
import { DoorOpen, MapPin, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { ClubReceiptCard } from "@/components/club-receipt";
import { GoogleReview } from "@/components/google-review";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { CLUB, LINKS, smsHref } from "@/lib/club";
import { applyPurchase } from "@/lib/club-data";
import { isLessonKind, parsePaySearch } from "@/lib/pay";
import {
  deskSms,
  gateSms,
  getReceipt,
  saveReceipt,
  steveSms,
  takeCheckout,
  type ClubReceipt,
} from "@/lib/receipt";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useDevelopment } from "@/lib/pd/context";
import type { ProposedSession } from "@/lib/pd/commerce-engine";

export const Route = createFileRoute("/paid")({
  validateSearch: parsePaySearch,
  component: PaidPage,
});

function PaidPage() {
  const search = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const { confirmSessions } = useDevelopment();
  const [receipt, setReceipt] = useState<ClubReceipt | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isPending) return;
    const stored = getReceipt(search.receipt);
    if (!stored) {
      setReceipt(null);
      setReady(true);
      return;
    }
    if (stored.status === "pending") {
      const paid = saveReceipt({ ...stored, status: "paid" });
      const stash = takeCheckout(paid.id);
      if (user && stash) {
        void applyPurchase({
          data: {
            kind: stash.kind,
            title: stash.title,
            date: stash.date,
            startTime: stash.startTime,
            durationMin: stash.durationMin,
            price: stash.price,
            credits: stash.credits,
            remote: stash.remote,
            planName: stash.planName,
          },
        }).catch(() => undefined);
      }
      if (stash?.athleteId && Array.isArray(stash.sessions) && stash.sessions.length) {
        confirmSessions({
          athleteId: stash.athleteId,
          serviceId: stash.serviceId || "",
          price: stash.price,
          sessions: stash.sessions as ProposedSession[],
          planName: stash.planName,
          lessons: stash.credits,
          remote: stash.remote,
        });
      }
      setReceipt(paid);
      setReady(true);
      return;
    }
    setReceipt(stored);
    setReady(true);
  }, [search.receipt, user, confirmSessions, isPending]);

  if (!ready) {
    return (
      <main id="main" className="bg-ink px-5 py-10 text-fg-inverse">
        <p className="text-sm text-fg-soft">Loading receipt…</p>
      </main>
    );
  }

  if (!receipt) {
    return (
      <main id="main">
        <PageHero
          eyebrow="Oklahoma Prospects"
          title="Nothing is booked yet."
          accent="Pick a slot first."
          copy="Choose a cage, lesson, or membership, then pay with debit or credit. A receipt only appears after checkout starts on this phone."
          actions={
            <Button asChild>
              <Link to="/book">Open booking</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const lesson = isLessonKind(receipt.kind);
  const who = lesson ? CLUB.coachSteve : "The facility desk";
  const whoPhone = lesson ? CLUB.coachStevePhone : CLUB.phoneDisplay;
  const whoSms = lesson ? steveSms(receipt) : deskSms(receipt);

  return (
    <main id="main">
      <PageHero
        compact
        image="/brand/facility.jpg"
        eyebrow="Oklahoma Prospects · paid"
        title="It’s yours."
        accent="Here’s the door."
        copy="This hour is reserved. Sign the waiver, know the door, and text if the gate is locked."
      />
      <div className="mx-auto max-w-3xl px-5 py-8">
        <ClubReceiptCard receipt={receipt} />

        <ol className="mt-6 grid gap-3">
          <li className="flex gap-4 rounded-2xl bg-paper-2 p-4 shadow-border">
            <DoorOpen className="mt-1 size-5 shrink-0 text-maroon" />
            <span>
              <span className="block font-display text-xl uppercase">The door</span>
              <span className="mt-1 block text-sm text-muted">
                {CLUB.addressLine1}. Turf or indoor shoes, water, and a
                helmet if you are hitting live.
              </span>
              <a
                href={LINKS.maps}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink"
              >
                <MapPin className="size-4 text-maroon" />
                Open directions
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </span>
          </li>
          <li className="flex gap-4 rounded-2xl bg-paper-2 p-4 shadow-border">
            <Shield className="mt-1 size-5 shrink-0 text-maroon" />
            <span>
              <span className="block font-display text-xl uppercase">The waiver</span>
              <span className="mt-1 block text-sm text-muted">
                Parent or guardian signs for athletes under 18. One waiver covers
                the year. Required before you train.
              </span>
              <Button asChild className="mt-3" size="sm">
                <Link to="/waiver">Sign the annual waiver</Link>
              </Button>
            </span>
          </li>
        </ol>

        <section className="mt-6 rounded-2xl bg-maroon p-5 text-fg-inverse">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Gate locked?
          </p>
          <h2 className="mt-2 text-3xl">Text the desk.</h2>
          <p className="mt-2 text-sm text-fg-soft">
            Prefilled with your receipt. {who} is for questions after this booking
            — {whoPhone}.
          </p>
          <Button asChild className="mt-4">
            <a href={gateSms(receipt)}>Text {CLUB.phoneDisplay} at the gate</a>
          </Button>
        </section>

        <section className="mt-6 rounded-2xl bg-paper-2 p-5 shadow-border">
          <h2 className="text-2xl">Questions after you book</h2>
          <p className="mt-2 text-sm text-muted">
            {lesson
              ? `Coach Steve after a paid lesson: ${CLUB.coachStevePhone}.`
              : `The desk for cages and the door: ${CLUB.phoneDisplay}.`}
          </p>
          <div className="mt-4 grid gap-2">
            <Button asChild variant="outlineDark">
              <a href={whoSms}>Text {who} · {whoPhone}</a>
            </Button>
            <Button asChild variant="ghost">
              <a href={smsHref(CLUB.phoneTel, `Receipt ${receipt.id} — arriving shortly.`)}>
                Text the desk
              </a>
            </Button>
          </div>
        </section>

        <div className="mt-6">
          <GoogleReview />
        </div>

        <p className="mt-6 text-center text-sm">
          <Link to="/visits">Saved bookings on this phone</Link>
          {" · "}
          <Link to="/book">Book another hour</Link>
        </p>
      </div>
    </main>
  );
}
