import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { pageHead } from "@/lib/seo";
import { TeamHubWorkspace } from "@/components/team-hub/workspace";
export const Route = createFileRoute("/team-hub")({
  head: () =>
    pageHead(
      "/team-hub",
      "Team Hub",
      "Your Prospects team updates, schedule and family conversations.",
      true,
    ),
  component: TeamHubPage,
});
function TeamHubPage() {
  const { user, isPending } = useCurrentUserState();
  if (isPending)
    return (
      <main id="main" className="p-6" role="status">
        Loading your account…
      </main>
    );
  if (!user) return <RedirectToSignIn />;
  return <TeamHubWorkspace key={user.id} />;
}
