import { useEffect, useState } from "react";
import { getCheckoutContext } from "@/lib/commerce/api";
import { getCreditSlots, bookWithCredit } from "@/lib/commerce/portal-api";
import { ASSESSMENT_PRODUCTS } from "@/lib/pricing";
import { chicagoDate } from "@/lib/scheduling";
import { BOOKABLE_LANES } from "@/lib/club";
import { Button } from "@/components/ui/button";
export function CreditBooking({
  credit,
  onSaved,
}: {
  credit: { id: string; kind: string; minutes: number };
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<Awaited<ReturnType<typeof getCheckoutContext>>>();
  const [date, setDate] = useState(chicagoDate());
  const [time, setTime] = useState("");
  const [coachId, setCoach] = useState("");
  const [serviceId, setService] = useState(
    ["remote-review", "film-review"].includes(credit.kind) ? "s5" : "",
  );
  const [laneId, setLane] = useState("");
  const [duration, setDuration] = useState(60);
  const [household, setHousehold] = useState(false);
  const [videoUrl, setVideo] = useState("");
  const [slots, setSlots] = useState<{ value: string; label: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (open)
      void getCheckoutContext()
        .then(setContext)
        .catch((e) => setError(e.message));
  }, [open]);
  const input = {
    requestId,
    grantId: credit.id,
    serviceId: credit.kind === "cage-minutes" ? "individual" : serviceId,
    coachId: coachId || undefined,
    date,
    time: time || undefined,
    laneId: laneId || undefined,
    duration,
    household,
    athleteCount: 1,
    videoUrl: videoUrl || undefined,
  };
  async function findTimes() {
    setBusy(true);
    setError("");
    setTime("");
    try {
      setSlots(await getCreditSlots({ data: input }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load available times.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2">
      <Button variant="outlineDark" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Close booking" : "Use credits"}
      </Button>
      {open ? (
        <form
          className="mt-3 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await bookWithCredit({ data: input });
              await onSaved();
              setOpen(false);
              setRequestId(crypto.randomUUID());
            } catch (e) {
              setError(e instanceof Error ? e.message : "Booking did not save.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {credit.kind === "cage-minutes" ? (
            <>
              <label>
                Cage
                <select
                  value={laneId}
                  onChange={(e) => {
                    setLane(e.target.value);
                    setTime("");
                    setSlots([]);
                  }}
                  required
                >
                  <option value="">Choose a cage</option>
                  {BOOKABLE_LANES.filter((l) => l.group !== "field").map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Duration
                <select
                  value={duration}
                  onChange={(e) => {
                    setDuration(Number(e.target.value));
                    setTime("");
                    setSlots([]);
                  }}
                >
                  {[30, 60, 90, 120, 150, 180].map((n) => (
                    <option value={n} key={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  required
                  checked={household}
                  onChange={(e) => setHousehold(e.target.checked)}
                />
                For 1–2 athletes in my household; no team practice.
              </label>
            </>
          ) : (
            <>
              <label>
                Service
                <select
                  required
                  value={serviceId}
                  onChange={(e) => {
                    setService(e.target.value);
                    setTime("");
                    setSlots([]);
                  }}
                >
                  <option value="">Choose a service</option>
                  {context?.products
                    .filter(
                      (p) =>
                        p.kind === "lesson" &&
                        !ASSESSMENT_PRODUCTS.has(p.id) &&
                        p.id !== "s6" &&
                        (credit.kind === "film-review" || p.minutes === credit.minutes) &&
                        ["remote-review", "film-review"].includes(credit.kind) === (p.id === "s5"),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Coach
                <select
                  required
                  value={coachId}
                  onChange={(e) => {
                    setCoach(e.target.value);
                    setTime("");
                    setSlots([]);
                  }}
                >
                  <option value="">Choose your coach</option>
                  {context?.coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {["remote-review", "film-review"].includes(credit.kind) ? (
            <label>
              Video link
              <input
                required
                type="url"
                value={videoUrl}
                onChange={(e) => setVideo(e.target.value)}
                placeholder="https://"
              />
            </label>
          ) : (
            <>
              <label>
                Date
                <input
                  required
                  type="date"
                  min={chicagoDate()}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setTime("");
                    setSlots([]);
                  }}
                />
              </label>
              <Button
                type="button"
                variant="outlineDark"
                disabled={busy}
                onClick={() => void findTimes()}
              >
                Find available times
              </Button>
              {slots.length ? (
                <label>
                  Start time
                  <select required value={time} onChange={(e) => setTime(e.target.value)}>
                    <option value="">Choose a time</option>
                    {slots.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>Select your booking details, then find times.</p>
              )}
            </>
          )}
          {error ? (
            <p role="alert" className="text-maroon">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={busy || (!["remote-review", "film-review"].includes(credit.kind) && !time)}
          >
            {busy
              ? "Saving…"
              : ["remote-review", "film-review"].includes(credit.kind)
                ? "Submit review using credit"
                : "Book using credit"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
