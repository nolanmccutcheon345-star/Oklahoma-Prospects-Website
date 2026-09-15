import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ClipboardCheck,
  GraduationCap,
  LogIn,
  MapPin,
  Phone,
  Shield,
  Shirt,
  Smartphone,
} from "lucide-react";
import { ContinueIn } from "@/components/continue-in";
import { GoogleReview } from "@/components/google-review";
import { HoursChip } from "@/components/hours-chip";
import { PageHero } from "@/components/page-hero";
import { PeopleCards } from "@/components/people";
import { VisitChecklist } from "@/components/visit-checklist";
import { Button } from "@/components/ui/button";
import { CLUB, LINKS } from "@/lib/club";

export const Route = createFileRoute("/more")({ component: VisitPage });

function VisitPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow="Same club · one visit"
        title="Arrive ready."
        accent="Then train."
        copy="Check-in, waiver, uniforms, and member tools stay inside Prospects — not a stack of random links."
        image="/brand/facility.jpg"
      />
      <div className="mx-auto w-full max-w-3xl px-5 py-8">
      <div className="mt-6 rounded-2xl bg-ink p-5 text-fg-inverse">
        <HoursChip />
        <p className="mt-3 font-display text-2xl">
          {CLUB.addressLine1}
          <br />
          {CLUB.addressLine2}
        </p>
        <p className="mt-2 text-sm text-fg-soft">
          {CLUB.hoursWeekday}
          <br />
          {CLUB.hoursWeekend}
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button asChild>
            <a href={`tel:${CLUB.phoneTel}`}>Call {CLUB.phoneDisplay}</a>
          </Button>
          <Button asChild variant="outline">
            <a href={LINKS.maps} target="_blank" rel="noreferrer">
              Directions
            </a>
          </Button>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-2xl">First visit</h2>
        <p className="mt-2 mb-4 text-sm text-muted">
          Four steps. Then you train.
        </p>
        <VisitChecklist />
      </section>

      <section className="mt-8">
        <h2 className="text-2xl">Arriving today</h2>
        <div className="mt-4 grid gap-2">
          <ContinueIn dest="checkin" plain>
            <Row icon={ClipboardCheck} title="Athlete check-in" body="Start your visit" />
          </ContinueIn>
          <Link to="/waiver" className="no-underline">
            <Row icon={Shield} title="Facility waiver" body="Required before you train" />
          </Link>
          <ContinueIn dest="uniform" plain>
            <Row icon={Shirt} title="Uniform sizing" body="Jersey, pants, and hat" />
          </ContinueIn>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl">Your Prospects account</h2>
        <div className="mt-4 grid gap-2">
          <Link to="/account" className="no-underline">
            <Row icon={LogIn} title="Member sign-in" body="Development plans, drills, and tracking" />
          </Link>
          <ContinueIn dest="coaches" plain>
            <Row icon={GraduationCap} title="Talk to a coach" body="Lessons, teams, evaluations" />
          </ContinueIn>
          <ContinueIn dest="memberships" plain>
            <Row icon={ClipboardCheck} title="Membership balance" body="Plans and remaining visits" />
          </ContinueIn>
          <Link to="/visits" className="no-underline">
            <Row icon={MapPin} title="Saved reminders" body="Intent on this phone — not a paid reservation" />
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl">Need a person?</h2>
        <p className="mt-2 text-sm text-muted">
          After you book. The desk for cages. Coach Steve after a paid lesson.
        </p>
        <div className="mt-4">
          <PeopleCards />
        </div>
      </section>

      <section className="mt-8 rounded-2xl bg-paper-2 p-5 shadow-border">
        <div className="flex gap-3">
          <Smartphone className="mt-0.5 size-5 text-maroon" />
          <div>
            <h2 className="font-display text-2xl uppercase">
              Put Prospects on the home screen
            </h2>
            <p className="mt-2 text-sm text-muted">
              iPhone: Share → Add to Home Screen. Android: menu → Install app.
              Booking, tryouts, and check-in in one icon.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <GoogleReview />
      </section>

      <div className="mt-6 flex items-center gap-3 text-sm">
        <Phone className="size-4 text-maroon" />
        <a href={`tel:${CLUB.phoneTel}`} className="font-semibold text-ink">
          {CLUB.phoneDisplay}
        </a>
        <span className="text-muted">Facility</span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-sm">
        <Phone className="size-4 text-maroon" />
        <a href={`tel:${CLUB.coachSteveTel}`} className="font-semibold text-ink">
          {CLUB.coachStevePhone}
        </a>
        <span className="text-muted">{CLUB.coachSteve} · development</span>
      </div>
      </div>
    </main>
  );
}

function Row({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Phone;
  title: string;
  body: string;
}) {
  return (
    <span className="flex min-h-16 items-center gap-4 rounded-xl bg-paper-2 px-4 py-3 shadow-border">
      <span className="flex size-10 items-center justify-center rounded-md bg-paper text-maroon">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block text-sm text-muted">{body}</span>
      </span>
    </span>
  );
}
