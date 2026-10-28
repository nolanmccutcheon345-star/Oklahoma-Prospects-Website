import { Link } from "@tanstack/react-router";
import { CatalogStatus } from "./catalog-status";
import { MembershipCard, PricingSkeleton } from "./pricing-cards";
import { canPurchase } from "@/lib/purchase-availability";
import { useLiveCatalog } from "@/lib/use-catalog";

export function MembershipPlans({ cta: _cta }: { cta?: string }) {
  const { cagePlans, purchaseAvailability, status, checkoutStatus, retry } = useLiveCatalog();
  if (status === "loading") return <PricingSkeleton label="cage memberships" />;
  if (status === "error") return <CatalogStatus label="cage memberships" error retry={retry} />;
  if (!cagePlans.length)
    return (
      <p role="status" className="rounded-xl border border-line p-5">
        No cage memberships are currently published.{" "}
        <Link to="/contact" className="underline">
          Contact the front desk
        </Link>{" "}
        for options.
      </p>
    );
  return (
    <div>
      {checkoutStatus === "error" ? (
        <div role="alert" className="mb-5 rounded-xl border border-line p-4">
          Prices are available, but checkout readiness could not be checked.{" "}
          <button type="button" onClick={retry} className="min-h-11 px-3 font-semibold underline">
            Try again
          </button>
        </div>
      ) : purchaseAvailability &&
        cagePlans.every((plan) => !canPurchase(purchaseAvailability, "cage-plan", plan.id)) ? (
        <p role="status" className="mb-4">
          Online cage-pass checkout is temporarily unavailable. Current plan details remain
          available for comparison.
        </p>
      ) : null}
      <div className="grid items-stretch gap-5 md:grid-cols-3">
        {cagePlans.map((plan) => (
          <MembershipCard key={plan.id} plan={plan} availability={purchaseAvailability} />
        ))}
      </div>
      <p className="mt-6 text-sm">
        Household athletes only. Team practices use team cage rates. All households may book up to
        14 days ahead, subject to availability.
      </p>
      <p className="mt-3">
        <Link
          to="/training"
          search={{ view: "plans" }}
          className="inline-flex min-h-11 items-center font-semibold underline"
        >
          Explore lesson memberships
        </Link>
      </p>
    </div>
  );
}
