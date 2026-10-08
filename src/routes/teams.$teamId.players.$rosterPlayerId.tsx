import { createFileRoute } from "@tanstack/react-router";
import FundraisingApp from "@/components/fundraising-app";
import css from "@/fundraising.css?url";
export const Route = createFileRoute("/teams/$teamId/players/$rosterPlayerId")({
  head: () => ({
    meta: [
      { title: "Player | Oklahoma Prospects Academy" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "stylesheet", href: css }],
  }),
  component: Page,
});
function Page() {
  const { teamId, rosterPlayerId } = Route.useParams();
  return (
    <FundraisingApp
      key={JSON.stringify([teamId, rosterPlayerId])}
      mode="player"
      publicTeamId={teamId}
      publicRosterId={rosterPlayerId}
    />
  );
}
