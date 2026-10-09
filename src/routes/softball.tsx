import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero } from "@/components/page-hero";
import { TryoutSchedule } from "@/components/tryout-schedule";
import { PublicTeamRoster } from "@/components/public-team-roster";
import { Button } from "@/components/ui/button";
import { getPublicTryoutEvents } from "@/lib/tryout-events-api";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/softball")({
  head: () => pageHead("/softball", "Softball Teams & Tryouts", "Explore Prospects softball teams, tryout opportunities and coaching in Broken Arrow.", false),
  loader: () => getPublicTryoutEvents(),
  component: SoftballPage,
});

function SoftballPage() {
  const events = Route.useLoaderData();
  const sportEvents = events.filter((event) => event.sport === "Softball");
  return (
    <main id="main">
      <PageHero
        eyebrow="Prospects Softball"
        title="Softball teams."
        accent="Find your fit."
        copy="Explore softball opportunities, meet our coaches and request an individual tryout."
        image="/brand/team.jpg"
        actions={<>
          <Button asChild><Link to="/tryouts" search={{sport:"Softball"}} hash="register">Register for softball tryouts</Link></Button>
          <Button asChild variant="outline"><Link to="/coaches">Meet the coaches</Link></Button>
        </>}
      />
      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="text-3xl">Softball tryouts & evaluations</h2>
        <p className="mt-3 mb-6 text-muted">{sportEvents.length ? "See published softball group dates below. Registration does not guarantee a roster spot." : "No softball group dates are posted yet. You can still request an individual evaluation."}</p>
        <TryoutSchedule events={sportEvents} sport="Softball" />
        <Button asChild className="mt-6"><Link to="/tryouts" search={{sport:"Softball"}} hash="register">Request a softball tryout</Link></Button>
      </section>
      <section className="bg-paper-2 px-5 py-10">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl">Our softball teams</h2>
          <p className="mt-3 text-muted">Current openings and team assignments are confirmed with our staff.</p>
          <PublicTeamRoster sport="Softball" />
        </div>
      </section>
    </main>
  );
}
