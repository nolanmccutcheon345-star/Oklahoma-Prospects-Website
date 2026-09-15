import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DeskCard, FieldInput, NumRows } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { useTeams } from "@/lib/teams/context";
import type { OsTeam } from "@/lib/teams/model";

export function ScoreBoard({ team }: { team: OsTeam }) {
  const os = useTeams();
  const games = os.gamesFor(team.id);
  const live = games.find((g) => g.status === "live");
  const finals = games.filter((g) => g.status === "final");
  const canScore = os.role === "coach" || os.role === "admin";
  const [opponent, setOpponent] = useState("");
  const [field, setField] = useState(team.practices?.[0]?.place || "BA Sports Park");
  const [time, setTime] = useState("10:00 AM");

  return (
    <div data-teams-score="true" className="grid gap-4">
      {live ? (
        <DeskCard
          eyebrow={`${live.event} · ${live.time}`}
          title={`${live.ourRuns} – ${live.oppRuns}`}
          copy={`${live.opponent} · ${live.field} · ${live.inning}`}
        >
          {live.live ? (
            <p className="rounded-xl bg-ink px-4 py-3 text-sm text-fg-inverse">
              {live.live.half} {live.live.inning} · {live.live.outs} out
              <span className="mt-1 block text-fg-soft">{live.live.lastPlay}</span>
            </p>
          ) : null}
          {canScore ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="maroon"
                className="min-h-14"
                data-teams-run="us"
                onClick={() => os.tapRun(live.id, "us")}
              >
                Us +1
              </Button>
              <Button
                type="button"
                variant="ink"
                className="min-h-14"
                data-teams-run="them"
                onClick={() => os.tapRun(live.id, "them")}
              >
                Them +1
              </Button>
              <Button
                type="button"
                variant="outlineDark"
                className="min-h-14"
                data-teams-advance
                onClick={() => os.advanceHalf(live.id)}
              >
                Next half
              </Button>
              <Button
                type="button"
                variant="outlineDark"
                className="min-h-14"
                data-teams-final
                onClick={() => os.postFinal(live.id)}
              >
                Post final
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-teams-muted">Live score. Families watch. Coaches tap.</p>
          )}
        </DeskCard>
      ) : canScore ? (
        <DeskCard
          eyebrow="Game day"
          title="Start a game."
          copy="One-handed between innings. Tap runs, advance the half, post the final."
        >
          <div className="grid gap-3">
            <FieldInput
              label="Opponent"
              value={opponent}
              onChange={setOpponent}
              placeholder="Tulsa Bandits"
              attr={{ "data-teams-opponent": "true" }}
            />
            <FieldInput label="Field" value={field} onChange={setField} />
            <FieldInput label="Time" value={time} onChange={setTime} />
            <Button
              type="button"
              variant="maroon"
              className="min-h-14"
              data-teams-start-game
              disabled={!opponent.trim()}
              onClick={() => {
                os.startGame(team.id, { opponent: opponent.trim(), field, time, event: team.seasonLabel });
                setOpponent("");
              }}
            >
              Start game
            </Button>
          </div>
        </DeskCard>
      ) : (
        <TeamsEmpty
          title="No live game."
          copy="When the book opens, the score lands here."
          action="Open schedule"
          onAction={() => os.openTeam(team.id, "schedule")}
        />
      )}

      {finals.map((g) => (
        <DeskCard
          key={g.id}
          eyebrow={g.event}
          title={`${g.ourRuns} – ${g.oppRuns}`}
          copy={`${g.opponent} · ${g.date} · ${g.field}`}
        >
          {g.recap ? <p className="text-sm text-teams-ink">{g.recap}</p> : null}
        </DeskCard>
      ))}

      <DeskCard eyebrow="Record" title={`${team.record.w}–${team.record.l}–${team.record.t}`}>
        <NumRows
          rows={[
            { label: "Wins", value: String(team.record.w) },
            { label: "Losses", value: String(team.record.l) },
            { label: "Ties", value: String(team.record.t) },
          ]}
        />
      </DeskCard>
    </div>
  );
}
