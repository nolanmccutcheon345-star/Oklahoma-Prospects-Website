import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { PublicTeamRoster } from "@/components/public-team-roster";
export const Route = createFileRoute("/teams/$teamId")({
  head: () => ({
    meta: [
      { title: "Team roster | Oklahoma Prospects Academy" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});
function Page() {
  const { teamId } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (
    pathname !== "/teams/" + encodeURIComponent(teamId) &&
    pathname !== "/teams/" + encodeURIComponent(teamId) + "/"
  )
    return <Outlet />;
  return (
    <main id="main">
      <h1 className="mx-auto max-w-3xl px-5 pt-8">Team roster</h1>
      <a className="inline-flex min-h-11 items-center px-5 underline" href="/teams">
        All teams
      </a>
      <PublicTeamRoster key={teamId} teamId={teamId} />
    </main>
  );
}
