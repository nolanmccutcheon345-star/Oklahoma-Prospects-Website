import { getPublicCatalogSnapshot } from "@/lib/ops";
import { CatalogStatus } from "@/components/catalog-status";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MembershipPlans } from "@/components/membership-plans";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { CatalogProvider, useLiveCatalog } from "@/lib/use-catalog";
import { formatDollars } from "@/lib/pricing";
import { CLUB } from "@/lib/club";

export const Route = createFileRoute("/memberships")({
  head: () =>
    pageHead(
      "/memberships",
      "Cage Passes",
      "Household cage memberships: Prospect, All-Star, and Elite Family. Review monthly pricing and included hours.",
      false,
    ),
  loader: () => getPublicCatalogSnapshot(),
  component: MembershipsRoute,
});

function MembershipsRoute() {
  const initial = Route.useLoaderData();
  return (
    <CatalogProvider initial={initial}>
      <MembershipsPage />
    </CatalogProvider>
  );
}

function MembershipsPage() {
  const catalog = useLiveCatalog();
  return (
    <main id="main">
      <PageHero
        eyebrow={`${CLUB.name} memberships`}
        title="Train every month."
        accent="Make room for practice."
        copy="Choose monthly cage access for your household. Team practices use separately priced team cages and team plans."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/book">Just need one hour</Link>
            </Button>
          </>
        }
      />
      <section className="bg-paper py-12">
        <div className="mx-auto max-w-6xl px-5">
          <MembershipPlans cta="Start All-Star" />
          <h2 className="mt-10 text-2xl">Team plans · 4 visits / month</h2>
          <p className="mt-2 text-sm">Team plans are scheduled and invoiced by Front Office.</p>
          {catalog.status === "loading" || catalog.status === "error" ? (
            <CatalogStatus
              label="team plans"
              error={catalog.status === "error"}
              retry={catalog.retry}
            />
          ) : !catalog.teamPlans.length ? (
            <p className="mt-3 text-sm">Contact Front Office for current team plan options.</p>
          ) : null}
          <div className="mt-4 grid gap-3">
            {catalog.status !== "loading" &&
              catalog.status !== "error" &&
              catalog.teamPlans.map((plan) => (
                <article key={plan.id} className="rounded-xl bg-white p-4">
                  <h3>{plan.name}</h3>
                  <p>{formatDollars(plan.price)} / month</p>
                  <p className="text-sm">{plan.purpose}</p>
                  <a className="underline" href="/contact">
                    Contact Front Office
                  </a>
                </article>
              ))}
          </div>
        </div>
      </section>
    </main>
  );
}
