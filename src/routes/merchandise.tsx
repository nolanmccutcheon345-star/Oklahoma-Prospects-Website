import { CLUB } from "@/lib/club";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { ShoppingBag, PackageCheck, Truck, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/merchandise")({
  head: () => pageHead(
    "/merchandise",
    "Merchandise & Pro Shop",
    "Prospects Sports Academy branded merchandise and future direct-to-home shipping.",
    false,
  ),
  component: MerchandisePage,
});

const COLLECTIONS = [
  { name: "Headwear", description: "Hats and beanies" },
  { name: "Training apparel", description: "Shirts and performance tops" },
  { name: "Outerwear", description: "Hoodies and cage jackets" },
  { name: "Accessories", description: "Tote bags and everyday gear" },
] as const;

function MerchandisePage() {
  return (
    <main id="main">
      <PageHero
        eyebrow={CLUB.name}
        title="Prospects pro shop."
        accent="Wear the colors."
        copy="Branded baseball and softball apparel, training layers, headwear and accessories."
        compact
      />
      <section className="mx-auto max-w-3xl px-5 py-10">
        <div className="rounded-2xl border border-line bg-paper-2 p-5" role="status">
          <ShoppingBag aria-hidden="true" className="size-8 text-maroon" />
          <h2 className="mt-3 text-2xl">Online store setup is in progress</h2>
          <p className="mt-3 text-muted">
            Products, prices, sizes, stock, customer shipping charges and fulfillment
            are not accepting orders yet. We will enable checkout only after secure
            payments, confirmed shipping rates, tax and order tracking are tested.
            Nothing on this page creates an order or collects payment.
          </p>
        </div>
        <h2 className="mt-10 text-3xl">Planned collections</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {COLLECTIONS.map((item) => (
            <article key={item.name} className="rounded-xl border border-line bg-paper p-5 shadow-border">
              <h3 className="text-2xl">{item.name}</h3>
              <p className="mt-2 text-muted">{item.description}</p>
            </article>
          ))}
        </div>
        <h2 className="mt-10 text-2xl">How online orders will work</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-paper-2 p-4"><ShoppingBag aria-hidden="true" className="size-6 text-maroon"/><h3 className="mt-2 text-lg">Choose products</h3><p className="mt-2 text-sm text-muted">Admin-approved items, sizes and prices</p></div>
          <div className="rounded-xl bg-paper-2 p-4"><Truck aria-hidden="true" className="size-6 text-maroon"/><h3 className="mt-2 text-lg">Ship home</h3><p className="mt-2 text-sm text-muted">Shipping address, tax and delivery cost shown before payment</p></div>
          <div className="rounded-xl bg-paper-2 p-4"><PackageCheck aria-hidden="true" className="size-6 text-maroon"/><h3 className="mt-2 text-lg">Track your order</h3><p className="mt-2 text-sm text-muted">Shipping status and tracking after verified fulfillment</p></div>
        </div>
        <p className="mt-7 flex items-start gap-2 text-sm text-muted">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0"/>
          The Pro Shop will use a verified payment and fulfillment flow. No payment credentials
          or customer shipping addresses are collected until that flow is enabled.
        </p>
        <Button asChild className="mt-6" variant="outlineDark"><Link to="/teams">Back to Prospects teams</Link></Button>
      </section>
    </main>
  );
}
