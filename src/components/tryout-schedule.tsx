import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { formatClockTime } from "@/lib/time-display";
import type { TryoutEvent } from "@/lib/tryout-events-contracts";
export function TryoutSchedule({
  events = [],
  sport,
}: {
  events?: TryoutEvent[];
  sport?: "Baseball" | "Softball";
}) {
  const visible = events.filter((event) => !sport || event.sport === sport);
  return visible.length ? (
    <div className="grid gap-4">
      {visible.map((event) => (
        <article key={event.id} className="rounded-xl bg-paper-2 p-5 shadow-border">
          <h3 className="text-2xl">
            {event.sport} · {event.ageGroups.join(" · ")}
          </h3>
          <p className="mt-2">
            {event.season} ·{" "}
            {new Intl.DateTimeFormat("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${event.date}T00:00:00Z`))}
          </p>
          <p>
            {formatClockTime(event.startTime)}–{formatClockTime(event.endTime)} Central ·{" "}
            {event.location}
          </p>
          <p className="mt-2 text-sm">
            Capacity: {event.capacity}. Submit your player information below. A request does not
            reserve a place in this event.
          </p>
          <Button asChild className="mt-4">
            <Link
              to="/tryouts"
              search={{
                event: event.id,
                sport: event.sport,
                age: event.ageGroups.length === 1 ? event.ageGroups[0] : undefined,
              }}
              hash="register"
            >
              Request This Tryout
            </Link>
          </Button>
        </article>
      ))}
    </div>
  ) : (
    <p className="rounded-xl bg-paper-2 px-5 py-4 text-sm shadow-border">
      No group tryouts are currently scheduled. Request an individual evaluation, and our staff will
      coordinate an appointment with your family.
    </p>
  );
}
