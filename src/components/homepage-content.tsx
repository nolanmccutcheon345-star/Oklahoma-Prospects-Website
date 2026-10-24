import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, CalendarCheck, ShieldCheck, Clock } from "lucide-react";
import type { PublicPerson } from "@/lib/person-contracts";
import { getPublicHomepage } from "@/lib/website-content-api";
import { CLUB, LINKS } from "@/lib/club";
import { CatalogStatus } from "./catalog-status";
import { HoursChip } from "./hours-chip";
import { Button } from "./ui/button";

export function FeaturedCoachCard({ person }: { person: PublicPerson }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white text-ink">
      <div className="flex aspect-[4/3] items-center justify-center bg-paper">
        {person.photo ? (
          <img
            src={person.photo}
            alt={person.name}
            width={480}
            height={360}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <span aria-hidden="true" className="font-display text-6xl text-navy">
            {person.name
              .replace(/^Coach\s+/i, "")
              .split(/\s+/)
              .slice(0, 2)
              .map((x) => x[0])
              .join("")}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-3xl">{person.name}</h3>
        <p className="mt-2 font-semibold">
          {[
            ...new Set([
              ...person.teams.map((t) => t.role),
              ...(person.title ? [person.title] : []),
            ]),
          ].join(" · ") || "Coach"}
        </p>
        <p className="mt-1 capitalize text-muted">
          {[...new Set([...person.sports, ...person.teams.map((t) => t.sport)])].join(" · ")}
        </p>
        {person.bio && !/^(na|n\/a|bio coming soon\.?)$/i.test(person.bio.trim()) && (
          <p className="my-4 line-clamp-4 text-muted">{person.bio}</p>
        )}
        <div className="mt-auto grid gap-2 pt-4">
          {person.bookable && (
            <a
              href={`/training?instructor=${encodeURIComponent(person.coachId)}`}
              className="flex min-h-12 items-center justify-center rounded-lg bg-maroon px-4 py-3 text-center font-semibold text-white"
            >
              View Lessons & Availability
            </a>
          )}
          <a
            href={`/coaches#person-${encodeURIComponent(person.id)}`}
            className="inline-flex min-h-11 items-center font-semibold underline"
          >
            View coach profile
          </a>
        </div>
      </div>
    </article>
  );
}
export function HomepagePeople({
  initial,
}: {
  initial: Awaited<ReturnType<typeof getPublicHomepage>>;
}) {
  const [retried, setRetried] = useState<{ source: typeof initial; result: typeof initial } | null>(
    null,
  );
  // A fresh route load must immediately replace withdrawn public content, even if
  // this component stays mounted. A retry from an old route cannot restore it.
  const data = retried?.source === initial ? retried.result : initial;
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    try {
      setRetried({ source: initial, result: await getPublicHomepage() });
    } catch {
      setRetried({ source: initial, result: { content: null, failed: true } });
    } finally {
      setBusy(false);
    }
  }
  if (data.failed)
    return (
      <section className="mx-auto max-w-6xl px-5 py-8">
        <CatalogStatus
          label="featured coaches and family stories"
          error={!busy}
          retry={() => void retry()}
        />
      </section>
    );
  return (
    <>
      {!!data.content?.coaches.length && (
        <section className="mx-auto max-w-6xl px-5 py-12" aria-label="Featured coaches">
          <p className="text-xs font-semibold tracking-widest text-maroon uppercase">
            The people behind the progress
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-4xl">Meet your coaches.</h2>
            <Link
              to="/coaches"
              className="inline-flex min-h-11 items-center font-semibold underline"
            >
              Meet all coaches
            </Link>
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {data.content.coaches.map((person) => (
              <FeaturedCoachCard key={person.id} person={person} />
            ))}
          </div>
        </section>
      )}
      {!!data.content?.testimonials.length && (
        <section className="bg-white py-12" aria-label="Family testimonials">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-4xl">Trusted by Prospects families.</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {data.content.testimonials.map((t) => (
                <figure
                  key={t.id}
                  className="rounded-2xl border border-line border-t-4 border-t-powder p-6"
                >
                  <blockquote className="text-lg leading-relaxed">“{t.quote}”</blockquote>
                  <figcaption className="mt-5 font-semibold text-navy">
                    {t.attribution}
                    {t.teamAffiliation && (
                      <span className="mt-1 block text-sm font-normal text-muted">
                        {t.teamAffiliation}
                      </span>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
export function FacilityStrip() {
  return (
    <section className="bg-navy py-12 text-white" aria-label="Facility and safety">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-widest text-powder uppercase">
            {CLUB.venueName}
          </p>
          <h2 className="mt-2 text-4xl">
            Built for the work.
            <br />
            Ready for your athlete.
          </h2>
          <p className="mt-4 text-fg-soft">
            Seven indoor lanes for baseball and softball. Plan your visit and complete your annual
            waiver before you train.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/facility">Explore the facility</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/book">Book a cage</Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <a href={LINKS.maps} className="flex gap-3 text-white">
            <MapPin className="size-6 shrink-0 text-powder" aria-hidden />
            <span>
              {CLUB.addressLine1}
              <br />
              {CLUB.addressLine2}
            </span>
          </a>
          <div className="flex gap-3">
            <Clock className="size-6 shrink-0 text-powder" aria-hidden />
            <div>
              <p>{CLUB.hoursWeekday}</p>
              <p>{CLUB.hoursWeekend}</p>
              <p className="mt-1 text-sm text-fg-soft">
                By paid booking. Closures and events may affect availability.
              </p>
            </div>
          </div>
          <Link to="/waiver" className="flex min-h-11 items-center gap-3 font-semibold underline">
            <ShieldCheck className="size-6 text-powder" aria-hidden />
            Annual waiver & safety
          </Link>
          <div className="flex items-center gap-3">
            <CalendarCheck className="size-6 shrink-0 text-powder" aria-hidden />
            <HoursChip />
          </div>
        </div>
      </div>
    </section>
  );
}
