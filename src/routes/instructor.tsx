import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getMyPerson } from "@/lib/person-api";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { CoachSessions } from "@/components/commerce/coach-sessions";
import { CoachProfile } from "@/components/commerce/coach-profile";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/instructor")({
  head: () =>
    pageHead("/instructor", "Instructor Workspace", "Your lesson sessions and availability.", true),
  component: Page,
});
function Page() {
  const { user, isPending } = useCurrentUserState();
  const [person, setPerson] = useState<Awaited<ReturnType<typeof getMyPerson>>>(),
    [error, setError] = useState("");
  useEffect(() => {
    if (user)
      getMyPerson()
        .then(setPerson)
        .catch((e) => setError(e.message));
  }, [user?.id]);
  if (isPending)
    return (
      <main id="main" className="p-6">
        Loading…
      </main>
    );
  if (!user) return <RedirectToSignIn />;
  return (
    <main id="main" className="mx-auto max-w-4xl px-5 py-6">
      <h1 className="text-4xl">Instructor workspace</h1>
      <nav className="my-5 flex flex-wrap gap-5">
        <a href="/my-profile" className="min-h-11 underline">
          My shared profile
        </a>
        <a href="/family" className="min-h-11 underline">
          Family
        </a>
        <a href="/account?desk=overview" className="min-h-11 underline">
          Player development
        </a>
      </nav>
      {error ? (
        <p role="alert">{error}</p>
      ) : !person ? (
        <p>Loading assignments…</p>
      ) : person.value.instructor || person.canManage ? (
        <>
          <CoachSessions />
          <details className="mt-6 rounded-xl border p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">My availability</summary>
            <CoachProfile availabilityOnly />
          </details>
        </>
      ) : (
        <p>Front Office must assign lesson services before you can teach bookable lessons.</p>
      )}
    </main>
  );
}
