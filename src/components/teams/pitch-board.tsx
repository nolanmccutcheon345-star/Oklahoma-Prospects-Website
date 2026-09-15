import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DeskCard, FieldInput, NumRows } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { positionsOf, useTeams } from "@/lib/teams/context";
import { agePitchMax, isPitcher } from "@/lib/teams/field";
import { iso } from "@/lib/teams/engine/00-helpers.js";
import type { OsTeam } from "@/lib/teams/model";
import { cn } from "@/lib/utils";

export function PitchBoard({ team }: { team: OsTeam }) {
  const os = useTeams();
  const pitchers = team.roster.filter((p) => !p.withdrawn && isPitcher(p));
  const max = agePitchMax(team.age);
  const [playerId, setPlayerId] = useState(pitchers[0]?.id || "");
  const [pitches, setPitches] = useState("70");
  const [date, setDate] = useState(iso(new Date(2026, 8, 15)));
  const [event, setEvent] = useState("Route 66 Fall Open");
  const [warn, setWarn] = useState("");

  function log() {
    if (!playerId) return;
    const result = os.logPitch(team.id, playerId, Number(pitches), date, event);
    if (!result.ok) {
      setWarn("Could not log that outing.");
      return;
    }
    if (result.warn) {
      setWarn(`${pitches} exceeds the ${team.age} maximum of ${result.max}. Logged anyway.`);
    } else {
      setWarn(`Logged ${pitches} pitches. Rest applied.`);
    }
  }

  if (pitchers.length === 0) {
    return (
      <TeamsEmpty
        title="No pitchers on this roster."
        copy="Pitch counts stay on the arms. Add a pitcher-only or a P on the card."
        action="Open roster"
        onAction={() => os.openTeam(team.id, "roster")}
      />
    );
  }

  return (
    <div data-teams-pitches="true" className="grid gap-4">
      <DeskCard
        eyebrow="Pitch counts"
        title="Log it before you forget."
        copy={`${team.age} daily max ${max}. 21 is one day of rest, 36 two, 51 three, 66 four.`}
      >
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Pitcher</span>
            <select
              data-teams-pitch-player
              className="teams-control min-h-11 w-full rounded-lg bg-paper px-3 text-sm shadow-border"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
            >
              {pitchers.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
          </label>
          <FieldInput
            label="Pitches"
            type="number"
            value={pitches}
            onChange={setPitches}
            attr={{ "data-teams-pitch-count": "true" }}
          />
          <FieldInput label="Date" type="date" value={date} onChange={setDate} />
          <FieldInput label="Event" value={event} onChange={setEvent} />
          {(os.role === "coach" || os.role === "admin") && (
            <Button type="button" variant="maroon" data-teams-pitch-log onClick={log}>
              Log outing
            </Button>
          )}
          {warn ? (
            <p
              data-teams-pitch-warn={/exceeds/i.test(warn) ? "true" : "false"}
              className={cn("text-sm", /exceeds/i.test(warn) ? "font-semibold text-ok-maroon" : "text-teams-ink")}
            >
              {warn}
            </p>
          ) : null}
        </div>
      </DeskCard>

      <DeskCard eyebrow="Availability" title="Who can throw tonight.">
        <ul className="divide-y divide-line">
          {pitchers.map((p) => {
            const st = os.pitchFor(team, p.id);
            return (
              <li
                key={p.id}
                data-teams-pitcher={p.id}
                data-teams-pitch-rest={st.available ? "false" : "true"}
                className="teams-row flex items-center justify-between gap-3"
              >
                <span>
                  <span className="block text-sm font-semibold">
                    #{p.number} {p.name}
                  </span>
                  <span className="text-xs text-teams-muted">
                    {positionsOf(p)}
                    {st.last ? ` · ${st.last.pitches} on ${st.last.date}` : " · no outing"}
                    {!st.available && st.readyOn ? ` · back ${st.readyOn}` : ""}
                  </span>
                </span>
                <span
                  className={cn(
                    "teams-num text-xs font-semibold tracking-wide uppercase",
                    st.available ? "text-teams-muted" : "text-ok-maroon",
                  )}
                >
                  {st.available ? "Available" : `Resting ${st.need}d`}
                </span>
              </li>
            );
          })}
        </ul>
      </DeskCard>

      <DeskCard eyebrow="Log" title="Outings this season.">
        {(team.pitchLog || []).length === 0 ? (
          <p className="text-sm text-teams-muted">No outings logged.</p>
        ) : (
          <NumRows
            rows={(team.pitchLog || []).slice(0, 12).map((row) => {
              const who = team.roster.find((p) => p.id === row.playerId);
              return {
                label: `${who?.name || "Pitcher"} · ${row.date}`,
                value: `${row.pitches}`,
                alert: row.pitches > max,
              };
            })}
          />
        )}
      </DeskCard>
    </div>
  );
}
