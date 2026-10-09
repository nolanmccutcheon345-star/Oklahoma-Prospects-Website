import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { getPublicTeamsView, getTeamStatsAccess } from "@/lib/teams/public-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { CoachBio } from "./coach-bio";
import { StatsTable } from "./team-stats-table";
type PublicTeam = Awaited<ReturnType<typeof getPublicTeamsView>>[number];
export function PublicTeamRoster({
  teamId,
  sport,
}: {
  teamId?: string;
  sport?: "Baseball" | "Softball";
}) {
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [age, setAge] = useState("");
  const [season, setSeason] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [statsAccess, setStatsAccess] = useState(false);
  const { user } = useCurrentUserState();
  const signedIn = Boolean(user && !user.isDevFallback);
  useEffect(() => {
    let active = true;
    setReady(false);
    setError("");
    getPublicTeamsView()
      .then((rows) => {
        if (!active) return;
        const filtered = rows.filter(
          (t) =>
            (!teamId || t.id === teamId) &&
            (!sport || t.sport.toLowerCase() === sport.toLowerCase()),
        );
        setTeams(filtered);
      })
      .catch((e) => {
        if (active) setError(e.message || "Team unavailable.");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [teamId, sport]);
  useEffect(() => {
    let active = true;
    setStatsAccess(false);
    if (teamId && signedIn) {
      getTeamStatsAccess({ data: { teamId } })
        .then((row) => {
          if (active) setStatsAccess(row.allowed);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [teamId, signedIn, user?.id]);
  const ages = [...new Set(teams.map((t) => t.age))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const seasons = [...new Set(teams.flatMap((t) => t.seasons))].sort();
  const visible = teams.filter(
    (t) => (!age || t.age === age) && (!season || t.seasons.includes(season)),
  );
  return (
    <section className="mx-auto max-w-5xl py-8" aria-label="Public team roster">
      {!teamId && teams.length >= 4 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Age Group
            <select
              className="mt-2 block min-h-11 w-full rounded-md border bg-paper px-3"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            >
              <option value="">All age groups</option>
              {ages.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Season
            <select
              className="mt-2 block min-h-11 w-full rounded-md border bg-paper px-3"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            >
              <option value="">All seasons</option>
              {seasons.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {ready && teams.length > 0 && !visible.length && (
        <p role="status">No teams match these filters. Try another age group or season.</p>
      )}
      {!ready && <p role="status">Loading team information…</p>}
      {error && <p role="alert">{error}</p>}
      {ready && !error && !teams.length && <p>No team pages are available yet.</p>}
      <div className={teamId ? "grid gap-5" : "grid gap-5 md:grid-cols-2"}>
        {visible.map((t) => (
          <article key={t.id} className="flex flex-col rounded-xl border bg-paper p-5">
            <h3 className="text-2xl">{t.name}</h3>
            <p className="mt-2 capitalize">
              {t.sport} · {t.age}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.seasons.map((season) => (
                <span
                  key={season}
                  className="rounded-full bg-paper-2 px-3 py-1 text-sm font-semibold"
                >
                  {season}
                </span>
              ))}
            </div>
            {teamId ? (
              <>
                <h4 className="mt-5 text-xl">Coaches</h4>
                {t.coaches.length ? (
                  t.coaches.map((c, i) => (
                    <div key={c.name + i} className="mt-3 rounded-lg bg-paper-2 p-4">
                      {c.photo && (
                        <img
                          src={c.photo}
                          alt={c.name}
                          className="mb-2 size-24 rounded-lg object-cover"
                        />
                      )}
                      <strong>{c.name}</strong>
                      <p className="text-sm">{c.role}</p>
                      <CoachBio>{c.bio}</CoachBio>
                    </div>
                  ))
                ) : (
                  <p>Coaches have not been assigned yet.</p>
                )}
                <p className="mt-5 font-semibold">
                  Record: {t.record.w}–{t.record.l}–{t.record.t} (W–L–T)
                </p>
                <h4 className="mt-5 text-xl">Team stats</h4>
                <StatsTable stats={t.stats} />
                <h4 className="mt-5 text-xl">Roster</h4>
                {!statsAccess && (
                  <p className="mt-2 text-sm">
                    Individual stats are available to signed-in players, parents and coaches on this
                    team.
                  </p>
                )}
                <ul className="mt-2 grid gap-2">
                  {t.players.map((p) => (
                    <li key={p.id} className="rounded-lg border px-3 py-2">
                      {statsAccess ? (
                        <a
                          className="inline-flex min-h-11 items-center underline"
                          href={`/teams/${encodeURIComponent(t.id)}/players/${encodeURIComponent(p.id)}`}
                        >
                          {p.number ? `#${p.number} ` : ""}
                          {p.name} · View stats
                        </a>
                      ) : (
                        <span>
                          {p.number ? `#${p.number} ` : ""}
                          {p.name}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {!t.players.length && <p>No players rostered yet.</p>}
              </>
            ) : (
              <>
                <div className="mt-4">
                  <h4 className="font-semibold">Coaching assignments</h4>
                  {t.coaches.length ? (
                    t.coaches.map((c, i) => (
                      <p key={c.name + i} className="mt-1 text-sm">
                        {c.name} · {c.role}
                      </p>
                    ))
                  ) : (
                    <p className="mt-1 text-sm text-muted">Coaches to be announced</p>
                  )}
                </div>
                <p className="mt-4 mb-5 font-semibold">
                  Record: {t.record.w}–{t.record.l}–{t.record.t} (W–L–T)
                </p>
                <Button asChild className="mt-auto w-full">
                  <a
                    aria-label={`View team: ${t.name}`}
                    href={"/teams/" + encodeURIComponent(t.id)}
                  >
                    View Team
                  </a>
                </Button>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
