import { PageHero } from "@/components/page-hero";
import { CLUB } from "@/lib/club";
import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";

const GAMES_COPY = "Games is coming soon. Live scores, schedules and replays will live here.";

export const Route = createFileRoute("/games")({
  head: () => pageHead("/games", "Games", GAMES_COPY, false),
  component: GamesPage,
});

function GamesPage() {
  return (
    <main id="main">
      <PageHero eyebrow={CLUB.name} title="Games" copy={GAMES_COPY} />
    </main>
  );
}
