import { createFileRoute, Link } from "@tanstack/react-router";
import { ContinueIn } from "@/components/continue-in";
import { TryoutForm } from "@/components/inquiry-form";
import { PageHero } from "@/components/page-hero";
import { TryoutSchedule } from "@/components/tryout-schedule";
import { Button } from "@/components/ui/button";
import { CLUB, TRYOUT_AGES } from "@/lib/club";

export const Route = createFileRoute("/tryouts")({ component: TryoutsPage });

function TryoutsPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow="Team opportunities"
        title="Come earn"
        accent="your spot."
        copy="Free Spring 2027 evaluations in Broken Arrow. No payment to register. Cage-only families can skip this page and just book a lane."
        actions={
          <>
            <ContinueIn dest="tryouts">Register for free</ContinueIn>
            <Button asChild variant="outline">
              <a href="#team-inquiry">Other ages · inquiry</a>
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
          Central.
        </p>
        <div className="mt-6">
          <TryoutSchedule />
        </div>
        <ContinueIn dest="tryouts" className="mt-6 w-full">
          View sessions & register
        </ContinueIn>
        <p className="mt-4 text-sm text-muted">
          Just need a cage?{" "}
          <Link to="/book" className="font-semibold text-ink">
            Reserve an hour
          </Link>{" "}
          — you do not have to try out.
        </p>
      </section>

      <section id="team-inquiry" className="bg-paper-2 py-10">
        <div className="mx-auto grid max-w-3xl gap-8 px-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              General team inquiry
            </p>
            <h2 className="mt-2 text-3xl">Tell us about your player.</h2>
            <p className="mt-2 mb-6 text-muted">
              For other openings, ages, or seasons. Prospects will contact you
              with the next step.
            </p>
            <TryoutForm />
            <p className="mt-4 text-xs text-muted">
              Your information is used to respond to this inquiry via email.
            </p>
          </div>
          <aside className="rounded-2xl bg-ink p-5 text-fg-inverse">
            <h2 className="text-3xl">Let’s talk baseball.</h2>
            <p className="mt-3 text-fg-soft">
              Questions about the right age group or evaluation?
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
              The office sends a Square checkout for that exact team fee — never a leftover cage link.
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
