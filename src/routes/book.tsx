import { pageHead } from "@/lib/seo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { BookingFunnel } from "@/components/booking-funnel";
import { CLUB, type BookableLaneId } from "@/lib/club";
import { getCageAvailability } from "@/lib/commerce/api";
import { useLiveCatalog } from "@/lib/use-catalog";

type BookSearch = { space?: string };

export const Route = createFileRoute("/book")({
  head: () =>
    pageHead(
      "/book",
      "Book a Cage",
      "Pay and book one or more indoor cages in Broken Arrow. View availability for 30 minutes to 3 hours.",
      false,
    ),
  validateSearch: (search: Record<string, unknown>): BookSearch => ({
    space: typeof search.space === "string" ? search.space : undefined,
  }),
  component: BookPage,
});

const loadAvailability = (input: { date: string; duration: number; laneIds: BookableLaneId[] }) =>
  getCageAvailability({ data: input });

function BookPage() {
  const { space } = Route.useSearch();
  const navigate = useNavigate();
  const catalog = useLiveCatalog();
  return (
    <main id="main" className="booking-page">
      <PageHero
        eyebrow={CLUB.name}
        title="Book your next rep."
        compact
        copy="Choose your space, pick a time, and get to work. Looking for coaching? Explore lessons and training plans below."
        image="/brand/facility.jpg"
        actions={
          <nav aria-label="Booking options" className="booking-options">
            <a href="#cage-booking" aria-current="location">
              Cage Rentals <span aria-hidden="true">✓</span>
            </a>
            <Link to="/training" hash="lessons">
              Lessons
            </Link>
            <Link to="/training" search={{view:"plans"}} hash="memberships">
              Training Plans
            </Link>
          </nav>
        }
      />
      <div id="cage-booking" className="scroll-mt-24">
        <BookingFunnel
          initial={space}
          catalog={catalog}
          loadAvailability={loadAvailability}
          onReview={(search) => {
            void navigate({ to: "/pay", search });
          }}
        />
      </div>
      <section className="bg-ink py-10 text-fg-inverse">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-3xl">Train regularly? Explore cage passes.</h2>
          <p className="mt-2 text-fg-soft">
            Practice more with a monthly cage pass. For individual and family use; coaching and team
            practices are not included.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/memberships">See cage passes</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/training" search={{view:"plans"}} hash="memberships">
                Training plans
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
