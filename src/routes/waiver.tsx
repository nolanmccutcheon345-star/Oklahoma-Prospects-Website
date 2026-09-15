import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { CLUB } from "@/lib/club";

export const Route = createFileRoute("/waiver")({ component: WaiverPage });

function WaiverPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow="Required before you train"
        title="One waiver."
        accent="One year."
        copy="Parent or guardian signs for athletes under 18. This is the official Oklahoma Prospects waiver — on this club, not a third-party form."
        actions={
          <Button asChild variant="outline">
            <a href={`tel:${CLUB.phoneTel}`}>Call the desk</a>
          </Button>
        }
      />
      <section className="mx-auto max-w-3xl px-5 py-10">
        <form
          className="grid gap-4"
          method="POST"
          action="https://prospectsbaseball.club/"
        >
          <input type="hidden" name="form-name" value="annual-waiver" />
          <label className="grid gap-1 text-sm font-semibold">
            Responsible adult name
            <input
              name="adult-name"
              autoComplete="name"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Adult email
            <input
              name="adult-email"
              type="email"
              autoComplete="email"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Adult mobile
            <input
              name="adult-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Athlete name
            <input
              name="athlete-name"
              autoComplete="name"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Participant
            <select
              name="participant-type"
              defaultValue="minor"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            >
              <option value="adult">Adult (18 or older)</option>
              <option value="minor">Minor (under 18)</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Emergency contact
            <input
              name="emergency-name"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Emergency phone
            <input
              name="emergency-phone"
              type="tel"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Electronic signature (full legal name)
            <input
              name="signer-name"
              autoComplete="name"
              required
              className="min-h-11 rounded-lg border border-line bg-paper px-3"
            />
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              name="waiver-accepted"
              type="checkbox"
              required
              className="mt-1 size-5"
            />
            <span>
              I have read the Facility Waiver & Release, understand sports
              training involves risk of injury, and I am legally authorized to
              sign.
            </span>
          </label>
          <Button type="submit">Sign the annual waiver</Button>
        </form>
        <p className="mt-6 text-sm text-muted">
          Full legal text lives on the club site. If anything looks off, stop
          and call {CLUB.phoneDisplay}.
        </p>
        <Button asChild variant="outlineDark" className="mt-6">
          <Link to="/more">Back to visit tools</Link>
        </Button>
      </section>
    </main>
  );
}
