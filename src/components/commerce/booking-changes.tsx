import { formatClockTime } from "@/lib/time-display";
import { TimeInput } from "@/components/time-input";
import { useEffect, useState } from "react";
import { SquareCard } from "./square-card";
import { submitSquarePayment } from "@/lib/commerce/api";
import { Button } from "@/components/ui/button";
import {
  getClubCancellationChoices,
  getStaffCancellationBookings,
  cancelClubSession,
  chooseClubCancellationRefund,
  rescheduleBooking,
  getBookingRescheduleQuote,
  startBookingRescheduleFee,
  getBookingRescheduleFeeStatus,
  resumeBookingRescheduleFee,
} from "@/lib/commerce/booking-resolution-api";

export function RescheduleBooking({
  id,
  onSaved,
  clubChange = false,
}: {
  id: string;
  onSaved: () => Promise<void>;
  clubChange?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string>();
  const [checkout, setCheckout] =
    useState<NonNullable<Awaited<ReturnType<typeof resumeBookingRescheduleFee>>>>();
  const [notice, setNotice] = useState("");
  async function checkFee() {
    if (!checkout) return;
    const state = await getBookingRescheduleFeeStatus({ data: { orderId: checkout.orderId } });
    if (state.completed) {
      setCheckout(undefined);
      setOpen(false);
      setRequestId(undefined);
      setNotice("Your paid reschedule is confirmed.");
      await onSaved();
    } else if (state.status === "payment_review" || state.status === "refunded")
      setNotice(
        "The move could not complete. Your original booking was kept; the fee is being refunded or has been refunded.",
      );
    else
      setNotice(
        "Payment confirmation is pending. Check this same payment before starting another.",
      );
    return state;
  }
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof getBookingRescheduleQuote>>>();
  return (
    <div className="mt-3">
      <Button
        variant="outlineDark"
        disabled={busy}
        onClick={async () => {
          if (open) {
            setOpen(false);
            return;
          }
          setBusy(true);
          setError("");
          try {
            const resume = await resumeBookingRescheduleFee({ data: { id } });
            setCheckout(resume || undefined);
            setQuote(resume ? undefined : await getBookingRescheduleQuote({ data: { id } }));
            setNotice(
              resume && !resume.canPay
                ? "An earlier fee payment needs a status check. Do not start another payment."
                : "",
            );
            setOpen(true);
            if (!requestId) setRequestId(crypto.randomUUID());
          } catch (e) {
            setError(e instanceof Error ? e.message : "Reschedule fee could not load.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {clubChange ? "Choose free reschedule" : "Review reschedule"}
      </Button>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {open && !checkout && quote?.mode !== "free" ? (
        <div className="mt-3 rounded border p-3" role="status">
          {quote?.mode === "payment_required" ? (
            <p>
              The 24–48-hour reschedule fee is{" "}
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                quote.feeCents / 100,
              )}
              , based on this individual session’s prepaid value. Select a new time and review
              payment. Your booking stays at its original time until payment and the move are
              confirmed.
            </p>
          ) : (
            <p>
              Under 24 hours, cancellation gives no refund. Online rescheduling is not available for
              this session. Your booking and household allowance have not changed.
            </p>
          )}
        </div>
      ) : null}
      {open && !checkout && (quote?.mode === "free" || quote?.mode === "payment_required") ? (
        <form
          className="mt-3 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !requestId || !quote) return;
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              const input = {
                id,
                date: String(form.get("date")),
                time: String(form.get("time")),
                requestId,
              };
              if (quote.mode === "payment_required") {
                setCheckout(await startBookingRescheduleFee({ data: input }));
              } else {
                await rescheduleBooking({ data: input });
                setOpen(false);
                setRequestId(undefined);
                await onSaved();
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : "Reschedule did not save.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            {quote.householdExempt
              ? "Your household allowance will not be used. Select a new available time with the same coach and resources."
              : "One cancellation or reschedule is shared by your household each Chicago calendar month. Changes at 48+ hours are free; 24–48-hour changes require the displayed individual-session fee."}{" "}
            All times are America/Chicago. Paid credits retain their original expiration.
          </p>
          <label>
            New date
            <input type="date" name="date" required className="ml-3 rounded border p-2" />
          </label>
          <label>
            New start time
            <TimeInput

              name="time"
              required
              step={1800}
              className="ml-3 rounded border p-2"
            />
          </label>
          <Button type="submit" disabled={busy}>
            {quote.mode === "free" ? "Confirm free reschedule" : "Review fee payment"}
          </Button>
        </form>
      ) : null}
      {open && checkout ? (
        <div className="mt-3 grid gap-3">
          <p>
            {checkout.canPay ? "Pay " : "Existing fee: "}
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
              checkout.totalCents / 100,
            )}{" "}
            for the requested move to {checkout.date} at {formatClockTime(checkout.time)} (America/Chicago). A
            confirmed move uses your household’s monthly allowance. If the move cannot complete, the
            fee enters the original-card refund process and the original booking stays intact.
          </p>
          {checkout.canPay && checkout.config ? (
            <SquareCard
              config={checkout.config}
              amountCents={checkout.totalCents}
              name={checkout.name}
              email={checkout.email}
              expiresAt={checkout.expiresAt}
              onToken={async (sourceId, attemptId) => {
                const result = await submitSquarePayment({
                  data: { orderId: checkout.orderId, sourceId, attemptId },
                });
                if (result.declined) return result;
                const state = await checkFee();
                return {
                  message: state?.completed
                    ? "Paid reschedule confirmed."
                    : result.message || "Confirmation is pending. Check this same payment.",
                };
              }}
            />
          ) : null}
          <Button
            variant="outlineDark"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await checkFee();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Status unavailable.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Check fee payment status
          </Button>
        </div>
      ) : null}
    </div>
  );
}
export function ClubCancellationChoices({ onSaved }: { onSaved: () => Promise<void> }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getClubCancellationChoices>>>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setRows(await getClubCancellationChoices());
  }
  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "Cancellation choices could not load."),
    );
  }, []);
  async function refresh() {
    await load();
    await onSaved();
    setNotice("Your free reschedule is saved.");
  }
  return (
    <section aria-label="Club cancellation choices" className="grid gap-3">
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {rows.map((row) => (
        <article key={row.id} className="rounded-xl border p-4">
          <h3 className="text-xl">
            {row.initiator === "facility" ? "Facility closure" : "Coach cancelled your session"}
          </h3>
          <p>
            {new Date(row.starts_at).toLocaleString("en-US", { timeZone: "America/Chicago" })}.
            Choose a full refund for this session or a free reschedule. Your household allowance is
            not affected.
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await chooseClubCancellationRefund({ data: { id: row.id } });
                await load();
                await onSaved();
                setNotice(
                  r.status === "completed"
                    ? "Your refund is confirmed."
                    : "Your refund is pending payment-provider confirmation.",
                );
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Refund did not complete. Retry to check the same refund.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {row.resolution_status === "refund_pending"
              ? "Check / retry original-card refund"
              : "Choose full refund to original card"}
          </Button>
          {row.resolution_status === "pending" ? (
            <RescheduleBooking id={row.id} clubChange onSaved={refresh} />
          ) : (
            <p>
              Your refund has been submitted; rescheduling is no longer available for this
              cancellation.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
export function StaffBookingChanges() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getStaffCancellationBookings>>>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setRows(await getStaffCancellationBookings());
  }
  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Sessions could not load."));
  }, []);
  return (
    <section className="my-6 grid gap-3" aria-label="Staff session cancellations">
      <h2 className="text-3xl">Cancel a session</h2>
      <p>
        The reserved time is released. The household can then choose a full refund or a free
        reschedule in its Family desk. This does not use its monthly allowance. Coaches can cancel
        only their assigned lessons; facility closures require an administrator.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {rows.length ? (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const data = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await cancelClubSession({
                data: {
                  id: String(data.get("booking")),
                  initiator: data.get("initiator") === "facility" ? "facility" : "coach",
                },
              });
              await load();
              setNotice(
                "Session cancelled. The family’s refund or reschedule choice is available in its Family desk.",
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "Cancellation did not save.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Session
            <select name="booking" required className="ml-3 rounded border p-2">
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {new Date(row.starts_at).toLocaleString("en-US", { timeZone: "America/Chicago" })}{" "}
                  · {row.product_id} · {row.athlete_name || row.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reason
            <select name="initiator" className="ml-3 rounded border p-2">
              <option value="coach">Coach cancellation</option>
              <option value="facility">Facility closure (admin only)</option>
            </select>
          </label>
          <label>
            <input type="checkbox" required /> I confirm this session must be cancelled by the coach
            or facility.
          </label>
          <Button type="submit" disabled={busy}>
            Confirm cancellation
          </Button>
        </form>
      ) : (
        <p>No upcoming eligible sessions.</p>
      )}
    </section>
  );
}
