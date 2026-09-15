import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClubReceiptCard } from "@/components/club-receipt";
import { GoogleReview } from "@/components/google-review";
import { VisitChecklist } from "@/components/visit-checklist";
import { Button } from "@/components/ui/button";
import { loadReceipts, type ClubReceipt } from "@/lib/receipt";

export const Route = createFileRoute("/visits")({ component: VisitsPage });

function VisitsPage() {
  const [ready, setReady] = useState(false);
  const [receipts, setReceipts] = useState<ClubReceipt[]>([]);

  useEffect(() => {
    setReady(true);
    setReceipts(loadReceipts().filter((row) => row.status === "paid"));
  }, []);

  const paid = receipts;

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-8">
      <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
        Saved on this phone
      </p>
      <h1 className="mt-2 text-4xl">Your bookings</h1>
      <p className="mt-2 text-muted">
        Paid receipts live on this phone. Show one at the door as your check-in.
        Sign in to also keep them on your account.
      </p>

      {!ready ? null : paid.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-paper-2 p-6 shadow-border">
          <h2 className="text-2xl">No paid visits yet</h2>
          <p className="mt-2 text-sm text-muted">
            From Book, choose one or more cages and a time — then pay with debit or credit.
          </p>
          <Button asChild className="mt-5">
            <Link to="/book">Browse cages</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4">
          {paid.map((row) => (
            <li key={row.id}>
              <ClubReceiptCard receipt={row} />
              <Button asChild className="mt-3 w-full">
                <Link
                  to="/paid"
                  search={{
                    kind: row.kind,
                    id: row.itemId,
                    date: row.date,
                    time: row.time,
                    minutes: row.minutes,
                    receipt: row.id,
                    cages: row.cages,
                    use: row.use,
                  }}
                >
                  Door, waiver, and gate text
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}

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
