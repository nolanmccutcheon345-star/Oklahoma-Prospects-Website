import {pageHead} from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MembershipPlans } from "@/components/membership-plans";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { useLiveCatalog } from "@/lib/use-catalog";
import { formatDollars } from "@/lib/pricing";
import { CLUB } from "@/lib/club";

export const Route = createFileRoute("/memberships")({head:()=>pageHead("/memberships","Cage Passes","Household cage memberships: Prospect, All-Star, and Elite Family. Review monthly pricing and included hours.",false),
  component: MembershipsPage,
});

function MembershipsPage() {
  const catalog=useLiveCatalog();
  return (
    <main id="main">
      <PageHero
        eyebrow={`${CLUB.name} memberships`}
        title="Train every month."
        accent="The hour costs less."
        copy="Household athletes train more for less. These plans are not for team practices — coaches book team cages and team monthly plans."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/book">Just need one hour</Link>
            </Button>
          </>
        }
      />
      <section className="bg-navy py-10 text-fg-inverse">
        <div className="mx-auto max-w-3xl px-5">
          <MembershipPlans cta="Start All-Star" />
          <h2 className="mt-10 text-2xl">Team plans · 4 visits / month</h2>
          <p className="mt-2 text-sm">Team plans are scheduled and invoiced by Front Office.</p>
          <div className="mt-4 grid gap-3">
            {catalog.teamPlans.map(plan=><article key={plan.id} className="rounded-xl bg-ink p-4"><h3>{plan.name}</h3><p>{formatDollars(plan.price)} / month</p><p className="text-sm">{plan.purpose}</p><a className="underline" href="/contact">Contact Front Office</a></article>)}
          </div>
        </div>
      </section>
    </main>
  );
}
