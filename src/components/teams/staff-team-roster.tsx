import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getStaffTeamRoster } from "@/lib/teams/staff-roster-api";
import { Button } from "../ui/button";

export function StaffTeamRoster({ teamId }: { teamId: string }) {
  const { user, isPending } = useCurrentUserState();
  // No SSR roster payload. Changing identity/team unmounts all private state
  // immediately, including when signing out or navigating between team pages.
  if (isPending || !user || user.isDevFallback) return null;
  return <AuthenticatedRoster key={`${user.id}:${teamId}`} teamId={teamId} />;
}

function AuthenticatedRoster({ teamId }: { teamId: string }) {
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof getStaffTeamRoster>>>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setRoster(null);
    getStaffTeamRoster({ data: { teamId } })
      .then((result) => {
        if (active) setRoster(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [teamId, attempt]);

  if (loading)
    return (
      <p role="status" className="py-4">
        Checking staff roster access…
      </p>
    );
  if (error)
    return (
      <div className="my-4 rounded-lg border p-4">
        <p role="alert">Staff roster access could not be checked. Please retry or sign in again.</p>
        <Button variant="outline" className="mt-2" onClick={() => setAttempt((value) => value + 1)}>
          Retry
        </Button>
      </div>
    );
  if (!roster) return null;
  const activeCount = roster.players.filter((player) => !player.withdrawn).length;
  return (
    <section aria-label="Private staff roster" className="my-6 rounded-xl border bg-paper p-5">
      <h2 className="text-2xl">Full team roster · Staff only</h2>
      <p className="mt-2 font-semibold">
        {roster.teamName} · {activeCount} active players
      </p>
      <p className="mt-2 text-sm">
        This private list includes players without public-roster consent. Public visitors only see
        players with current signed consent. No privacy settings have changed.
      </p>
      <ul className="mt-4 grid gap-2">
        {roster.players.map((player) => (
          <li key={player.id} className="rounded-lg border px-3 py-3">
            {player.number ? `#${player.number} ` : ""}
            {player.name}
            {player.withdrawn && <span className="ml-2 text-sm">— Withdrawn</span>}
          </li>
        ))}
      </ul>
      {!roster.players.length && (
        <p className="mt-3">No players on this team's private roster yet.</p>
      )}
    </section>
  );
}
