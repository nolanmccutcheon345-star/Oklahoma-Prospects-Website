import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { TeamsShell } from "@/components/teams/shell";
import { TryoutEvaluations } from "@/components/tryout-evaluations";

export const Route = createFileRoute("/evaluations")({
  head: () =>
    pageHead(
      "/evaluations",
      "Tryout Evaluations",
      "Private Oklahoma Prospects coach evaluations and owner results.",
      true,
    ),
  component: Page,
});
function Page() {
  return (
    <ClientOnly fallback={<Loading />}>
      <AuthenticatedEvaluations />
    </ClientOnly>
  );
}
function Loading() {
  return (
    <main id="main" className="p-6">
      <p role="status">Loading evaluations…</p>
    </main>
  );
}
function AuthenticatedEvaluations() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <Loading />;
  if (!user) return <RedirectToSignIn />;
  return (
    <TeamsShell
      title="Tryout evaluations"
      path="/evaluations"
      nav={[
        { to: "/coach", label: "Coach" },
        { to: "/evaluations", label: "Evaluations" },
        { to: "/office", label: "Office" },
      ]}
    >
      <TryoutEvaluations />
    </TeamsShell>
  );
}
