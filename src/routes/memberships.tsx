import {pageHead} from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MembershipPlans } from "@/components/membership-plans";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { TEAM_MEMBERSHIPS } from "@/lib/club";

export const Route = createFileRoute("/memberships")({head:()=>pageHead("/memberships","Cage Passes","Household cage memberships: Prospect, All-Star, and Elite Family. Review monthly pricing and included hours.",false),
  component: MembershipsPage,
});

function MembershipsPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow="Oklahoma Prospects memberships"
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
          <div className="mt-4 overflow-x-auto rounded-xl bg-ink">
            <table className="w-full min-w-lg text-left text-sm">
              <thead className="text-xs tracking-widest text-powder uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Space</th>
                  <th className="px-4 py-3 font-semibold">1 hour</th>
                  <th className="px-4 py-3 font-semibold">90 min</th>
                  <th className="px-4 py-3 font-semibold">2 hours</th>
                </tr>
              </thead>
              <tbody>
                {TEAM_MEMBERSHIPS.map((row) => (
                  <tr key={row.space} className="border-t border-fg-inverse/10">
                    <td className="px-4 py-3 font-medium">{row.space}</td>
                    {row.rates.map((rate) => (
                      <td key={rate.duration} className="px-4 py-3 tabular-nums">
                        ${rate.price}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
