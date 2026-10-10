import { createFileRoute } from "@tanstack/react-router";
import { PersonEditor } from "@/components/staff/person-editor";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/my-profile")({
  head: () =>
    pageHead(
      "/my-profile",
      "My Shared Profile",
      "Manage your coaching and instructor profile.",
      true,
    ),
  component: Page,
});
function Page() {
  const { user, isPending } = useCurrentUserState();
  if (isPending)
    return (
      <main id="main" className="p-6">
        Loading account…
      </main>
    );
  if (!user) return <RedirectToSignIn />;
  return (
    <main id="main" className="mx-auto max-w-3xl px-5 py-6">
      <nav className="flex flex-wrap gap-5">
        <a className="min-h-11 underline" href="/account">
          Account
        </a>
        <a className="min-h-11 underline" href="/coach">
          Team Coach workspace
        </a>
        <a className="min-h-11 underline" href="/instructor">
          Instructor workspace
        </a>
      </nav>
      <PersonEditor />
    </main>
  );
}
