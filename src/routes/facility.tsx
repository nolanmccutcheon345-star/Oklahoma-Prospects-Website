import {pageHead} from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { FacilityLanes } from "@/components/facility-lanes";
import { HoursChip } from "@/components/hours-chip";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { CLUB, FAQ, LINKS, RENTALS } from "@/lib/club";

export const Route = createFileRoute("/facility")({head:()=>pageHead("/facility","Visit the Facility","Seven indoor lanes for baseball and softball at 3804 S. Elm Pl., Suite A, Broken Arrow.",false), component: FacilityPage });

function FacilityPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow="Indoor baseball & softball · Broken Arrow"
        title="Your next rep."
        accent="Your next level."
        copy="Book a cage, plan a team workout, or work with an instructor."
        image="/brand/facility.jpg"
        actions={
          <>
            <Button asChild>
              <Link to="/book">Check availability</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/training">Private lessons</Link>
            </Button>
          </>
        }
      />

      <section className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-3xl">Hours</h2>
            <p className="mt-1 text-muted">{CLUB.hoursWeekday}</p>
            <p className="text-muted">{CLUB.hoursWeekend}</p>
          </div>
          <HoursChip tone="onLight" />
        </div>
      </section>

      <section className="bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">A space for every workout</h2>
          <p className="mt-2 text-muted">Current cage and field-area rental rates.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {RENTALS.map((rental) => (
              <article key={rental.id} className="rounded-2xl p-5 shadow-border">
                <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
                  {rental.name}
                </p>
                <p className="mt-2 font-display text-5xl font-extrabold">
                  ${rental.price}
                  <span className="ml-1 font-sans text-sm font-medium text-muted">
                    {rental.unit}
                  </span>
                </p>
                <p className="mt-3 text-sm text-muted">{rental.summary}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="text-3xl">Know your space</h2>
        <p className="mt-2 mb-6 text-muted">
          Mound lanes, hitting lanes, and a combined fielding area. Tap a lane
          for details.
        </p>
        <FacilityLanes />
      </section>

      <section className="bg-ink py-10 text-fg-inverse">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">Inside Prospects</h2>
          <p className="mt-2 text-fg-soft">
            A look at the real space and the work that happens here.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              { src: "/brand/facility.jpg", cap: "Room to train" },
              { src: "/brand/training.jpg", cap: "Purposeful instruction" },
              { src: "/brand/team.jpg", cap: "Quality repetitions" },
              { src: "/brand/wordmark.png", cap: "A place to grow" },
            ].map((shot) => (
              <figure
                key={shot.cap}
                className="overflow-hidden rounded-xl bg-navy"
              >
                <img
                  src={shot.src}
                  alt={shot.cap}
                  className="aspect-4/3 w-full object-cover"
                />
                <figcaption className="px-4 py-3 text-xs font-semibold tracking-widest uppercase">
                  {shot.cap}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="text-3xl">Before you arrive</h2>
        <div className="mt-6 divide-y divide-line">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {item.q}
                <span className="text-maroon group-open:hidden">+</span>
                <span className="hidden text-maroon group-open:inline">–</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
        <address className="mt-8 rounded-2xl bg-ink p-5 not-italic text-fg-inverse">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Oklahoma Prospects
          </p>
          <p className="mt-2 font-display text-3xl">Find our house.</p>
          <p className="mt-3 text-fg-soft">
            {CLUB.addressLine1}
            <br />
            {CLUB.addressLine2}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild>
              <a href={LINKS.maps} target="_blank" rel="noreferrer">
                Open directions
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link to="/contact">Contact</Link>
            </Button>
          </div>
        </address>
      </section>
    </main>
  );
}
