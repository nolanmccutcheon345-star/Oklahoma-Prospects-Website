import { CLUB } from "@/lib/club";
import { createFileRoute } from "@tanstack/react-router";
import FundraisingApp from "@/components/fundraising-app";
import css from "@/fundraising.css?url";
export const Route = createFileRoute("/fundraising/my")({
  head: () => ({
    meta: [
      { title: `Player Fundraising | ${CLUB.name}` },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "stylesheet", href: css }],
  }),
  component: Page,
});
function Page() {
  return <FundraisingApp mode="my" />;
}
