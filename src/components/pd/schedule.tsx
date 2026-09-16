import {ContractorEarnings} from "@/components/commerce/operations";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { pushUndo } from "@/components/pd/polish";
import { useDevelopment } from "@/lib/pd/context";
import { FEATURE_LABELS } from "@/lib/pd/content/commerce";
import { cancelQuote, earningRow, slotsOn, type ProposedSession } from "@/lib/pd/commerce-engine";
import { featuresForTier, rescheduleFor } from "@/lib/pd/engines";
import { PD_OS } from "@/lib/pd";
import type { Booking, Family } from "@/lib/pd/types";
import type { LessonStart } from "@/components/pd/guided-lesson";
import { cn } from "@/lib/utils";

function labelTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function SessionPolicyRow({
  booking,
  family,
}: {
  booking: Booking;
  family: Family;
}) {
  const { data, rescheduleBooking, cancelBooking, restoreBooking } = useDevelopment();
  const gate = rescheduleFor(booking, family, data);
  const quote = cancelQuote(booking, data.policy);
  const [changing, setChanging] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [message, setMessage] = useState("");
  const alts = useMemo(() => {
    if (!changing) return [];
    const coachId = booking.coachId || "c-steve";
    const out: ProposedSession[] = [];
    for (let i = 1; i <= 14 && out.length < 8; i++) {
      const d = new Date(`${booking.date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      for (const time of slotsOn(data, coachId, iso) as string[]) {
        out.push({ coachId, date: iso, dateLabel: label, time });
        if (out.length >= 8) break;
      }
    }
    return out;
  }, [booking, changing, data]);

  if (booking.status === "cancelled") {
    return (
      <li className="pd-row rounded-xl bg-paper-2 text-muted shadow-border">
        {booking.date} · {labelTime(booking.time)} · cancelled
      </li>
    );
  }

  return (
    <li
      className="pd-row rounded-2xl bg-paper-2 shadow-border"
      data-session-id={booking.id}
      data-session-reschedule={gate.ok ? "open" : "blocked"}
    >
      <strong>
        {booking.date} · {labelTime(booking.time)}
      </strong>
      <span className="mt-1 block text-sm text-muted">
        {booking.status}
        {booking.rescheduledMonth ? " · already moved this month" : ""}
      </span>
      <div className="mt-3 flex flex-wrap gap-2">
        {gate.ok ? (
          <Button
            type="button"
            size="sm"
            variant="outlineDark"
            data-reschedule-ok="true"
            onClick={() => setChanging((v) => !v)}
          >
            Reschedule
          </Button>
        ) : (
          <p className="rounded-lg bg-maroon/15 px-3 py-2 text-sm" data-reschedule-blocked="true">
            {gate.reason}. {gate.detail} Call {PD_OS.phone} for a genuine emergency.
          </p>
        )}
        <Button type="button" size="sm" variant="maroon" onClick={() => setConfirmCancel(true)}>
          Cancel
        </Button>
      </div>
      {changing ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {alts.map((slot) => (
            <button
              key={`${slot.date}-${slot.time}`}
              type="button"
              className="min-h-11 rounded-md bg-paper text-xs font-semibold shadow-border"
              onClick={() => {
                const result = rescheduleBooking(booking.id, slot, family.id);
                setMessage(result.ok ? `Moved to ${slot.dateLabel}` : result.reason || "Could not move.");
                setChanging(false);
              }}
            >
              {slot.date.slice(5)} {labelTime(slot.time)}
            </button>
          ))}
        </div>
      ) : null}
      {confirmCancel ? (
        <div className="mt-3 rounded-xl bg-paper p-3" data-cancel-quote="true">
          <p className="text-sm">
            {quote.label}. Fee before you confirm:{" "}
            <strong className="pd-num">${quote.fee}</strong>
            {quote.feePct ? ` (${quote.feePct}%)` : " — free"}.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="maroon"
              onClick={() => {
                cancelBooking(booking.id);
                setConfirmCancel(false);
                pushUndo({
                  label: `Cancelled ${booking.date}.`,
                  run: () => restoreBooking(booking.id),
                });
              }}
            >
              Confirm cancel · ${quote.fee}
            </Button>
            <Button type="button" size="sm" variant="outlineDark" onClick={() => setConfirmCancel(false)}>
              Keep session
            </Button>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
    </li>
  );
}

export function LockedFeatures({ tier }: { tier?: string }) {
  const features = featuresForTier(tier === "none" || tier === "package" ? undefined : tier);
  const developmentCount = featuresForTier("development").filter((row) => row.has).length;
  const performanceCount = featuresForTier("performance").filter((row) => row.has).length;
  return (
    <ul
      className="mt-3 grid gap-2"
      data-count-development={String(developmentCount)}
      data-count-performance={String(performanceCount)}
    >
      {features.map((row) => (
        <li
          key={row.feature}
          className="pd-row flex items-baseline justify-between rounded-xl bg-paper-2 shadow-border"
          data-feature={row.feature}
          data-feature-locked={row.has ? "false" : "true"}
        >
          <span className="text-sm">{FEATURE_LABELS[row.feature] ?? row.feature}</span>
          <span className={cn("text-xs font-semibold tracking-wide uppercase", row.has ? "text-maroon" : "text-muted")}>
            {row.has ? "Included" : `Locked · unlocks on ${row.min}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CoachWaitlist() {
  const { data } = useDevelopment();
  const open = data.waitlist.filter((row) => (row.status ?? "open") === "open");
  return (
    <section className="rounded-2xl bg-paper-2 shadow-border" data-coach-waitlist="true">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Waitlist</p>
        <h3 className="mt-2 text-2xl">Offer a slot</h3>
        <p className="mt-2 text-sm text-muted">
          Review the family’s preferred time before arranging a confirmed booking.
        </p>
        {open.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-maroon">No open waitlist names. Check the floor.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {open.map((row) => {
              const athlete = data.athletes.find((item) => item.id === row.athleteId);
              return (
                <li key={row.id} className="pd-row rounded-xl bg-paper" data-waitlist-id={row.id}>
                  <strong>{athlete ? `${athlete.firstName} ${athlete.lastName}` : row.athleteId}</strong>
                  <span className="mt-1 block text-sm text-muted">
                    Prefers {row.preferredDay || "any day"} {row.preferredTime || ""}
                  </span>
                  <p className="mt-2">Contact the family to arrange a booking through the front desk. This waitlist entry does not reserve a slot.</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export function CoachFloor({
  coachId,
  onStartLesson,
}: {
  coachId?: string;
  onStartLesson?: (start: LessonStart) => void;
}) {
  const { data } = useDevelopment();
  const rows = data.bookings.filter(
    (row) =>
      row.status === "paid" &&
      row.date >= "2026-09-12" &&
      (!coachId || row.coachId === coachId || !row.coachId),
  );
  return (
    <section className="rounded-2xl bg-paper-2 shadow-border">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Sessions</p>
        <h3 className="mt-2 text-2xl">Mark complete to earn</h3>
        <p className="mt-2 text-sm text-muted">
          Earnings stay pending until you mark the session complete. Booking never pays out.
        </p>
        <ul className="mt-3 grid gap-2">
          {rows.length === 0 ? (
            <li className="text-sm font-semibold text-maroon">No paid sessions on the floor. Open the lesson desk.</li>
          ) : (
            rows.map((row) => {
              const athlete = data.athletes.find((item) => item.id === row.athleteId);
              return (
                <li key={row.id} className="pd-row rounded-xl bg-paper" data-floor-session={row.id}>
                  <strong>{athlete ? `${athlete.firstName} ${athlete.lastName}` : row.athleteId}</strong>
                  <span className="mt-1 block text-sm text-muted">
                    {row.date} · {labelTime(row.time)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2 min-h-12"
                    data-start-lesson={row.athleteId}
                    onClick={() =>
                      onStartLesson?.({
                        athleteId: row.athleteId,
                        bookingId: row.id,
                        serviceId: row.serviceId,
                      })
                    }
                  >
                    Start lesson
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outlineDark"
                    className="mt-2 min-h-12"
                    data-start-bullpen={row.athleteId}
                    onClick={() =>
                      onStartLesson?.({
                        athleteId: row.athleteId,
                        bookingId: row.id,
                        serviceId: row.serviceId,
                        jumpTo: "tracker",
                      })
                    }
                  >
                    Bullpen
                  </Button>
                  <p className="mt-2 text-sm">Finish this session in Confirmed sessions, with a saved coach recap.</p>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="pd-row rounded-xl bg-paper">
      <p className="text-[0.65rem] font-semibold tracking-widest text-muted uppercase">{label}</p>
      <p className="pd-num font-display text-2xl">{value}</p>
    </div>
  );
}

export function EarningsBoard({ coachId: _coachId }: { coachId?: string }) {
 return <ContractorEarnings/>;
}

export function PolicyEditor() {
  const { data, updatePolicy } = useDevelopment();
  const p = data.policy;
  return (
    <section className="rounded-2xl bg-paper-2 shadow-border" data-policy-editor="true">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Booking policy</p>
        <h3 className="mt-2 text-2xl">Admin-configurable</h3>
        <label className="mt-3 block text-sm font-semibold">
          Reschedule notice (days)
          <input
            type="number"
            min={1}
            max={14}
            value={p.rescheduleDaysNotice}
            onChange={(event) => updatePolicy({ rescheduleDaysNotice: Number(event.target.value) || 5 })}
            className="pd-control mt-1.5 min-h-11 w-full rounded-md border border-line bg-paper px-3"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold">
          Reschedules per family per month
          <input
            type="number"
            min={0}
            max={4}
            value={p.reschedulesPerMonth}
            onChange={(event) => updatePolicy({ reschedulesPerMonth: Number(event.target.value) || 1 })}
            className="pd-control mt-1.5 min-h-11 w-full rounded-md border border-line bg-paper px-3"
          />
        </label>
        <label className="mt-3 flex min-h-12 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={p.verifyActivities}
            onChange={(event) => updatePolicy({ verifyActivities: event.target.checked })}
            data-verify-toggle="true"
          />
          High-value activities stay pending until a coach verifies
        </label>
        <p className="mt-3 text-sm text-muted">
          Club cancel policy is locked: 48 hours for a full refund, 24–48 hours for 50%, inside 24 hours none.
          The fee always shows before confirm.
        </p>
      </div>
    </section>
  );
}
