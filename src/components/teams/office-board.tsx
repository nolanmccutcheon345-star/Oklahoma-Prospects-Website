import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DeskCard, NumRows } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { useTeams } from "@/lib/teams/context";
import { formatTeamMoney } from "@/lib/teams/os";
import {
  marginAmount,
  matchesCollection,
  ownerSplit,
  valueOfAnotherPlayer,
  type CollectionFilter,
} from "@/lib/teams/money";
import { cn } from "@/lib/utils";

function openFromAlert(
  os: ReturnType<typeof useTeams>,
  item: { kind: string; teamId: string; text: string },
) {
  const team = os.teamById(item.teamId);
  const player = team?.roster.find((p) => item.text.includes(p.name));
  if (item.kind === "Agreement" && player) {
    os.openPlayer(item.teamId, player.id, "account");
    return;
  }
  if ((item.kind === "Money" || item.kind === "Docs") && player) {
    os.openPlayer(item.teamId, player.id, item.kind === "Docs" ? "documents" : "account");
    return;
  }
  if (item.kind === "Uniforms" && player) {
    os.openPlayer(item.teamId, player.id, "uniform");
    return;
  }
  if (item.kind === "Schedule") {
    os.openTeam(item.teamId, "schedule");
    return;
  }
  os.openTeam(item.teamId, "roster");
}

export function OfficeOverview() {
  const os = useTeams();
  const players = os.visibleTeams.flatMap((t) =>
    t.roster.filter((p) => !p.withdrawn).map((p) => ({ team: t, player: p })),
  );
  const contracted = players.reduce((sum, x) => sum + os.feeFor(x.team, x.player), 0);
  const margins = os.visibleTeams.map((t) => marginAmount(os.state, t));
  const margin = margins.reduce((s, m) => s + m.amount, 0);
  const anyForecast = margins.some((m) => m.forecast);
  return (
    <div className="teams-stack" data-teams-office="overview">
      <DeskCard
        eyebrow="Overview"
        title="Win the week, not the spreadsheet."
        copy="Every red item links to the screen that fixes it."
      >
        <NumRows
          rows={[
            { label: "Teams", value: String(os.visibleTeams.length) },
            { label: "Rostered", value: String(players.length) },
            { label: "Contracted", value: formatTeamMoney(contracted) },
            {
              label: anyForecast ? "Forecast margin" : "Realized margin",
              value: formatTeamMoney(margin),
            },
            { label: "Attention", value: String(os.alerts.length), alert: os.alerts.length > 0 },
          ]}
        />
      </DeskCard>
      <DeskCard eyebrow="Attention" title="What has to move.">
        {os.alerts.length === 0 ? (
          <p className="text-sm text-teams-muted">This desk is quiet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {os.alerts.slice(0, 16).map((item) => (
              <li key={`${item.kind}-${item.text}`}>
                <button
                  type="button"
                  data-teams-alert={item.kind}
                  onClick={() => openFromAlert(os, item)}
                  className="teams-row flex w-full items-start justify-between gap-3 text-left"
                >
                  <span>
                    <span className="block text-xs font-semibold tracking-wide text-maroon uppercase">
                      {item.kind}
                    </span>
                    <span className="mt-1 block text-sm">{item.text}</span>
                  </span>
                  <span className="text-xs font-semibold tracking-wide text-maroon uppercase">Open</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DeskCard>
    </div>
  );
}

export function OfficeCollections() {
  const os = useTeams();
  const [filter, setFilter] = useState<CollectionFilter>("all");
  const [amount, setAmount] = useState("");
  const rows = os.collectionsFor().filter((r) => matchesCollection(r, filter));
  const filters: { id: CollectionFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "pastDue", label: "Past due" },
    { id: "noDeposit", label: "No deposit" },
    { id: "noBackup", label: "No backup card" },
  ];
  return (
    <div data-teams-office="collections" className="teams-stack">
      <DeskCard
        eyebrow="Collections"
        title="Open balances, past-due first."
        copy="Record a payment. Waive a uniform. Chase the group."
      >
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-ink p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              data-teams-collect={f.id}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "teams-control shrink-0 rounded-lg px-3 text-xs font-semibold uppercase",
                filter === f.id ? "bg-maroon text-fg-inverse" : "text-fg-soft",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="mt-3 grid gap-1">
          <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Record amount</span>
          <input
            className="teams-control min-h-11 rounded-lg bg-paper px-3 text-sm shadow-border"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
          />
        </label>
        {os.role === "admin" && rows.length ? (
          <Button
            type="button"
            variant="outlineDark"
            className="mt-3"
            onClick={() => {
              const byTeam = new Map<string, string[]>();
              rows.forEach((r) => {
                const list = byTeam.get(r.team.id) || [];
                list.push(r.player.name);
                byTeam.set(r.team.id, list);
              });
              byTeam.forEach((names, teamId) => os.remindGroup(teamId, "account", names));
            }}
          >
            Chase this group
          </Button>
        ) : null}
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-teams-muted">Nothing in this filter.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {rows.map((row) => (
              <li key={row.player.id} className="py-3" data-teams-balance={row.player.id}>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => os.openPlayer(row.team.id, row.player.id, "account")}
                  >
                    <span className="block text-sm font-semibold">{row.player.name}</span>
                    <span className="text-xs text-teams-muted">
                      {row.team.name}
                      {row.pastDue ? " · past due" : ""}
                      {!row.depositPaid ? " · no deposit" : ""}
                      {!row.backup ? " · no backup" : ""}
                    </span>
                  </button>
                  <span className={cn("teams-num text-sm font-semibold", row.pastDue ? "text-ok-maroon" : "")}>
                    {formatTeamMoney(row.balance)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outlineDark"
                    onClick={() =>
                      os.recordOfficePay({
                        teamId: row.team.id,
                        playerId: row.player.id,
                        amount: Number(amount) || row.balance,
                        method: "ach",
                      })
                    }
                  >
                    Record payment
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => os.waiveUniform(row.team.id, row.player.id)}
                    disabled={row.player.uniformWaived}
                  >
                    Waive uniform
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DeskCard>
    </div>
  );
}

export function OfficeCash() {
  const os = useTeams();
  const [teamId, setTeamId] = useState(os.visibleTeams[0]?.id || "");
  const team = os.teamById(teamId) ?? os.visibleTeams[0] ?? null;
  const flow = os.cashFlowFor(team);
  if (!team || !flow) {
    return <TeamsEmpty title="No team to run cash on." copy="Open a season first." />;
  }
  return (
    <div data-teams-office="cash" className="teams-stack">
      <DeskCard
        eyebrow="Cash flow"
        title={
          flow.low.balance < 0
            ? `You go short in ${flow.low.label}.`
            : "This season clears."
        }
        copy="Margin says whether a season works. This says whether you can pay the bills in the order they arrive."
      >
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-ink p-1">
          {os.visibleTeams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTeamId(t.id)}
              className={cn(
                "teams-control shrink-0 rounded-lg px-3 text-xs font-semibold uppercase",
                team.id === t.id ? "bg-maroon text-fg-inverse" : "text-fg-soft",
              )}
            >
              {t.name.replace("Prospects ", "")}
            </button>
          ))}
        </div>
        {flow.low.balance < 0 ? (
          <p className="mb-3 text-sm text-ok-maroon" data-teams-short={flow.low.month}>
            Low point {formatTeamMoney(flow.low.balance)} in {flow.low.label}.
          </p>
        ) : null}
        <ul className="divide-y divide-line">
          {flow.months.map((m) => (
            <li key={m.month} className="teams-row" data-teams-cash-month={m.month}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">{m.label}</span>
                <span
                  className={cn(
                    "teams-num text-sm font-semibold",
                    m.running < 0 ? "text-ok-maroon" : "text-teams-ink",
                  )}
                >
                  {formatTeamMoney(m.running)}
                </span>
              </div>
              <p className="mt-1 text-xs text-teams-muted">
                In {formatTeamMoney(m.inflow)} · Entry {formatTeamMoney(m.entry)} · Staff{" "}
                {formatTeamMoney(m.staff)} · Facility {formatTeamMoney(m.facility)} · Uniform{" "}
                {formatTeamMoney(m.uniform)}
              </p>
            </li>
          ))}
        </ul>
      </DeskCard>
    </div>
  );
}

export function OfficeBudget() {
  const os = useTeams();
  const [teamId, setTeamId] = useState(os.visibleTeams.find((t) => t.id === "t14f")?.id || os.visibleTeams[0]?.id || "");
  const team = os.teamById(teamId);
  const price = team ? os.priceFor(team) : null;
  const m = team ? marginAmount(os.state, team) : null;
  if (!team || !price || !m) {
    return <TeamsEmpty title="Pick a team." copy="The waterfall lives on the team." />;
  }
  const drifted = team.roster.filter((p) => !p.withdrawn && p.feeLock && os.driftFor(team, p) !== 0);
  return (
    <div data-teams-office="budget" className="teams-stack">
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-ink p-1">
        {os.visibleTeams.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTeamId(t.id)}
            className={cn(
              "teams-control shrink-0 rounded-lg px-3 text-xs font-semibold uppercase",
              team.id === t.id ? "bg-maroon text-fg-inverse" : "text-fg-soft",
            )}
          >
            {t.name.replace("Prospects ", "")}
          </button>
        ))}
      </div>
      <DeskCard
        eyebrow="Team budget"
        title="The number that has to add up."
        copy={m.forecast ? "Until the season closes, margin is a forecast." : "This season is closed. Margin is realized."}
      >
        <NumRows
          rows={[
            { label: "Contracted revenue", value: formatTeamMoney(price.revenue) },
            { label: "Protected reserve", value: formatTeamMoney(price.contingency) },
            { label: "Coach pay", value: formatTeamMoney(price.coachTotal) },
            { label: "Facility", value: formatTeamMoney(price.facility) },
            { label: "Uniforms at cost", value: formatTeamMoney(price.uniformActual) },
            {
              label: m.forecast ? "Forecast margin" : "Realized margin",
              value: formatTeamMoney(m.amount),
            },
            { label: "Per owner at 50/50", value: formatTeamMoney(ownerSplit(m.amount)) },
            {
              label: "Value of one more player",
              value: formatTeamMoney(valueOfAnotherPlayer(os.state, team)),
            },
          ]}
        />
      </DeskCard>
      <DeskCard
        eyebrow="Signed prices"
        title="Locked fees that no longer match live costs."
        copy="Nothing moves on a family invoice until they accept."
      >
        {drifted.length === 0 ? (
          <p className="text-sm text-teams-muted">Every signed fee still matches.</p>
        ) : (
          <ul className="divide-y divide-line">
            {drifted.map((p) => {
              const d = os.driftFor(team, p);
              return (
                <li key={p.id} className="teams-row flex items-center justify-between gap-3">
                  <span className="text-sm">{p.name}</span>
                  <span className="teams-num text-sm text-ok-maroon">
                    {d > 0 ? "+" : ""}
                    {formatTeamMoney(d)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 grid gap-2">
          <Button type="button" data-teams-amend-all="true" onClick={() => os.issueAmendments(team.id, "all")}>
            Issue to everyone affected
          </Button>
          {drifted[0] ? (
            <Button
              type="button"
              variant="outlineDark"
              onClick={() => os.issueAmendments(team.id, [drifted[0].id])}
            >
              Issue to {drifted[0].name.split(" ")[0]}
            </Button>
          ) : null}
        </div>
      </DeskCard>
    </div>
  );
}

export function OfficeClose() {
  const os = useTeams();
  const [teamId, setTeamId] = useState(os.visibleTeams.find((t) => t.id === "t14f")?.id || os.visibleTeams[0]?.id || "");
  const team = os.teamById(teamId);
  const price = team ? os.priceFor(team) : null;
  const [actuals, setActuals] = useState<Record<string, string>>({});
  if (!team || !price) {
    return <TeamsEmpty title="Pick a team to close." copy="Actuals turn forecast into realized." />;
  }
  const m = marginAmount(os.state, team);
  const lines = [
    { key: "entries", label: "Entry fees", forecast: price.entryFees },
    { key: "other", label: "Other costs", forecast: price.other },
    { key: "coach", label: "Coach pay", forecast: price.coachTotal },
    { key: "facility", label: "Facility", forecast: price.facility },
    { key: "uniforms", label: "Uniforms", forecast: price.uniformActual },
    { key: "contingency", label: "Contingency released", forecast: 0 },
  ];
  return (
    <div data-teams-office="close" className="teams-stack">
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-ink p-1">
        {os.visibleTeams.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTeamId(t.id)}
            className={cn(
              "teams-control shrink-0 rounded-lg px-3 text-xs font-semibold uppercase",
              team.id === t.id ? "bg-maroon text-fg-inverse" : "text-fg-soft",
            )}
          >
            {t.name.replace("Prospects ", "")}
          </button>
        ))}
      </div>
      <DeskCard
        eyebrow="Season close"
        title={m.forecast ? "Margin is still a forecast." : "Margin is realized."}
        copy="Enter actuals against every budget line. Closing archives the roster and the stat lines."
      >
        <NumRows
          rows={[
            {
              label: m.forecast ? "Forecast margin" : "Realized margin",
              value: formatTeamMoney(m.amount),
            },
          ]}
        />
        <div className="mt-4 grid gap-3">
          {lines.map((line) => (
            <label key={line.key} className="grid gap-1">
              <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">
                {line.label} · forecast {formatTeamMoney(line.forecast)}
              </span>
              <input
                className="teams-control min-h-11 rounded-lg bg-paper px-3 text-sm shadow-border"
                value={actuals[line.key] ?? String(line.forecast)}
                onChange={(e) => setActuals((cur) => ({ ...cur, [line.key]: e.target.value }))}
                inputMode="numeric"
                disabled={!m.forecast}
              />
            </label>
          ))}
        </div>
        {m.forecast ? (
          <Button
            type="button"
            className="mt-4"
            data-teams-close="true"
            onClick={() => {
              const payload: Record<string, number> = {};
              lines.forEach((line) => {
                payload[line.key] = Number(actuals[line.key] ?? line.forecast) || 0;
              });
              os.closeSeason(team.id, payload);
            }}
          >
            Close season
          </Button>
        ) : (
          <p className="mt-4 text-sm text-teams-muted">Archived with rosters and stat lines.</p>
        )}
      </DeskCard>
    </div>
  );
}
