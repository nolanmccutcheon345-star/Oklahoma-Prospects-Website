import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { BudgetMeter, DeskCard, NumRows } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { useTeams } from "@/lib/teams/context";
import { formatTeamMoney } from "@/lib/teams/os";
import type { OsEvent, OsTeam } from "@/lib/teams/model";
import {
  coachEventCopy,
  eligibleEvents,
  formatShare,
  icsForTeam,
  isStayToPlay,
  normalizeRsvp,
  REGION_STATES,
  replacementsFor,
  RSVP_VALUES,
  rsvpCounts,
  rsvpHoldouts,
  scheduledEvents,
  SHOWCASE_ORGS,
  type OsRsvp,
} from "@/lib/teams/schedule";
import { cn } from "@/lib/utils";

function downloadIcs(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function EventCost({
  dollars,
  share,
  showDollars,
}: {
  dollars: number;
  share: number;
  showDollars: boolean;
}) {
  return (
    <span className="teams-num shrink-0 text-sm font-semibold" data-teams-share={share}>
      {showDollars ? formatTeamMoney(dollars) : formatShare(share)}
    </span>
  );
}

function EventRow({
  team,
  event,
  onSlate,
}: {
  team: OsTeam;
  event: OsEvent;
  onSlate?: boolean;
}) {
  const os = useTeams();
  const [open, setOpen] = useState(false);
  const share = os.shareFor(team.id, event.id);
  const counts = rsvpCounts(team, event.id);
  const stay = isStayToPlay(event);
  const holdouts = rsvpHoldouts(team, event.id);
  const mine = os.myPlayers.filter((p) => p.teamId === team.id);
  const showCost = os.role === "admin" || os.role === "coach";
  const showDollars = os.role === "admin";
  const canEditRsvp =
    os.role === "coach" || os.role === "admin" || os.role === "parent" || os.role === "player";
  const rsvpTargets =
    os.role === "parent" || os.role === "player"
      ? mine
      : team.roster.filter((p) => !p.withdrawn);

  return (
    <li className="teams-row" data-teams-event={event.id}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-teams-ink">{event.name}</p>
          <p className="text-xs text-teams-muted">
            {event.org} · {event.city}, {event.state} · {event.start}
            {event.end && event.end !== event.start ? `–${event.end.slice(5)}` : ""}
          </p>
          {stay ? (
            <p className="mt-1 text-xs text-ok-maroon" data-teams-stay="true">
              Stay-to-play. Lodging is paid by each family and is not part of the team fee.
            </p>
          ) : null}
        </div>
        {showCost ? <EventCost dollars={event.fee} share={share} showDollars={showDollars} /> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-teams-muted">
        <span>
          Going {counts.going} · Maybe {counts.maybe} · Can't {counts.cant} · No answer {counts.none}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outlineDark" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide RSVP" : "RSVP"}
        </Button>
        {onSlate && (os.role === "coach" || os.role === "admin") ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-teams-cancel={event.id}
            onClick={() => os.cancelEvent(team.id, event.id, "Cancelled")}
          >
            Cancel event
          </Button>
        ) : null}
        {os.role === "coach" || os.role === "admin" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-teams-nudge={event.id}
            disabled={!holdouts.length}
            onClick={() => os.nudgeRsvp(team.id, event.id)}
          >
            Nudge {holdouts.length || "none"}
          </Button>
        ) : null}
      </div>
      {open ? (
        <ul className="mt-3 divide-y divide-line rounded-xl bg-paper px-3">
          {rsvpTargets.map((p) => {
            const current = normalizeRsvp(team.rsvps?.[event.id]?.[p.id]);
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="text-sm">{p.name}</span>
                {canEditRsvp ? (
                  <div className="flex gap-1" role="group" aria-label={`${p.name} RSVP`}>
                    {RSVP_VALUES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        data-teams-rsvp={`${p.id}-${v}`}
                        onClick={() => os.setRsvp(team.id, event.id, p.id, v as OsRsvp)}
                        className={cn(
                          "teams-control min-h-11 rounded-lg px-3 text-xs font-semibold uppercase",
                          current === v ? "bg-maroon text-fg-inverse" : "bg-paper-2 text-teams-ink",
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs uppercase">{current || "—"}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export function ScheduleBoard({ team }: { team: OsTeam }) {
  const os = useTeams();
  const [count, setCount] = useState(4);
  const [preview, setPreview] = useState<ReturnType<typeof os.previewSlate>>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const showCost = os.role === "admin" || os.role === "coach";
  const showDollars = os.role === "admin";
  const entry = os.viewer.entryByTeam[team.id];
  const catalog = os.state.catalog;
  const onSlate = scheduledEvents(team, catalog);
  const pool = useMemo(
    () => eligibleEvents(catalog, team).filter((e) => !(team.tournamentIds || []).includes(e.id)),
    [catalog, team],
  );
  const cancelled = (os.state.cancelled || []).filter((c) => c.teamId === team.id);
  const canBuild = os.role === "coach" || os.role === "admin";
  const ageNum = Number(String(team.age).replace(/U/i, "")) || 0;

  const build = () => {
    setPreview(os.previewSlate(team.id, count));
    setFlash(null);
  };

  const tryAdd = (eventId: string) => {
    const result = os.addEvent(team.id, eventId);
    if (result.ok) {
      setFlash("Weekend added. Families were notified.");
      setPreview(null);
      return;
    }
    if (result.reason === "budget") {
      os.askBudget(team.id, eventId);
      setAsked(eventId);
      setFlash("Past budget. Front office has the request.");
      return;
    }
    if (result.reason === "conflict") {
      setFlash("That weekend overlaps something already on the slate.");
      return;
    }
    setFlash("That event is not on this team's board.");
  };

  return (
    <div
      className="teams-stack"
      data-teams-schedule="true"
      data-teams-schedule-money={showDollars ? "admin" : showCost ? "share" : "hidden"}
    >
      {showCost ? (
      <DeskCard
        eyebrow="Season"
        title={showDollars ? "What this season costs to enter." : "How much of the season is spent."}
        copy={
          showDollars
            ? "Entry fees against the tournament budget. Families never see this number."
            : "A percentage of the tournament budget. Never an entry fee."
        }
      >
        {entry ? (
          <BudgetMeter
            label="Tournament entries"
            spent={entry.spent}
            budget={entry.budget}
            spentLabel={
              showDollars
                ? `${formatTeamMoney(entry.spent)} of ${formatTeamMoney(entry.budget)}`
                : formatShare(entry.pct)
            }
          />
        ) : null}
        <p className="mt-3 text-xs text-teams-muted">
          {REGION_STATES.join(", ")} · {team.age} {team.level} {team.sport}.{" "}
          {ageNum < 15
            ? `${SHOWCASE_ORGS.join(", ")} stay off this board until 15U.`
            : `Showcases from ${SHOWCASE_ORGS.join(", ")} are on the board.`}
        </p>
      </DeskCard>
      ) : null}

      <DeskCard
        eyebrow="Calendar"
        title="Where this team is going."
        copy="Export the slate. RSVP lives on each weekend."
      >
        <Button
          type="button"
          variant="outlineDark"
          size="sm"
          data-teams-export-ics="true"
          onClick={() =>
            downloadIcs(
              `${team.name.replace(/\s+/g, "-").toLowerCase()}.ics`,
              icsForTeam(team, onSlate),
            )
          }
        >
          Export calendar
        </Button>
      </DeskCard>

      {flash ? (
        <p className="rounded-xl bg-cream px-4 py-3 text-sm" data-teams-schedule-flash="true">
          {flash}
        </p>
      ) : null}

      {onSlate.length === 0 ? (
        <TeamsEmpty
          title="No events on the schedule."
          copy={
            canBuild
              ? "Build a slate inside the budget, or add a weekend from the list below."
              : "When the season slate posts, it lands here."
          }
          action={canBuild ? "Build a slate" : undefined}
          onAction={canBuild ? () => document.getElementById("teams-slate")?.scrollIntoView({ behavior: "smooth" }) : undefined}
        />
      ) : (
        <DeskCard eyebrow="Slate" title="Weekends on the board.">
          <ul className="divide-y divide-line">
            {onSlate.map((ev) => (
              <EventRow key={ev.id} team={team} event={ev} onSlate />
            ))}
          </ul>
        </DeskCard>
      )}

      {cancelled[0] ? (
        <DeskCard
          eyebrow="Cancelled"
          title={cancelled[0].name}
          copy={`${cancelled[0].reason}. Same-month replacements with no date conflict.`}
        >
          <CancelledAlts team={team} eventId={cancelled[0].eventId} onAdd={tryAdd} />
        </DeskCard>
      ) : null}

      {canBuild ? (
        <DeskCard
          id="teams-slate"
          eyebrow="Build my schedule"
          title="Pick a number. We fill the season."
          copy="Inside the budget, skip date conflicts, show the slate before it locks."
        >
          <label className="grid gap-2 text-sm">
            <span className="text-teams-muted">Events this season</span>
            <select
              className="min-h-11 rounded-xl border border-line bg-paper-2 px-3"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              data-teams-slate-count="true"
            >
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" className="mt-4" data-teams-build-slate="true" onClick={build}>
            Build a slate
          </Button>
          {preview ? (
            <div className="mt-4 rounded-xl bg-paper px-4 py-3" data-teams-slate-preview="true">
              <NumRows
                rows={preview.events.map((e) => ({
                  label: coachEventCopy(e, os.shareFor(team.id, e.id)).replace(
                    ` · ${formatShare(os.shareFor(team.id, e.id))}`,
                    "",
                  ),
                  value: showDollars
                    ? formatTeamMoney(e.fee)
                    : formatShare(os.shareFor(team.id, e.id)),
                }))}
              />
              {preview.short ? (
                <p className="mt-3 text-sm text-ok-maroon">
                  Only {preview.events.length} fit inside the budget without a date conflict.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  data-teams-apply-slate="true"
                  onClick={() => {
                    os.applyBuiltSlate(team.id, preview.ids);
                    setPreview(null);
                    setFlash("Season slate locked. Families were notified.");
                  }}
                >
                  Apply slate
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(null)}>
                  Discard
                </Button>
              </div>
            </div>
          ) : null}
        </DeskCard>
      ) : null}

      {canBuild ? (
        <DeskCard
          eyebrow="Catalog"
          title="Age, level, sport. This region only."
          copy="Showcases stay off the board under 15U. Past budget, adding stops."
        >
          {pool.length === 0 ? (
            <p className="text-sm text-teams-muted">No more eligible weekends in this season.</p>
          ) : (
            <ul className="divide-y divide-line">
              {pool.map((event) => {
                const fit = os.eventFits(team.id, event.id);
                const share = os.shareFor(team.id, event.id);
                return (
                  <li key={event.id} className="teams-row">
                    <p className="text-sm font-semibold">{event.name}</p>
                    <p className="text-xs text-teams-muted">
                      {event.org} · {event.city}, {event.state} · {event.start}
                      {isStayToPlay(event) ? " · stay-to-play" : ""}
                    </p>
                    {isStayToPlay(event) ? (
                      <p className="mt-1 text-xs text-ok-maroon">
                        Lodging is paid by each family and is not part of the team fee.
                      </p>
                    ) : null}
                    <p className="mt-1">
                      <EventCost dollars={event.fee} share={share} showDollars={showDollars} />
                    </p>
                    {fit.overflow ? (
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="maroon"
                          size="sm"
                          data-teams-ask-budget={event.id}
                          onClick={() => {
                            os.askBudget(team.id, event.id);
                            setAsked(event.id);
                            setFlash("Front office is notified.");
                          }}
                        >
                          Ask for more budget
                        </Button>
                        {asked === event.id ? (
                          <p className="mt-2 text-xs text-teams-muted">Front office is notified.</p>
                        ) : null}
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outlineDark"
                        size="sm"
                        className="mt-3"
                        data-teams-add-event={event.id}
                        onClick={() => tryAdd(event.id)}
                      >
                        Add weekend
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DeskCard>
      ) : null}
    </div>
  );
}

function CancelledAlts({
  team,
  eventId,
  onAdd,
}: {
  team: OsTeam;
  eventId: string;
  onAdd: (id: string) => void;
}) {
  const os = useTeams();
  const event = os.state.catalog.find((e) => e.id === eventId);
  const alts = event ? replacementsFor(os.state.catalog, team, event) : [];
  if (!alts.length) {
    return (
      <p className="text-sm text-teams-muted">
        No same-month replacement without a date conflict{event ? ` for ${event.name}` : ""}.
      </p>
    );
  }
  const showCost = os.role === "admin" || os.role === "coach";
  const showDollars = os.role === "admin";
  return (
    <ul className="divide-y divide-line">
      {alts.map((e) => (
        <li key={e.id} className="teams-row flex items-center justify-between gap-3">
          <span className="text-sm">
            {e.name} · {e.start}
            {isStayToPlay(e) ? " · stay-to-play" : ""}
          </span>
          <div className="flex items-center gap-2">
            {showCost ? (
              <EventCost dollars={e.fee} share={os.shareFor(team.id, e.id)} showDollars={showDollars} />
            ) : null}
            {os.role === "coach" || os.role === "admin" ? (
              <Button
                type="button"
                size="sm"
                variant="outlineDark"
                data-teams-replace={e.id}
                onClick={() => onAdd(e.id)}
              >
                Add
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
