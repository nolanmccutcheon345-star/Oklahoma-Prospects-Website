import { PublicTeamRoster } from "@/components/public-team-roster";
import {pageHead} from "@/lib/seo";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ContinueIn } from "@/components/continue-in";
import { PageHero } from "@/components/page-hero";
import { TryoutSchedule } from "@/components/tryout-schedule";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getProfile, type ClubRole } from "@/lib/club-data";
import { AGE_GROUPS, SOFTBALL_AGES } from "@/lib/club";
import { cn } from "@/lib/utils";
import { getPublicTryoutEvents } from "@/lib/tryout-events-api";

export const Route = createFileRoute("/teams")({
  head: () =>
    pageHead(
      "/teams",
      "Teams & Spring 2027 Tryouts",
      "Oklahoma Prospects baseball and softball teams in Broken Arrow. Free individual tryout requests at every age; group event dates appear when published.",
      false,
    ),
  loader: () => getPublicTryoutEvents(),
  component: TeamsPage,
});

function deskFor(role: ClubRole | null) {
  if (role === "admin") return { to: "/office" as const, label: "Front office" };
  if (role === "coach") return { to: "/coach" as const, label: "Coach desk" };
  return { to: "/family" as const, label: "Family desk" };
}

function TeamsPage() {
  const pathname=useRouterState({select:s=>s.location.pathname});
  return pathname !== "/teams" && pathname !== "/teams/" ? <Outlet/> : <TeamsOverview/>;
}
function TeamsOverview() {
  const { user, isPending } = useCurrentUserState();
  const [profileRole, setProfileRole] = useState<ClubRole | null>(null);
  const [ready, setReady] = useState(!user);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setProfileRole(null);
      setReady(true);
      return;
    }
    setReady(false);
    getProfile()
      .then((row) => {
        if (cancelled) return;
        setProfileRole(row?.role ?? "parent");
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setProfileRole("parent");
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const desk = deskFor(profileRole);

  return (
    <main id="main">
      {user && !isPending ? (
        <section className="border-b border-fg-inverse/10 bg-navy px-5 py-6 text-fg-inverse">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
              Signed in
            </p>
            <h2 className="mt-2 text-3xl italic">Your team desk</h2>
            <p className="mt-2 text-sm text-fg-soft">
              {ready
                ? "Rosters, fees, uniforms, and game day live on your desk. Public tryouts stay on this page."
                : "Loading your desk…"}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild>
                <Link to={desk.to}>{desk.label}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/account">Training desk</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}
      <nav aria-label="Team sports" className="mx-auto grid max-w-3xl grid-cols-2 gap-3 px-5 py-4">
        <Button asChild variant="outlineDark">
          <a href="#baseball">Baseball</a>
        </Button>
        <Button asChild variant="outlineDark">
          <a href="#softball">Softball</a>
        </Button>
      </nav>
      <TeamsPublic />
    <PublicTeamRoster/>
      </main>
  );
}

function TeamsPublic() {
  const events = Route.useLoaderData();
  const hasBaseballDates = events.some((event) => event.sport === "Baseball");
  const hasSoftballDates = events.some((event) => event.sport === "Softball");
  const [age, setAge] = useState<(typeof AGE_GROUPS)[number] | null>(null);

  return (
    <>
      <PageHero
        eyebrow="Oklahoma Prospects teams"
        title="Find your team."
        accent="Bring your game."
        copy="Competitive baseball and softball, purposeful development, and a place to belong. Free Spring 2027 evaluations in Broken Arrow."
        image="/brand/team.jpg"
        actions={
          <>
            <Button asChild>
              <Link to="/tryouts" hash="register">
                Register for tryouts
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/contact">Talk to a coach</Link>
            </Button>
          </>
        }
      />

      <section id="softball" className="scroll-mt-24 bg-navy py-10 text-fg-inverse">
        <div className="mx-auto max-w-3xl px-5">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Oklahoma Prospects softball
          </p>
          <h2 className="mt-2 text-4xl">Teams forming: {SOFTBALL_AGES.join(" · ")}</h2>
          <p className="mt-3 text-fg-soft">
            Sarah Blankenship, Softball Program Coordinator, is adding four softball age groups.
            Register your interest below.{" "}
            {hasSoftballDates
              ? "Published softball group event dates are listed below; Prospects will confirm any enrollment."
              : "No softball group date is posted yet. Prospects will coordinate private requests with families."}
          </p>
          <div className="mt-5 text-ink">
            <TryoutSchedule events={events} sport="Softball" />
          </div>
          <p className="mt-4 font-semibold">14U B Softball · Head Coach Rusty</p>
          <p className="mt-2 text-fg-soft">
            Rusty also offers softball hitting and defense instruction.{" "}
            <Link to="/softball" className="underline">
              Meet Coach Rusty and ask about lessons.
            </Link>
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {SOFTBALL_AGES.map((group) => (
              <Button asChild key={group}>
                <Link to="/tryouts" search={{ sport: "Softball", age: group }} hash="register">
                  {group} softball tryout signup
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section id="baseball" className="mx-auto max-w-3xl scroll-mt-24 px-5 py-10">
        <h2 className="text-3xl">Spring 2027 baseball evaluations</h2>
        <p className="mt-2 mb-6 text-muted">
          {hasBaseballDates
            ? "Free. No payment to register. Check in 15 minutes before your confirmed group event."
            : "Free individual evaluation requests. A coach will confirm any private appointment."}
        </p>
        <TryoutSchedule events={events} sport="Baseball" />
        <p className="mt-4">
          Do not see a group event for your age?{" "}
          <Link to="/tryouts" search={{ sport: "Baseball" }} hash="register" className="underline">
            Request an individual tryout
          </Link>
          .
        </p>
        <Button asChild className="mt-6 w-full">
          <Link to="/tryouts" search={{ sport: "Baseball" }} hash="register">
            Register for baseball
          </Link>
        </Button>
      </section>

      <section className="bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">Baseball: start with your age group</h2>
          <p className="mt-2 text-muted">
            Team openings and rosters are confirmed directly with Prospects. Fees are shared after
            you evaluate — not published as a public price list.
          </p>
          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Age groups">
            {AGE_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={age === group}
                onClick={() => setAge(group)}
                className={cn(
                  "min-h-12 min-w-16 rounded-md px-4 text-sm font-bold transition-colors duration-150",
                  age === group ? "bg-maroon text-fg-inverse" : "bg-paper text-ink shadow-border",
                )}
              >
                {group}
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-2xl bg-paper p-5 shadow-border">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              Your next step
            </p>
            <h3 className="mt-1 text-3xl">
              {age ? `Ask about ${age}` : "Find your fit with Prospects."}
            </h3>
            <p className="mt-3 text-sm text-muted">
              {age
                ? `Ask about ${age} openings, the right evaluation, and what happens after. Availability varies by season.`
                : "Select an age group to ask about the right team, openings, and evaluation options."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link
                  to="/tryouts"
                  search={{ sport: "Baseball", age: age ?? undefined }}
                  hash="register"
                >
                  {age ? `Request ${age} tryout` : "Request a tryout"}
                </Link>
              </Button>
              <ContinueIn dest="coaches" variant="outlineDark">
                Contact a coach
              </ContinueIn>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
