import { useEffect, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { BOOKABLE_LANES, CANCEL_POLICY, type BookableLaneId } from "@/lib/club";
import { formatDollars } from "@/lib/pricing";
import { quoteCages, type PaySearch } from "@/lib/pay";
import type { PublicCatalog } from "@/lib/ops";
import { reservationSlots, chicagoDateISO } from "@/lib/hours";
import { cageBookingLastDate, validDate } from "@/lib/scheduling";
import { cn } from "@/lib/utils";

const DURATIONS = [
  [30, "30 min"],
  [60, "1 hour"],
  [90, "1.5 hr"],
  [120, "2 hours"],
  [150, "2.5 hr"],
  [180, "3 hours"],
] as const;
type Slot = { value: string; label: string };
type AvailabilityInput = { date: string; duration: number; laneIds: BookableLaneId[] };
const spaceName = (id: BookableLaneId) =>
  id === "3-4"
    ? "Fielding Area · Lanes 3–4"
    : id === "7"
      ? "Lane 7 · Baseball / Softball"
      : BOOKABLE_LANES.find((lane) => lane.id === id)!.name;

export function BookingFunnel({
  initial,
  catalog,
  loadAvailability,
  onReview,
}: {
  initial?: string;
  catalog: PublicCatalog;
  loadAvailability: (input: AvailabilityInput) => Promise<Slot[]>;
  onReview: (search: PaySearch) => void;
}) {
  const today = chicagoDateISO(),
    maxDate = cageBookingLastDate();
  const [party, setParty] = useState<"household" | "team">(
    initial === "team" ? "team" : "household",
  );
  const [lanes, setLanes] = useState<BookableLaneId[]>(initial === "field" ? ["3-4"] : []);
  const [date, setDate] = useState(today),
    [duration, setDuration] = useState(60);
  const [attest, setAttest] = useState(false),
    [error, setError] = useState("");
  const [selectedTime, setSelectedTime] = useState({ key: "", value: "" });
  const [availability, setAvailability] = useState<{
    key: string;
    rows: Slot[];
    error: string;
    loading: boolean;
  }>({ key: "", rows: [], error: "", loading: false });
  const forcedTeam = lanes.length >= 3;
  const use = party === "team" || forcedTeam ? "team" : "household";
  const rate = use === "team" ? "team" : "individual";
  const selectionKey = JSON.stringify([date, duration, lanes]);
  const dateValid = validDate(date) && date >= today && date <= maxDate;
  useEffect(() => {
    if (!lanes.length || !dateValid) return;
    let active = true;
    setAvailability({ key: selectionKey, rows: [], error: "", loading: true });
    loadAvailability({ date, duration, laneIds: lanes })
      .then((rows) => {
        if (active) setAvailability({ key: selectionKey, rows, error: "", loading: false });
      })
      .catch((e) => {
        if (active)
          setAvailability({
            key: selectionKey,
            rows: [],
            error:
              e instanceof Error
                ? e.message
                : "Availability could not load. Please try another date.",
            loading: false,
          });
      });
    return () => {
      active = false;
    };
  }, [selectionKey, dateValid, loadAvailability, date, duration, lanes]);
  const currentAvailability = availability.key === selectionKey;
  const loadingSlots = Boolean(
    lanes.length && dateValid && (!currentAvailability || availability.loading),
  );
  const slots = currentAvailability && dateValid ? availability.rows : [];
  const slotError = currentAvailability ? availability.error : "";
  const time =
    selectedTime.key === selectionKey && slots.some((slot) => slot.value === selectedTime.value)
      ? selectedTime.value
      : "";
  const quote = quoteCages(catalog, { rate, laneIds: lanes, minutes: duration, use });
  const complete = Boolean(
    lanes.length && dateValid && time && !loadingSlots && quote && !quote.error,
  );
  const householdHour =
    catalog.cages.find((row) => row.id === "individual")?.price;
  const teamHour = catalog.cages.find((row) => row.id === "team")?.price;
  const fieldHour = catalog.cages.find((row) => row.id === "field")?.price;
  const dateLabel = dateValid
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${date}T12:00:00Z`))
    : "";
  const timeLabel = slots.find((slot) => slot.value === time)?.label || "";
  const durationLabel = DURATIONS.find(([minutes]) => minutes === duration)![1];
  const total = quote?.price ?? 0;
  function clearTime() {
    setSelectedTime({ key: "", value: "" });
    setError("");
  }
  function toggleLane(id: BookableLaneId) {
    setLanes((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
    clearTime();
    setAttest(false);
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!complete || !reservationSlots(date, duration).some((slot) => slot.value === time)) {
      setError("Select your space, date, and an available start time before continuing.");
      return;
    }
    if (!attest) {
      setError("Confirm the booking type before continuing.");
      return;
    }
    onReview({
      kind: "cage",
      id: rate,
      date,
      time,
      minutes: duration,
      cages: lanes.join(","),
      use,
    });
  }
  if (householdHour === undefined || teamHour === undefined || fieldHour === undefined) return <p role="status" className="p-5">Loading current rental rates. If rates do not appear, refresh or contact Front Office.</p>;
  return (
    <section className="mx-auto max-w-3xl px-5 py-8" data-booking-ready={complete}>
      <form id="cage-booking-form" onSubmit={onSubmit} className="grid min-w-0 gap-8">
        <div>
          <h2 className="text-3xl">1. Who’s training?</h2>
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Who is training</legend>
            {(
              [
                ["household", "Individual / Family · 1–2 athletes", householdHour],
                ["team", "Team / Group · 3+ athletes", teamHour],
              ] as const
            ).map(([value, label, price]) => (
              <label
                key={value}
                className={cn(
                  "flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 p-4 has-[:focus-visible]:outline-2",
                  use === value
                    ? "border-maroon bg-maroon text-fg-inverse"
                    : "border-transparent bg-paper-2 shadow-border",
                )}
              >
                <input
                  type="radio"
                  name="party"
                  value={value}
                  checked={use === value}
                  disabled={value === "household" && forcedTeam}
                  onChange={() => {
                    setParty(value);
                    setAttest(false);
                    setError("");
                  }}
                  className="size-5 shrink-0 accent-powder"
                />
                <span className="min-w-0">
                  <span className="block font-display text-xl uppercase">{label}</span>
                  <span className="text-sm">{formatDollars(price)} / cage / hour</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="mt-3 text-sm text-muted">
            Individual / Family is for 1–2 athletes from one household. Team pricing applies to 3+
            athletes or 3+ spaces. The fielding area has its own rate: {formatDollars(fieldHour)} /
            hour.
          </p>
          {forcedTeam && (
            <p
              className="mt-2 text-sm font-semibold text-maroon"
              data-forced-team="true"
              role="status"
            >
              You selected 3+ spaces. Team pricing is applied automatically.
            </p>
          )}
        </div>
        <div>
          <h2 className="text-3xl">2. Choose your space</h2>
          <p className="mt-2 text-sm text-muted">
            Select one or more spaces. All selected spaces use the same start time and duration.
          </p>
          <fieldset className="mt-4 grid gap-2" data-cage-picker="true">
            <legend className="sr-only">Spaces</legend>
            {BOOKABLE_LANES.map((item) => {
              const on = lanes.includes(item.id),
                hourly =
                  item.group === "field" ? fieldHour : rate === "team" ? teamHour : householdHour;
              return (
                <label
                  key={item.id}
                  className={cn(
                    "booking-space flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                    on ? "border-maroon bg-maroon text-fg-inverse" : "border-line bg-paper-2",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-powder"
                    checked={on}
                    onChange={() => toggleLane(item.id)}
                    data-cage-id={item.id}
                    aria-label={spaceName(item.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xl uppercase">
                      {spaceName(item.id)}
                    </span>
                    <span className="block text-sm">
                      {item.size}
                      {item.group === "field" ? " · includes both lanes" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-2xl font-extrabold">
                      {formatDollars(hourly)}
                    </span>
                    <span className="block text-xs">/ hour</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        </div>
        <div className="grid min-w-0 gap-4">
          <h2 className="text-3xl">3. Pick your date & time</h2>
          <label className="block min-w-0 text-sm font-semibold">
            Date
            <input
              required
              name="date"
              type="date"
              min={today}
              max={maxDate}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clearTime();
              }}
              className="booking-date mt-1.5 block min-h-11 w-full min-w-0 max-w-full rounded-md border border-line bg-paper-2 px-3 text-base"
            />
          </label>
          <p className="text-xs text-muted">
            Bookings are available today through 14 days ahead, Central Time.
          </p>
          <fieldset>
            <legend className="text-sm font-semibold">Duration</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {DURATIONS.map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-paper-2 text-sm font-semibold shadow-border has-[:checked]:bg-maroon has-[:checked]:text-fg-inverse has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-powder"
                >
                  <input
                    type="radio"
                    name="duration"
                    value={value}
                    checked={duration === value}
                    onChange={() => {
                      setDuration(value);
                      clearTime();
                    }}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold">Start time</legend>
            {slots.length ? (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => (
                  <label
                    key={slot.value}
                    className="flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-paper-2 text-sm font-semibold shadow-border has-[:checked]:bg-maroon has-[:checked]:text-fg-inverse has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-powder"
                  >
                    <input
                      required
                      type="radio"
                      name="time"
                      value={slot.value}
                      checked={time === slot.value}
                      onChange={() => {
                        setSelectedTime({ key: selectionKey, value: slot.value });
                        setError("");
                      }}
                      className="sr-only"
                    />
                    {slot.label}
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted" role="status">
                {!lanes.length
                  ? "Select a space above to view available start times."
                  : !dateValid
                    ? "Choose today or a date within the next 14 days."
                    : loadingSlots
                      ? "Loading available times…"
                      : slotError
                        ? "Available times could not load. Please try another date."
                        : date === today
                          ? "No remaining windows today. Pick another date."
                          : "No available times on this date. Pick another day."}
              </p>
            )}
          </fieldset>
        </div>
        <div className="grid gap-4">
          <section
            id="cage-total"
            aria-label="Booking summary"
            className="rounded-xl border border-line bg-paper-2 p-4"
            aria-live="polite"
          >
            <h3 className="text-2xl">Your booking</h3>
            {complete ? (
              <>
                <p className="mt-2 font-semibold">
                  {dateLabel} · {timeLabel} Central
                </p>
                <p className="mt-1 text-sm">
                  {durationLabel} · {use === "team" ? "Team / Group" : "Individual / Family"}
                </p>
                <ul className="mt-4 grid gap-2 text-sm" data-cage-count={lanes.length}>
                  {quote!.lines.map((line, index) => (
                    <li key={line.label} className="flex justify-between gap-4">
                      <span>{spaceName(lanes[index])}</span>
                      <span className="shrink-0 tabular-nums">{formatDollars(line.amount)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-3 font-semibold">
                  <span>Total</span>
                  <span className="font-display text-3xl" data-cage-total={total}>
                    {formatDollars(total)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  Processing fees included. No added processing surcharge.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Select your space and time to see your total.
              </p>
            )}
          </section>
          {lanes.length > 0 && (
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                required
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-maroon"
                checked={attest}
                onChange={(e) => setAttest(e.target.checked)}
                data-household-attest={use === "household" ? "true" : undefined}
              />
              <span>
                {use === "household"
                  ? "This booking is for 1–2 athletes from one household, not a team practice."
                  : forcedTeam
                    ? "I understand that selecting 3+ spaces applies team pricing to this booking. The fielding area keeps its own rate."
                    : "This booking is for a team or group of 3+ athletes. Team pricing applies; the fielding area keeps its own rate."}
              </span>
            </label>
          )}
          <details className="rounded-lg border border-line px-4">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
              Cancellation policy · full refund with 48 hours’ notice
            </summary>
            <p className="pb-4 text-sm text-muted" data-cancel-policy="true">
              {CANCEL_POLICY.copy}
            </p>
          </details>
          {(error || slotError) && (
            <p role="alert" className="text-sm text-maroon">
              {error || slotError}
            </p>
          )}
          <p className="text-center text-xs text-muted">
            Your booking is confirmed only after successful payment.
          </p>
          <div className={complete ? "booking-review-bar" : ""} data-booking-review={complete}>
            <div
              className={
                complete
                  ? "mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3"
                  : ""
              }
            >
              {complete && (
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    {lanes.length} {lanes.length === 1 ? "space" : "spaces"} · {durationLabel}
                  </p>
                  <p className="font-display text-3xl">{formatDollars(total)}</p>
                </div>
              )}
              <Button
                type="submit"
                className={complete ? "min-h-12 shrink-0" : "w-full"}
                disabled={!complete}
                aria-describedby="cage-total"
              >
                {complete
                  ? "Review Booking"
                  : !lanes.length
                    ? "Select a space to continue"
                    : !slots.length
                      ? "Pick an open date"
                      : "Select a start time"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
