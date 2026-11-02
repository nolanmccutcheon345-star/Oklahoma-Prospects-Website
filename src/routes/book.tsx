import { useState } from "react";
import { getPublicCatalogSnapshot } from "@/lib/ops";
import { CatalogStatus } from "@/components/catalog-status";
import { CatalogAndBook } from "@/components/training-catalog";
import { FrontDeskHelp } from "@/components/front-desk-help";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { BookingFunnel } from "@/components/booking-funnel";
import { CLUB, type BookableLaneId } from "@/lib/club";
import { getCageAvailability } from "@/lib/commerce/api";
import { useLiveCatalog, CatalogProvider } from "@/lib/use-catalog";

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
  loader: () => getPublicCatalogSnapshot(),
  component: BookRoute,
});

const loadAvailability = (input: { date: string; duration: number; laneIds: BookableLaneId[] }) =>
  getCageAvailability({ data: input });

function BookRoute() {
  const initial = Route.useLoaderData();
  return (
    <CatalogProvider initial={initial}>
      <BookPage />
    </CatalogProvider>
  );
}

function BookPage() {
  const [view, setView] = useState<"cages" | "lessons" | "plans">("cages");
  const tabs = [
    { id: "cages", label: "Cage Rentals" },
    { id: "lessons", label: "Lessons" },
    { id: "plans", label: "Training Plans" },
  ] as const;
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
          <div role="tablist" aria-label="Booking options" className="booking-options">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`booking-tab-${tab.id}`}
                aria-selected={view === tab.id}
                aria-controls={`booking-panel-${tab.id}`}
                tabIndex={view === tab.id ? 0 : -1}
                onClick={() => setView(tab.id)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (index + tabs.length - 1) % tabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  setView(tabs[next].id);
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    [next]?.focus();
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />
      <div
        id="booking-panel-cages"
        role="tabpanel"
        aria-labelledby="booking-tab-cages"
        hidden={view !== "cages"}
        tabIndex={0}
      >
        <div id="cage-booking" className="scroll-mt-24 min-h-[42rem]">
          {catalog.status !== "ready" ? (
            <div className="mx-auto max-w-3xl px-5 py-8">
              <CatalogStatus
                label="current rental rates"
                error={catalog.status === "error"}
                retry={catalog.retry}
              />
            </div>
          ) : (
            <>
              <BookingFunnel
                initial={space}
                catalog={catalog}
                loadAvailability={loadAvailability}
                onReview={(search) => {
                  void navigate({ to: "/pay", search });
                }}
              />
            </>
          )}
        </div>
        <div className="mx-auto max-w-3xl px-5 pb-8">
          <FrontDeskHelp />
        </div>
      </div>
      {tabs
        .filter((tab) => tab.id !== "cages")
        .map((tab) => (
          <div
            key={tab.id}
            id={`booking-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`booking-tab-${tab.id}`}
            hidden={view !== tab.id}
            tabIndex={0}
          >
            {view === tab.id && <CatalogAndBook view={tab.id as "lessons" | "plans"} />}
          </div>
        ))}
      <section className="min-h-64 bg-ink py-10 text-fg-inverse">
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
              <Link to="/training" search={{ view: "plans" }} hash="memberships">
                Training plans
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
