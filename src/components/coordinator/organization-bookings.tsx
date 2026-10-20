import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import * as api from "@/lib/coordinator/organization-bookings-api";
import {
  organizationBookingOperationInput,
  organizationEventSessionOperationInput,
  type OrganizationBookingSchedule,
} from "@/lib/coordinator/organization-bookings-contracts";
type Booking = OrganizationBookingSchedule["bookings"][number];
type Event = OrganizationBookingSchedule["events"][number];
type Selection =
  | { kind: "booking"; booking: Booking }
  | { kind: "session"; event: Event; session: Event["sessions"][number] };
const field = "min-h-11 w-full rounded-lg border border-line p-2";
const when = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });
export function OrganizationBookings() {
  const [data, setData] = useState<OrganizationBookingSchedule>(),
    [selection, setSelection] = useState<Selection>(),
    [action, setAction] = useState("reschedule"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef(false),
    generation = useRef(0),
    mounted = useRef(true);
  const load = useCallback(async () => {
    const epoch = ++generation.current;
    try {
      const next = await api.getOrganizationBookings();
      if (mounted.current && epoch === generation.current) setData(next);
    } catch (e) {
      if (mounted.current && epoch === generation.current) {
        setData(undefined);
        setSelection(undefined);
      }
      throw e;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const epoch = generation;
    void load().catch((e) => {
      if (mounted.current) setError(e instanceof Error ? e.message : "Could not load schedule.");
    });
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, [load]);
  function choose(next: Selection) {
    if (pending.current) return;
    setSelection(next);
    setAction(
      next.kind === "booking"
        ? next.booking.eventId
          ? "check-in"
          : next.booking.status === "cancelled"
            ? "restore"
            : "reschedule"
        : next.session.status === "cancelled"
          ? "restore"
          : "reschedule",
    );
    setError("");
    setNotice("");
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selection || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const selected = selection,
      form = new FormData(e.currentTarget),
      text = (key: string) => String(form.get(key) || "").trim();
    try {
      if (selected.kind === "booking")
        await api.saveOrganizationBookingOperation({
          data: organizationBookingOperationInput.parse({
            bookingId: selected.booking.id,
            revision: selected.booking.revision,
            expectedStartsAt: selected.booking.startsAt,
            expectedEndsAt: selected.booking.endsAt,
            action,
            reason: text("reason"),
            ...(action === "reschedule" ? { date: text("date"), time: text("time") } : {}),
          }),
        });
      else
        await api.saveOrganizationEventSessionOperation({
          data: organizationEventSessionOperationInput.parse({
            eventId: selected.event.id,
            sessionKey: selected.session.sessionKey,
            revision: selected.session.revision,
            action,
            reason: text("reason"),
            ...(action === "reschedule"
              ? {
                  date: text("date"),
                  start: text("start"),
                  end: text("end"),
                  location: text("location"),
                }
              : {}),
          }),
        });
      if (mounted.current) {
        setSelection(undefined);
        await load();
        if (mounted.current) setNotice("Operational schedule saved.");
      }
    } catch (e) {
      if (mounted.current) {
        setSelection(undefined);
        setError(e instanceof Error ? e.message : "Could not save schedule.");
        try {
          await load();
        } catch {
          /* load clears inaccessible data */
        }
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Operational booking schedule" className="grid gap-5">
      <div>
        <h2 className="text-2xl">Bookings & session schedule</h2>
        <p className="text-sm">
          Manage delivery times, cancellations and check-in. Financial decisions remain with the
          owners.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p role="status">Loading schedule…</p>
      ) : (
        <>
          {!data.canAdjust && (
            <p>
              Paid booking changes become available after the reviewed financial cutover.
              Uncommitted event sessions can still be managed below.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {data.bookings.length ? (
              data.bookings.map((b) => (
                <article key={b.id} className="rounded-xl border bg-white p-4">
                  <h3 className="text-xl">{b.title}</h3>
                  <p>
                    {b.player} · {when(b.startsAt)} CT
                  </p>
                  <p>
                    {b.status}
                    {b.checkedInAt ? " · Checked in" : ""}
                  </p>
                  {b.eventId && (
                    <p className="text-sm">
                      Use the event schedule to move or cancel this group session.
                    </p>
                  )}
                  <button
                    className="min-h-11 underline"
                    disabled={busy || !b.editable}
                    onClick={() => choose({ kind: "booking", booking: b })}
                  >
                    {b.eventId ? "Manage check-in" : "Manage booking"}
                  </button>
                </article>
              ))
            ) : (
              <p>No recent customer bookings.</p>
            )}
          </div>
          <h3 className="text-xl">Camp & event sessions</h3>
          {data.events.length ? (
            data.events.map((event) => (
              <article key={event.id} className="grid gap-3 rounded-xl border bg-white p-4">
                <h4 className="text-xl">{event.name}</h4>
                {event.sessions.map((session) => (
                  <div
                    key={session.sessionKey}
                    className="flex flex-wrap items-center justify-between gap-3 border-t py-2"
                  >
                    <p>
                      {session.date} · {session.start}–{session.end} CT · {session.location} ·{" "}
                      {session.status}
                    </p>
                    <button
                      className="min-h-11 underline"
                      disabled={busy || !event.editable}
                      onClick={() => choose({ kind: "session", event, session })}
                    >
                      Manage session
                    </button>
                  </div>
                ))}
              </article>
            ))
          ) : (
            <p>No event sessions.</p>
          )}
        </>
      )}
      {selection && (
        <form
          key={selection.kind === "booking" ? selection.booking.id : selection.session.sessionKey}
          onSubmit={(e) => void save(e)}
          className="grid gap-3 rounded-xl border-2 border-maroon bg-white p-5"
          aria-label="Change operational schedule"
        >
          <h3 className="text-xl">
            {selection.kind === "booking" ? selection.booking.title : selection.event.name}
          </h3>
          <fieldset disabled={busy} className="grid gap-3">
            <label>
              Action
              <select className={field} value={action} onChange={(e) => setAction(e.target.value)}>
                {selection.kind === "booking" && selection.booking.eventId ? (
                  <option value="check-in">Check in</option>
                ) : (
                  <>
                    <option value="reschedule">Reschedule</option>
                    <option value="cancel">Cancel delivery</option>
                    <option value="restore">Restore delivery</option>
                    {selection.kind === "booking" && <option value="check-in">Check in</option>}
                  </>
                )}
              </select>
            </label>
            {action === "reschedule" && (
              <>
                <label>
                  New date
                  <input
                    className={field}
                    name="date"
                    type="date"
                    required
                    defaultValue={selection.kind === "session" ? selection.session.date : undefined}
                  />
                </label>
                {selection.kind === "booking" ? (
                  <label>
                    New start time (Central)
                    <input className={field} name="time" type="time" step={300} required />
                  </label>
                ) : (
                  <>
                    <label>
                      Start time (Central)
                      <input
                        className={field}
                        name="start"
                        type="time"
                        step={300}
                        required
                        defaultValue={selection.session.start}
                      />
                    </label>
                    <label>
                      End time (Central)
                      <input
                        className={field}
                        name="end"
                        type="time"
                        step={300}
                        required
                        defaultValue={selection.session.end}
                      />
                    </label>
                    <label>
                      Location
                      <input
                        className={field}
                        name="location"
                        minLength={3}
                        maxLength={300}
                        required
                        defaultValue={selection.session.location}
                      />
                    </label>
                  </>
                )}
              </>
            )}
            <label>
              Reason
              <textarea className={field} name="reason" minLength={5} maxLength={1000} required />
            </label>
            <div className="flex gap-3">
              <button type="submit" className="min-h-11 rounded-lg bg-maroon px-4 text-white">
                {busy ? "Saving…" : "Save schedule"}
              </button>
              <button
                type="button"
                className="min-h-11 underline"
                onClick={() => setSelection(undefined)}
              >
                Close
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
