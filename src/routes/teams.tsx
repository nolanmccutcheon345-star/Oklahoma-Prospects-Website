import {pageHead} from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ContinueIn } from "@/components/continue-in";
import { PageHero } from "@/components/page-hero";
import { TryoutSchedule } from "@/components/tryout-schedule";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getProfile, type ClubRole } from "@/lib/club-data";
import { AGE_GROUPS } from "@/lib/club";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teams")({head:()=>pageHead("/teams","Teams & Spring 2027 Tryouts","Free November 14\u201315, 2026 evaluations in Broken Arrow. Other ages and softball: send a team inquiry.",false), component: TeamsPage });

function deskFor(role: ClubRole | null) {
  if (role === "admin") return { to: "/office" as const, label: "Front office" };
  if (role === "coach") return { to: "/coach" as const, label: "Coach desk" };
  return { to: "/family" as const, label: "Family desk" };
}

function TeamsPage() {
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
  }, [user]);

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
      <TeamsPublic />
    </main>
  );
}

function TeamsPublic() {
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

      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="text-3xl">Spring 2027 evaluations</h2>
        <p className="mt-2 mb-6 text-muted">
          Free. No payment to register. Check in 15 minutes early.
        </p>
        <TryoutSchedule /><p className="mt-4">Other ages & softball: <Link to="/tryouts" hash="team-inquiry" className="underline">send a team inquiry</Link>.</p>
        <Button asChild className="mt-6 w-full">
          <Link to="/tryouts" hash="register">
            Register for free
          </Link>
        </Button>
      </section>

      <section className="bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">Start with your age group</h2>
          <p className="mt-2 text-muted">
            Team openings and rosters are confirmed directly with Prospects.
            Fees are shared after you evaluate — not published as a public price list.
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
                  age === group
                    ? "bg-maroon text-fg-inverse"
                    : "bg-paper text-ink shadow-border",
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
                <Link to="/tryouts" hash="register">
                  {age ? `Register ${age}` : "Register for tryouts"}
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
