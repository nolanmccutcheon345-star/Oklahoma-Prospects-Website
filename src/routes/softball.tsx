import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { SOFTBALL_AGES } from "@/lib/club";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/softball")({
  head: () => pageHead("/softball", "Softball Teams & Tryouts", "Oklahoma Prospects softball: 10U, 12U, 14U and 16U. Free tryout registration. Dates and times to be announced.", false),
  component: SoftballPage,
});

function SoftballPage() {
  return (
    <main id="main">
      <PageHero eyebrow="Oklahoma Prospects softball" title="Your team starts here." accent="Bring your game." copy="Teams forming for 10U, 12U, 14U and 16U in Broken Arrow. Free tryout registration is open." actions={<Button asChild><a href="#softball-ages">Find your age group</a></Button>} />
      <section id="softball-ages" className="mx-auto max-w-3xl scroll-mt-24 px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-maroon">Softball tryouts</p>
        <h2 className="mt-2 text-3xl">Choose your age group</h2>
        <p className="mt-3 text-muted">Dates and times are to be announced. Register your player now, and Prospects will follow up with the details.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {SOFTBALL_AGES.map(age => <article key={age} className="rounded-2xl bg-paper-2 p-5 shadow-border">
            <h3 className="text-3xl">{age} Softball</h3>
            <p className="mt-2 text-sm text-muted">Team forming · Free tryout signup</p>
            <Button asChild className="mt-4 w-full"><Link to="/tryouts" search={{ sport: "Softball", age }} hash="register">Register for {age}</Link></Button>
          </article>)}
        </div>
        <div className="mt-8 rounded-2xl bg-ink p-6 text-fg-inverse">
          <h2 className="text-2xl">Sarah Blankenship</h2>
          <p className="mt-1 font-semibold text-powder">Softball Program Coordinator</p>
          <p className="mt-3 text-fg-soft">Helping families find their place with Oklahoma Prospects softball.</p>
          <Button asChild variant="outline" className="mt-4"><Link to="/contact">Ask about softball</Link></Button>
        </div>
      </section>
    </main>
  );
}
