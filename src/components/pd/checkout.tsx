import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDevelopment } from "@/lib/pd/context";
import {
  coachForDiscipline,
  FEATURE_LABELS,
  WEEKDAYS,
} from "@/lib/pd/content/commerce";
import {
  planSessionCount,
  proposeFromAvailability,
  proposeRecurring,
  serviceIdForCheckout,
  slotsOn,
  type ProposedSession,
} from "@/lib/pd/commerce-engine";
import { featuresForTier } from "@/lib/pd/engines";
import { SquarePayButton } from "@/components/square-pay";
import { PD_OS } from "@/lib/pd";
import { cn } from "@/lib/utils";
import type { PaySearch } from "@/lib/pay";

export type CheckoutItem = {
  kind: string;
  id: string;
  title: string;
  price: number;
  minutes: number;
  credits: number;
  remote: number;
  planName: string;
  detail: string;
  discipline?: string;
  tier?: string;
  lessons?: number;
};

function labelTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 || 12;
  const ap = h < 12 ? "AM" : "PM";
  return `${hour}:${String(m).padStart(2, "0")} ${ap}`;
}

export function CheckoutSchedule({
  item,
  athleteId,
  initialDate,
  initialTime,
  onApproved,
  busy,
  search,
  hasAssessment,
}: {
  item: CheckoutItem;
  athleteId: string;
  initialDate?: string;
  initialTime?: string;
  onApproved: (sessions: ProposedSession[]) => void;
  busy?: boolean;
  search: PaySearch;
  hasAssessment?: boolean;
}) {
  const { data, joinWaitlist } = useDevelopment();
  const coaches = data.coaches.filter((row) => row.active);
  const defaultCoach =
    coachForDiscipline(item.discipline || "Pitching") || coaches[0]?.id || "c-steve";
  const [coachId, setCoachId] = useState(defaultCoach);
  const needed = Math.max(
    1,
    planSessionCount(item.kind, {
      credits: item.credits,
      lessons: item.lessons ?? item.credits,
      minutes: item.minutes,
    }),
  );
  const remoteNeeded = item.kind === "membership" ? item.remote : 0;

  const auto = useMemo(
    () => proposeFromAvailability(data, coachId, needed, remoteNeeded),
    [data, coachId, needed, remoteNeeded],
  );

  const [sessions, setSessions] = useState<ProposedSession[]>(() => {
    if (initialDate && initialTime) {
      return [
        {
          coachId: defaultCoach,
          date: initialDate,
          dateLabel: initialDate,
          time: initialTime,
        },
      ];
    }
    return auto.booked;
  });
  const [changing, setChanging] = useState<number | null>(null);
  const [weekday, setWeekday] = useState(2);
  const [recurTime, setRecurTime] = useState("17:00");
  const [weeks, setWeeks] = useState(needed);
  const [waitDay, setWaitDay] = useState("Tue");
  const [waitTime, setWaitTime] = useState("17:00");
  const [waitJoined, setWaitJoined] = useState(false);
  const [approved, setApproved] = useState(false);
  const short = sessions.length < needed && item.kind !== "lesson";

  function applyRecurring() {
    const next = proposeRecurring(data, coachId, weekday, recurTime, weeks);
    setSessions(next.booked);
    setChanging(null);
  }

  const alts =
    changing != null
      ? nearbyAlts(data, coachId, sessions[changing]?.date || auto.booked[0]?.date, sessions)
      : [];

  const serviceId = serviceIdForCheckout(item.kind, item.id, item.minutes);
  const features =
    item.kind === "membership" ? featuresForTier(item.tier) : [];

  return (
    <div className="pd-stack" data-checkout="schedule">
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Proposed schedule
          </p>
          <h3 className="mt-2 text-2xl italic">Review the dates, then pay.</h3>
          <p className="mt-2 text-sm text-fg-soft">
            These times came from posted coach windows. Change or remove any
            session. You pay with debit or credit on the next step.
          </p>
        </div>
      </section>

      <label className="grid gap-1.5 text-sm font-semibold">
        Coach
        <select
          className="pd-control min-h-11 rounded-md border border-line bg-paper-2 px-3"
          value={coachId}
          onChange={(event) => {
            const next = event.target.value;
            setCoachId(next);
            const rebuilt = proposeFromAvailability(data, next, needed, remoteNeeded);
            setSessions(rebuilt.booked);
          }}
        >
          {coaches.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>

      <ul className="grid gap-2">
        {sessions.length === 0 ? (
          <li className="rounded-xl bg-paper-2 px-4 py-3 text-sm shadow-border">
            No open slots on this coach. Join the waitlist with a day and time.
          </li>
        ) : (
          sessions.map((row, index) => (
            <li
              key={`${row.date}-${row.time}-${index}`}
              className="pd-row rounded-2xl bg-paper-2 shadow-border"
              data-proposed-session={row.date}
            >
              <span className="flex items-baseline justify-between gap-3">
                <strong>
                  {row.dateLabel || row.date} · {labelTime(row.time)}
                </strong>
                <button
                  type="button"
                  className="text-xs font-semibold tracking-wide text-maroon uppercase"
                  onClick={() =>
                    setSessions(sessions.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </button>
              </span>
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-maroon"
                onClick={() => setChanging(changing === index ? null : index)}
              >
                Change
              </button>
              {changing === index ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {alts.length === 0 ? (
                    <p className="col-span-3 text-sm text-muted">
                      No other open slots nearby.
                    </p>
                  ) : (
                    alts.map((slot) => (
                      <button
                        type="button"
                        key={`${slot.date}-${slot.time}`}
                        className="min-h-11 rounded-md bg-paper text-xs font-semibold shadow-border"
                        onClick={() => {
                          const next = sessions.slice();
                          next[index] = slot;
                          setSessions(next);
                          setChanging(null);
                        }}
                      >
                        {slot.date.slice(5)} {labelTime(slot.time)}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>

      {short ? (
        <p className="text-sm text-maroon" data-schedule-short="true">
          Only {sessions.length} of {needed} open slots found. Remove none you
          want, or join the waitlist for the rest.
        </p>
      ) : null}

      {item.kind !== "lesson" ? (
        <section className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              Recurring
            </p>
            <h3 className="mt-2 text-2xl">Same slot every week</h3>
            <p className="mt-2 text-sm text-muted">
              Generated against real openings. A week is skipped if that time is taken.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="text-xs font-semibold">
                Day
                <select
                  className="pd-control mt-1 min-h-11 w-full rounded-md border border-line bg-paper px-2"
                  value={weekday}
                  onChange={(event) => setWeekday(Number(event.target.value))}
                >
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Time
                <select
                  className="pd-control mt-1 min-h-11 w-full rounded-md border border-line bg-paper px-2"
                  value={recurTime}
                  onChange={(event) => setRecurTime(event.target.value)}
                >
                  {["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"].map(
                    (time) => (
                      <option key={time} value={time}>
                        {labelTime(time)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Weeks
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={weeks}
                  onChange={(event) => setWeeks(Number(event.target.value) || needed)}
                  className="pd-control mt-1 min-h-11 w-full rounded-md border border-line bg-paper px-2"
                />
              </label>
            </div>
            <Button type="button" variant="outlineDark" className="mt-3" onClick={applyRecurring}>
              Build {weeks}-week series
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl bg-paper-2 shadow-border" data-waitlist-form="true">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            Waitlist
          </p>
          <h3 className="mt-2 text-2xl">Nothing open that works?</h3>
          <p className="mt-2 text-sm text-muted">
            Tell us the day and time you want. The coach can offer a real matching slot.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold">
              Day
              <select
                className="pd-control mt-1 min-h-11 w-full rounded-md border border-line bg-paper px-2"
                value={waitDay}
                onChange={(event) => setWaitDay(event.target.value)}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold">
              Time
              <select
                className="pd-control mt-1 min-h-11 w-full rounded-md border border-line bg-paper px-2"
                value={waitTime}
                onChange={(event) => setWaitTime(event.target.value)}
              >
                {["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"].map(
                  (time) => (
                    <option key={time} value={time}>
                      {labelTime(time)}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          <Button
            type="button"
            variant="outlineDark"
            className="mt-3"
            disabled={waitJoined}
            onClick={() => {
              joinWaitlist({
                athleteId,
                serviceId,
                preferredDay: waitDay,
                preferredTime: waitTime,
                note: item.title,
              });
              setWaitJoined(true);
            }}
          >
            {waitJoined ? "You’re on the waitlist" : "Join the waitlist"}
          </Button>
        </div>
      </section>

      {features.length ? (
        <section className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              What’s on this plan
            </p>
            <ul className="mt-3 grid gap-2">
              {features.map((row) => (
                <li
                  key={row.feature}
                  className="pd-row flex items-baseline justify-between rounded-xl bg-paper"
                  data-feature={row.feature}
                  data-feature-locked={row.has ? "false" : "true"}
                >
                  <span className="text-sm">
                    {FEATURE_LABELS[row.feature] ?? row.feature}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold tracking-wide uppercase",
                      row.has ? "text-maroon" : "text-muted",
                    )}
                  >
                    {row.has ? "Included" : `Locked · unlocks on ${row.min}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <p className="text-sm text-muted" data-pay-seam="square">
        Pay with debit or credit. Square charges ${item.price} — the same total as this order.
        Nothing is booked until that payment clears.
      </p>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-5"
          checked={approved}
          onChange={(event) => setApproved(event.target.checked)}
        />
        <span>
          I approve these {sessions.length} session
          {sessions.length === 1 ? "" : "s"} and will pay ${item.price} by debit
          or credit.
        </span>
      </label>

      <SquarePayButton
        amount={item.price}
        title={item.title}
        lines={[{ label: item.title, amount: item.price }]}
        search={search}
        hasAssessment={hasAssessment}
        disabled={!approved || sessions.length === 0}
        busy={busy}
        onPay={() => onApproved(sessions)}
      />
      <p className="text-center text-xs text-muted">
        Desk {PD_OS.phone} if a date cannot move.
      </p>
    </div>
  );
}

function nearbyAlts(
  data: Parameters<typeof slotsOn>[0],
  coachId: string,
  around: string,
  extra: ProposedSession[],
) {
  const start = around || "2026-09-15";
  const out: ProposedSession[] = [];
  for (let i = 0; i < 10 && out.length < 9; i++) {
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    for (const time of slotsOn(data, coachId, iso, extra) as string[]) {
      out.push({ coachId, date: iso, dateLabel: label, time });
      if (out.length >= 9) break;
    }
  }
  return out;
}
