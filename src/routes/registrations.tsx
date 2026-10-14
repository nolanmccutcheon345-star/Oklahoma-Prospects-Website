import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { TryoutCenter } from "@/components/tryout-center";

export const Route = createFileRoute("/registrations")({
  head: () =>
    pageHead(
      "/registrations",
      "Tryouts & Evaluations",
      "Prospects coordinator registration desk.",
      true,
    ),
  component: Page,
});
function Page() {
  const { user, isPending } = useCurrentUserState();
  if (isPending)
    return (
      <main id="main" className="p-6">
        <p role="status">Loading account…</p>
      </main>
    );
  if (!user) return <RedirectToSignIn />;
  return <TryoutCenter />;
}
