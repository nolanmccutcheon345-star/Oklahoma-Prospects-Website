import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClubReceiptCard } from "@/components/club-receipt";
import { GoogleReview } from "@/components/google-review";
import { VisitChecklist } from "@/components/visit-checklist";
import { Button } from "@/components/ui/button";
import { loadReceipts, type ClubReceipt } from "@/lib/receipt";
import { useVisits, VISIT_LABELS } from "@/lib/visits";

export const Route = createFileRoute("/visits")({ component: VisitsPage });

function VisitsPage() {
  const visits = useVisits((s) => s.visits);
  const remove = useVisits((s) => s.remove);
  const [ready, setReady] = useState(false);
  const [receipts, setReceipts] = useState<ClubReceipt[]>([]);

  useEffect(() => {
    setReady(true);
    setReceipts(loadReceipts());
  }, []);

  const latestHeld = receipts[0];

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-8">
      <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
        Saved on this phone
      </p>
      <h1 className="mt-2 text-4xl">My planned visits</h1>
      <p className="mt-2 text-muted">
        Bookings and receipts live on this phone. Pick a live slot, pay with card,
        then show up ready.
      </p>

      {ready && latestHeld ? (
        <section className="mt-6">
          <h2 className="mb-3 text-2xl">Latest booking</h2>
          <ClubReceiptCard receipt={latestHeld} />
          <Button asChild className="mt-3 w-full">
            <Link
              to="/paid"
              search={{
                kind: latestHeld.kind,
                id: latestHeld.itemId,
                date: latestHeld.date,
                time: latestHeld.time,
                minutes: latestHeld.minutes,
                receipt: latestHeld.id,
              }}
            >
              Door, waiver, and gate text
            </Link>
          </Button>
        </section>
      ) : null}

      {!ready ? null : visits.length === 0 && !latestHeld ? (
        <div className="mt-8 rounded-2xl bg-paper-2 p-6 shadow-border">
          <h2 className="text-2xl">No visits planned yet</h2>
          <p className="mt-2 text-sm text-muted">
            From Book, choose one or more cages and a time — then pay with debit or credit.
          </p>
          <Button asChild className="mt-5">
            <Link to="/book">Browse rentals</Link>
          </Button>
        </div>
      ) : visits.length > 0 ? (
        <ul className="mt-6 grid gap-3">
          {visits.map((visit) => (
            <li
              key={visit.id}
              className="rounded-2xl bg-paper-2 p-5 shadow-border"
            >
              <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
                {VISIT_LABELS[visit.kind]}
              </p>
              <h2 className="mt-1 text-2xl">
                {formatDate(visit.date)} · {formatTime(visit.time)}
              </h2>
              {visit.notes ? (
                <p className="mt-2 text-sm text-muted">{visit.notes}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/book">Book this time</Link>
                </Button>
                <Button
                  size="sm"
                  variant="outlineDark"
                  onClick={() => remove(visit.id)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="mt-8">
        <h2 className="text-2xl">Before you walk in</h2>
        <p className="mt-2 mb-4 text-sm text-muted">
          Your paid receipt is the reservation. This list is the rest of the
          first visit.
        </p>
        <VisitChecklist />
      </section>

      <section className="mt-8">
        <GoogleReview />
      </section>
    </main>
  );
}

function formatDate(value: string) {
  if (!value) return "Date TBD";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string) {
  if (!value) return "Time TBD";
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h)) return value;
  const date = new Date();
  date.setHours(h, m || 0, 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
