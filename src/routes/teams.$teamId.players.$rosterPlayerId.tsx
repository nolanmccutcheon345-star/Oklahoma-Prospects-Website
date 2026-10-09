import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getTeamPlayerStats } from "@/lib/teams/public-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { StatsTable } from "@/components/team-stats-table";
import { CLUB } from "@/lib/club";
export const Route = createFileRoute("/teams/$teamId/players/$rosterPlayerId")({
  head: () => ({meta: [{title: `Player stats | ${CLUB.name}`}, {name: "robots", content: "noindex"}]}),
  component: Page,
});
function Page() {
  const {teamId, rosterPlayerId} = Route.useParams();
  const {user, isPending} = useCurrentUserState();
  const signedIn = Boolean(user && !user.isDevFallback);
  const [player, setPlayer] = useState<Awaited<ReturnType<typeof getTeamPlayerStats>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setPlayer(null); setError("");
    if (signedIn) getTeamPlayerStats({data: {teamId, playerId: rosterPlayerId}})
      .then(row => { if (active) setPlayer(row); }).catch(e => { if (active) setError(e.message || "Stats unavailable."); });
    return () => { active = false; };
  }, [teamId, rosterPlayerId, signedIn, user?.id]);
  return <main id="main" className="mx-auto max-w-3xl px-5 py-8">
    <a className="inline-flex min-h-11 items-center underline" href={"/teams/"+encodeURIComponent(teamId)}>Back to team</a>
    <h1 className="mt-3 text-3xl">{player ? `${player.name} · Stats` : "Player stats"}</h1>
    {isPending ? <p role="status">Checking access…</p> : !user || user.isDevFallback ? <p className="mt-3">Sign in with your team account to view individual stats. <a className="underline" href={`/login?next=${encodeURIComponent(`/teams/${teamId}/players/${rosterPlayerId}`)}`}>Sign in</a></p> : error ? <p role="alert" className="mt-3">{error}</p> : player ? <><p>{player.teamName}{player.number ? ` · #${player.number}` : ""}</p><StatsTable stats={player.stats} /></> : <p role="status">Loading stats…</p>}
  </main>;
}
