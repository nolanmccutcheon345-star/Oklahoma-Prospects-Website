import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getPublishedTeamFees } from "@/lib/teams/fee-api";
import { money } from "@/lib/teams/fee-model";

export function PublishedTeamFees({ teamId }: { teamId: string }) {
  const { user } = useCurrentUserState();
  const [loaded, setLoaded] = useState<{
    userId: string;
    teamId: string;
    value: Awaited<ReturnType<typeof getPublishedTeamFees>>;
  }>();
  const quote =
    user && loaded?.userId === user.id && loaded.teamId === teamId ? loaded.value : null;
  useEffect(() => {
    let active = true,
      generation = 0;
    setLoaded(undefined);
    if (!user || user.isDevFallback) return;
    const load = () => {
      const request = ++generation;
      setLoaded(undefined);
      void getPublishedTeamFees({ data: { teamId } })
        .then((value) => {
          if (active && request === generation) setLoaded({ userId: user.id, teamId, value });
        })
        .catch(() => {
          if (active && request === generation) setLoaded(undefined);
        });
    };
    load();
    window.addEventListener("focus", load);
    window.addEventListener("team-budget-updated", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
      window.removeEventListener("team-budget-updated", load);
    };
  }, [teamId, user?.id]);
  if (!quote) return null;
  return (
    <section
      className="my-5 grid gap-2 rounded-xl border border-line bg-paper p-4"
      aria-label="Published team player fees"
    >
      <h2 className="text-2xl">Published player fees</h2>
      <p>Full player: {money(quote.full)}</p>
      {quote.fullAccess !== undefined && (
        <p>With optional Individual Facility Access Upgrade: {money(quote.fullAccess)}</p>
      )}
      {quote.po !== undefined && <p>Pitcher only: {money(quote.po)}</p>}
      <p className="text-sm">
        Final payment due {quote.finalDue} · Front Office published version {quote.revision}
      </p>
      <p className="text-sm">
        Your accepted agreement and payment history remain in your private account.
      </p>
    </section>
  );
}
