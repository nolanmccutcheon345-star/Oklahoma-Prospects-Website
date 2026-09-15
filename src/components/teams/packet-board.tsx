import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeskCard, downloadText } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { positionsOf, useTeams } from "@/lib/teams/context";
import {
  eventSheetCopy,
  packetText,
  pitchingPlan,
  submissionRoster,
  travelRoster,
} from "@/lib/teams/field";
import { scheduledEvents } from "@/lib/teams/schedule";
import type { OsTeam } from "@/lib/teams/model";
import { cn } from "@/lib/utils";

export function PacketBoard({ team }: { team: OsTeam }) {
  const os = useTeams();
  const events = scheduledEvents(team, os.state.catalog);
  const [eventId, setEventId] = useState(team.tournamentIds?.[0] || events[0]?.id || "");
  const event = os.eventFor(eventId) ?? events[0] ?? null;
  const sub = useMemo(() => submissionRoster(team), [team]);
  const travel = useMemo(() => travelRoster(team, event?.id), [team, event?.id]);
  const plan = useMemo(() => pitchingPlan(team), [team]);
  const pin = (team.announcements || []).find((a) => a.pin) ?? team.announcements?.[0];
  const sheet = eventSheetCopy(team, event, pin);
  const packet = packetText(team, event);

  function postSheet() {
    os.sendChat(team.id, sheet);
  }

  return (
    <div data-teams-packet="true" className="grid gap-4" data-teams-print="roster">
      <DeskCard
        eyebrow="Tournament packet"
        title="Four documents. One binder."
        copy="Submission roster, travel, pitching plan, and the event sheet for the team chat."
      >
        {events.length ? (
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Event</span>
            <select
              data-teams-packet-event
              className="teams-control min-h-11 w-full rounded-lg bg-paper px-3 text-sm shadow-border"
              value={event?.id || ""}
              onChange={(e) => setEventId(e.target.value)}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-teams-muted">No event on the slate yet.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outlineDark"
            data-teams-packet-export
            onClick={() =>
              downloadText(`${team.name.replace(/\s+/g, "-").toLowerCase()}-packet.txt`, packet)
            }
          >
            Export packet
          </Button>
        </div>
      </DeskCard>

      <DeskCard
        eyebrow="1 · Submission roster"
        title={`${sub.eligible.length} eligible`}
        copy="Missing any of the four documents and they sit. Birth certificates in red."
      >
        {sub.eligible.length === 0 ? (
          <p className="text-sm text-ok-maroon">Nobody is cleared to submit.</p>
        ) : (
          <ul className="divide-y divide-line" data-teams-submission>
            {sub.eligible.map((p) => (
              <li key={p.id} className="teams-row flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">
                  #{p.number} {p.name}
                </span>
                <span className="text-xs text-teams-muted">{positionsOf(p)}</span>
              </li>
            ))}
          </ul>
        )}
        {sub.ineligible.length ? (
          <div className="mt-4" data-teams-ineligible>
            <p className="text-xs font-semibold tracking-wide text-ok-maroon uppercase">
              Ineligible · {sub.ineligible.length}
            </p>
            <ul className="mt-2 divide-y divide-line">
              {sub.ineligible.map((row) => (
                <li key={row.player.id} className="teams-row">
                  <p className="text-sm font-semibold text-teams-ink">{row.player.name}</p>
                  <p
                    className={cn("text-xs", row.birthCert ? "font-semibold text-ok-maroon" : "text-ok-maroon")}
                    data-teams-birth-cert={row.birthCert ? "true" : "false"}
                  >
                    {row.reason}
                    {row.birthCert ? " · birth certificate missing" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-sm text-teams-muted">No ineligible names.</p>
        )}
      </DeskCard>

      <DeskCard
        eyebrow="2 · Travel roster"
        title={`${travel.length} going`}
        copy="Who is on the trip, who to call, medical, insurance."
      >
        {travel.length === 0 ? (
          <TeamsEmpty
            title="Nobody is marked going."
            copy="RSVP the roster before you print this page."
            action="Open schedule"
            onAction={() => os.openTeam(team.id, "schedule")}
          />
        ) : (
          <ul className="divide-y divide-line" data-teams-travel>
            {travel.map((row) => (
              <li key={row.player.id} className="teams-row">
                <p className="text-sm font-semibold">
                  #{row.player.number} {row.player.name}
                </p>
                <p className="text-xs text-teams-muted">
                  {(row.guardians || [])
                    .map((g) => `${g.name} ${g.phone || ""}`.trim())
                    .join(" · ") || "No guardian on file"}
                </p>
                {(row.emergency?.allergies || row.emergency?.conditions) && (
                  <p className="mt-1 text-xs font-semibold text-ok-maroon">
                    {[row.emergency.allergies, row.emergency.conditions].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="text-xs text-teams-muted">
                  {row.emergency?.insurer || "—"} {row.emergency?.policyNo || ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DeskCard>

      <DeskCard
        eyebrow="3 · Pitching plan"
        title="Who can throw."
        copy="Rest is automatic. Availability is flagged here and on the roster."
      >
        {plan.length === 0 ? (
          <p className="text-sm text-teams-muted">No pitchers on this roster.</p>
        ) : (
          <ul className="divide-y divide-line" data-teams-pitch-plan>
            {plan.map((row) => (
              <li key={row.player.id} className="teams-row flex items-center justify-between gap-3">
                <span>
                  <span className="block text-sm font-semibold">{row.player.name}</span>
                  <span className="text-xs text-teams-muted">
                    {row.available
                      ? "Available"
                      : `Resting · ${row.last?.pitches || 0} on ${row.last?.date || "—"} · back ${row.readyOn}`}
                  </span>
                </span>
                <span
                  data-teams-pitch-rest={row.available ? "false" : "true"}
                  className={cn(
                    "teams-num text-xs font-semibold tracking-wide uppercase",
                    row.available ? "text-teams-muted" : "text-ok-maroon",
                  )}
                >
                  {row.available ? "Ready" : "Resting"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DeskCard>

      <DeskCard eyebrow="4 · Event sheet" title="For the team chat." copy="Arrive, uniform, hotel. One page, no buried thread.">
        <pre className="whitespace-pre-wrap rounded-xl bg-cream px-4 py-3 text-sm text-teams-ink">{sheet}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="maroon" data-teams-packet-chat onClick={postSheet}>
            Post to team chat
          </Button>
          <Button
            type="button"
            variant="outlineDark"
            onClick={() =>
              downloadText(`${team.name.replace(/\s+/g, "-").toLowerCase()}-event-sheet.txt`, sheet)
            }
          >
            Export sheet
          </Button>
        </div>
      </DeskCard>
    </div>
  );
}
