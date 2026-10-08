import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { RegistrationDesk } from "@/components/registration-desk";

export const Route = createFileRoute("/registrations")({
  head: () =>
    pageHead(
      "/registrations",
      "Registrations & inquiries",
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
  return <RegistrationDesk />;
}
