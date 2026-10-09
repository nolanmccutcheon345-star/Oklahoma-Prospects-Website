import { useEffect, useState } from "react";
import { playerDestination, type Player } from "@/lib/fundraising/shared";
type TeamSummary = { id: string; name: string; sport: string; season: string; players?: Player[] };
export function PublicTeamRoster({ teamId, sport }: { teamId?: string; sport?: "Baseball" | "Softball" }) {
  const [teams, setTeams] = useState<TeamSummary[]>([]),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/fundraising/teams" + (teamId ? "?teamId=" + encodeURIComponent(teamId) : ""))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Team unavailable.");
        if (!cancelled) setTeams((teamId ? [d.team] : d.teams).filter((team: TeamSummary) => !sport || team.sport.toLowerCase() === sport.toLowerCase()));
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, sport]);
  return (
    <section className="mx-auto max-w-3xl px-5 py-8" aria-label="Public team roster">
      <h2>{teamId ? "Public roster" : "Team pages"}</h2>
      {!ready && <p role="status">Loading team information…</p>}
      {error && <p role="alert">{error}</p>}
      {ready && !error && !teams.length && <p>No public team pages are available yet.</p>}
      {teams.map((t) => (
        <article key={t.id} className="mt-4 rounded border p-4">
          <h3>{t.name}</h3>
          <p>
            {t.sport} · {t.season}
          </p>
          {teamId ? (
            <>
              <p>Only players with permission to publish appear here.</p>
              <ul>
                {t.players?.map((p) => (
                  <li key={p.id} className="mt-3">
                    <a
                      className="inline-flex min-h-11 items-center underline"
                      href={playerDestination(p)}
                    >
                      {p.name} · View player
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <a
              className="inline-flex min-h-11 items-center underline"
              href={"/teams/" + encodeURIComponent(t.id)}
            >
              View team and public roster
            </a>
          )}
        </article>
      ))}
    </section>
  );
}
