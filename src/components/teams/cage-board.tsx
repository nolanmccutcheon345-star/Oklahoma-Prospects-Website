import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DeskCard, FieldInput, NumRows } from "@/components/teams/desk-kit";
import { useTeams } from "@/lib/teams/context";
import { cageWeekSummary, weekSunday } from "@/lib/teams/field";
import { formatTeamMoney } from "@/lib/teams/os";
import type { OsTeam } from "@/lib/teams/model";

export function CageBoard({ team }: { team: OsTeam }) {
  const os = useTeams();
  const week = weekSunday();
  const showRate = os.canSeeCageRate;
  const rate = Number(os.state.settings.cageHourlyRate) || 0;
  const teamSum = cageWeekSummary(os.state, "team", team.id, week);
  const playerId = os.homePlayer?.id;
  const playerSum = playerId ? cageWeekSummary(os.state, "player", playerId, week) : null;
  const teamAllow = Number(team.teamCageHoursPerWeek) || 0;
  const playerAllow = Number(team.playerCageHoursPerWeek) || 0;
  const canBook = os.role === "coach" || os.role === "admin" || os.role === "parent" || os.role === "player";
  const [hours, setHours] = useState("1");
  const [scope, setScope] = useState<"team" | "player">(os.role === "player" ? "player" : "team");
  const [note, setNote] = useState("");

  const ownerId = scope === "team" ? team.id : playerId || team.id;

  function book(noShow = false) {
    const result = os.bookCage({
      scope: os.role === "player" ? "player" : scope,
      ownerId: os.role === "player" ? playerId || team.id : ownerId,
      hours: Number(hours) || 1,
      noShow,
    });
    if (result.overage && showRate) {
      setNote(`Past the allowance. Billed at ${formatTeamMoney(rate)} / hour.`);
    } else if (result.overage) {
      setNote("Past the weekly allowance. Extra hours bill to the family.");
    } else if (noShow) {
      setNote("Marked no-show. Credit burned.");
    } else {
      setNote(`Booked ${hours} hour${Number(hours) === 1 ? "" : "s"} this week.`);
    }
  }

  return (
    <div data-teams-cages="true" className="grid gap-4">
      <DeskCard
        eyebrow="Cages"
        title="Credits reset Sunday."
        copy="Unused hours never roll. A no-show burns the credit and does not look like a used one."
      >
        <NumRows
          rows={[
            { label: "Week of", value: week },
            { label: "Team used", value: `${teamSum.used} / ${teamAllow} hrs` },
            { label: "Team no-show", value: `${teamSum.noShow} hrs`, alert: teamSum.noShow > 0 },
            { label: "Team overage", value: `${teamSum.overage} hrs`, alert: teamSum.overage > 0 },
            ...(playerSum
              ? [
                  { label: "Player used", value: `${playerSum.used} / ${playerAllow} hrs` },
                  { label: "Player no-show", value: `${playerSum.noShow} hrs`, alert: playerSum.noShow > 0 },
                ]
              : []),
            ...(showRate
              ? [{ label: "Standard rate", value: `${formatTeamMoney(rate)} / hr` }]
              : []),
          ]}
        />
        {canBook ? (
          <div className="mt-4 grid gap-3">
            {os.role !== "player" && playerId ? (
              <div className="flex gap-1 rounded-xl bg-ink p-1">
                {(["team", "player"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setScope(id)}
                    className={`teams-control min-h-11 flex-1 rounded-lg text-xs font-semibold tracking-wide uppercase ${
                      scope === id ? "bg-maroon text-fg-inverse" : "text-fg-soft"
                    }`}
                  >
                    {id}
                  </button>
                ))}
              </div>
            ) : null}
            <FieldInput
              label="Hours"
              type="number"
              value={hours}
              onChange={setHours}
              attr={{ "data-teams-cage-hours": "true" }}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="maroon" data-teams-cage-book onClick={() => book(false)}>
                Book
              </Button>
              <Button
                type="button"
                variant="outlineDark"
                data-teams-cage-noshow
                onClick={() =>
                  os.markNoShow({
                    scope: os.role === "player" ? "player" : scope,
                    ownerId: os.role === "player" ? playerId || team.id : ownerId,
                  })
                }
              >
                Mark no-show
              </Button>
            </div>
            {note ? <p className="text-sm text-teams-ink">{note}</p> : null}
          </div>
        ) : (
          <div className="mt-4">
            <Button asChild className="mt-4">
              <Link to="/book">Book a lane</Link>
            </Button>
          </div>
        )}
      </DeskCard>
    </div>
  );
}
