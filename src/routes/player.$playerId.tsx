import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getRecruitingPlayer } from "@/lib/recruiting-api";
import { metricDefinitions, currentSeason } from "@/lib/recruiting-contracts";
import { StatsTable } from "@/components/team-stats-table";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/player/$playerId")({
  head: ({ params }) =>
    pageHead(
      "/player/" + encodeURIComponent(params.playerId),
      "Player recruiting profile",
      "Oklahoma Prospects player recruiting profile.",
    ),
  component: Page,
});
function Page() {
  const { playerId } = Route.useParams();
  const [p, setP] = useState<Awaited<ReturnType<typeof getRecruitingPlayer>>[number]>(),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [team, setTeam] = useState("all"),
    [season, setSeason] = useState(currentSeason());
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setP(undefined);
    getRecruitingPlayer({ data: { athleteId: playerId } })
      .then((r) => {
        if (active) {
          setP(r[0]);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [playerId]);
  if (!p)
    return (
      <main id="main" className="mx-auto max-w-4xl px-5 py-8">
        <a href="/players">All players</a>
        <p role="status">
          {error || (!loaded ? "Loading profile…" : "This profile is private or unavailable.")}
        </p>
      </main>
    );
  const seasons = [
    ...new Set([
      currentSeason(),
      ...p.teams.flatMap((t) => t.seasons),
      ...p.rows.map((r) => r.season),
      ...p.additional.map((r) => r.season),
    ]),
  ];
  const rows = p.rows.filter(
    (r) => (team === "all" || r.teamId === team) && (season === "all" || r.season === season),
  );
  const stats: Record<string, number> = {};
  for (const r of rows)
    for (const [k, v] of Object.entries(r.values)) stats[k] = (stats[k] || 0) + v;
  if (stats.ab) stats.avg = stats.h / stats.ab;
  return (
    <main id="main" className="mx-auto max-w-4xl px-5 py-8">
      <a className="inline-flex min-h-11 items-center underline" href="/players">
        All players
      </a>
      <section className="grid gap-5 rounded-2xl bg-ink p-5 text-white sm:grid-cols-2">
        <div>
          <h1 className="text-4xl">{p.name}</h1>
          <p className="my-3 text-powder">
            {p.profile.gradYear && "Class of " + p.profile.gradYear + " · "}
            {p.profile.positions}
          </p>
          <p>
            {p.teams
              .filter((t) => t.current)
              .map((t) => t.name)
              .join(" · ")}
          </p>
          <div className="my-4 flex flex-wrap gap-2">
            {[
              ["Bats", p.profile.bats],
              ["Throws", p.profile.throws],
              ["Height", p.profile.height],
              ["Weight", p.profile.weight],
            ]
              .filter((x) => x[1])
              .map(([k, v]) => (
                <span key={k} className="rounded border border-powder/50 px-3 py-2">
                  {k}: {v}
                </span>
              ))}
          </div>
        </div>
        {p.profile.photo ? (
          <img
            src={p.profile.photo}
            alt={p.name}
            className="max-h-96 w-full rounded-xl object-cover"
          />
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-xl bg-navy text-6xl text-powder">
            {p.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
        )}
      </section>
      <nav className="my-4 flex flex-wrap gap-4" aria-label="Player profile sections">
        <a href="#overview">Overview</a>
        <a href="#measurements">Measurements</a>
        <a href="#stats">Game stats</a>
        <a href="/player-profiles">Manage profile</a>
      </nav>
      <section id="overview" className="my-6 grid gap-3 rounded-xl border bg-white p-5">
        <h2 className="text-2xl">Player overview</h2>
        <p className="whitespace-pre-wrap">{p.profile.bio || "Biography coming soon."}</p>
        {[
          ["School", p.profile.school],
          ["Hometown", p.profile.city],
          ["GPA (self-reported)", p.profile.gpa],
          ["Commitment", p.profile.commitment],
        ]
          .filter((x) => x[1])
          .map(([k, v]) => (
            <p key={k}>
              <strong>{k}:</strong> {v}
            </p>
          ))}
        {p.profile.video && (
          <a href={p.profile.video} target="_blank" rel="noreferrer" className="underline">
            Watch player video
          </a>
        )}
        <a className="underline" href="/contact">
          Contact Prospects about this player
        </a>
      </section>
      <section id="measurements">
        <h2 className="text-2xl">Measurements</h2>
        <p className="mb-4">
          Player-submitted values remain unverified until an admin or assigned head coach approves
          them.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {p.metrics.map((m) => (
            <article key={m.id} className="rounded-xl border bg-white p-4">
              <h3 className="text-xl">{metricDefinitions[m.metric].label}</h3>
              <p className="text-3xl">
                {m.value} <span className="text-base">{metricDefinitions[m.metric].unit}</span>
              </p>
              <p className="font-semibold">
                {m.status === "verified"
                  ? "✓ Verified"
                  : m.status === "pending"
                    ? "Verification requested · Unverified"
                    : "Unverified"}
              </p>
              <p>Measured {m.date}</p>
              {m.status === "verified" && (
                <p className="text-sm">
                  Verified by {m.verifiedBy} · {m.verifiedAt?.slice(0, 10)}
                  <br />
                  {m.method}
                </p>
              )}
            </article>
          ))}
        </div>
        {!p.metrics.length && <p>No measurements submitted yet.</p>}
      </section>
      <section id="stats" className="my-6">
        <h2 className="text-2xl">Game stats</h2>
        <div className="my-3 grid gap-3 sm:grid-cols-2">
          <label>
            Team
            <select
              className="office-control"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              <option value="all">All teams</option>
              {p.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Season
            <select
              className="office-control"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            >
              <option value="all">All seasons</option>
              {seasons.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm">
          Synced from linked team game records. Corrections made by team staff update these totals.
          Historical totals without a season remain labeled Unassigned season.
        </p>
        {rows.length ? (
          <StatsTable stats={stats} />
        ) : (
          <p className="my-4">No recorded stats for this selection.</p>
        )}
        {p.additional
          .filter(
            (r) =>
              (team === "all" || r.teamId === team) && (season === "all" || r.season === season),
          )
          .map((r, i) => (
            <div key={r.teamId + ":" + i} className="mt-4 rounded border p-3">
              <h3 className="text-xl">Additional team-recorded stats · {r.team}</h3>
              <p>
                {r.season}. These recorded rates and totals are shown separately rather than
                averaging rates across teams. Measurements here are team-reported; verification
                badges appear only in Measurements.
              </p>
              <StatsTable stats={r.values} />
            </div>
          ))}
      </section>
    </main>
  );
}
