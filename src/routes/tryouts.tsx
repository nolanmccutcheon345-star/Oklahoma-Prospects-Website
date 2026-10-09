import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ContactForm, TryoutForm } from "@/components/inquiry-form";
import { PageHero } from "@/components/page-hero";
import { TryoutSchedule } from "@/components/tryout-schedule";
import { Button } from "@/components/ui/button";
import { CLUB } from "@/lib/club";

import { getPublicTryoutEvents } from "@/lib/tryout-events-api";

type TryoutSearch = { event?: string; age?: string; sport?: "Baseball" | "Softball" };

export const Route = createFileRoute("/tryouts")({
  head: () =>
    pageHead(
      "/tryouts",
      "Request a Tryout",
      "Request a free individual tryout for baseball or softball at any age group. Private appointments are arranged with a coach.",
      false,
    ),
  loader: () => getPublicTryoutEvents(),
  validateSearch: (search: Record<string, unknown>): TryoutSearch => ({
    event: typeof search.event === "string" ? search.event : undefined,
    age: typeof search.age === "string" ? search.age : undefined,
    sport: search.sport === "Softball" || search.sport === "Baseball" ? search.sport : undefined,
  }),
  component: TryoutsPage,
});

function TryoutsPage() {
  const { age, sport, event } = Route.useSearch();
  const events = Route.useLoaderData();
  return (
    <main id="main">
      <PageHero
        eyebrow="Team opportunities"
        title="Tryouts."
        accent="Find your team."
        copy="Explore upcoming baseball and softball tryouts or request an individual evaluation. Our staff will help you find the right next step."
        actions={
          <>
            <Button asChild>
              <a href="#register">Request a tryout</a>
            </Button>
            <Button asChild variant="outline">
              <a href="#team-inquiry">Questions</a>
            </Button>
          </>
        }
      />

      <section id="schedule" className="scroll-mt-24 bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            Baseball & softball
          </p>
          <h2 className="mt-2 text-3xl">Upcoming tryouts</h2>
          <p className="mt-3 mb-6 text-muted">
            Published group evaluation times for either sport appear here. You can submit one free
            request below for any age group even when a matching group date is not posted.
            Individual appointments are arranged with a coach; submitting does not reserve a time or
            roster place.
          </p>
          <TryoutSchedule events={events} />
          <p className="mt-5 text-sm text-muted">
            Looking for independent training instead?{" "}
            <Link to="/book" className="font-semibold underline">
              Book a cage
            </Link>
            .
          </p>
        </div>
      </section>

      <section id="register" className="scroll-mt-24 bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            Tryout request
          </p>
          <h2 className="mt-2 text-3xl">Tell us about your player.</h2>
          <p className="mt-2 mb-6 text-muted">
            Choose your sport and age group, then share your player’s information. Select a
            scheduled tryout or request an individual evaluation.
          </p>
          <TryoutForm
            key={`${sport ?? "Baseball"}:${age ?? ""}:${event ?? ""}`}
            initialEventId={event}
            intent="register"
            initialAge={age}
            initialSport={sport}
            publishedEvents={events}
          />
        </div>
      </section>

      <section id="team-inquiry" className="py-10">
        <div className="mx-auto grid max-w-3xl gap-8 px-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              Tryout questions
            </p>
            <h2 className="mt-2 text-3xl">Have a tryout question?</h2>
            <p className="mt-2 mb-6 text-muted">
              For general team or season questions. Individual tryout requests for all ages use the
              form above.
            </p>
            <details className="rounded-xl border p-4">
              <summary className="min-h-11 cursor-pointer font-semibold">Ask a Question</summary>
              <div className="mt-4">
                <ContactForm />
              </div>
            </details>
            <p className="mt-4 text-xs text-muted">
              Your information is used to respond to this inquiry via email.
            </p>
          </div>
          <aside className="rounded-2xl bg-ink p-5 text-fg-inverse">
            <h2 className="text-3xl">Questions about tryouts?</h2>
            <p className="mt-3 text-fg-soft">
              Baseball and softball. Ask about the right age group or evaluation.
            </p>
            <Button asChild className="mt-5 w-full">
              <Link to="/contact">Contact</Link>
            </Button>
            <p className="mt-5 text-sm text-fg-soft">
              {CLUB.addressLine1}
              <br />
              {CLUB.addressLine2}
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
