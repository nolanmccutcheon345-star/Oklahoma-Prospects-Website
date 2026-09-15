import {pageHead} from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { ContactForm } from "@/components/inquiry-form";
import { HoursChip } from "@/components/hours-chip";
import { PageHero } from "@/components/page-hero";
import { PeopleCards } from "@/components/people";
import { Button } from "@/components/ui/button";
import { CLUB, LINKS } from "@/lib/club";

export const Route = createFileRoute("/contact")({head:()=>pageHead("/contact","Contact the Front Desk","Call (918) 922-8114 or send Oklahoma Prospects a question about cages, lessons, and teams.",false), component: ContactPage });

function ContactPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow="Contact Oklahoma Prospects"
        title="Let’s get"
        accent="to work."
        copy="Teams, tryouts, lessons, or facility rentals. Tell us what you need."
        actions={
          <Button asChild>
            <a href={`tel:${CLUB.phoneTel}`}>Call / text {CLUB.phoneDisplay}</a>
          </Button>
        }
      />

      <section className="mx-auto grid max-w-3xl gap-8 px-5 py-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <h2 className="text-3xl">How can we help?</h2>
          <p className="mt-2 mb-6 text-muted">
            Send an inquiry and Prospects will follow up.
          </p>
          <ContactForm />
        </div>
        <aside className="rounded-2xl bg-ink p-5 text-fg-inverse">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Oklahoma Prospects
          </p>
          <h2 className="mt-2 text-3xl">Find our house.</h2>
          <HoursChip className="mt-4" />
          <p className="mt-4 text-fg-soft">
            {CLUB.addressLine1}
            <br />
            {CLUB.addressLine2}
          </p>
          <p className="mt-3 text-sm text-fg-soft">
            {CLUB.hoursWeekday}
            <br />
            {CLUB.hoursWeekend}
          </p>
          <p className="mt-4 text-sm">{CLUB.email}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild>
              <a href={LINKS.maps} target="_blank" rel="noreferrer">
                Open directions
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`sms:${CLUB.phoneTel}`}>Text the desk</a>
            </Button>
          </div>
        </aside>
      </section>

      <section className="bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">Who to text</h2>
          <p className="mt-2 mb-5 text-muted">
            Desk for cages and arriving today. Steve for lessons and member
            access.
          </p>
          <PeopleCards />
        </div>
      </section>
    </main>
  );
}
