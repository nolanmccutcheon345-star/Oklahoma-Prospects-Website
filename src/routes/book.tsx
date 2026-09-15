import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { MembershipPlans } from "@/components/membership-plans";
import { PageHero } from "@/components/page-hero";
import { CancelNote } from "@/components/square-pay";
import { BOOKABLE_LANES, CANCEL_POLICY, TEAM_MEMBERSHIPS, type BookableLaneId } from "@/lib/club";
import { reservationSlots } from "@/lib/hours";
import { quoteCages } from "@/lib/pay";
import { useLiveCatalog } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

type BookSearch = { space?: string };

export const Route = createFileRoute("/book")({
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
        accent="Pay. They’re yours."
        copy="One cage or several at the same time — 30 minutes to 3 hours. Household rate is for 1–2 athletes. Team rate is for groups of three or more."
        image="/brand/facility.jpg"
      />
      <BookingFunnel initial={space} />
      <section className="bg-ink py-10 text-fg-inverse">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">Household cage memberships</h2>
          <p className="mt-2 text-fg-soft">
            For one or two family athletes — not team practices. Lesson memberships live on Train.
          </p>
          <div className="mt-6">
            <MembershipPlans />
          </div>
          <h3 className="mt-10 text-2xl">Team plans · 4 visits / month</h3>
          <p className="mt-2 text-sm text-fg-soft">
            Coaches and teams book here. Individual and household memberships cannot be used for a team workout.
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl bg-navy">
            <table className="w-full min-w-lg text-left text-sm">
              <thead className="text-xs tracking-widest text-powder uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Space</th>
                  <th className="px-4 py-3 font-semibold">1 hour</th>
                  <th className="px-4 py-3 font-semibold">90 min</th>
                  <th className="px-4 py-3 font-semibold">2 hours</th>
                </tr>
              </thead>
              <tbody>
                {TEAM_MEMBERSHIPS.map((row) => (
                  <tr key={row.space} className="border-t border-fg-inverse/10">
                    <td className="px-4 py-3 font-medium">{row.space}</td>
                    {row.rates.map((rate) => (
                      <td key={rate.duration} className="px-4 py-3 tabular-nums">
                        ${rate.price}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
  const [party, setParty] = useState<"household" | "team">(initial === "team" ? "team" : "household");
  const [lanes, setLanes] = useState<BookableLaneId[]>(() => defaultLanes(initial));
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(60);
  const [attest, setAttest] = useState(false);
  const [error, setError] = useState("");
  const forcedTeam = lanes.length >= 3;
  const use = party === "team" || forcedTeam ? "team" : "household";
  const rate = use === "team" ? "team" : "individual";
  const slots = useMemo(() => reservationSlots(date), [date]);
  const quote = quoteCages(catalog, { rate, laneIds: lanes, minutes: duration, use });
  const total = quote?.price ?? 0;

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
      },
    });
  }

  return (
    <section className="mx-auto max-w-3xl px-5 py-8">
      <h2 className="text-3xl">1. Who is this hour for?</h2>
      <p className="mt-2 text-sm text-muted">
        Individual cages are $50/hr for one or two household athletes. Teams of three or more pay $60/hr per cage so a coach cannot book the household rate for a team practice.
      </p>
      <fieldset className="mt-4 grid gap-2 sm:grid-cols-2" data-party-picker="true">
        <legend className="sr-only">Who is training</legend>
        {(
          [
            ["household", "Household · 1–2 athletes", "$50 / cage"],
            ["team", "Team or group · 3+", "$60 / cage"],
          ] as const
        ).map(([value, label, price]) => (
          <button
            key={value}
            type="button"
            aria-pressed={party === value}
            data-party={value}
            onClick={() => {
              setParty(value);
              setAttest(false);
            }}
            className={cn(
              "rounded-xl px-4 py-3 text-left shadow-border",
              party === value ? "bg-maroon text-fg-inverse" : "bg-paper-2",
            )}
          >
            <span className="block font-display text-xl uppercase">{label}</span>
            <span className={cn("text-sm", party === value ? "text-fg-soft" : "text-muted")}>{price}</span>
          </button>
        ))}
      </fieldset>
      {forcedTeam ? (
        <p className="mt-3 text-sm text-maroon" data-forced-team="true">
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
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              data-cage-id={item.id}
              onClick={() => toggleLane(item.id)}
              className={cn(
                "flex min-h-16 items-center justify-between rounded-xl px-4 text-left shadow-border",
                on ? "bg-maroon text-fg-inverse" : "bg-paper-2 text-ink",
              )}
            >
              <span>
                <span className="block font-display text-xl uppercase">{item.name}</span>
                <span className={cn("text-sm", on ? "text-fg-soft" : "text-muted")}>
                  {item.size}
                  {item.group === "field" ? " · fielding area" : ""}
                </span>
              </span>
              <span className="font-display text-3xl font-extrabold">${hourly}</span>
            </button>
          );
        })}
      </fieldset>

      <form onSubmit={onSubmit} className="mt-8 grid gap-4">
        <h2 className="text-3xl">3. Open slot</h2>
        <label className="text-sm font-semibold">
          Date
          <input
            required
            name="date"
            type="date"
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
                className="flex min-h-11 items-center justify-center rounded-md bg-paper-2 text-sm font-semibold shadow-border has-[:checked]:bg-maroon has-[:checked]:text-fg-inverse"
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
            <p className="mt-2 text-sm text-muted">Pick a date to see open windows.</p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((slot) => (
                <label
                  key={slot.value}
                  className="flex min-h-11 items-center justify-center rounded-md bg-paper-2 text-sm font-semibold shadow-border has-[:checked]:bg-maroon has-[:checked]:text-fg-inverse"
                >
                  <input required type="radio" name="time" value={slot.value} className="sr-only" />
                  {slot.label}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {quote && quote.lines.length > 0 ? (
          <ul className="grid gap-1 text-sm text-muted" data-cage-count={lanes.length}>
            {quote.lines.map((line) => (
              <li key={line.label} className="flex justify-between gap-3">
                <span>{line.label}</span>
                <span className="tabular-nums text-ink">${line.amount}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="font-display text-4xl" data-cage-total={total}>
          ${total}
        </p>
        {use === "household" ? (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={attest}
              onChange={(event) => setAttest(event.target.checked)}
              data-household-attest="true"
            />
            <span>
              This booking is for one or two household athletes, not a team of three or more.
            </span>
          </label>
        ) : (
          <p className="text-sm text-muted">Team rate is locked for this reservation.</p>
        )}
        <CancelNote />
        {error ? <p className="text-sm text-maroon">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={lanes.length === 0}>
          {lanes.length === 0
            ? "Select a cage to continue"
            : `Review ${lanes.length > 1 ? `${lanes.length} cages` : "this cage"} · $${total}`}
        </Button>
        <p className="text-center text-xs text-muted">
          Debit or credit on the next screen. Square charges ${total || 0}. {CANCEL_POLICY.short}.
        </p>
      </form>
    </section>
  );
}
