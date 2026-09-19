import { AFTER_SCHOOL } from "@/lib/after-school";
import {pageHead} from "@/lib/seo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { CancelNote } from "@/components/square-pay";
import { BOOKABLE_LANES, CANCEL_POLICY, type BookableLaneId } from "@/lib/club";
import {getCageAvailability} from "@/lib/commerce/api";
import { reservationSlots, chicagoDateISO } from "@/lib/hours";
import { quoteCages } from "@/lib/pay";
import { useLiveCatalog } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

type BookSearch = { space?: string };

export const Route = createFileRoute("/book")({head:()=>pageHead("/book","Book a Cage","Pay and book one or more indoor cages in Broken Arrow. View availability for 30 minutes to 3 hours.",false),
  validateSearch: (search: Record<string, unknown>): BookSearch => ({
    space: typeof search.space === "string" ? search.space : undefined,
  }),
  component: BookPage,
});

const DURATIONS = [
  [30, "30 min"],
  [60, "1 hour"],
  [90, "1.5 hr"],
  [120, "2 hours"],
  [150, "2.5 hr"],
  [180, "3 hours"],
] as const;

function BookPage() {
  const { space } = Route.useSearch();
  return (
    <main id="main">
      <PageHero
        eyebrow="Oklahoma Prospects"
        title="Pick the lanes."
        accent="Pay. Then it’s booked."
        copy="One cage or several at the same time — 30 minutes to 3 hours. Household rate is for 1–2 family athletes. Team rate is for groups of three or more, or three or more spaces. Choose an available time and pay online to book."
        image="/brand/facility.jpg"
      />
      <BookingFunnel initial={space} />
      <section className="bg-ink py-10 text-fg-inverse">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">Cage passes</h2>
          <p className="mt-2 text-fg-soft">
            Household athletes only — not coaching and not team practices. Lesson
            plans live on Train. Team monthly plans are invoiced by the office.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/memberships">See cage passes</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/training">Monthly coaching</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function defaultLanes(space?: string): BookableLaneId[] {
  if (space === "field") return ["3-4"];
  return [];
}

function BookingFunnel({ initial }: { initial?: string }) {
  const navigate = useNavigate();
  const catalog = useLiveCatalog();
  const today = chicagoDateISO();
  const [party, setParty] = useState<"household" | "team">(initial === "team" ? "team" : "household");
  const [lanes, setLanes] = useState<BookableLaneId[]>(() => defaultLanes(initial));
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(60);
  const [time, setTime] = useState("");
  const [schoolAge, setSchoolAge] = useState(false);
  const [attest, setAttest] = useState(false);
  const [error, setError] = useState("");
  const forcedTeam = lanes.length >= 3;
  const use = party === "team" || forcedTeam ? "team" : "household";
  const rate = use === "team" ? "team" : "individual";
  const [slots,setSlots]=useState<{value:string;label:string}[]>([]);
  const [loadingSlots,setLoadingSlots]=useState(false);
  useEffect(()=>{let cancelled=false;setSlots([]);setTime("");setError("");if(!lanes.length)return;setLoadingSlots(true);void getCageAvailability({data:{date,duration,laneIds:lanes}}).then(rows=>{if(!cancelled)setSlots(rows);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"Availability could not load.");}).finally(()=>{if(!cancelled)setLoadingSlots(false);});return()=>{cancelled=true;};},[date,duration,lanes]);
  const quote = quoteCages(catalog, { rate, laneIds: lanes, minutes: duration, use, date, time, schoolAge });
  const total = quote?.price ?? 0;
  const householdHour = catalog.cages.find((row) => row.id === "individual")?.price ?? 50;
  const teamHour = catalog.cages.find((row) => row.id === "team")?.price ?? 60;

  function toggleLane(id: BookableLaneId) {
    setLanes((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (lanes.length === 0) {
      setError("Select at least one cage.");
      return;
    }
    if (use === "household" && !attest) {
      setError("Confirm this is for one or two household athletes — not a team practice.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const time = String(data.get("time") ?? "");
    const chosenDate = String(data.get("date") ?? "");
    if (!chosenDate || !time) {
      setError("Pick a date and a start time that is still open.");
      return;
    }
    const open = reservationSlots(chosenDate, duration).some((slot) => slot.value === time);
    if (!open) {
      setError("That window isn’t open. Pick another time.");
      return;
    }
    void navigate({
      to: "/pay",
      search: {
        kind: "cage",
        id: rate,
        date: chosenDate,
        time,
        minutes: duration,
        cages: lanes.join(","),
        use,
        schoolAge,
      },
    });
  }

  return (
    <section className="mx-auto max-w-3xl px-5 py-8">
      {today <= AFTER_SCHOOL.end ? <aside className="mb-8 rounded-xl bg-ink p-5 text-fg-inverse">
        <h2 className="text-3xl">After School. Before Game Day.</h2>
        <p className="mt-2">$20 / 30 minutes · $35 / 1 hour, per cage</p>
        <p className="mt-2 text-sm">{AFTER_SCHOOL.dates} · Monday–Friday, 4–6 PM Central. Sessions must end by 6 PM.</p>
        <p className="mt-2 text-sm">For 1–2 school-age athletes from one household. Select 30 or 60 minutes and confirm eligibility below. Team bookings and the fielding area use standard rates. Subject to availability.</p>
      </aside> : null}
      <h2 className="text-3xl">1. Who is this hour for?</h2>
      <p className="mt-2 text-sm text-muted">
        Household (${householdHour}/cage): 1–2 athletes from one family. Team (${teamHour}/cage):
        three or more athletes, or three or more spaces. Fielding area is always the field rate.
      </p>
      <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Who is training</legend>
        {(
          [
            ["household", "Household · 1–2 athletes", `$${householdHour} / cage / hr`],
            ["team", "Team or group · 3+", `$${teamHour} / cage / hr`],
          ] as const
        ).map(([value, label, price]) => {
          const on = party === value;
          return (
            <label
              key={value}
              className={cn(
                "flex min-h-16 cursor-pointer items-center rounded-xl px-4 py-3 shadow-border",
                on ? "bg-maroon text-fg-inverse" : "bg-paper-2",
              )}
            >
              <input
                type="radio"
                name="party"
                value={value}
                checked={on}
                onChange={() => {
                  setParty(value);
                  setAttest(false);
                }}
                className="sr-only"
              />
              <span>
                <span className="block font-display text-xl uppercase">{label}</span>
                <span className={cn("text-sm", on ? "text-fg-inverse/80" : "text-muted")}>{price}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {forcedTeam ? (
        <p className="mt-3 text-sm text-maroon" data-forced-team="true" aria-live="polite">
          Three or more spaces is a team booking. Team rate applies.
        </p>
      ) : null}

      <h2 className="mt-8 text-3xl">2. Choose the cages</h2>
      <p className="mt-2 text-sm text-muted">
        Tap every lane you need. Same start time. Coaches often book two hitting lanes, or a mound plus the fielding area.
      </p>
      <fieldset className="mt-4 grid gap-2" data-cage-picker="true">
        <legend className="sr-only">Cages</legend>
        {BOOKABLE_LANES.map((item) => {
          const on = lanes.includes(item.id);
          const hourly =
            item.group === "field"
              ? catalog.cages.find((row) => row.id === "field")?.price ?? 75
              : catalog.cages.find((row) => row.id === rate)?.price ?? (rate === "team" ? 60 : 50);
          return (
            <label
              key={item.id}
              className={cn(
                "flex min-h-16 cursor-pointer items-center justify-between rounded-xl px-4 shadow-border",
                on ? "bg-maroon text-fg-inverse" : "bg-paper-2 text-ink",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() => toggleLane(item.id)}
                data-cage-id={item.id}
              />
              <span>
                <span className="block font-display text-xl uppercase">{item.name}</span>
                <span className={cn("text-sm", on ? "text-fg-inverse/80" : "text-muted")}>
                  {item.size}
                  {item.group === "field" ? " · fielding area" : ""}
                </span>
              </span>
              <span className="font-display text-3xl font-extrabold">${hourly}</span>
            </label>
          );
        })}
      </fieldset>

      <form onSubmit={onSubmit} className="mt-8 grid gap-4">
        <h2 className="text-3xl">3. Date and time</h2>
        <label className="text-sm font-semibold">
          Date
          <input
            required
            name="date"
            type="date"
            min={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1.5 block min-h-11 w-full rounded-md border border-line bg-paper-2 px-3"
          />
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">Duration</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {DURATIONS.map(([value, label]) => (
              <label
                key={value}
                className="flex min-h-11 items-center justify-center rounded-md bg-paper-2 text-sm font-semibold shadow-border has-[:checked]:bg-maroon has-[:checked]:text-fg-inverse has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-powder"
              >
                <input
                  type="radio"
                  name="duration"
                  value={value}
                  checked={duration === value}
                  onChange={() => setDuration(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold">Start time</legend>
          {slots.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              {lanes.length === 0 ? "Choose a lane to see available times." : loadingSlots ? "Loading available times…" : date === today
                ? "No remaining windows today. Pick another date."
                : "No windows on this date. Pick another day."}
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((slot) => {
                const taken = false;
                return (
                  <label
                    key={slot.value}
                    className={cn(
                      "flex min-h-11 items-center justify-center rounded-md text-sm font-semibold shadow-border has-[:checked]:bg-maroon has-[:checked]:text-fg-inverse has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-powder",
                      taken ? "cursor-not-allowed bg-paper text-muted" : "bg-paper-2",
                    )}
                  >
                    <input
                      required
                      type="radio"
                      name="time"
                      value={slot.value}
                      checked={time === slot.value}
                      onChange={() => setTime(slot.value)}
                      disabled={taken}
                      className="sr-only"
                    />
                    {taken ? `${slot.label} · taken` : slot.label}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
        {use === "household" && today <= AFTER_SCHOOL.end ? <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-6" checked={schoolAge} onChange={(event) => setSchoolAge(event.target.checked)} />
          <span>All athletes in this booking are school-age students. Apply the After-School Special to eligible 30- or 60-minute cages. Other dates, times, and durations use standard rates.</span>
        </label> : null}
        {quote && quote.lines.length > 0 ? (
          <ul className="grid gap-1 text-sm text-muted" data-cage-count={lanes.length} id="cage-total">
            {quote.lines.map((line) => (
              <li key={line.label} className="flex justify-between gap-3">
                <span>{line.label}</span>
                <span className="tabular-nums text-ink">${line.amount}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="font-display text-4xl" data-cage-total={total} aria-live="polite">
          ${total}
        </p>
        {use === "household" ? (
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-6"
              checked={attest}
              onChange={(event) => setAttest(event.target.checked)}
              data-household-attest="true"
            />
            <span>
              This booking is for one or two household athletes, not a team of three or more.
            </span>
          </label>
        ) : (
          <p className="text-sm text-muted">Team rate applies to this booking.</p>
        )}
        <CancelNote />
        {error ? (
          <p className="text-sm text-maroon" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          className="w-full"
          disabled={loadingSlots || lanes.length === 0 || slots.length === 0}
          aria-describedby="cage-total"
        >
          {lanes.length === 0
            ? "Select a cage to continue"
            : slots.length === 0
              ? "Pick an open date"
              : `Review ${lanes.length > 1 ? `${lanes.length} cages` : "this cage"} · $${total}`}
        </Button>
        <p className="text-center text-xs text-muted">
          Next screen confirms the price and payment availability. Payment must succeed before your booking is confirmed. Choosing a time here does not save a booking. {CANCEL_POLICY.short}.
        </p>
      </form>
    </section>
  );
}
