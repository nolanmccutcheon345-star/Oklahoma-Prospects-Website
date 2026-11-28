import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getPublicLessonTimes } from "@/lib/commerce/api";
import { calendarDay, NEXT_LESSON_DAYS } from "@/lib/commerce/available-lesson-times";
import { checkoutReturnPath } from "@/lib/pay";
import { chicagoDate } from "@/lib/scheduling";

export function GuestLessonTimes({
  productId,
  coachId,
  coaches,
  initialDate,
  onChangeCoach,
}: {
  productId: string;
  coachId: string;
  coaches: { id: string; name: string }[];
  initialDate?: string;
  onChangeCoach: (id: string) => void;
}) {
  const today = chicagoDate();
  const latest = calendarDay(today, NEXT_LESSON_DAYS);
  const [date, setDate] = useState(
    initialDate && initialDate >= today && initialDate <= latest ? initialDate : today,
  );
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    times?: Awaited<ReturnType<typeof getPublicLessonTimes>>;
  } | null>(null);
  const key = JSON.stringify([productId, coachId, date, attempt]);
  const hasCoach = coaches.some((coach) => coach.id === coachId);
  useEffect(() => {
    if (!hasCoach || !date) return;
    let active = true;
    getPublicLessonTimes({ data: { productId, coachId, date } })
      .then((times) => {
        if (active) setResult({ key, times });
      })
      .catch(() => {
        if (active) setResult({ key });
      });
    return () => {
      active = false;
    };
  }, [productId, coachId, date, key, hasCoach]);

  const current = result?.key === key ? result : null;
  const firstOpen = current?.times?.nextAvailable;
  const visibleSlots = current?.times?.slots.length
    ? { date, slots: current.times.slots }
    : firstOpen;

  return (
    <section
      aria-labelledby="guest-lesson-heading"
      className="grid gap-4 rounded-xl border border-line p-4"
    >
      <h2 id="guest-lesson-heading" className="text-2xl">
        Available lesson times
      </h2>
      <p>
        Browse times now. Sign in after choosing a time to select your athlete and confirm
        eligibility.
      </p>
      <label className="grid gap-1">
        Instructor
        <select
          className="rounded-lg border p-3"
          value={hasCoach ? coachId : ""}
          onChange={(event) => onChangeCoach(event.target.value)}
        >
          <option value="">Select an instructor</option>
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        Date · Central Time
        <input
          className="min-w-0 rounded-lg border p-3"
          type="date"
          min={today}
          max={latest}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      {!coaches.length ? <p>No instructor is currently available for this lesson.</p> : null}
      {hasCoach && date && !current ? <p role="status">Checking available times…</p> : null}
      {current && !current.times ? (
        <div role="alert">
          <p>Times could not load. Try again or contact Front Office.</p>
          <Button
            type="button"
            variant="outlineDark"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {current?.times && !visibleSlots ? (
        <p role="status">No openings found for this instructor. Try another date or instructor.</p>
      ) : null}
      {visibleSlots ? (
        <div aria-label="Available start times">
          <p className="mb-2 font-semibold">
            {firstOpen ? "Next available · " : ""}
            {new Date(visibleSlots.date + "T12:00:00Z").toLocaleDateString("en-US", {
              timeZone: "America/Chicago",
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            {visibleSlots.slots.map((slot) => (
              <Button asChild key={slot.value} variant="outlineDark">
                <Link
                  to="/login"
                  search={{
                    next: checkoutReturnPath({
                      kind: "lesson",
                      id: productId,
                      instructor: coachId,
                      date: visibleSlots.date,
                      time: slot.value,
                    }),
                  }}
                  aria-label={`Continue with ${slot.label}`}
                >
                  {slot.label}
                </Link>
              </Button>
            ))}
          </div>
          <p className="mt-3 text-sm">Times are rechecked at checkout.</p>
        </div>
      ) : null}
    </section>
  );
}
