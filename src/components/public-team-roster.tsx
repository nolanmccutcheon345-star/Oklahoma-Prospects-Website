import { useEffect, useState } from "react";
import { getPublicTeamsView, getTeamStatsAccess } from "@/lib/teams/public-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { CoachBio } from "./coach-bio";
import { StatsTable } from "./team-stats-table";
type PublicTeam = Awaited<ReturnType<typeof getPublicTeamsView>>[number];
export function PublicTeamRoster({ teamId, sport }: { teamId?: string; sport?: "Baseball" | "Softball" }) {
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [statsAccess, setStatsAccess] = useState(false);
  const { user } = useCurrentUserState();
  const signedIn = Boolean(user && !user.isDevFallback);
  useEffect(() => {
    let active = true;
    setReady(false); setError("");
    getPublicTeamsView().then(rows => {
      if (!active) return;
      const filtered = rows.filter(t => (!teamId || t.id === teamId) && (!sport || t.sport.toLowerCase() === sport.toLowerCase()));
      setTeams(filtered);
    }).catch(e => { if (active) setError(e.message || "Team unavailable."); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [teamId, sport]);
  useEffect(() => {
    let active = true;
    setStatsAccess(false);
    if (teamId && signedIn) {
      getTeamStatsAccess({data: {teamId}}).then(row => { if (active) setStatsAccess(row.allowed); }).catch(() => {});
    }
    return () => { active = false; };
  }, [teamId, signedIn, user?.id]);
  return <section className="mx-auto max-w-3xl px-5 py-8" aria-label="Public team roster">
    <h2 className="text-2xl">{teamId ? "Team & roster" : "Team pages"}</h2>
    {!ready && <p role="status">Loading team information…</p>}
    {error && <p role="alert">{error}</p>}
    {ready && !error && !teams.length && <p>No team pages are available yet.</p>}
    {teams.map(t => <article key={t.id} className="mt-4 rounded-xl border p-5">
      <h3 className="text-2xl">{t.name}</h3><p>{t.sport} · {t.age} · {t.season}</p>
      <p className="mt-3 font-semibold">Record: {t.record.w}–{t.record.l}–{t.record.t} (W–L–T)</p>
      {teamId ? <>
        <h4 className="mt-5 text-xl">Coaches</h4>
        {t.coaches.length ? t.coaches.map((c, i) => <div key={c.name+i} className="mt-3 rounded-lg bg-paper-2 p-4">
          {c.photo && <img src={c.photo} alt={c.name} className="mb-2 size-24 rounded-lg object-cover" />}
          <strong>{c.name}</strong><p className="text-sm">{c.role}</p><CoachBio>{c.bio}</CoachBio>
        </div>) : <p>Coaches have not been assigned yet.</p>}
        <h4 className="mt-5 text-xl">Team stats</h4><StatsTable stats={t.stats} />
        <h4 className="mt-5 text-xl">Roster</h4>
        {!statsAccess && <p className="mt-2 text-sm">Individual stats are available to signed-in players, parents and coaches on this team.</p>}
        <ul className="mt-2 grid gap-2">{t.players.map(p => <li key={p.id} className="rounded-lg border px-3 py-2">
          {statsAccess ? <a className="inline-flex min-h-11 items-center underline" href={`/teams/${encodeURIComponent(t.id)}/players/${encodeURIComponent(p.id)}`}>
            {p.number ? `#${p.number} ` : ""}{p.name} · View stats
          </a> : <span>{p.number ? `#${p.number} ` : ""}{p.name}</span>}
        </li>)}</ul>
        {!t.players.length && <p>No players rostered yet.</p>}
      </> : <a className="inline-flex min-h-11 items-center underline" href={"/teams/"+encodeURIComponent(t.id)}>View team and public roster</a>}
    </article>)}
  </section>;
}
