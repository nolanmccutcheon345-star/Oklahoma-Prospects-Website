import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  admitFinancialIdentity,
  getFinancialIdentityAdmissionOptions,
  previewFinancialIdentityAdmission,
} from "@/lib/finance/identity-admission-api";

type Options = Awaited<ReturnType<typeof getFinancialIdentityAdmissionOptions>>;
type Review = Awaited<ReturnType<typeof previewFinancialIdentityAdmission>>;
const date = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

/** Choices are display conveniences only. The server verifies the owner, identity,
 * current basis, review digest and each explicitly selected record on submission. */
export function FinancialIdentityAdmission({
  kind,
  onAdmitted,
}: {
  kind: "instructor" | "payroll";
  onAdmitted?: () => Promise<void>;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [options, setOptions] = useState<Options>();
  const [userId, setUserId] = useState("");
  const [coachId, setCoachId] = useState("");
  const [payrollFromMonth, setPayrollFromMonth] = useState("");
  const [review, setReview] = useState<Review>();
  const [bookingIds, setBookingIds] = useState<string[]>([]);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const generation = useRef(0);
  const label = kind === "instructor" ? "Instructor" : "Payroll";

  useEffect(() => {
    const current = ++generation.current;
    if (!open) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setOptions(undefined);
    setUserId("");
    setCoachId("");
    setPayrollFromMonth("");
    setReview(undefined);
    setBookingIds([]);
    setOrderIds([]);
    setReason("");
    setConfirmed(false);
    getFinancialIdentityAdmissionOptions()
      .then((value) => {
        if (generation.current === current) setOptions(value);
      })
      .catch((err) => {
        if (generation.current === current)
          setError(err instanceof Error ? err.message : "Could not load verified identities.");
      })
      .finally(() => {
        if (generation.current === current) {
          pending.current = false;
          setBusy(false);
        }
      });
    return () => {
      generation.current = current + 1;
    };
  }, [open, reload, kind]);

  function clearReview() {
    setReview(undefined);
    setBookingIds([]);
    setOrderIds([]);
    setConfirmed(false);
    setError("");
    setNotice("");
  }
  async function preview() {
    if (pending.current || !userId || (kind === "instructor" ? !coachId : !payrollFromMonth))
      return;
    pending.current = true;
    setBusy(true);
    clearReview();
    const current = generation.current;
    try {
      const value = await previewFinancialIdentityAdmission({
        data:
          kind === "instructor" ? { kind, userId, coachId } : { kind, userId, payrollFromMonth },
      });
      if (generation.current === current) setReview(value);
    } catch (err) {
      if (generation.current === current)
        setError(err instanceof Error ? err.message : "Could not review this identity.");
    } finally {
      if (generation.current === current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !review || !confirmed || reason.trim().length < 5) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const current = generation.current;
    try {
      const result = await admitFinancialIdentity({
        data: {
          ...(kind === "instructor"
            ? { kind, userId, coachId }
            : { kind, userId, payrollFromMonth }),
          expectedBasisVersion: review.basisVersion,
          reviewDigest: review.reviewDigest,
          bookingIds,
          orderIds,
          confirmed: true,
          reason: reason.trim(),
        },
      });
      if (generation.current !== current) return;
      setReview(undefined);
      setBookingIds([]);
      setOrderIds([]);
      setConfirmed(false);
      setReason("");
      setNotice(
        `${label} financial identity admitted in version ${result.version}. ` +
          (kind === "payroll"
            ? "Set and save any staffing amount separately in the master budget. No payment was made."
            : "Only the existing records you selected were included. No payment was made."),
      );
      if (onAdmitted) {
        try {
          await onAdmitted();
        } catch {
          if (generation.current === current)
            setError(
              "Admission succeeded. Reload this page before making further financial changes.",
            );
        }
      }
    } catch (err) {
      if (generation.current === current) {
        // Never resubmit a stale preview; re-review exact identities and scope.
        setReview(undefined);
        setBookingIds([]);
        setOrderIds([]);
        setConfirmed(false);
        setError(
          (err instanceof Error ? err.message : "Could not admit this identity.") +
            " Review the current identity and scope again before submitting.",
        );
      }
    } finally {
      if (generation.current === current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <section className="my-4 grid gap-3 rounded-xl border border-line bg-paper p-4">
      <h4 className="text-xl">{label} financial access</h4>
      <p className="text-sm text-muted">
        {kind === "instructor"
          ? "Save the coach and send their invitation as usual. Financial self-access stays pending until an owner selects their verified account and confirms admission."
          : "An owner can bind a verified account to payroll from a chosen month. Admission creates no staffing amount or payment."}
      </p>
      <Button
        variant="outlineDark"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        {open ? "Close financial access review" : `Review ${kind} financial access`}
      </Button>
      {open && (
        <div id={panelId} className="grid gap-3">
          {error && (
            <p role="alert" className="text-maroon">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {!options && busy && <p role="status">Loading verified identities…</p>}
          {!options && !busy && (
            <Button variant="outlineDark" onClick={() => setReload((value) => value + 1)}>
              Retry loading identities
            </Button>
          )}
          {options?.mode === "legacy" && (
            <p className="text-sm">
              The existing staff and payroll workflow is unchanged. Separate financial identity
              admission is not active.
            </p>
          )}
          {options?.mode === "basis" && (
            <form onSubmit={save} className="grid gap-3">
              <fieldset disabled={busy} className="grid min-w-0 gap-3">
                <legend className="font-semibold">Choose the exact identity</legend>
                <label className="grid min-w-0 gap-1 text-sm">
                  Verified account
                  <select
                    className="office-control w-full min-w-0"
                    value={userId}
                    onChange={(event) => {
                      setUserId(event.target.value);
                      clearReview();
                    }}
                  >
                    <option value="">Select a verified account</option>
                    {options.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.email} · {account.id}
                      </option>
                    ))}
                  </select>
                </label>
                {!options.accounts.length && (
                  <p className="text-sm">
                    No eligible verified accounts are available. The coach can still be saved and
                    invited. Self-access remains pending until the account is verified and selected
                    here.
                  </p>
                )}
                {kind === "instructor" ? (
                  <label className="grid min-w-0 gap-1 text-sm">
                    Saved instructor
                    <select
                      className="office-control w-full min-w-0"
                      value={coachId}
                      onChange={(event) => {
                        setCoachId(event.target.value);
                        clearReview();
                      }}
                    >
                      <option value="">Select an instructor</option>
                      {options.instructors.map((coach) => (
                        <option key={coach.coachId} value={coach.coachId}>
                          {coach.name} · {coach.email} · {coach.coachId}
                        </option>
                      ))}
                    </select>
                    {!options.instructors.length && (
                      <span>Save the instructor first, then reload these choices.</span>
                    )}
                  </label>
                ) : (
                  <label className="grid gap-1 text-sm">
                    Payroll begins in month
                    <input
                      className="office-control w-full"
                      type="month"
                      value={payrollFromMonth}
                      onChange={(event) => {
                        setPayrollFromMonth(event.target.value);
                        clearReview();
                      }}
                    />
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!userId || (kind === "instructor" ? !coachId : !payrollFromMonth)}
                    onClick={preview}
                  >
                    {busy ? "Working…" : "Preview identity and scope"}
                  </Button>
                  <Button variant="outlineDark" onClick={() => setReload((value) => value + 1)}>
                    Reload choices
                  </Button>
                </div>
                {review && (
                  <div className="grid min-w-0 gap-3 rounded-lg border border-line bg-paper-2 p-3">
                    <p className="font-semibold">Review financial version {review.basisVersion}</p>
                    <p className="break-words text-sm">
                      Verified account: {review.user.name} · {review.user.email} · {review.user.id}
                    </p>
                    {review.coach && (
                      <p className="break-words text-sm">
                        Instructor: {review.coach.name} · {review.coach.email} · {review.coach.id}
                      </p>
                    )}
                    <p className="break-words text-sm">
                      Payee: {review.payee.name} · {review.payee.email} · {review.payee.id}
                    </p>
                    <p className="text-sm">
                      {kind === "instructor"
                        ? "Prospective instructor financial access begins with admission. Existing bookings and pinned orders are excluded unless individually selected below. Prices, shares and already-earned amounts are not changed."
                        : `Payroll identity begins in ${review.payrollFromMonth}. No earlier payroll history, staffing amount or payment is added by this admission. Set any amount separately in the master budget.`}
                    </p>
                    {kind === "instructor" && (
                      <>
                        <p className="text-sm">
                          Existing records: {bookingIds.length} bookings and {orderIds.length}{" "}
                          pinned orders selected. All start unchecked.
                        </p>
                        <fieldset className="grid gap-2">
                          <legend className="font-semibold">Include existing bookings</legend>
                          {!review.bookings.length && (
                            <p className="text-sm">No eligible existing bookings.</p>
                          )}
                          {review.bookings.map((booking) => (
                            <label
                              key={booking.id}
                              className="flex min-h-11 items-start gap-3 break-words text-sm"
                            >
                              <input
                                type="checkbox"
                                className="mt-1 h-5 w-5 shrink-0"
                                checked={bookingIds.includes(booking.id)}
                                onChange={(event) => {
                                  setBookingIds(
                                    event.target.checked
                                      ? [...bookingIds, booking.id]
                                      : bookingIds.filter((id) => id !== booking.id),
                                  );
                                  setConfirmed(false);
                                }}
                              />
                              <span className="min-w-0">
                                Booking {booking.id}: {date(booking.startsAt)} to{" "}
                                {date(booking.endsAt)}
                              </span>
                            </label>
                          ))}
                        </fieldset>
                        <fieldset className="grid gap-2">
                          <legend className="font-semibold">Include existing pinned orders</legend>
                          {!review.orders.length && (
                            <p className="text-sm">No eligible pinned orders.</p>
                          )}
                          {review.orders.map((order) => (
                            <label
                              key={order.id}
                              className="flex min-h-11 items-start gap-3 break-words text-sm"
                            >
                              <input
                                type="checkbox"
                                className="mt-1 h-5 w-5 shrink-0"
                                checked={orderIds.includes(order.id)}
                                onChange={(event) => {
                                  setOrderIds(
                                    event.target.checked
                                      ? [...orderIds, order.id]
                                      : orderIds.filter((id) => id !== order.id),
                                  );
                                  setConfirmed(false);
                                }}
                              />
                              <span className="min-w-0">
                                Pinned order {order.id}: {date(order.startsAt)} to{" "}
                                {date(order.endsAt)}
                              </span>
                            </label>
                          ))}
                        </fieldset>
                      </>
                    )}
                    <label className="grid gap-1 text-sm">
                      Owner reason
                      <textarea
                        className="office-control w-full"
                        required
                        minLength={5}
                        maxLength={1000}
                        value={reason}
                        onChange={(event) => {
                          setReason(event.target.value);
                          setConfirmed(false);
                        }}
                      />
                    </label>
                    <label className="flex min-h-11 items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 shrink-0"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                      />
                      <span>
                        I reviewed this verified account, payee and scope, including{" "}
                        {kind === "instructor"
                          ? `${bookingIds.length} existing bookings and ${orderIds.length} pinned orders`
                          : `payroll from ${review.payrollFromMonth}`}
                        , and approve this financial admission.
                      </span>
                    </label>
                    <Button type="submit" disabled={!confirmed || reason.trim().length < 5}>
                      {busy ? "Admitting…" : "Confirm financial admission"}
                    </Button>
                    <Button variant="outlineDark" onClick={clearReview}>
                      Cancel this review
                    </Button>
                  </div>
                )}
              </fieldset>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
