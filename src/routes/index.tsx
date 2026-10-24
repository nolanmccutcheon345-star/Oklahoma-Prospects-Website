import { getPublicCatalogSnapshot } from "@/lib/ops";
import { getPublicHomepage } from "@/lib/website-content-api";
import { FacilityStrip, HomepagePeople } from "@/components/homepage-content";
import { RentalCards } from "@/components/pricing-cards";
import { ACTIVE_SEASON } from "@/lib/active-season";
import { formatDollars } from "@/lib/pricing";
import { CatalogProvider, useLiveCatalog } from "@/lib/use-catalog";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPin } from "lucide-react";
import { BrandImage } from "@/components/brand-image";
import { FaqList } from "@/components/faq-list";
import { GoogleReview } from "@/components/google-review";
import { HoursChip } from "@/components/hours-chip";
import { MembershipPlans } from "@/components/membership-plans";

import { Button } from "@/components/ui/button";
import { CANCEL_POLICY, CLUB, LINKS, PROOF } from "@/lib/club";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "/",
      "Indoor cages, lessons & teams",
      "Book indoor baseball and softball cages, coaching, and teams in Broken Arrow. Serving northeast Oklahoma since 2008.",
      false,
    ),
  loader: async () => {
    const [catalog, homepage] = await Promise.all([
      getPublicCatalogSnapshot(),
      getPublicHomepage(),
    ]);
    return { catalog, homepage };
  },
  component: HomeRoute,
});

function HomeRoute() {
  const data = Route.useLoaderData();
  return (
    <CatalogProvider initial={data.catalog}>
      <Home homepage={data.homepage} />
    </CatalogProvider>
  );
}

function Home({ homepage }: { homepage: Awaited<ReturnType<typeof getPublicHomepage>> }) {
  const catalog = useLiveCatalog();
  return (
    <main id="main">
      <section className="relative isolate overflow-hidden bg-ink text-fg-inverse">
        <BrandImage
          priority
          src="/brand/team.jpg"
          alt=""
          width={1536}
          height={1152}
          className="absolute inset-0 -z-20 size-full object-cover object-[center_36%]"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/92 to-ink/50" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-transparent to-ink/40" />
        <div className="relative mx-auto max-w-3xl px-5 pt-8 pb-12">
          <HoursChip />
          <p className="mt-5 text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Broken Arrow · Indoor baseball & softball
          </p>
          <h1 className="mt-3 max-w-xl font-display text-5xl leading-[0.9] font-extrabold italic sm:text-6xl">
            <span className="block">BUILD YOUR GAME.</span>
            <span className="block">TRAIN WITH PURPOSE.</span>
          </h1>
          <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-fg-soft">
            Indoor baseball and softball training in Broken Arrow. Rent a batting cage, book private
            instruction, or explore Prospects teams and tryouts.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/book">Book a cage</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/tryouts">Tryouts</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-fg-soft">
            <a href={LINKS.maps} className="underline">
              {CLUB.venueName} · {CLUB.addressLine1}, {CLUB.addressLine2}
            </a>
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-maroon from-70% to-powder" />
      </section>

      <section className="bg-ink">
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-px border-t border-fg-inverse/10">
          {PROOF.map((item) => (
            <div key={item.label} className="px-2 py-4 text-center">
              <p className="text-[0.65rem] font-semibold tracking-widest text-fg-soft uppercase">
                {item.label}
              </p>
              <p className="mt-1 font-display text-sm font-extrabold text-powder uppercase sm:text-base">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-8">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Start here</p>
        <h2 className="mt-2 text-3xl">What would you like to do?</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <PathCard
            to="/book"
            kicker={
              catalog.cages.find((r) => r.id === "individual")
                ? `From ${formatDollars(catalog.cages.find((r) => r.id === "individual")!.price)} / hour`
                : "Cage rentals"
            }
            title="Book a cage"
            body="Reserve indoor cage time for individual training or team practice."
          />
          <PathCard
            to="/training"
            kicker="Baseball & softball instruction"
            title="Book coaching"
            body="Find private lessons, player assessments, and monthly development plans."
          />
          <MemberPathCard />
          <PathCard
            to="/tryouts"
            kicker={`${ACTIVE_SEASON} teams`}
            title="Find a team or tryout"
            body="Meet our teams and request a scheduled tryout or individual evaluation."
          />
        </div>
      </section>

      <section
        aria-label="Coaching and teams"
        className="mx-auto grid max-w-3xl items-center gap-6 px-5 pt-2 pb-10 md:grid-cols-2"
      >
        <BrandImage
          src="/brand/training.jpg"
          alt="Coach working with athletes at Prospects Sports Academy"
          className="aspect-[4/3] w-full rounded-2xl object-cover"
        />
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            Coaching and teams
          </p>
          <h2 className="mt-2 text-3xl">Coaching built around your athlete.</h2>
          <p className="mt-3 text-muted">
            Work with experienced coaches, build your skills through lessons, and explore baseball
            and softball teams at Prospects Sports Academy.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="maroon">
              <Link to="/training">Explore Lessons</Link>
            </Button>
            <Button asChild variant="outlineDark">
              <Link to="/coaches">Meet Our Coaches</Link>
            </Button>
            <Button asChild variant="outlineDark">
              <Link to="/teams">Explore Teams</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-paper-2 py-10">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl">Cage rates</h2>
              <p className="mt-1 text-muted">
                Choose your space, reserve your time, and pay online. Rates below are per hour.
              </p>
              <p className="mt-2 text-sm text-muted">
                Payment confirms your booking. {CANCEL_POLICY.short}.
              </p>
            </div>
            <Button
              asChild
              variant="outlineDark"
              size="sm"
              className="min-h-11 w-full shrink-0 whitespace-nowrap sm:w-auto"
            >
              <Link to="/book">Book a cage</Link>
            </Button>
          </div>
          <div className="mt-6">
            <RentalCards />
          </div>
          <p className="mt-4 text-sm text-muted">
            Softball trains here too — Lane 7 is dual-use. Compare monthly cage passes below using
            current rates and included hours.
          </p>
        </div>
      </section>

      <section className="bg-paper py-12">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            Cage memberships
          </p>
          <h2 className="mt-2 text-3xl">Compare monthly cage access.</h2>
          <p className="mt-3 max-w-xl text-muted">
            Make practice part of your routine. Choose a monthly cage pass for household training,
            or explore lesson memberships for coached development.
          </p>
          <div className="mt-6">
            <MembershipPlans cta="Compare memberships" />
          </div>
        </div>
      </section>

      <FacilityStrip />
      <HomepagePeople initial={homepage} />

      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="text-3xl">Straight answers</h2>
        <FaqList />
      </section>

      <section className="bg-paper-2 py-10">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">We’re here to help.</h2>
          <p className="mt-2 mb-5 text-muted">
            Contact Prospects Sports Academy for help with bookings, lessons, memberships, and
            teams.
          </p>
          <Link to="/contact" className="inline-flex min-h-11 items-center uppercase underline">
            Contact Prospects Sports Academy
          </Link>
          <a
            href={LINKS.maps}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex min-h-20 items-center gap-3 rounded-xl bg-paper px-4 py-3 no-underline shadow-border"
          >
            <MapPin className="size-5 text-maroon" aria-hidden />
            <span>
              <span className="block text-[0.7rem] font-semibold tracking-widest text-muted uppercase">
                {CLUB.venueName}
              </span>
              <span className="block text-sm font-semibold">{CLUB.addressLine1}</span>
              <span className="block text-sm">{CLUB.addressLine2}</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </span>
          </a>
          <div className="mt-6">
            <GoogleReview />
          </div>
        </div>
      </section>
    </main>
  );
}

function MemberPathCard() {
  const { user, isPending } = useCurrentUserState();
  if (isPending || !user) {
    return (
      <PathCard
        to="/login"
        kicker="Parents · players · coaches"
        title="Go to my account"
        body="Manage your bookings, memberships, athlete profiles, and team information."
      />
    );
  }
  return (
    <PathCard
      to="/account"
      kicker="Already signed in"
      title="Go to my account"
      body="Manage your bookings, memberships, athlete profiles, and team information."
    />
  );
}

function PathCard({
  to,
  kicker,
  title,
  body,
}: {
  to: "/book" | "/training" | "/more" | "/tryouts" | "/account" | "/login";
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-4 rounded-2xl bg-paper-2 p-5 no-underline shadow-border"
    >
      <span>
        <span className="block text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          {kicker}
        </span>
        <span className="mt-1 block font-display text-2xl uppercase">{title}</span>
        <span className="mt-1 block text-sm text-muted">{body}</span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-maroon" aria-hidden />
    </Link>
  );
}
