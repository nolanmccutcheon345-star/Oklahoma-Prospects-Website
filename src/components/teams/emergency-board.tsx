import { useMemo, useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeskCard, downloadText } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { positionsOf, useTeams } from "@/lib/teams/context";
import { emergencyCardText, telHref } from "@/lib/teams/field";
import type { OsPlayer, OsTeam } from "@/lib/teams/model";
import { cn } from "@/lib/utils";

function medicalLine(player: OsPlayer) {
  return [player.emergency?.allergies, player.emergency?.conditions].filter(Boolean);
}

export function EmergencyBoard({ team }: { team: OsTeam }) {
  const os = useTeams();
  const [q, setQ] = useState("");
  const own = os.visibleTeams.filter((t) => t.id === team.id);
  const roster = own[0]?.roster.filter((p) => !p.withdrawn) ?? [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter((p) => {
      const hay = `${p.name} ${p.number} ${positionsOf(p)} ${(p.parents || []).map((g) => g.name).join(" ")}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [q, roster]);
  const flagged = rows.filter((p) => medicalLine(p).length > 0);

  function exportBinder() {
    const body = rows.map((p) => emergencyCardText(p, team)).join("\n\n---\n\n");
    downloadText(`${team.name.replace(/\s+/g, "-").toLowerCase()}-emergency.txt`, body);
  }

  if (roster.length === 0) {
    return (
      <TeamsEmpty
        title="No roster on this team."
        copy="Emergency cards stay with your own team. Nothing from another roster lives here."
        action="Back to desks"
        onAction={() => os.closeRecord()}
      />
    );
  }

  return (
    <div data-teams-emergency="true" className="grid gap-4">
      <DeskCard
        eyebrow="Emergency"
        title="This team. This field."
        copy="Allergies and conditions first. Tap a number. The card is already on the phone."
      >
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="sr-only">Search this team</span>
            <input
              data-teams-emergency-search
              className="teams-control min-h-11 w-full rounded-lg bg-paper px-3 text-sm shadow-border"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a player"
            />
          </label>
          <p className="text-xs font-semibold tracking-wide text-ok-maroon uppercase">
            {flagged.length
              ? `${flagged.length} medical flag${flagged.length > 1 ? "s" : ""} on this roster`
              : "No medical flags on the matching names"}
          </p>
          <Button type="button" variant="outlineDark" data-teams-emergency-export onClick={exportBinder}>
            Export binder
          </Button>
        </div>
      </DeskCard>

      {rows.length === 0 ? (
        <TeamsEmpty title="No match on this team." copy="Search stays inside your roster." />
      ) : (
        rows.map((player) => <EmergencyCard key={player.id} team={team} player={player} />)
      )}
    </div>
  );
}

function EmergencyCard({ team, player }: { team: OsTeam; player: OsPlayer }) {
  const os = useTeams();
  const e = player.emergency;
  const medical = medicalLine(player);
  const parents = player.parents || [];

  return (
    <section
      data-teams-emergency-player={player.id}
      className="overflow-hidden rounded-2xl bg-paper-2 shadow-border"
    >
      <div className={cn("h-1", medical.length ? "bg-ok-maroon" : "bg-maroon")} />
      <div className="teams-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          #{player.number} · {positionsOf(player)}
        </p>
        <h2 className="mt-2 text-3xl">{player.name}</h2>
        {medical.length ? (
          <p className="mt-2 text-sm font-semibold text-ok-maroon" data-teams-medical="true">
            {medical.join(" · ")}
          </p>
        ) : (
          <p className="mt-2 text-sm text-teams-muted">No allergies or conditions on file.</p>
        )}
        <ul className="mt-4 divide-y divide-line">
          {parents.map((g) => {
            const href = telHref(g.phone);
            return (
              <li key={`${g.email}-${g.phone}`} className="teams-row flex items-center justify-between gap-3">
                <span>
                  <span className="block text-sm font-semibold text-teams-ink">{g.name}</span>
                  <span className="text-xs text-teams-muted">{g.rel}</span>
                </span>
                {href ? (
                  <a
                    href={href}
                    data-teams-tel={g.phone}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-ink px-3 text-xs font-semibold tracking-wide text-fg-inverse uppercase"
                  >
                    <Phone className="size-4" strokeWidth={2.2} />
                    {g.phone}
                  </a>
                ) : (
                  <span className="text-xs text-teams-muted">No number</span>
                )}
              </li>
            );
          })}
          <li className="teams-row">
            <p className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Insurance</p>
            <p className="mt-1 text-sm font-semibold text-teams-ink">
              {e?.insurer || "—"} {e?.policyNo || ""}
            </p>
          </li>
          <li className="teams-row">
            <p className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Physician</p>
            <p className="mt-1 text-sm text-teams-ink">{e?.physician || "—"}</p>
          </li>
          <li className="teams-row">
            <p className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Authorized pickup</p>
            <p className="mt-1 text-sm text-teams-ink">{(e?.pickup || []).join(", ") || "—"}</p>
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => os.openPlayer(team.id, player.id, "emergency")}
          >
            Open record
          </Button>
          <Button
            type="button"
            variant="outlineDark"
            size="sm"
            onClick={() =>
              downloadText(
                `${player.name.replace(/\s+/g, "-").toLowerCase()}-card.txt`,
                emergencyCardText(player, team),
              )
            }
          >
            Export card
          </Button>
        </div>
      </div>
    </section>
  );
}
