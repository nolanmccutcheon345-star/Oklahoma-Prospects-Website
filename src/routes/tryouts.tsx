import { createFileRoute, Link } from "@tanstack/react-router";
import { ContactForm, TryoutForm } from "@/components/inquiry-form";
import { PageHero } from "@/components/page-hero";
import { TryoutSchedule } from "@/components/tryout-schedule";
import { Button } from "@/components/ui/button";
import { CLUB, TRYOUT_AGES } from "@/lib/club";

type TryoutSearch = { age?: string };

export const Route = createFileRoute("/tryouts")({
  validateSearch: (search: Record<string, unknown>): TryoutSearch => ({
    age: typeof search.age === "string" ? search.age : undefined,
  }),
  component: TryoutsPage,
});

function TryoutsPage() {
  const { age } = Route.useSearch();
  return (
    <main id="main">
      <PageHero
        eyebrow="Team opportunities"
        title="Free Spring 2027 evaluations."
        accent="November 14–15."
        copy="Baseball and softball in Broken Arrow. No payment to register. Saturday morning sessions use special hours — doors open at 8:45 AM for 5U."
        actions={
          <>
            <Button asChild>
              <a href="#register">Register for free</a>
            </Button>
            <Button asChild variant="outline">
              <a href="#team-inquiry">Other ages</a>
            </Button>
          </>
        }
      />

      <section className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          Free evaluations · Spring 2027
        </p>
        <h2 className="mt-2 text-4xl">November 14–15, 2026</h2>
        <p className="mt-3 text-muted">
          {TRYOUT_AGES.join(", ")}. Check in 15 minutes early. Times are
          Central. Regular weekend cage hours (1–8 PM) still apply after evaluations.
          Other ages: send an inquiry below.
        </p>
        <div className="mt-6">
          <TryoutSchedule />
        </div>
        <Button asChild className="mt-6 w-full">
          <a href="#register">Register for a session</a>
        </Button>
        <p className="mt-4 text-sm text-muted">
          Just need a cage?{" "}
          <Link to="/book" className="font-semibold text-ink">
            Reserve an hour
          </Link>
          .
        </p>
      </section>

      <section id="register" className="bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            Register
          </p>
          <h2 className="mt-2 text-3xl">Put your player on the November list.</h2>
          <p className="mt-2 mb-6 text-muted">
            Free. Pick the session. This opens your email so Prospects receives
            the registration.
          </p>
          <TryoutForm intent="register" initialAge={age} />
        </div>
      </section>

      <section id="team-inquiry" className="py-10">
        <div className="mx-auto grid max-w-3xl gap-8 px-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              Other ages or seasons
            </p>
            <h2 className="mt-2 text-3xl">Tell us about your player.</h2>
            <p className="mt-2 mb-6 text-muted">
              For openings outside November 14–15. Prospects will contact you
              with the next step.
            </p>
            <ContactForm />
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
              <a href={`tel:${CLUB.phoneTel}`}>Call / text Prospects</a>
            </Button>
            <p className="mt-5 text-sm text-fg-soft">
              {CLUB.addressLine1}
              <br />
              {CLUB.addressLine2}
            </p>
            <div className="my-5 h-px bg-fg-inverse/20" />
            <h3 className="text-xl">Team payments</h3>
            <p className="mt-2 text-sm text-fg-soft">
              Only pay after the office confirms the team, fee, and amount. Put
              the player’s name and age group on the payment. Debit or credit only.
            </p>
            <div className="mt-4">
              <Button asChild variant="outline" size="sm">
                <Link to="/contact">Ask the office for a team invoice</Link>
              </Button>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
