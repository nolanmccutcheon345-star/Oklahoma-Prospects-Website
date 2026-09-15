import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useLiveCatalog } from "@/lib/use-catalog";

export function MembershipPlans({
  cta = "Start All-Star",
}: {
  cta?: string;
}) {
  const { cagePlans } = useLiveCatalog();
  const featured = cagePlans.find((plan) => plan.featured) ?? cagePlans[1] ?? cagePlans[0];
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-3">
        {cagePlans.map((plan) => (
          <article
            key={plan.id}
            className={cn(
              "rounded-2xl p-5",
              plan.featured ? "bg-maroon" : "bg-ink",
            )}
          >
            {plan.featured ? (
              <p className="text-xs font-semibold tracking-widest text-powder uppercase">
                Best value
              </p>
            ) : null}
            <h3 className="mt-1 text-2xl text-powder">{plan.name}</h3>
            <p className="mt-1 font-display text-4xl font-extrabold">
              ${plan.price}
              <span className="ml-1 font-sans text-sm font-medium text-fg-soft">
                {plan.period}
              </span>
            </p>
            {plan.hourly ? <p className="mt-2 text-sm text-powder">{plan.hourly}</p> : null}
            <p className="mt-2 text-sm text-fg-soft">{plan.bestFor}</p>
            {plan.savings ? <p className="mt-2 text-sm text-powder">{plan.savings}</p> : null}
            <ul className="mt-3 grid gap-1 text-sm text-fg-soft">
              {plan.perks.map((perk) => (
                <li key={perk}>+ {perk}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="mt-6 grid gap-2">
        <p className="text-sm text-fg-soft">
          Household athletes only. Team practices use team cage rates and team monthly plans.
        </p>
        <Button asChild className="w-full">
          <Link to="/pay" search={{ kind: "cage-plan", id: featured?.id ?? "all-star" }}>
            {cta}
          </Link>
        </Button>
        <Button asChild variant="outlineDark" className="w-full">
          <Link to="/training">Lesson memberships</Link>
        </Button>
      </div>
    </div>
  );
}
