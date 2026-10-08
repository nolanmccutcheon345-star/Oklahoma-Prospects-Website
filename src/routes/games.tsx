import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { CLUB } from "@/lib/club";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/games")({
  head: () =>
    pageHead(
      "/games",
      "Games",
      "Games is not launched on this site yet. Steve's Prospects Live project is not embedded or opened from here.",
      false,
    ),
  component: GamesPage,
});

function GamesPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow={CLUB.name}
        title="Games"
        accent="Not launched yet."
        copy="Schedules, scores, and live viewing are not available on this page yet."
      />
      <section className="mx-auto max-w-3xl px-5 py-10" aria-labelledby="games-status">
        <h2 id="games-status" className="text-3xl">
          Prospects Live
        </h2>
        <p className="mt-3 text-muted">
          Steve&apos;s Prospects Live work stays in that project. This page does not embed it,
          redirect to it, or start a broadcast.
        </p>
        <p className="mt-3 text-muted">
          When Games launches, it will be here on {CLUB.name}. Until then, there is nothing to watch
          on this screen.
        </p>
        <div className="mt-6">
          <Button asChild variant="outlineDark">
            <Link to="/teams">Team information</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
