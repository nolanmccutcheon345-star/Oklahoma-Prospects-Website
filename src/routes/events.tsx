import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { pageHead } from "@/lib/seo";
import { getTrainingEvents, getEventFamily, startEventCheckout } from "@/lib/training-events-api";
import { submitSquarePayment } from "@/lib/commerce/api";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { SquareCard } from "@/components/commerce/square-card";
import { TrainingNav } from "@/components/training-nav";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/pricing";
import { formatClockTime } from "@/lib/time-display";
import { chicagoDate } from "@/lib/scheduling";
export const Route = createFileRoute("/events")({
  head: () =>
    pageHead(
      "/events",
      "Camps & Clinics",
      "Explore upcoming baseball and softball camps and clinics at Oklahoma Prospects.",
    ),
  component: EventsPage,
});
type Event = Awaited<ReturnType<typeof getTrainingEvents>>[number];
export function EventsPage() {
  const user = useCurrentUser(),
    [events, setEvents] = useState<Event[]>(),
    [error, setError] = useState(""),
    [family, setFamily] = useState<Awaited<ReturnType<typeof getEventFamily>>>(),
    [selected, setSelected] = useState<Event>(),
    [month, setMonth] = useState(chicagoDate().slice(0, 7)),
    [day, setDay] = useState(""),
    [view, setView] = useState<"list" | "calendar">("list");
  useEffect(() => {
    let active = true;
    getTrainingEvents()
      .then((r) => {
        if (active) setEvents(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setFamily(undefined);
    if (user)
      getEventFamily()
        .then((r) => {
          if (active) setFamily(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [user?.id]);
  const registrationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) registrationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected?.id]);
  const dates = new Set((events || []).flatMap((e) => e.sessions.map((s) => s.date)));
  const shown = (events || []).filter(
    (e) =>
      view === "list" ||
      e.sessions.some((s) => s.date.startsWith(month) && (!day || s.date === day)),
  );
  const first = new Date(month + "-01T12:00:00Z"),
    count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return (
    <main id="main" className="pb-10">
      <header className="border-b-4 border-maroon bg-ink px-5 py-10 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs tracking-widest text-powder">OKLAHOMA PROSPECTS</p>
          <h1 className="my-3 text-5xl">Camps & Clinics.</h1>
          <p>Learn together. Build your game. Explore upcoming events and register your player.</p>
        </div>
      </header>
      <TrainingNav current="events" />
      <div className="mx-auto grid max-w-5xl gap-6 px-5 py-6">
        {error && (
          <p role="alert" className="text-maroon">
            {error}
          </p>
        )}
        <div className="flex gap-2" aria-label="Event view">
          <Button variant={view === "list" ? "maroon" : "outline"} onClick={() => setView("list")}>
            Upcoming events
          </Button>
          <Button
            variant={view === "calendar" ? "maroon" : "outline"}
            onClick={() => setView("calendar")}
          >
            Calendar
          </Button>
        </div>
        {view === "calendar" && (
          <section
            className="grid gap-3 rounded-2xl border bg-white p-3"
            aria-label="Upcoming events calendar"
          >
            <label>
              Calendar month
              <input
                aria-label="Calendar month"
                className="office-control w-full"
                type="month"
                value={month}
                onChange={(e) => {
                  if (e.target.value) {
                    setMonth(e.target.value);
                    setDay("");
                  }
                }}
              />
            </label>
            <div className="grid grid-cols-7 gap-1 text-center">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <span key={d} className="text-xs">
                  {d}
                </span>
              ))}
              {Array.from({ length: first.getUTCDay() }, (_, i) => (
                <span key={"empty" + i} />
              ))}
              {Array.from({ length: count }, (_, i) => {
                const d = month + "-" + String(i + 1).padStart(2, "0"),
                  has = dates.has(d);
                return (
                  <button
                    key={d}
                    aria-label={`${d}${has ? " — events scheduled" : ""}`}
                    aria-pressed={day === d}
                    disabled={!has}
                    className={`min-h-11 rounded-lg text-sm ${day === d ? "bg-maroon text-white" : has ? "bg-powder font-bold" : "text-muted"}`}
                    onClick={() => setDay(day === d ? "" : d)}
                  >
                    {i + 1}
                    {has && <span className="block text-xs">●</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-xs">
              Highlighted days have events. Select a day to see its camps and clinics. All times are
              Central Time.
            </p>
            {day && (
              <Button variant="outline" onClick={() => setDay("")}>
                Show whole month
              </Button>
            )}
          </section>
        )}
        {!events ? (
          <p role="status">Loading events…</p>
        ) : !shown.length ? (
          <p className="rounded-xl border p-5">
            No upcoming events {view === "calendar" ? "in this selection" : "are published yet"}.
            Check back for camps and clinics.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {shown.map((e) => (
              <article
                key={e.id}
                className="grid content-start gap-3 rounded-2xl border border-line bg-white p-5"
              >
                <p className="text-xs font-semibold uppercase text-maroon">
                  {e.type} · {e.sport}
                </p>
                <h2 className="text-3xl">{e.name}</h2>
                <p className="whitespace-pre-wrap">{e.description}</p>
                <Sessions event={e} />
                <p>{e.location}</p>
                <p>Coaches: {e.coaches.map((c) => c.name).join(", ")}</p>
                <p className="font-semibold">
                  {formatMoney(e.priceCents)} per player · includes all listed sessions
                </p>
                <Button
                  disabled={
                    e.status !== "published" ||
                    e.registrationOpen === false ||
                    e.remainingSeats === 0
                  }
                  onClick={() => setSelected(e)}
                >
                  {e.remainingSeats === 0
                    ? "Event full"
                    : e.status === "published" && e.registrationOpen !== false
                      ? "Register a player"
                      : "Registration closed"}
                </Button>
              </article>
            ))}
          </div>
        )}
        {selected && (
          <section
            className="rounded-2xl border-2 border-maroon bg-white p-5"
            ref={registrationRef}
            aria-label="Event registration"
          >
            <h2 className="text-3xl">Register for {selected.name}</h2>
            {!user ? (
              <p>
                <Link
                  className="inline-flex min-h-11 items-center underline"
                  to="/login"
                  search={{ next: "/events" }}
                >
                  Sign in to register your player
                </Link>
              </p>
            ) : (
              <EventRegistration
                key={selected.id}
                event={selected}
                family={family}
                name={user.displayName || ""}
                email={user.primaryEmail || ""}
              />
            )}
          </section>
        )}
        {family && (
          <section className="grid gap-3">
            <h2 className="text-3xl">Your player registrations</h2>
            {!family.registrations.length ? (
              <p>No confirmed event registrations yet.</p>
            ) : (
              family.registrations.map((r) => (
                <article key={r.id} className="rounded-xl border bg-white p-4">
                  <h3 className="text-xl">{r.title}</h3>
                  <p>
                    {r.player} · {r.status}
                  </p>
                  <Sessions event={r.event} />
                  <p>{r.event.location}</p>
                  <a
                    className="inline-flex min-h-11 items-center underline"
                    href={"/paid?order_id=" + encodeURIComponent(r.orderId)}
                  >
                    Payment and receipt
                  </a>
                </article>
              ))
            )}
          </section>
        )}
      </div>
    </main>
  );
}
function Sessions({ event }: { event: { sessions: Event["sessions"] } }) {
  return (
    <ul className="grid gap-1 text-sm">
      {event.sessions.map((s, i) => (
        <li key={i}>
          {new Date(s.date + "T12:00:00Z").toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}{" "}
          · {formatClockTime(s.start)}–{formatClockTime(s.end)} CT
        </li>
      ))}
    </ul>
  );
}
function EventRegistration({
  event,
  family,
  name,
  email,
}: {
  event: Event;
  family?: Awaited<ReturnType<typeof getEventFamily>>;
  name: string;
  email: string;
}) {
  const [player, setPlayer] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [prepared, setPrepared] = useState<Awaited<ReturnType<typeof startEventCheckout>>>();
  const request = useRef(crypto.randomUUID());
  return (
    <div className="mt-4 grid gap-4">
      <Sessions event={event} />
      <p>
        {event.location} · {formatMoney(event.priceCents)} total per player
      </p>
      <p className="whitespace-pre-wrap">{event.policy}</p>
      {!family ? (
        <p>Loading linked players…</p>
      ) : !family.players.length ? (
        <p>
          <a className="inline-flex min-h-11 items-center underline" href="/family">
            Add a player in your family account
          </a>
          , then return to register.
        </p>
      ) : (
        <>
          <label>
            Player
            <select
              className="office-control w-full"
              disabled={!!prepared}
              value={player}
              onChange={(e) => {
                setPlayer(e.target.value);
                request.current = crypto.randomUUID();
              }}
            >
              <option value="">Choose your player</option>
              {family.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex gap-3">
            <input
              type="checkbox"
              disabled={!!prepared}
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I accept the event registration and cancellation policy shown above. Registration is
              confirmed only after successful payment.
            </span>
          </label>
          <p className="text-sm">
            Checkout lasts ten minutes. Do not open another checkout for this player while payment
            is pending.
          </p>
          <Button
            disabled={!player || !consent || busy || !!prepared}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setPrepared(
                  await startEventCheckout({
                    data: {
                      eventId: event.id,
                      athleteId: player,
                      revision: event.revision,
                      requestId: request.current,
                      consent: true,
                    },
                  }),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Preparing checkout…" : "Continue to secure payment"}
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {prepared?.square && (
        <SquareCard
          config={prepared.square}
          amountCents={prepared.totalCents}
          expiresAt={prepared.holdUntil}
          name={name}
          email={email}
          onToken={async (sourceId, attemptId) => {
            const r = await submitSquarePayment({
              data: { orderId: prepared.orderId, sourceId, attemptId },
            });
            if (r.url) window.location.assign(r.url);
            return r;
          }}
        />
      )}
    </div>
  );
}
