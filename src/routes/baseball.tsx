import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero } from "@/components/page-hero";
import { TryoutSchedule } from "@/components/tryout-schedule";
import { PublicTeamRoster } from "@/components/public-team-roster";
import { Button } from "@/components/ui/button";
import { getPublicTryoutEvents } from "@/lib/tryout-events-api";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/baseball")({
  head: () =>
    pageHead(
      "/baseball",
      "Baseball Teams & Tryouts",
      "Explore Prospects baseball teams, tryout opportunities and coaching in Broken Arrow.",
      false,
    ),
  loader: () => getPublicTryoutEvents(),
  component: BaseballPage,
});

function BaseballPage() {
  const events = Route.useLoaderData();
  const sportEvents = events.filter((event) => event.sport === "Baseball");
  return (
    <main id="main">
      <PageHero
        eyebrow="Prospects Baseball"
        title="Baseball teams."
        accent="Find your fit."
        copy="Explore our baseball teams, meet the coaches, and find your next opportunity at Prospects Sports Academy."
        image="/brand/team.jpg"
        actions={
          <>
            <Button asChild>
              <a href="#explore-teams">Explore Teams</a>
            </Button>
            <Button asChild variant="outline">
              <Link to="/tryouts" search={{ sport: "Baseball" }} hash="register">
                Request a baseball tryout
              </Link>
            </Button>
          </>
        }
      />
      <section id="explore-teams" className="scroll-mt-24 bg-paper-2 px-5 py-10">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl">Explore our baseball teams</h2>
          <p className="mt-3 text-muted">
            Browse teams by age group and season. Contact our staff to confirm roster openings and
            the right fit for your player.
          </p>
          <PublicTeamRoster sport="Baseball" />
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-5 py-10">
        <h2 className="text-3xl">Find your next team</h2>
        <p className="mt-3 mb-6 text-muted">
          Explore upcoming tryouts or request an individual evaluation. Our staff will help you find
          the right next step.
        </p>
        <TryoutSchedule events={sportEvents} sport="Baseball" />
        <Button asChild className="mt-6">
          <Link to="/tryouts" search={{ sport: "Baseball" }} hash="register">
            Request a baseball tryout
          </Link>
        </Button>
      </section>
    </main>
  );
}
