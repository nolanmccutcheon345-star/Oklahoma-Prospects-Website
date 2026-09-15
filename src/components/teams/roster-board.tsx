import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeskCard, NumRows } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { SignFlow } from "@/components/teams/sign-flow";
import { positionsOf, useTeams } from "@/lib/teams/context";
import { formatTeamMoney } from "@/lib/teams/os";
import {
  ROSTER_FILTERS,
  matchesRosterFilter,
  searchRoster,
  type RosterFilter,
} from "@/lib/teams/roster";
import type { OsClearance, OsInvite, OsPlayer, OsTeam } from "@/lib/teams/model";
import { cn } from "@/lib/utils";

function clearanceTone(status: OsClearance) {
  return status === "cleared" ? "text-teams-muted" : "text-ok-maroon";
}

export function RosterBoard({ team }: { team: OsTeam }) {
  const os = useTeams();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [notice, setNotice] = useState("");
  const [signing, setSigning] = useState<
    | { kind: "player"; player: OsPlayer }
    | { kind: "invite"; invite: OsInvite }
    | null
  >(null);

  const active = team.roster.filter((p) => !p.withdrawn);
  const out = team.roster.filter((p) => p.withdrawn);
  const rows = useMemo(
    () =>
      active.filter(
        (p) => matchesRosterFilter(p, filter) && searchRoster(p, q),
      ),
    [active, filter, q],
  );

  function chase() {
    const names = rows.map((p) => p.name);
    if (names.length === 0) return;
    os.remindGroup(team.id, filter === "all" ? "action" : filter, names);
    setNotice(`Chase sent to ${names.length === 1 ? names[0] : `${names.length} families`}.`);
  }

  if (signing) {
    return (
      <SignFlow
        team={team}
        player={signing.kind === "player" ? signing.player : null}
        invite={signing.kind === "invite" ? signing.invite : null}
        onDone={(id) => {
          setSigning(null);
          os.openPlayer(team.id, id, "account");
        }}
        onCancel={() => setSigning(null)}
      />
    );
  }

  if (active.length === 0 && out.length === 0 && !(team.invites || []).length) {
    return (
      <TeamsEmpty
        title="No one is rostered."
        copy="Send an invite or pull a player from the recruiting desk."
        action="Open recruiting"
        onAction={() => os.closeRecord()}
      />
    );
  }

  return (
    <>
      <DeskCard
        eyebrow="Roster"
        title="Who is eligible tonight."
        copy={
          os.role === "coach"
            ? "Clearance is yes or no. Never a dollar amount."
            : "Tap a name for the player record. Red means they sit."
        }
      >
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="sr-only">Search roster</span>
            <input
              data-teams-roster-search
              className="teams-control min-h-11 w-full rounded-lg bg-paper px-3 text-sm shadow-border"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, number, position"
            />
          </label>
          <div
            role="tablist"
            aria-label="Roster filters"
            className="flex gap-1 overflow-x-auto rounded-xl bg-ink p-1"
          >
            {ROSTER_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                data-teams-filter={item.id}
                aria-selected={filter === item.id}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "teams-control shrink-0 rounded-lg px-3 text-xs font-semibold tracking-wide uppercase",
                  filter === item.id ? "bg-maroon text-fg-inverse" : "text-fg-soft",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {os.role === "admin" || os.role === "coach" ? (
            <Button
              type="button"
              variant="outlineDark"
              data-teams-roster-chase
              onClick={chase}
              disabled={rows.length === 0}
            >
              Chase this group
            </Button>
          ) : null}
          {notice ? <p className="text-sm text-teams-ink">{notice}</p> : null}
        </div>
        <ul className="mt-4 divide-y divide-line">
          {rows.map((player) => {
            const clear = os.clearanceFor(player);
            const pitch = os.pitchFor(team, player.id);
            return (
              <li key={player.id}>
                <button
                  type="button"
                  data-teams-open-player={player.id}
                  data-teams-clearance={clear.status}
                  onClick={() => os.openPlayer(team.id, player.id)}
                  className="teams-row flex w-full items-center justify-between gap-3 text-left"
                >
                  <span>
                    <span className="block text-sm font-semibold text-teams-ink">
                      #{player.number} {player.name}
                    </span>
                    <span className="text-xs text-teams-muted">
                      {positionsOf(player)}
                      {player.roleType === "po" ? " · pitcher-only" : ""}
                      {player.coachChild ? " · coach's child" : ""}
                      {!pitch.available ? ` · rest ${pitch.need}d` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "teams-num text-xs font-semibold tracking-wide uppercase",
                      clearanceTone(clear.status),
                    )}
                  >
                    {clear.reason}
                  </span>
                </button>
                {os.canSign(player) ? (
                  <button
                    type="button"
                    data-teams-start-sign={player.id}
                    className="mb-2 px-4 text-xs font-semibold tracking-wide text-maroon uppercase"
                    onClick={() => setSigning({ kind: "player", player })}
                  >
                    Collect signature
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-teams-muted">No one matches this filter.</p>
        ) : null}
      </DeskCard>
      {out.length ? (
        <DeskCard eyebrow="Withdrawn" title="Off the roster.">
          <NumRows
            rows={out.map((p) => ({
              label: p.name,
              value: String(p.withdrawn),
              alert: true,
            }))}
          />
        </DeskCard>
      ) : null}
      {team.invites?.length ? (
        <DeskCard eyebrow="Invites" title="Still out.">
          <ul className="divide-y divide-line">
            {team.invites.map((inv) => (
              <li key={inv.id} className="teams-row">
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold">{inv.name}</span>
                    <span className="text-xs text-teams-muted">
                      {inv.position} · {inv.status}
                      {os.canSeeTeamMoney && inv.charge
                        ? ` · charged ${formatTeamMoney(inv.charge.totalCharged)}`
                        : os.perms.seeAnyPrice && os.depositAmount(team)
                          ? ` · deposit ${formatTeamMoney(os.depositAmount(team))}`
                          : ""}
                    </span>
                  </span>
                  {inv.status === "pending" && os.role === "admin" ? (
                    <button
                      type="button"
                      data-teams-accept-invite={inv.id}
                      className="text-xs font-semibold tracking-wide text-maroon uppercase"
                      onClick={() => setSigning({ kind: "invite", invite: inv })}
                    >
                      Accept invite
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {os.perms.seeAnyPrice ? (
            <p className="mt-3 text-sm text-teams-muted">
              Accepting records the deposit, the card fee, and the total charged as three numbers.
            </p>
          ) : null}
        </DeskCard>
      ) : null}
    </>
  );
}
