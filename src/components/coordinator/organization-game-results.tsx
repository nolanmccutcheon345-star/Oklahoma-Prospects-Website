import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../ui/button";
import { statKeys } from "@/lib/teams/activity-contracts";
import {
  organizationGameResultInput,
  type OrganizationGameResultInput,
} from "@/lib/coordinator/organization-contracts";
import {
  getOrganizationGameResults,
  saveOrganizationGameResult,
} from "@/lib/coordinator/organization-game-results-api";

type Workspace = Awaited<ReturnType<typeof getOrganizationGameResults>>;
type Team = Workspace["teams"][number];
type Game = Team["games"][number];
type Values = OrganizationGameResultInput["stats"][number]["values"];
const field = "min-h-11 w-full min-w-0 rounded border border-line bg-white p-2 text-ink";
const emptyStats = (): Values => ({ ab: 0, h: 0, r: 0, hr: 0, rbi: 0, sb: 0, bb: 0, so: 0 });
const labels: Record<(typeof statKeys)[number], string> = {
  ab: "At-bats",
  h: "Hits",
  r: "Runs",
  hr: "Home runs",
  rbi: "Runs batted in",
  sb: "Stolen bases",
  bb: "Walks",
  so: "Strikeouts",
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to complete the request. Please try again.";

function GameResultForm({
  game,
  team,
  busy,
  onSave,
}: {
  game: Game;
  team: Team;
  busy: boolean;
  onSave: (input: OrganizationGameResultInput) => Promise<void>;
}) {
  const [status, setStatus] = useState(game.status);
  const [ourRuns, setOurRuns] = useState(String(game.ourRuns));
  const [oppRuns, setOppRuns] = useState(String(game.oppRuns));
  const [stats, setStats] = useState<Record<string, Values>>(() =>
    Object.fromEntries(
      game.stats
        .filter((stat) => statKeys.some((key) => stat.values[key] !== 0))
        .map((stat) => [stat.playerId, stat.values]),
    ),
  );
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = organizationGameResultInput.safeParse({
      id: game.id,
      teamId: team.id,
      revision: game.revision,
      status,
      ourRuns: Number(ourRuns),
      oppRuns: Number(oppRuns),
      stats: Object.entries(stats).map(([playerId, values]) => ({ playerId, values })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the score and statistics.");
      return;
    }
    setError("");
    await onSave(parsed.data);
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="grid min-w-0 gap-4">
      <div>
        <h3 className="text-lg font-semibold">{game.title}</h3>
        <p className="text-sm text-muted-foreground">
          {game.date} · {game.startTime}–{game.endTime} · {game.location}
        </p>
      </div>
      <fieldset disabled={busy} className="grid min-w-0 gap-4">
        <legend className="sr-only">Game score and player statistics</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1">
            Game status
            <select
              className={field}
              value={status}
              onChange={(event) => {
                const selected = event.target.value;
                if (selected === "scheduled" || selected === "live" || selected === "final")
                  setStatus(selected);
              }}
            >
              <option value="scheduled">Scheduled</option>
              <option value="live">Live</option>
              <option value="final">Final</option>
            </select>
          </label>
          <label className="grid gap-1">
            Our runs
            <input
              className={field}
              type="number"
              min={0}
              max={999}
              step={1}
              required
              value={ourRuns}
              onChange={(event) => setOurRuns(event.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Opponent runs
            <input
              className={field}
              type="number"
              min={0}
              max={999}
              step={1}
              required
              value={oppRuns}
              onChange={(event) => setOppRuns(event.target.value)}
            />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          Final results count toward the team record and season statistics. Correcting a final game
          replaces its previous contribution. Existing public team scores update when saved; player
          publication consent remains in effect.
        </p>
        <h4 className="font-semibold">Player game statistics</h4>
        {!team.players.length && (
          <p className="text-sm">
            This team has no rostered players. You can still save the score.
          </p>
        )}
        {team.players.map((player) => {
          const current = stats[player.id];
          return (
            <div key={player.id} className="grid min-w-0 gap-3 rounded-lg border border-line p-3">
              <label className="flex min-h-11 items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(current)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setStats((previous) => {
                      const next = { ...previous };
                      if (checked) next[player.id] = emptyStats();
                      else delete next[player.id];
                      return next;
                    });
                  }}
                />
                <span>
                  {player.number ? `#${player.number} ` : ""}
                  {player.name}
                  {player.withdrawn ? " (withdrawn)" : ""}
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                Season: {player.stats.ab} AB · {player.stats.h} H · {player.stats.rbi} RBI · AVG{" "}
                {player.stats.avg === null ? "—" : player.stats.avg.toFixed(3)}
              </p>
              {current && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {statKeys.map((key) => (
                    <label key={key} className="grid min-w-0 gap-1 text-sm">
                      {labels[key]}
                      <input
                        className={field}
                        type="number"
                        min={0}
                        max={999}
                        step={1}
                        required
                        aria-label={`${player.name}: ${labels[key]}`}
                        value={Number.isNaN(current[key]) ? "" : current[key]}
                        onChange={(event) => {
                          const value =
                            event.target.value === "" ? Number.NaN : Number(event.target.value);
                          setStats((previous) => ({
                            ...previous,
                            [player.id]: { ...previous[player.id], [key]: value },
                          }));
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Uncheck a player to clear their recorded statistics for this game. Schedule, travel
          arrangements, and tournament entries are managed separately.
        </p>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="justify-self-start">
          {busy ? "Saving…" : "Save Game Result"}
        </Button>
      </fieldset>
    </form>
  );
}

export function OrganizationGameResults({ onSaved }: { onSaved?: () => void | Promise<void> }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [teamId, setTeamId] = useState("");
  const [gameId, setGameId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = await getOrganizationGameResults();
      if (id === request.current) setWorkspace(next);
      return true;
    } catch (cause) {
      if (id === request.current) {
        setError(message(cause));
        setWorkspace(null);
      }
      return false;
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      request.current += 1;
    };
  }, [load]);
  const team = workspace?.teams.find((candidate) => candidate.id === teamId) || workspace?.teams[0];
  const game = team?.games.find((candidate) => candidate.id === gameId) || team?.games[0];
  async function save(input: OrganizationGameResultInput) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await saveOrganizationGameResult({ data: input });
      setSuccess(
        result.changed
          ? "Game result saved. Season totals are updated."
          : "This result is already up to date.",
      );
      await load();
      if (onSaved) await onSaved();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="grid min-w-0 gap-4 rounded-xl border border-line bg-white p-5"
      aria-label="Game results"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Game Results & Statistics</h2>
        <Button
          type="button"
          variant="outline"
          disabled={loading || saving}
          onClick={() => {
            setSuccess("");
            void load();
          }}
        >
          Reload Results
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Update scores and player statistics for existing scheduled, live, or final games.
      </p>
      {success && (
        <p role="status" className="text-green-800">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading game results…</p>
      ) : !workspace ? null : !team ? (
        <p>No active teams are available.</p>
      ) : (
        <>
          <label className="grid gap-1">
            Team
            <select
              className={field}
              disabled={saving}
              value={team.id}
              onChange={(event) => {
                setTeamId(event.target.value);
                setGameId("");
                setError("");
                setSuccess("");
              }}
            >
              {workspace.teams.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} · {candidate.sport}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm">
            Team record: {team.record.w} wins · {team.record.l} losses · {team.record.t} ties
          </p>
          {!game ? (
            <p>No games are available to score for this team. Add a game in Schedule first.</p>
          ) : (
            <>
              <label className="grid gap-1">
                Game
                <select
                  className={field}
                  disabled={saving}
                  value={game.id}
                  onChange={(event) => {
                    setGameId(event.target.value);
                    setError("");
                    setSuccess("");
                  }}
                >
                  {team.games.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.date} · {candidate.title} · {candidate.status}
                    </option>
                  ))}
                </select>
              </label>
              <GameResultForm
                key={`${game.id}:${game.revision}`}
                game={game}
                team={team}
                busy={saving}
                onSave={save}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
