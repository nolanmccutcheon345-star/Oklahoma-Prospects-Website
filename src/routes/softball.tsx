import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { SOFTBALL_AGES } from "@/lib/club";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/softball")({
  head: () =>
    pageHead(
      "/softball",
      "Softball Teams & Tryouts",
      "Oklahoma Prospects softball: 10U, 12U, 14U and 16U. Free tryout registration. Dates and times to be announced.",
      false,
    ),
  component: SoftballPage,
});

function SoftballPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow="Oklahoma Prospects softball"
        title="Your team starts here."
        accent="Bring your game."
        copy="Softball in Broken Arrow. Free individual tryout requests are open for every age group."
        actions={
          <Button asChild>
            <a href="#softball-ages">Find your age group</a>
          </Button>
        }
      />
      <section id="softball-ages" className="mx-auto max-w-3xl scroll-mt-24 px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-maroon">
          Softball tryouts
        </p>
        <h2 className="mt-2 text-3xl">Choose your age group</h2>
        <p className="mt-3 text-muted">
          Requests are open for every age group, including ages beyond the team cards below. Submit
          your player information, and Prospects will respond with next steps.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {SOFTBALL_AGES.map((age) => (
            <article key={age} className="rounded-2xl bg-paper-2 p-5 shadow-border">
              <h3 className="text-3xl">{age === "14U" ? "14U B" : age} Softball</h3>
              <p className="mt-2 text-sm text-muted">Team forming · Free tryout signup</p>
              {age === "14U" ? <p className="mt-2 font-semibold">Head Coach: Rusty</p> : null}
              <Button asChild className="mt-4 w-full">
                <Link to="/tryouts" search={{ sport: "Softball", age }} hash="register">
                  Register for {age}
                </Link>
              </Button>
            </article>
          ))}
        </div>
        <article className="mt-8 rounded-2xl border border-line p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-maroon">
            14U B softball · Instruction
          </p>
          <h2 className="mt-2 text-3xl">Coach Rusty</h2>
          <p className="mt-2 font-semibold">14U B Softball Head Coach</p>
          <p className="mt-3 text-muted">
            Softball hitting and defense instructor. Ask about hitting assessments, 30- and
            60-minute hitting lessons, and 60-minute fielding lessons.
          </p>
          <Button asChild variant="outlineDark" className="mt-4">
            <Link
              to="/contact"
              search={{ subject: "Softball hitting and defense with Coach Rusty" }}
            >
              Ask about lessons with Rusty
            </Link>
          </Button>
        </article>
        <div className="mt-8 rounded-2xl bg-ink p-6 text-fg-inverse">
          <h2 className="text-2xl">Sarah Blankenship</h2>
          <p className="mt-1 font-semibold text-powder">Softball Program Coordinator</p>
          <p className="mt-3 text-fg-soft">
            Helping families find their place with Oklahoma Prospects softball.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/tryouts" search={{ sport: "Softball" }} hash="register">
              Request a softball tryout
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
