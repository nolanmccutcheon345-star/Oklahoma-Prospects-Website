import { LessonExceptionReport } from "../pd/booked-guided-lesson";
import { LessonAssignments } from "./lesson-assignments";
import { MyFinance } from "../finance/my-finance";
import { useEffect, useState } from "react";
import {
  getOfficeOperations,
  getOfficeBookingReference,
  setServiceResources,
  saveBookingParticipants,
} from "@/lib/commerce/operations-api";
import { checkInBooking } from "@/lib/commerce/portal-api";
import { BOOKABLE_LANES } from "@/lib/club";
import { formatMoney } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
export function Participants({
  id,
  count,
  athletes,
  onSaved,
}: {
  id: string;
  count: number;
  athletes: { id: string; name: string }[];
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer">
        Confirm {count} participating athlete{count === 1 ? "" : "s"}
      </summary>
      <form
        className="grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await saveBookingParticipants({
              data: { id, athleteIds: form.getAll("athlete").map(String) },
            });
            await onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Participants did not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {athletes.map((a) => (
          <label key={a.id} className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="athlete" value={a.id} />
            {a.name}
          </label>
        ))}
        <p>Add missing household athletes in Bookings & billing, then sign their annual waivers.</p>
        <Button type="submit" disabled={busy}>
          Save participants
        </Button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </details>
  );
}
export function ContractorEarnings() {
  return <MyFinance />;
}
function BookingReferenceLookup() {
  const [reference, setReference] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof getOfficeBookingReference>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const date = (value: string | Date) =>
    new Date(value).toLocaleString("en-US", { timeZone: "America/Chicago" });
  return (
    <section aria-label="Booking reference lookup" className="rounded-xl border p-4">
      <h3 className="text-2xl">Look up a booking alert</h3>
      <p>
        Search an exact booking reference, including past visits. Confirmation, payment and
        attendance are separate records.
      </p>
      <form
        className="grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setResult(undefined);
          try {
            setResult(await getOfficeBookingReference({ data: { reference: reference.trim() } }));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Booking lookup failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Booking reference
          <input
            className="block min-h-11 w-full rounded border p-2"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={150}
            required
            disabled={busy}
          />
        </label>
        <Button type="submit" disabled={busy || !reference.trim()}>
          {busy ? "Looking up…" : "Look up booking"}
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result === null && (
        <p role="status">
          No saved booking matches this reference. Do not infer a reservation or payment from the
          alert.
        </p>
      )}
      {result && (
        <article className="mt-3 grid gap-2 break-words" aria-live="polite">
          <p>Reference: {result.id}</p>
          <p>
            Customer: {result.customer_name || "Name not recorded"} ·{" "}
            {result.customer_email || "Email not recorded"}
          </p>
          <p>
            {date(result.starts_at)} – {date(result.ends_at)} Central
          </p>
          <p>
            Spaces:{" "}
            {result.resources
              .filter((r) => r.startsWith("lane:"))
              .map((r) => BOOKABLE_LANES.find((l) => l.id === r.slice(5))?.name || r)
              .join(" · ") || "No physical lanes recorded"}
          </p>
          <p>
            Booking status: {result.status} · {result.product_id}
          </p>
          <p>
            Attendance:{" "}
            {result.checked_in_at
              ? `Check-in recorded ${date(result.checked_in_at)} Central`
              : "No check-in recorded; attendance unverified"}
          </p>
          <p>
            Order status: {result.order_status || "No linked order"}
            {result.total_cents != null ? ` · Order total ${formatMoney(result.total_cents)}` : ""}
          </p>
          {result.payments.length ? (
            result.payments.map((p) => (
              <p key={p.id}>
                Square {p.environment}: {p.status} · amount {formatMoney(p.amount_cents)} · refunded{" "}
                {formatMoney(p.refunded_cents)} · {p.id}
              </p>
            ))
          ) : (
            <p>No linked Square payment record. Payment is not established by booking status.</p>
          )}
          <p>
            Saved provider records do not certify bank settlement. Sandbox records are not real
            payments.
          </p>
        </article>
      )}
    </section>
  );
}
export function OfficeOperations({ view = "all" }: { view?: "all" | "bookings" | "reports" }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getOfficeOperations>>>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setData(await getOfficeOperations());
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="my-6 grid gap-4">
      <h2 className="text-3xl">Bookings, waivers & records</h2>
      {error ? <p role="alert">{error}</p> : null}
      {view !== "reports" && (
        <>
          <BookingReferenceLookup />
          <LessonAssignments />
          <LessonExceptionReport />
          <h3 className="text-2xl">Upcoming visits</h3>
          {data?.bookings.length === 0 ? <p>No confirmed visits in the next two weeks.</p> : null}
          {data?.bookings.map((b) => (
            <article key={b.id} className="rounded-xl border p-4">
              <p>
                {new Date(b.starts_at).toLocaleString("en-US", { timeZone: "America/Chicago" })} ·{" "}
                {b.product_id}
              </p>
              <p>
                {b.resources
                  .filter((r) => r.startsWith("lane:"))
                  .map((r) => BOOKABLE_LANES.find((l) => l.id === r.slice(5))?.name || r)
                  .join(" · ")}{" "}
                · ends{" "}
                {new Date(b.ends_at).toLocaleTimeString("en-US", {
                  timeZone: "America/Chicago",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                Central
              </p>
              <p>
                {b.customer_email}{" "}
                {b.total_cents != null
                  ? `· Order total ${formatMoney(b.total_cents)}; verify payment separately`
                  : ""}
              </p>
              <p>
                {b.participant_names || "Participants not confirmed"} · expected{" "}
                {b.participant_count}
              </p>
              <p>
                {b.missing_waivers
                  ? "Current waivers needed"
                  : "Listed participants have current waivers"}
              </p>
              <Button
                disabled={busy || !!b.checked_in_at}
                onClick={() => void action(() => checkInBooking({ data: { id: b.id } }))}
              >
                {b.checked_in_at ? "Checked in" : "Check in — verify all waivers"}
              </Button>
              {!b.checked_in_at ? (
                <Participants
                  id={b.id}
                  count={b.participant_count}
                  athletes={data.athletes}
                  onSaved={load}
                />
              ) : null}
            </article>
          ))}
          <details>
            <summary className="min-h-11 cursor-pointer text-xl">Lesson facility spaces</summary>
            <p>
              Assign the lane or lanes required for each lesson. A coach, athlete and these spaces
              are booked together after payment. New bookings stay closed for services without a
              space assignment.
            </p>
            {data?.resources.map((r) => (
              <form
                key={r.service_id}
                className="mt-4 rounded-xl border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const laneIds = new FormData(e.currentTarget).getAll("lane").map(String);
                  void action(() => setServiceResources({ data: { id: r.service_id, laneIds } }));
                }}
              >
                <fieldset>
                  <legend className="font-semibold">{r.name}</legend>
                  {BOOKABLE_LANES.map((l) => (
                    <label key={l.id} className="flex min-h-11 items-center gap-3">
                      <input
                        name="lane"
                        type="checkbox"
                        value={l.id}
                        defaultChecked={r.lane_ids?.includes(l.id)}
                      />
                      {l.name}
                    </label>
                  ))}
                </fieldset>
                <Button type="submit" disabled={busy}>
                  Save facility requirement
                </Button>
              </form>
            ))}
          </details>
        </>
      )}
      {view !== "bookings" && (
        <>
          <details>
            <summary className="min-h-11 cursor-pointer text-xl">Reconciliation overview</summary>
            {data ? (
              <>
                <p>
                  Legacy reservations: {data.counts.legacy_reservations}; legacy assessment flags:{" "}
                  {data.counts.legacy_assessments}. Authoritative confirmed/completed bookings:{" "}
                  {data.counts.confirmed_bookings}; coach-verified assessments:{" "}
                  {data.counts.verified_assessments}. Paid order total:{" "}
                  {formatMoney(data.counts.paid_cents)}; payments needing review:{" "}
                  {data.counts.open_review}.
                </p>
                <p>
                  Claimed athletes: {data.counts.claimed_athletes}; unclaimed guest athletes:{" "}
                  {data.counts.guest_athletes}; development-file athletes:{" "}
                  {data.counts.development_athletes}; saved strength versions:{" "}
                  {data.counts.strength_versions}; saved bullpens: {data.counts.saved_bullpens}. If
                  a known athlete is missing, reconcile their verified household with a dated backup
                  before creating a replacement.
                </p>
                <p>
                  These counts identify records to review; they do not establish matching balances.
                  Verify legacy receipts, assessments and reservations before recording opening
                  balances. No legacy payment or completion flag is converted automatically.
                </p>
              </>
            ) : null}
          </details>
          <details>
            <summary className="min-h-11 cursor-pointer text-xl">
              Recent administrative audit events
            </summary>
            <ul>
              {data?.events.map((e) => (
                <li className="mt-2 break-words" key={e.id}>
                  {new Date(e.created_at).toLocaleString()} · {e.action} · {e.target_table} ·{" "}
                  {e.target_id} · actor {e.actor_id}
                </li>
              ))}
            </ul>
          </details>
          <ContractorEarnings />
        </>
      )}
    </section>
  );
}
