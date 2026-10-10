import { createFileRoute } from "@tanstack/react-router";
import { getPublicPeople } from "@/lib/person-api";
import { PeopleDirectory } from "@/components/people-directory";
import { PageHero } from "@/components/page-hero";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/instructors")({
  head: () =>
    pageHead(
      "/instructors",
      "Meet Our Instructors",
      "Explore baseball and softball lesson instructors, specialties, and availability.",
      false,
    ),
  loader: () => getPublicPeople(),
  component: () => (
    <main id="main">
      <PageHero
        eyebrow="Oklahoma Prospects"
        title="Meet your instructors."
        copy="Find the right instructor for your player. Explore specialties, get to know our staff, and book your next lesson."
        compact
      />
      <PeopleDirectory people={Route.useLoaderData()} kind="instructors" />
    </main>
  ),
});
