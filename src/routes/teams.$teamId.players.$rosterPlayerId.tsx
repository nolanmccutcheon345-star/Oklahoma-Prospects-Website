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
  return <main id="main" className="mx-auto max-w-3xl px-5 py-8">
    <a className="inline-flex min-h-11 items-center underline" href={"/teams/"+encodeURIComponent(teamId)}>Back to team</a>
    {isPending ? <p role="status">Checking access…</p> : !user || user.isDevFallback ? <>
      <h1 className="mt-3 text-3xl">Player stats</h1>
      <p className="mt-3">Sign in with an authorized staff account to view individual stats. <a className="underline" href={`/login?next=${encodeURIComponent(`/teams/${teamId}/players/${rosterPlayerId}`)}`}>Sign in</a></p>
    </> : <AuthenticatedPlayerStats key={`${user.id}:${teamId}:${rosterPlayerId}`} teamId={teamId} rosterPlayerId={rosterPlayerId} />}
  </main>;
}
function AuthenticatedPlayerStats({teamId, rosterPlayerId}: {teamId: string; rosterPlayerId: string}) {
  const [player, setPlayer] = useState<Awaited<ReturnType<typeof getTeamPlayerStats>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setPlayer(null); setError("");
    getTeamPlayerStats({data: {teamId, playerId: rosterPlayerId}})
      .then(row => { if (active) setPlayer(row); }).catch(e => { if (active) setError(e.message || "Stats unavailable."); });
    return () => { active = false; };
  }, [teamId, rosterPlayerId]);
  return <>
    <h1 className="mt-3 text-3xl">{player ? `${player.name} · Stats` : "Player stats"}</h1>
    {error ? <p role="alert" className="mt-3">{error}</p> : player ? <><p>{player.teamName}{player.number ? ` · #${player.number}` : ""}</p><StatsTable stats={player.stats} /></> : <p role="status">Loading stats…</p>}
  </>;
}
