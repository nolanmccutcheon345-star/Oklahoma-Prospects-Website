import { createFileRoute } from "@tanstack/react-router";
import { getPublicPeople } from "@/lib/person-api";
import { PeopleDirectory } from "@/components/people-directory";
import { PageHero } from "@/components/page-hero";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/coaches")({
  head: () =>
    pageHead(
      "/coaches",
      "Meet Our Coaches",
      "Meet the coaches leading our baseball and softball teams.",
      false,
    ),
  loader: () => getPublicPeople(),
  component: () => (
    <main id="main">
      <PageHero
        eyebrow="Oklahoma Prospects"
        title="Meet our coaches."
        copy="Meet the coaches guiding our athletes’ development and leading our baseball and softball teams."
        compact
      />
      <PeopleDirectory people={Route.useLoaderData()} kind="coaches" />
    </main>
  ),
});
