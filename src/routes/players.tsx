import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getRecruitingDirectory } from "@/lib/recruiting-api";
import { pageHead } from "@/lib/seo";
export const Route = createFileRoute("/players")({
  head: () =>
    pageHead(
      "/players",
      "Players",
      "Explore Oklahoma Prospects recruiting profiles, verified measurements and team statistics.",
    ),
  component: Players,
});
function Players() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getRecruitingDirectory>>>(),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [sport, setSport] = useState("");
  useEffect(() => {
    getRecruitingDirectory()
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main id="main" className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="text-4xl">Meet our players.</h1>
      <p className="my-3">
        Recruiting profiles shared with parent permission. Measurements are marked verified only
        after staff review.
      </p>
      <a
        className="inline-flex min-h-11 items-center rounded bg-maroon px-4 text-white"
        href="/player-profiles"
      >
        Manage profiles & verification
      </a>
      <div className="my-5 grid gap-3 sm:grid-cols-2">
        <label>
          Find a player
          <input
            className="office-control"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, school, graduation year or position"
          />
        </label>
        <label>
          Sport
          <select
            className="office-control"
            value={sport}
            onChange={(e) => setSport(e.target.value)}
          >
            <option value="">All sports</option>
            <option value="baseball">Baseball</option>
            <option value="softball">Softball</option>
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !rows ? (
        <p>Loading players…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows
            .filter(
              (p) =>
                (!sport || p.teams.some((t) => t.sport === sport)) &&
                [p.name, p.profile.school, p.profile.gradYear, p.profile.positions]
                  .join(" ")
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            )
            .map((p) => (
              <a
                key={p.id}
                href={"/player/" + encodeURIComponent(p.id)}
                className="grid gap-3 rounded-xl border bg-white p-4 text-ink"
              >
                <div className="aspect-[4/3] overflow-hidden rounded bg-ink text-powder">
                  {p.profile.photo ? (
                    <img
                      alt={p.name}
                      src={p.profile.photo}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">
                      {p.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                  )}
                </div>
                <h2 className="text-2xl">{p.name}</h2>
                <p>
                  {p.profile.gradYear && "Class of " + p.profile.gradYear + " · "}
                  {p.profile.positions}
                </p>
                <p>
                  {p.teams
                    .filter((t) => t.current)
                    .map((t) => t.name)
                    .join(" · ")}
                </p>
                <span className="font-semibold underline">View player</span>
              </a>
            ))}
          {!rows.length && <p>No player profiles have been published yet.</p>}
        </div>
      )}
    </main>
  );
}
