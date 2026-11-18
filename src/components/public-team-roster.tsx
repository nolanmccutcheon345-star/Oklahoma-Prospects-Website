import { publicCoachName } from "@/lib/public-profile-text";
import { publicRequest } from "@/lib/public-request";
import { CatalogStatus } from "./catalog-status";
import { TeamActivities } from "./teams/team-activities";
import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { getPublicTeamsView, getTeamStatsAccess } from "@/lib/teams/public-api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { CoachBio } from "./coach-bio";
import { StatsTable } from "./team-stats-table";
import { publicRecordLabel } from "@/lib/public-record";
type PublicTeam = Awaited<ReturnType<typeof getPublicTeamsView>>[number];
export function PublicTeamRoster({
  teamId,
  sport,
  initial,
}: {
  initial?: PublicTeam[] | null;
  teamId?: string;
  sport?: "Baseball" | "Softball";
}) {
  const [teams, setTeams] = useState<PublicTeam[]>(initial || []);
  const [age, setAge] = useState("");
  const [season, setSeason] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(Boolean(initial));
  const [attempt, setAttempt] = useState(0);
  const [access, setAccess] = useState<{ userId: string; teamId: string; allowed: boolean } | null>(null);
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  const signedIn = Boolean(!isPending && user && !user.isDevFallback);
  const statsAccess = Boolean(signedIn && access?.userId === user?.id && access?.teamId === teamId && access?.allowed);
  useEffect(() => {
    if (initial && attempt === 0) return;
    let active = true;
    setTeams([]);
    setReady(false);
    setError("");
    publicRequest(getPublicTeamsView())
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
  }, [teamId, sport, initial, attempt]);
  useEffect(() => {
    let active = true;
    setAccess(null);
    if (teamId && signedIn && userId) {
      getTeamStatsAccess({ data: { teamId } })
        .then((row) => {
          if (active) setAccess({userId, teamId, allowed: row.allowed});
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [teamId, signedIn, userId]);
  const currentTeams = (initial && attempt === 0 ? initial : teams).filter(
    (t) =>
      (!teamId || t.id === teamId) && (!sport || t.sport.toLowerCase() === sport.toLowerCase()),
  );
  const ages = [...new Set(currentTeams.map((t) => t.age))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const seasons = [...new Set(currentTeams.flatMap((t) => t.seasons))].sort();
  const visible = currentTeams.filter(
    (t) => (!age || t.age === age) && (!season || t.seasons.includes(season)),
  );
  return (
    <section className="mx-auto max-w-5xl py-8" aria-label="Public team roster">
      {teamId && statsAccess && <TeamActivities key={`${user?.id}:${teamId}`} teamId={teamId} />}
      {!teamId && currentTeams.length >= 4 && (
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
      {ready && currentTeams.length > 0 && !visible.length && (
        <p role="status">No teams match these filters. Try another age group or season.</p>
      )}
      {(!ready || error) && (
        <CatalogStatus
          label="team information"
          error={Boolean(error)}
          retry={() => setAttempt((n) => n + 1)}
        />
      )}
      {ready && !error && !currentTeams.length && <p>No team pages are available yet.</p>}
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
                          alt={publicCoachName(c.name)}
                          className="mb-2 size-24 rounded-lg object-cover"
                        />
                      )}
                      <strong>{publicCoachName(c.name)}</strong>
                      <p className="text-sm">{c.role}</p>
                      <CoachBio>{c.bio}</CoachBio>
                    </div>
                  ))
                ) : (
                  <p>Coaches have not been assigned yet.</p>
                )}
                <p className="mt-5 font-semibold">
                  {publicRecordLabel(t.record) ?? "Season results not published yet."}
                </p>
                <h4 className="mt-5 text-xl">Team stats</h4>
                <StatsTable stats={t.stats} />
                <h4 className="mt-5 text-xl">Private roster</h4>
                <p className="mt-2 text-sm">
                  Player names are visible only to authorized staff signed in to this team.
                </p>
              </>
            ) : (
              <>
                <div className="mt-4">
                  <h4 className="font-semibold">Coaching assignments</h4>
                  {t.coaches.length ? (
                    t.coaches.map((c, i) => (
                      <p key={c.name + i} className="mt-1 text-sm">
                        {publicCoachName(c.name)} · {c.role}
                      </p>
                    ))
                  ) : (
                    <p className="mt-1 text-sm text-muted">Coaches to be announced</p>
                  )}
                </div>
                <p className="mt-4 mb-5 font-semibold">
                  {publicRecordLabel(t.record) ?? "Season results not published yet."}
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
