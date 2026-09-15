import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BackLink, BudgetMeter, DeskCard, NumRows, RecordTabs } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { TeamsErrorBoundary } from "@/components/teams/error-boundary";
import { RosterBoard } from "@/components/teams/roster-board";
import { ScheduleBoard } from "@/components/teams/schedule-board";
import { UniformBoard } from "@/components/teams/uniform-board";
import { EmergencyBoard } from "@/components/teams/emergency-board";
import { PacketBoard } from "@/components/teams/packet-board";
import { PitchBoard } from "@/components/teams/pitch-board";
import { FieldOpsBoard } from "@/components/teams/field-ops-board";
import { CageBoard } from "@/components/teams/cage-board";
import { ScoreBoard } from "@/components/teams/score-board";
import { useTeams } from "@/lib/teams/context";
import { formatTeamMoney } from "@/lib/teams/os";
import { marginAmount } from "@/lib/teams/money";
import type { OsPlayer, OsTeam } from "@/lib/teams/model";
import { cn } from "@/lib/utils";

function fmtRec(team: OsTeam) {
  const r = team.record || { w: 0, l: 0, t: 0 };
  return `${r.w}–${r.l}–${r.t}`;
}

function Overview({ team }: { team: OsTeam }) {
  const os = useTeams();
  const price = os.priceFor(team);
  const active = team.roster.filter((p) => !p.withdrawn);
  const unsigned = active.filter((p) => !p.agreement).length;
  const paper = active.filter((p) => os.docsMissing(p).length > 0).length;
  const sizes = active.filter((p) => !p.order?.submitted).length;
  const alerts = os.alerts.filter((a) => a.teamId === team.id);
  const published = os.publishedFor(team);
  const entry = os.viewer.entryByTeam[team.id];
  const travel = os.viewer.travelByTeam[team.id];

  return (
    <>
      <DeskCard
        eyebrow={`${team.age} · ${team.level} · ${team.seasonLabel}`}
        title={team.name}
        copy={`${team.headCoach} · ${team.sport === "softball" ? "Fastpitch" : "Baseball"}. Record ${fmtRec(team)}.`}
      >
        <NumRows
          rows={[
            { label: "Roster", value: String(active.length) },
            { label: "Record", value: fmtRec(team) },
            {
              label: "Unsigned",
              value: String(unsigned),
              alert: unsigned > 0,
            },
            {
              label: "Missing paper",
              value: String(paper),
              alert: paper > 0,
            },
            {
              label: "Uniform orders",
              value: String(sizes),
              alert: sizes > 0,
            },
            ...(os.canSeePublished && published
              ? [{ label: "Published fee", value: formatTeamMoney(published) }]
              : []),
            ...(os.canSeeTeamMoney && price
              ? [{ label: "Funded / 10", value: `${price.fundedPlayers} / 10` }]
              : []),
          ]}
        />
        {os.role === "coach" && entry ? (
          <div className="mt-4 grid gap-4">
            <BudgetMeter
              label="Tournament entries"
              spent={entry.spent}
              budget={entry.budget}
              spentLabel={`${entry.pct}% of budget`}
            />
            {travel ? (
              <BudgetMeter
                label="Coach travel"
                spent={travel.reimbursed}
                budget={travel.budget}
                spentLabel={`${formatTeamMoney(travel.reimbursed)} of ${formatTeamMoney(travel.budget)}`}
              />
            ) : null}
          </div>
        ) : null}
      </DeskCard>
      {alerts.length ? (
        <DeskCard eyebrow="Attention" title="What has to move.">
          <ul className="divide-y divide-line">
            {alerts.slice(0, 8).map((item) => (
              <li key={item.text} className="teams-row text-sm">
                <span className="font-semibold tracking-wide text-maroon uppercase">
                  {item.kind}
                </span>
                <p className="mt-1 text-teams-ink">{item.text}</p>
              </li>
            ))}
          </ul>
        </DeskCard>
      ) : (
        <TeamsEmpty
          title="This desk is quiet."
          copy="No unsigned agreements, missing paper, or thin roster on this team."
          action="Open roster"
          onAction={() => os.openTeam(team.id, "roster")}
        />
      )}
    </>
  );
}

function Roster({ team }: { team: OsTeam }) {
  return <RosterBoard team={team} />;
}

function Schedule({ team }: { team: OsTeam }) {
  return <ScheduleBoard team={team} />;
}

function Practice({ team }: { team: OsTeam }) {
  return <FieldOpsBoard team={team} pane="practice" />;
}

function Uniforms({ team }: { team: OsTeam }) {
  return <UniformBoard team={team} />;
}

function GameDay({ team }: { team: OsTeam }) {
  return <ScoreBoard team={team} />;
}

function Announcements({ team }: { team: OsTeam }) {
  return <FieldOpsBoard team={team} pane="announcements" />;
}

function Attendance({ team }: { team: OsTeam }) {
  return <FieldOpsBoard team={team} pane="attendance" />;
}

function FieldCalls({ team }: { team: OsTeam }) {
  return <FieldOpsBoard team={team} pane="field-calls" />;
}

function Stats({ team }: { team: OsTeam }) {
  const os = useTeams();
  const rows = team.roster.filter((p) => !p.withdrawn && Number(p.stats?.gp) > 0);
  if (rows.length === 0) {
    return (
      <TeamsEmpty
        title="No stats in the book."
        copy="When the first game is final, hitting and pitching land here."
        action="Open game day"
        onAction={() => os.openTeam(team.id, "game-day")}
      />
    );
  }
  return (
    <DeskCard eyebrow="Stats" title="The work shows up here.">
      <ul className="divide-y divide-line">
        {rows.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => os.openPlayer(team.id, p.id, "stats")}
              className="teams-row flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="text-sm font-semibold">{p.name}</span>
              <span className="teams-num text-sm">
                AVG {Number(p.stats.avg) ? Number(p.stats.avg).toFixed(3).replace(/^0/, "") : "—"}
                {p.stats.velo ? ` · ${p.stats.velo} mph` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </DeskCard>
  );
}

function Chat({ team }: { team: OsTeam }) {
  return <FieldOpsBoard team={team} pane="chat" />;
}

function Money({ team }: { team: OsTeam }) {
  const os = useTeams();
  if (!os.canSeeTeamMoney) {
    return (
      <TeamsEmpty
        title="Team money stays in the office."
        copy="Budgets, entry fees, and other families' balances are admin-only."
      />
    );
  }
  const price = os.priceFor(team);
  if (!price) {
    return (
      <TeamsEmpty
        title="Fee engine could not price this team."
        copy="Check events, the uniform package, and season dates."
      />
    );
  }
  const pastDue = team.roster.filter((p) => !p.withdrawn && os.balanceFor(team, p) > 0).length;
  const deadline = os.deadlineFor(team);
  const deposit = os.depositAmount(team);
  const m = marginAmount(os.state, team);
  return (
    <div data-teams-money="true" data-teams-margin={m.forecast ? "forecast" : "realized"}>
      <DeskCard
        eyebrow="Money"
        title="The number that has to add up."
        copy={
          m.forecast
            ? "Until the season closes, margin is a forecast."
            : "This season is closed. Margin is realized."
        }
      >
        <NumRows
          rows={[
            { label: "Entry fees", value: formatTeamMoney(price.entryFees) },
            { label: "Other costs", value: formatTeamMoney(price.other) },
            { label: "Contingency", value: formatTeamMoney(price.contingency) },
            { label: "Protected", value: formatTeamMoney(price.protectedBudget) },
            { label: "Coach pool", value: formatTeamMoney(price.coachTotal) },
            { label: "Facility", value: formatTeamMoney(price.facility) },
            { label: "Published fee", value: formatTeamMoney(price.published) },
            { label: "Contracted", value: formatTeamMoney(price.revenue) },
            {
              label: m.forecast ? "Forecast margin" : "Realized margin",
              value: formatTeamMoney(m.amount),
            },
            { label: "Invite deposit", value: formatTeamMoney(deposit) },
            {
              label: "Paid in full by",
              value: deadline || "After schedule posts",
            },
            { label: "Past due", value: String(pastDue), alert: pastDue > 0 },
          ]}
        />
      </DeskCard>
      <DeskCard eyebrow="Roster fees" title="Each player, one column.">
        <ul className="divide-y divide-line">
          {team.roster
            .filter((p) => !p.withdrawn)
            .map((p) => {
              const drift = os.driftFor(team, p);
              const amend = os.amendmentFor(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => os.openPlayer(team.id, p.id, "account")}
                    className="teams-row flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span>
                      <span className="block text-sm">{p.name}</span>
                      {p.feeLock ? (
                        <span className="text-xs text-teams-muted">
                          Signed {formatTeamMoney(p.feeLock.amount)}
                          {drift
                            ? ` · live ${drift > 0 ? "+" : ""}${formatTeamMoney(drift)}`
                            : " · no drift"}
                          {amend ? " · amendment pending" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-ok-maroon">Unsigned · live price</span>
                      )}
                    </span>
                    <span className="teams-num text-sm font-semibold">
                      {formatTeamMoney(os.feeFor(team, p))} · due {formatTeamMoney(os.balanceFor(team, p))}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      </DeskCard>
    </div>
  );
}

function Body({ team, tab }: { team: OsTeam; tab: string }) {
  if (tab === "emergency") return <EmergencyBoard team={team} />;
  if (tab === "packet") return <PacketBoard team={team} />;
  if (tab === "pitches") return <PitchBoard team={team} />;
  if (tab === "roster") return <Roster team={team} />;
  if (tab === "schedule") return <Schedule team={team} />;
  if (tab === "practice") return <Practice team={team} />;
  if (tab === "uniforms") return <Uniforms team={team} />;
  if (tab === "game-day") return <GameDay team={team} />;
  if (tab === "announcements") return <Announcements team={team} />;
  if (tab === "attendance") return <Attendance team={team} />;
  if (tab === "field-calls") return <FieldCalls team={team} />;
  if (tab === "cages") return <CageBoard team={team} />;
  if (tab === "stats") return <Stats team={team} />;
  if (tab === "chat") return <Chat team={team} />;
  if (tab === "money") return <Money team={team} />;
  return <Overview team={team} />;
}

export function TeamRecord({ teamId, tab }: { teamId: string; tab: string }) {
  const os = useTeams();
  const team = os.teamById(teamId);
  const activeTab = os.teamTabs.some((t) => t.id === tab) ? tab : os.teamTabs[0]?.id ?? "overview";
  if (!team) {
    return (
      <TeamsEmpty
        title="That team is not on this desk."
        copy="It may belong to another coach, or it was never created."
        action="Back to teams"
        onAction={os.closeRecord}
      />
    );
  }
  const section = `Teams · ${team.name} · ${activeTab}`;
  return (
    <div data-teams-record={team.id} data-teams-active-tab={activeTab} className="min-w-0 max-w-full">
      <div className="mb-3">
        <BackLink label="All desks" onClick={os.closeRecord} />
      </div>
      <RecordTabs
        label={`${team.name} record`}
        tabs={os.teamTabs}
        active={activeTab}
        onChange={os.setRecordTab}
      />
      <div className="teams-stack mt-5">
        <TeamsErrorBoundary section={section}>
          <Body team={team} tab={activeTab} />
        </TeamsErrorBoundary>
      </div>
    </div>
  );
}

export function TeamList({
  teams,
  onOpen,
}: {
  teams: OsTeam[];
  onOpen: (id: string) => void;
}) {
  if (teams.length === 0) {
    return (
      <TeamsEmpty
        title="No teams yet."
        copy="Open a season and add the first roster. Empty never crashes this desk."
      />
    );
  }
  return (
    <ul className="divide-y divide-line">
      {teams.map((team) => {
        const n = team.roster.filter((p) => !p.withdrawn).length;
        return (
          <li key={team.id}>
            <button
              type="button"
              data-teams-open-team={team.id}
              onClick={() => onOpen(team.id)}
              className="teams-row flex w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block text-sm font-semibold">{team.name}</span>
                <span className="text-xs text-teams-muted">
                  {team.seasonLabel} · {team.headCoach}
                </span>
              </span>
              <span
                className={cn(
                  "teams-num text-sm font-semibold",
                  n < 10 ? "text-ok-maroon" : "text-teams-ink",
                )}
              >
                {n} / 12
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function PlayerChip({
  team,
  player,
}: {
  team: OsTeam;
  player: OsPlayer;
}) {
  const os = useTeams();
  return (
    <button
      type="button"
      data-teams-open-player={player.id}
      onClick={() => os.openPlayer(team.id, player.id)}
      className="text-maroon"
    >
      {player.name}
    </button>
  );
}

export function BookLaneLink() {
  return (
    <Button asChild className="mt-4">
      <Link to="/book">Book a lane</Link>
    </Button>
  );
}
