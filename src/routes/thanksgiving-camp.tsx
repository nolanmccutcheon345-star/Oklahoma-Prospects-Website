import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, Clock3, MapPin, Phone } from "lucide-react";
import { pageHead } from "@/lib/seo";
import { THANKSGIVING_CAMP, thanksgivingGroup } from "@/lib/thanksgiving-camp";
import { getThanksgivingCamp } from "@/lib/thanksgiving-camp-api";
import { getEventFamily } from "@/lib/training-events-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { EventRegistration } from "./events";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/thanksgiving-camp")({
  head: () =>
    pageHead(
      "/thanksgiving-camp",
      "Thanksgiving Camp · Nov. 23–25",
      "Baseball and softball Thanksgiving Camp, November 23–25, 2026. Ages 6–14U. $45 per day or $120 for all three days at Prospects Sports Academy in Broken Arrow.",
      false,
    ),
  component: ThanksgivingCampPage,
});
export function ThanksgivingCampPage() {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  const [camp, setCamp] = useState<Awaited<ReturnType<typeof getThanksgivingCamp>>>();
  const [family, setFamily] = useState<Awaited<ReturnType<typeof getEventFamily>>>();
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getThanksgivingCamp()
      .then((value) => {
        if (active) setCamp(value);
      })
      .catch(() => {
        if (active)
          setError("Registration availability could not be loaded. Please retry or call Steve.");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setFamily(undefined);
    if (userId)
      getEventFamily()
        .then((value) => {
          if (active) setFamily(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [userId]);
  const event = camp?.events.find((e) => e.id === selected);
  return (
    <main id="main">
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 py-12 md:grid-cols-[1.4fr_1fr] md:py-16">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-powder uppercase">
              Prospects Sports Academy · Baseball & softball
            </p>
            <h1 className="mt-4 text-5xl leading-none sm:text-7xl">
              Thanksgiving
              <br />
              <span className="text-powder">Camp.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-fg-soft">
              Three days to build skills and train with Prospects coaches.
            </p>
            <p className="mt-5 flex items-center gap-3 text-xl font-semibold">
              <CalendarDays aria-hidden="true" />
              November 23–25, 2026
            </p>
            <p className="mt-2 text-fg-soft">Monday–Wednesday · Broken Arrow, Oklahoma</p>
            <Button asChild className="mt-7">
              <a href="#register">Choose your session</a>
            </Button>
          </div>
          <div className="self-center rounded-2xl border border-white/20 bg-white/5 p-6">
            <p className="text-sm font-semibold tracking-wide text-powder uppercase">
              One player · Your choice of days
            </p>
            <p className="mt-3 text-5xl font-bold">
              $45 <span className="text-base font-normal">per day</span>
            </p>
            <p className="mt-3 text-2xl font-semibold">$120 for all 3 days</p>
            <p className="mt-4 border-t border-white/20 pt-4 text-sm text-fg-soft">
              Spots are limited. Indoor training in our 25,000 sq ft facility, with up to 150 kids
              total each day.
            </p>
          </div>
        </div>
        <div className="h-1 bg-maroon" />
      </section>
      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10">
        <section aria-labelledby="sessions-title">
          <p className="text-xs font-bold tracking-[0.15em] text-maroon uppercase">
            Find your session
          </p>
          <h2 id="sessions-title" className="mt-2 text-3xl">
            Two age groups. Both sports.
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {THANKSGIVING_CAMP.groups.map((g) => (
              <article key={g.id} className="rounded-2xl border border-line bg-paper-2 p-6">
                <h3 className="text-3xl">Ages {g.label}</h3>
                <p className="mt-3 flex items-center gap-2 text-lg font-semibold">
                  <Clock3 aria-hidden="true" className="size-5" />
                  {g.time}
                </p>
                <p className="mt-2 text-sm text-muted">Nov. 23, 24 & 25 · Central Time</p>
              </article>
            ))}
          </div>
        </section>
        <section className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-3xl">Work on your game.</h2>
            <p className="mt-3 text-muted">
              <strong>Baseball:</strong> Hitting, fielding, pitching, baserunning and games.
            </p>
            <p className="mt-3 text-muted">
              <strong>Softball:</strong> Hitting and defense only. No pitching.
            </p>
            <h3 className="mt-6 text-xl">Your camp coaches</h3>
            <p className="mt-2">{THANKSGIVING_CAMP.coaches.join(" · ")}</p>
          </div>
          <div className="rounded-2xl border border-line p-6">
            <h2 className="flex items-center gap-2 text-2xl">
              <MapPin aria-hidden="true" />
              Where to go
            </h2>
            <p className="mt-3 font-semibold">Prospects Sports Academy</p>
            <p>
              3804 S. Elm Pl., Suite A<br />
              Broken Arrow, OK 74011
            </p>
            <p className="mt-5 flex items-center gap-2">
              <Phone aria-hidden="true" className="size-4" />
              <a className="underline" href="tel:+19187602719">
                Steve: (918) 760-2719
              </a>
            </p>
            <p className="mt-2">
              <a className="underline" href="tel:+19189228114">
                Facility: (918) 922-8114
              </a>
            </p>
          </div>
        </section>
        <section
          id="announcements"
          className="scroll-mt-24 rounded-2xl border-l-4 border-maroon bg-paper-2 p-6"
        >
          <h2 className="text-3xl">Camp announcements</h2>
          <p className="mt-3">
            Check this page for camp times, what to bring and any changes. What-to-bring
            instructions have not been posted yet.
          </p>
          {camp?.events.map((e) => (
            <div key={e.id} className="mt-4">
              <h3 className="font-semibold">Ages {thanksgivingGroup(e.id)?.label}</h3>
              <p className="mt-1 whitespace-pre-wrap">{e.description}</p>
              {e.operationalSessions.map((s) => (
                <p key={s.sessionKey} className="mt-1 text-sm">
                  {s.date} · {s.start}–{s.end} Central Time
                  {s.status === "cancelled" ? " · Session cancelled" : ""}
                  {s.location !== THANKSGIVING_CAMP.location ? ` · ${s.location}` : ""}
                </p>
              ))}
            </div>
          ))}
        </section>
        <section
          id="register"
          className="scroll-mt-24 rounded-2xl border border-line bg-white p-5 sm:p-8"
          aria-labelledby="registration-title"
        >
          <p className="text-xs font-bold tracking-[0.15em] text-maroon uppercase">Camp signup</p>
          <h2 id="registration-title" className="mt-2 text-3xl">
            Register your player.
          </h2>
          <p className="mt-3 text-muted">
            Choose an age group, then all three days or individual days. Payment is by card through
            the academy’s existing Square checkout. Your place is confirmed only after successful
            payment.
          </p>
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-paper-2 p-4">
              {error}
            </p>
          )}
          {!camp && !error && (
            <p role="status" className="mt-5">
              Checking registration availability…
            </p>
          )}
          {camp && (!camp.paymentsAvailable || !camp.events.some((e) => e.registrationOpen)) ? (
            <p role="status" className="mt-5 rounded-xl bg-paper-2 p-4">
              Online registration is not open at this time. Please contact Steve at{" "}
              <a href="tel:+19187602719" className="underline">
                (918) 760-2719
              </a>{" "}
              for the latest camp availability. This page has not reserved a place or taken payment.
            </p>
          ) : (
            camp && (
              <>
                <fieldset disabled={checkoutStarted} className="mt-5 grid gap-3 sm:grid-cols-2">
                  <legend className="mb-2 font-semibold">Player age group</legend>
                  {THANKSGIVING_CAMP.groups.map((g) => {
                    const current = camp.events.find((e) => e.id === g.id);
                    return (
                      <label
                        key={g.id}
                        className="flex min-h-16 items-center gap-3 rounded-xl border p-4"
                      >
                        <input
                          type="radio"
                          name="ageGroup"
                          value={g.id}
                          checked={selected === g.id}
                          disabled={!current?.registrationOpen}
                          onChange={() => {
                            setSelected(g.id);
                            setError("");
                          }}
                        />
                        <span>
                          Ages {g.label} · {g.time}
                          {!current?.registrationOpen ? " · Unavailable" : ""}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
                {event && (
                  <div className="mt-5" key={event.id}>
                    {isPending ? (
                      <p role="status">Loading your account…</p>
                    ) : !user ? (
                      <p>
                        <Link
                          className="inline-flex min-h-11 items-center font-semibold underline"
                          to="/login"
                          search={{ next: "/thanksgiving-camp#register" }}
                        >
                          Sign in or create a parent account to register
                        </Link>
                      </p>
                    ) : (
                      <EventRegistration
                        onCheckoutPrepared={() => setCheckoutStarted(true)}
                        key={event.id + user.id}
                        event={event}
                        family={family}
                        name={user.displayName || ""}
                        email={user.primaryEmail || ""}
                      />
                    )}
                  </div>
                )}
              </>
            )
          )}
          <p className="mt-5 text-sm text-muted">
            Registration details are available only to your household and authorized academy staff.{" "}
            <Link to="/privacy" className="underline">
              Privacy information
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
