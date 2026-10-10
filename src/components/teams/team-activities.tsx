import { currentSeason } from "@/lib/recruiting-contracts";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { getTeamActivities, changeTeamActivity, sendTeamChat } from "@/lib/teams/activity-api";
import { statKeys, resultOf, type TeamActivity } from "@/lib/teams/activity-contracts";
import { formatClockTime } from "@/lib/time-display";
type Workspace = Awaited<ReturnType<typeof getTeamActivities>>;
const blank = (teamId: string): TeamActivity => ({
  teamId,
  id: "",
  revision: 0,
  kind: "game",
  title: "",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  status: "scheduled",
  ourRuns: 0,
  oppRuns: 0,
  stats: [],
});
const emptyStats = () => ({ ab: 0, h: 0, r: 0, hr: 0, rbi: 0, sb: 0, bb: 0, so: 0 });
export function TeamActivities({
  teamId,
  onSaved,
}: {
  teamId: string;
  onSaved?: () => Promise<void> | void;
}) {
  const [data, setData] = useState<Workspace>(),
    [draft, setDraft] = useState<TeamActivity | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [body, setBody] = useState("");
  async function reload() {
    setData(await getTeamActivities({ data: { teamId } }));
  }
  useEffect(() => {
    let active = true;
    setData(undefined);
    setDraft(null);
    setError("");
    getTeamActivities({ data: { teamId } })
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [teamId]);
  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await reload();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const field = "office-control w-full min-w-0";
  return (
    <section className="my-4 grid min-w-0 gap-4" aria-label="Team schedule and chat">
      <h2 className="text-2xl">Team Schedule, Games & Chat</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p>
          {error
            ? "Team activity could not be loaded. Refresh this page to retry."
            : "Loading team activity…"}
        </p>
      ) : (
        <>
          <p>
            Record {data.record.w}–{data.record.l}–{data.record.t}. Final game scores update the
            Games page and team record. Individual player stats remain private to this team.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outlineDark"
              disabled={busy}
              onClick={() => void run(reload, "Team activity refreshed.")}
            >
              Refresh
            </Button>
            {data.manage && (
              <Button
                onClick={() =>
                  setDraft({
                    ...blank(teamId),
                    season: data.seasons.includes(currentSeason())
                      ? currentSeason()
                      : data.seasons.length === 1
                        ? data.seasons[0]
                        : "",
                  })
                }
              >
                Add game, tournament or practice
              </Button>
            )}
          </div>
          {draft && data.manage && (
            <form
              className="grid min-w-0 gap-3 rounded-xl border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await changeTeamActivity({ data: draft });
                  window.dispatchEvent(new CustomEvent("team-budget-updated", { detail: teamId }));
                  setDraft(null);
                  await onSaved?.();
                }, "Schedule and stats saved.");
              }}
            >
              <h3>{draft.id ? "Edit activity" : "New activity"}</h3>
              <label>
                Activity
                <select
                  className={field}
                  disabled={Boolean(draft.id)}
                  value={draft.kind}
                  onChange={(e) =>
                    setDraft({
                      ...blank(teamId),
                      season: data.seasons.includes(currentSeason())
                        ? currentSeason()
                        : data.seasons.length === 1
                          ? data.seasons[0]
                          : "",
                      kind: e.target.value as TeamActivity["kind"],
                    })
                  }
                >
                  <option value="game">Game</option>
                  <option value="tournament">Tournament</option>
                  <option value="practice">Practice</option>
                </select>
              </label>
              <label>
                {draft.kind === "game" ? "Opponent" : "Name"}
                <input
                  required
                  maxLength={140}
                  className={field}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>
              <label>
                Date
                <input
                  required
                  type="date"
                  className={field}
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  Start time (Central)
                  <input
                    required
                    type="time"
                    className={field}
                    value={draft.startTime}
                    onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                  />
                </label>
                <label>
                  End time (Central)
                  <input
                    required
                    type="time"
                    className={field}
                    value={draft.endTime}
                    onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Location
                <input
                  required
                  maxLength={240}
                  className={field}
                  value={draft.location}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                />
              </label>
              {draft.kind !== "practice" && (
                <fieldset className="grid gap-3 rounded-xl border p-3">
                  <legend>Travel & overnight stays</legend>
                  <label>
                    Local or travel
                    <select
                      className={field}
                      value={draft.travel || "local"}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          travel: e.target.value as "local" | "travel",
                          overnightNights: 0,
                        })
                      }
                    >
                      <option value="local">Local</option>
                      <option value="travel">Travel</option>
                    </select>
                  </label>
                  {draft.travel === "travel" && (
                    <label>
                      Overnight stays (nights)
                      <input
                        className={field}
                        type="number"
                        min={0}
                        max={30}
                        step={1}
                        required
                        value={draft.overnightNights || 0}
                        onChange={(e) =>
                          setDraft({ ...draft, overnightNights: Number(e.target.value) })
                        }
                      />
                    </label>
                  )}
                  <p className="text-sm">
                    Count each hotel stay once. For a tournament with several games, enter the
                    nights on the tournament and use 0 on its games. Day trips use 0 nights.
                    Cancelled events are excluded.
                  </p>
                </fieldset>
              )}
              <label>
                Status
                <select
                  className={field}
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as TeamActivity["status"] })
                  }
                >
                  <option value="scheduled">Scheduled</option>
                  {draft.kind === "game" && (
                    <>
                      <option value="live">Live</option>
                      <option value="final">Final</option>
                    </>
                  )}
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              {draft.kind === "game" && (
                <>
                  <label>
                    Season
                    <select
                      className={field}
                      value={draft.season || ""}
                      onChange={(e) => setDraft({ ...draft, season: e.target.value })}
                    >
                      <option value="">
                        {data.seasons.length === 1 ? data.seasons[0] : "Choose season"}
                      </option>
                      {data.seasons.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <p className="text-sm">
                    Game dates, locations and scores appear publicly on Games. Set Final to update
                    the team record and season stats; win/loss/tie is calculated from the score.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {(["ourRuns", "oppRuns"] as const).map((k) => (
                      <label key={k}>
                        {k === "ourRuns" ? "Our runs" : "Opponent runs"}
                        <input
                          type="number"
                          min={0}
                          max={999}
                          required
                          className={field}
                          value={draft[k]}
                          onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })}
                        />
                      </label>
                    ))}
                  </div>
                  <details>
                    <summary className="min-h-11 cursor-pointer font-semibold">
                      Player stats for this game
                    </summary>
                    <p className="text-sm">
                      Enter this game's counts only. Corrections replace the previous counts in
                      season totals.
                    </p>
                    {data.players.map((p) => {
                      const s = draft.stats.find((s) => s.playerId === p.id);
                      return (
                        <fieldset key={p.id} className="my-3 rounded border p-3">
                          <legend>{p.name}</legend>
                          <div className="grid grid-cols-4 gap-2">
                            {statKeys.map((k) => (
                              <label className="text-xs uppercase" key={k}>
                                {k}
                                <input
                                  aria-label={p.name + " " + k}
                                  type="number"
                                  min={0}
                                  max={999}
                                  className={field}
                                  value={s?.values[k] ?? 0}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      stats: [
                                        ...draft.stats.filter((x) => x.playerId !== p.id),
                                        {
                                          playerId: p.id,
                                          values: {
                                            ...(s?.values || emptyStats()),
                                            [k]: Number(e.target.value),
                                          },
                                        },
                                      ],
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      );
                    })}
                  </details>
                </>
              )}
              <p className="text-sm">Scheduling does not reserve or charge for facility space.</p>
              <div className="flex gap-2">
                <Button disabled={busy} type="submit">
                  Save activity
                </Button>
                <Button type="button" variant="outlineDark" onClick={() => setDraft(null)}>
                  Cancel edit
                </Button>
              </div>
            </form>
          )}
          {!data.activities.length && (
            <p>
              No games, tournaments or practices added here yet. Existing tournament selections and
              practices remain listed below in the team desk.
            </p>
          )}
          {data.activities.map((g) => (
            <article className="rounded-xl border bg-paper p-4" key={g.id}>
              <p className="text-xs uppercase">
                {g.kind} · {g.status}
              </p>
              <h3>
                {g.kind === "game" ? "vs " : ""}
                {g.title}
              </h3>
              <p>
                {g.date} · {formatClockTime(g.startTime)}–{formatClockTime(g.endTime)} CT ·{" "}
                {g.location}
              </p>
              {g.kind !== "practice" && (
                <p className="text-sm">
                  {g.travel === "travel"
                    ? `Travel · ${g.overnightNights || 0} overnight stays`
                    : "Local"}
                </p>
              )}
              {g.kind === "game" && (
                <>
                  <p>
                    {g.ourRuns}–{g.oppRuns}
                    {resultOf(g) ? " · " + { w: "Win", l: "Loss", t: "Tie" }[resultOf(g)!] : ""}
                  </p>
                  <a
                    className="inline-flex min-h-11 items-center underline"
                    href={"/games?view=scores&game=" + g.id}
                  >
                    View on Games
                  </a>
                  {g.stats.length > 0 && (
                    <details>
                      <summary>Player stats</summary>
                      {g.stats.map((s) => (
                        <p key={s.playerId}>
                          {data.players.find((p) => p.id === s.playerId)?.name ||
                            "Former roster player"}
                          : {statKeys.map((k) => k.toUpperCase() + ": " + s.values[k]).join(" · ")}
                        </p>
                      ))}
                    </details>
                  )}
                </>
              )}
              {data.manage && (
                <Button
                  variant="outlineDark"
                  disabled={busy}
                  onClick={() => setDraft(structuredClone(g))}
                >
                  Edit activity
                </Button>
              )}
            </article>
          ))}
          <details className="rounded-xl border p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">Team chat</summary>
            <p className="text-sm">
              One group thread for this team's coaches, parents and players. No private
              adult-to-player messages.
            </p>
            {!data.messages.length && <p>No messages yet.</p>}
            {data.messages.map((m) => (
              <article key={m.id} className="my-3 border-b py-2">
                <strong>{m.author}</strong>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <time className="text-xs">
                  {new Date(m.at).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT
                </time>
              </article>
            ))}
            <form
              className="mt-3 grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await sendTeamChat({ data: { teamId, body } });
                  setBody("");
                }, "Message posted to your team.");
              }}
            >
              <label>
                Team message
                <textarea
                  className={field}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  maxLength={3000}
                />
              </label>
              <Button disabled={busy || !body.trim()}>Post to team</Button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
