import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getClubCancellationChoices,
  getStaffCancellationBookings,
  cancelClubSession,
  chooseClubCancellationRefund,
  rescheduleBooking,
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
  return (
    <div className="mt-3">
      <Button
        variant="outlineDark"
        disabled={busy}
        onClick={() => {
          setOpen(!open);
          if (!requestId) setRequestId(crypto.randomUUID());
        }}
      >
        {clubChange ? "Choose free reschedule" : "Reschedule (48+ hours ahead)"}
      </Button>
      {open ? (
        <form
          className="mt-3 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !requestId) return;
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await rescheduleBooking({
                data: {
                  id,
                  date: String(form.get("date")),
                  time: String(form.get("time")),
                  requestId,
                },
              });
              setOpen(false);
              setRequestId(undefined);
              await onSaved();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Reschedule did not save.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            {clubChange
              ? "Your household allowance will not be used. Select a new available time with the same coach and resources."
              : "One cancellation or reschedule is shared by your household each Chicago calendar month. This free reschedule requires at least 48 hours’ notice; later changes require fee collection."}{" "}
            All times are America/Chicago. Paid credits retain their original expiration.
          </p>
          <label>
            New date
            <input type="date" name="date" required className="ml-3 rounded border p-2" />
          </label>
          <label>
            New start time
            <input
              type="time"
              name="time"
              required
              step={1800}
              className="ml-3 rounded border p-2"
            />
          </label>
          <Button type="submit" disabled={busy}>
            Confirm free reschedule
          </Button>
          {error ? <p role="alert">{error}</p> : null}
        </form>
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
