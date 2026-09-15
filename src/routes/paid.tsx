import { createFileRoute, Link } from "@tanstack/react-router";
import { DoorOpen, MapPin, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ClubReceiptCard } from "@/components/club-receipt";
import { GoogleReview } from "@/components/google-review";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { CLUB, LINKS, smsHref } from "@/lib/club";
import { isLessonKind, parsePaySearch, quoteCheckout } from "@/lib/pay";
import {
  deskSms,
  gateSms,
  getReceipt,
  receiptFromItem,
  steveSms,
  type ClubReceipt,
} from "@/lib/receipt";
import { useLiveCatalog } from "@/lib/use-catalog";

export const Route = createFileRoute("/paid")({
  validateSearch: parsePaySearch,
  component: PaidPage,
});

function PaidPage() {
  const search = Route.useSearch();
  const catalog = useLiveCatalog();
  const item = useMemo(
    () => quoteCheckout(search, catalog, search.assessed === "1"),
    [search, catalog],
  );
  const [receipt, setReceipt] = useState<ClubReceipt | null>(null);

  useEffect(() => {
    const stored = getReceipt(search.receipt);
    if (stored) {
      setReceipt(stored);
      return;
    }
    if (item) setReceipt(receiptFromItem(item, search, search.receipt));
  }, [item, search]);

  if (!item && !receipt) {
    return (
      <main id="main">
        <PageHero
          eyebrow="Oklahoma Prospects"
          title="Nothing is booked yet."
          accent="Pick a slot first."
          copy="Choose a cage, lesson, or membership, then pay with debit or credit."
          actions={
            <Button asChild>
              <Link to="/book">Open booking</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const held = receipt ?? (item ? receiptFromItem(item, search) : null);
  if (!held) return null;

  const lesson = isLessonKind(held.kind);
  const who = lesson ? CLUB.coachSteve : "The facility desk";
  const whoPhone = lesson ? CLUB.coachStevePhone : CLUB.phoneDisplay;
  const whoSms = lesson ? steveSms(held) : deskSms(held);

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
        <ClubReceiptCard receipt={held} />

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
                rel="noreferrer"
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink"
              >
                <MapPin className="size-4 text-maroon" />
                Open directions
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
            <a href={gateSms(held)}>Text {CLUB.phoneDisplay} at the gate</a>
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
              <a href={smsHref(CLUB.phoneTel, `Receipt ${held.id} — arriving shortly.`)}>
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
