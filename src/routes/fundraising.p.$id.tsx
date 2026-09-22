import { createFileRoute } from "@tanstack/react-router";
import FundraisingApp from "@/components/fundraising-app";
import css from "@/fundraising.css?url";
export const Route = createFileRoute("/fundraising/p/$id")({
  head: () => ({
    meta: [
      { title: "Player Fundraising | Oklahoma Prospects" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "stylesheet", href: css }],
  }),
  component: Page,
});
function Page() {
  const { id } = Route.useParams();
  return <FundraisingApp mode="player" playerId={id} />;
}
