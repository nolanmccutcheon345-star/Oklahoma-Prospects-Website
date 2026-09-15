import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ContinueIn } from "@/components/continue-in";
import { PageHero } from "@/components/page-hero";
import { TryoutSchedule } from "@/components/tryout-schedule";
import { Button } from "@/components/ui/button";
import { AGE_GROUPS } from "@/lib/club";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teams")({ component: TeamsPage });

function TeamsPage() {
  const [age, setAge] = useState<(typeof AGE_GROUPS)[number] | null>(null);

  return (
    <main id="main">
      <PageHero
        eyebrow="Oklahoma Prospects teams"
        title="Find your team."
        accent="Bring your game."
        copy="Competitive baseball, purposeful development, and a place to belong. Cage-only families can skip this page."
        image="/brand/team.jpg"
        actions={
          <>
            <Button asChild>
              <Link to="/tryouts">View tryout schedule</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/family">Family app</Link>
            </Button>
          </>
        }
      />

      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="text-3xl">Spring 2027 evaluations</h2>
        <p className="mt-2 mb-6 text-muted">
          Free. No payment to register. Check in 15 minutes early.
        </p>
        <TryoutSchedule />
        <ContinueIn dest="tryouts" className="mt-6 w-full">
          Register for free
        </ContinueIn>
      </section>

      <section className="bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">Start with your age group</h2>
          <p className="mt-2 text-muted">
            Team openings and rosters are confirmed directly with Prospects. We
            do not publish fees or invented rosters here.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {AGE_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
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
                <Link to="/tryouts">Ask about this team</Link>
              </Button>
              <ContinueIn dest="coaches" variant="outlineDark">
                Contact a coach
              </ContinueIn>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
