import { useState } from "react";
import { getOperationsHealth } from "@/lib/front-office-api";
import { Button } from "./ui/button";
export function OperationsHealth() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getOperationsHealth>>>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setData(await getOperationsHealth());
    } catch {
      setError("Could not load the operational summary. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-labelledby="operations-health-title"
      className="rounded-xl border border-line bg-white p-5"
    >
      <h2 id="operations-health-title" className="text-2xl">
        Publication & business health
      </h2>
      <p className="mt-2 text-sm text-muted">
        Owner-only counts from saved records. No athlete identities or visitor tracking.
      </p>
      <Button className="mt-3" disabled={busy} onClick={() => void refresh()}>
        {busy ? "Loading summary…" : data ? "Refresh summary" : "View operational summary"}
      </Button>
      {error && (
        <p role="alert" className="mt-3">
          {error}
        </p>
      )}
      {data && (
        <div className="mt-4 space-y-4" aria-live="polite">
          <p className="text-sm">
            Checked{" "}
            {new Date(data.checkedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}{" "}
            Central.
          </p>
          <div>
            <h3 className="font-semibold">Public roster consent</h3>
            <p>
              {data.roster.published} published · {data.roster.withheld} withheld ·{" "}
              {data.roster.revoked} revoked · {data.roster.withdrawn} withdrawn
            </p>
            <p className="text-sm text-muted">
              Counts are roster entries on open teams, not unique athletes. Revoked entries are
              included in withheld.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Records created in the last 30 days</h3>
            <p>
              {data.outcomes.tryouts} tryout requests · {data.outcomes.paidOrders} currently paid
              production orders · {data.outcomes.bookings} confirmed or completed production order
              bookings
            </p>
            <p className="text-sm text-muted">
              Current saved statuses; refunded orders and cancelled bookings are excluded.
              Credit-only bookings without a production order are excluded. These counts are not a
              conversion rate or a provider reconciliation.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Payment follow-up</h3>
            <p>
              {data.queues.paymentReview} orders under review · {data.queues.pendingEvents} pending
              Square events · {data.queues.pendingRefunds} pending refunds
            </p>
            <p className="text-sm text-muted">
              Pending work may be normal. Review details in Payments; this summary makes no payment
              changes.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
