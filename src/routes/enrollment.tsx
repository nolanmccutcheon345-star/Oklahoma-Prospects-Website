import { createFileRoute } from "@tanstack/react-router";
import { EnrollmentWorkspace } from "@/components/enrollment/workspace";
import { pageHead } from "@/lib/seo";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";
export const Route = createFileRoute("/enrollment")({
  head: () =>
    pageHead(
      "/enrollment",
      "My Season & Enrollment",
      "Your team packet, enrollment steps and first month.",
      true,
    ),
  validateSearch: (s: Record<string, unknown>): { teamId?: string; playerId?: string } => ({
    teamId: typeof s.teamId === "string" ? s.teamId.slice(0, 150) : undefined,
    playerId: typeof s.playerId === "string" ? s.playerId.slice(0, 150) : undefined,
  }),
  component: Page,
});
function Page() {
  const { teamId, playerId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user, isPending } = useCurrentUserState();
  if (isPending)
    return (
      <main id="main" className="p-6">
        Loading…
      </main>
    );
  if (!user) return <RedirectToSignIn />;
  return (
    <main id="main" className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="mb-5 text-4xl">My Season & Enrollment</h1>
      <EnrollmentWorkspace
        initialTeamId={teamId}
        initialPlayerId={playerId}
        onSelectionChange={(teamId, playerId) => {
          void navigate({ search: { teamId, playerId }, replace: true });
        }}
      />
    </main>
  );
}
