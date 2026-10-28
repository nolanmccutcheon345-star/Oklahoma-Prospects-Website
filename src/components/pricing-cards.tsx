import { Link } from "@tanstack/react-router";
import { CircleDot, Users, Diamond, Star, Shield, Grid2X2 } from "lucide-react";
import type { PublicCatalog } from "@/lib/ops";
import { formatDollars } from "@/lib/pricing";
import { readServicePresentation, type ServicePresentation } from "@/lib/service-presentation";
import { canPurchase } from "@/lib/purchase-availability";
import { useLiveCatalog } from "@/lib/use-catalog";
import { CatalogStatus } from "./catalog-status";
import { Button } from "./ui/button";

export function CardIcon({
  icon,
  className = "size-12",
}: {
  icon: ServicePresentation["icon"];
  className?: string;
}) {
  const Icon = {
    baseball: CircleDot,
    team: Users,
    field: Diamond,
    star: Star,
    shield: Shield,
    cage: Grid2X2,
  }[icon];
  return <Icon aria-hidden="true" strokeWidth={1.35} className={className} />;
}
export function PricingSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={`Loading ${label}`} className="grid gap-5 md:grid-cols-3">
      <span className="sr-only">Loading {label}…</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="min-h-80 rounded-2xl border border-line bg-white p-6 motion-safe:animate-pulse"
        >
          <div className="mx-auto my-5 h-14 w-14 rounded bg-line" />
          <div className="my-4 h-7 rounded bg-line" />
          <div className="mx-auto my-5 h-12 w-2/3 rounded bg-line" />
          <div className="mt-8 h-12 rounded bg-line" />
        </div>
      ))}
    </div>
  );
}
export function RentalCards() {
  const catalog = useLiveCatalog();
  if (catalog.status === "loading") return <PricingSkeleton label="rental rates" />;
  if (catalog.status === "error")
    return <CatalogStatus label="rental rates" error retry={catalog.retry} />;
  if (!catalog.cages.length)
    return (
      <p role="status" className="rounded-xl border border-line p-5">
        No rental rates are currently published.{" "}
        <Link to="/contact" className="underline">
          Contact the front desk
        </Link>
        .
      </p>
    );
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {catalog.cages.map((rental) => (
        <article
          key={rental.id}
          className="pricing-card flex flex-col overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-border"
        >
          <h3 className="border-t-4 border-powder bg-navy px-5 py-4 text-center text-2xl text-white">
            {rental.name}
          </h3>
          <div className="flex flex-1 flex-col items-center p-6 text-center">
            <div className="my-2 text-navy">
              <CardIcon
                icon={rental.id === "team" ? "team" : rental.id === "field" ? "field" : "cage"}
              />
            </div>
            <p className="my-4 border-t border-line pt-4 font-display text-5xl font-extrabold">
              {formatDollars(rental.price)}
              <span className="ml-1 font-sans text-base font-medium text-muted">{rental.unit}</span>
            </p>
            <p className="mb-5 text-base text-muted">
              {rental.summary ||
                (rental.id === "team"
                  ? "Dedicated cage time for team practices."
                  : rental.id === "field"
                    ? "Ground balls, footwork, and defensive drills."
                    : "Hitting and pitching practice for your household.")}
            </p>
            <Button asChild className="mt-auto w-full">
              <Link to="/book" search={{ space: rental.id }}>
                {" "}
                {rental.id === "team"
                  ? "Book team cage"
                  : rental.id === "field"
                    ? "View availability"
                    : "Book cage"}
              </Link>
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
export function MembershipCard({
  plan,
  availability,
  preview = false,
}: {
  plan: PublicCatalog["cagePlans"][number];
  availability?: PublicCatalog["purchaseAvailability"];
  preview?: boolean;
}) {
  const presentation = readServicePresentation(plan.presentation);
  const badge = presentation.badge || (plan.featured ? "Best value" : "");
  return (
    <article className="pricing-card flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-border">
      <div
        className={`relative border-t-4 border-powder px-6 py-5 text-white ${plan.featured ? "bg-maroon" : "bg-navy"}`}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <CardIcon icon={presentation.icon} className="size-9 text-powder" />
          {badge && (
            <span className="rounded-full bg-powder px-3 py-1 text-xs font-bold text-navy">
              {badge}
            </span>
          )}
        </div>
        <h3 className="text-3xl">{plan.name}</h3>
        <p className="mt-1 text-sm text-white/85">Household cage membership</p>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <p className="font-display text-5xl font-extrabold">
          {formatDollars(plan.price)}
          <span className="ml-1 font-sans text-base font-medium text-muted">/mo</span>
        </p>
        <p className="mt-2 font-semibold">
          {plan.hours} included {plan.hours === 1 ? "hour" : "hours"} / month
        </p>
        {plan.bestFor && <p className="mt-2 text-muted">{plan.bestFor}</p>}
        {(plan.hourly || plan.savings) && (
          <div className="my-5 grid gap-2 rounded-xl bg-paper p-4">
            {plan.hourly && <p className="font-semibold text-navy">{plan.hourly}</p>}
            {plan.savings && <p className="font-semibold text-maroon">{plan.savings}</p>}
          </div>
        )}
        <ul className="my-4 grid gap-3">
          {plan.perks.map((perk, i) => (
            <li key={`${i}-${perk}`} className="flex gap-2 text-sm">
              <CardIcon
                icon={presentation.benefits[i]?.icon || "baseball"}
                className="mt-0.5 size-4 shrink-0 text-maroon"
              />
              <span>{perk}</span>
            </li>
          ))}
        </ul>
        {plan.comparisonNote && <p className="mb-4 text-sm text-muted">{plan.comparisonNote}</p>}
        <p className="mb-5 text-sm text-muted">
          Monthly renewal. Household use only; team practices and the fielding area are excluded.
        </p>
        {preview ? (
          <Button type="button" disabled className="mt-auto w-full">
            Card preview
          </Button>
        ) : canPurchase(availability, "cage-plan", plan.id) ? (
          <Button asChild variant={plan.featured ? "maroon" : "primary"} className="mt-auto w-full">
            <Link to="/pay" search={{ kind: "cage-plan", id: plan.id }}>
              Start {plan.name} · {formatDollars(plan.price)}
            </Link>
          </Button>
        ) : (
          <Button disabled className="mt-auto w-full">
            {availability ? "Checkout unavailable" : "Checking checkout…"}
          </Button>
        )}
      </div>
    </article>
  );
}
