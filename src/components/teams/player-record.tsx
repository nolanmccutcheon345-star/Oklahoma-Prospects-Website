import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BackLink, DeskCard, NumRows, RecordTabs, downloadText } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { TeamsErrorBoundary } from "@/components/teams/error-boundary";
import { SignFlow } from "@/components/teams/sign-flow";
import { fmtAvg, positionsOf, useTeams } from "@/lib/teams/context";
import { formatTeamMoney } from "@/lib/teams/os";
import { recruitingOnePager, recruitingShareUrl } from "@/lib/teams/money";
import { withdrawSettlement } from "@/lib/teams/roster";
import { sizeFieldsOf, sizeOpts } from "@/lib/teams/uniforms";
import type { OsPlayer, OsTeam } from "@/lib/teams/model";

function WithdrawBox({
  team,
  player,
}: {
  team: OsTeam;
  player: OsPlayer;
}) {
  const os = useTeams();
  const [reason, setReason] = useState("");
  const [forgive, setForgive] = useState(false);
  const [msg, setMsg] = useState("");
  const settle = withdrawSettlement(
    // settlement uses live team+player; amounts come from context selectors
    {
      ...os.state,
      teams: os.state.teams,
      settings: os.state.settings,
      catalog: os.state.catalog,
      uniforms: os.state.uniforms,
    } as never,
    team,
    player,
  );

  const amount = settle.owes === "full" ? os.balanceFor(team, player) : os.depositAmount(team);

  return (
    <div className="grid gap-3">
      <p className="text-sm text-teams-muted">
        {settle.owes === "full"
          ? "Schedule is committed. Policy settles at the full remaining balance."
          : "Schedule is not committed. Policy settles at the deposit only."}
        {os.canSeeAccount(player) ? ` ${formatTeamMoney(amount)}.` : ""}
      </p>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          Reason
        </span>
        <input
          data-teams-withdraw-reason
          className="teams-control min-h-11 rounded-lg bg-paper px-3 shadow-border"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Required for the audit log"
        />
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-maroon"
          checked={forgive}
          onChange={(e) => setForgive(e.target.checked)}
        />
        Forgive the remaining balance (exception — audit log)
      </label>
      <Button
        type="button"
        variant="outlineDark"
        data-teams-withdraw
        disabled={!reason.trim()}
        onClick={() => {
          os.withdrawSpot(team.id, player.id, reason.trim(), forgive);
          setMsg("Withdrawn. The audit log has the reason.");
        }}
      >
        Withdraw player
      </Button>
      {msg ? <p className="text-sm">{msg}</p> : null}
    </div>
  );
}

function Profile({ team, player }: { team: OsTeam; player: OsPlayer }) {
  const os = useTeams();
  const clear = os.clearanceFor(player);
  const [signing, setSigning] = useState(false);

  if (signing) {
    return (
      <SignFlow
        team={team}
        player={player}
        onDone={() => {
          setSigning(false);
          os.openPlayer(team.id, player.id, os.canSeeAccount(player) ? "account" : "profile");
        }}
        onCancel={() => setSigning(false)}
      />
    );
  }

  return (
    <>
      <DeskCard
        eyebrow={`${team.name} · #${player.number}`}
        title={player.name}
        copy={`${positionsOf(player)} · ${player.bats} / ${player.throws} · ${player.school} · ${player.gradYear}`}
      >
        <NumRows
          rows={[
            { label: "Height / weight", value: `${player.height} · ${player.weight}` },
            { label: "Bats / throws", value: `${player.bats} / ${player.throws}` },
            {
              label: "Role",
              value: player.roleType === "po" ? "Pitcher-only" : "Full player",
            },
            {
              label: "Coach's child",
              value: player.coachChild ? player.coachChild : "No",
            },
            {
              label: "Agreement",
              value: player.agreement ? "Signed" : "Unsigned",
              alert: !player.agreement,
            },
            {
              label: "Tournament eligible",
              value: clear.ok ? "Yes" : `No · ${clear.reason}`,
              alert: !clear.ok,
            },
          ]}
        />
        {os.canSign(player) ? (
          <Button
            type="button"
            variant="maroon"
            className="mt-4 min-h-12"
            data-teams-start-sign={player.id}
            onClick={() => setSigning(true)}
          >
            Collect signature
          </Button>
        ) : null}
      </DeskCard>
      {os.perms.admin && !player.withdrawn ? (
        <DeskCard
          eyebrow="Withdrawal"
          title="Off the roster."
          copy="Deposit only before the schedule commits. Full balance after. Forgiveness is an exception and goes to the audit log."
        >
          <WithdrawBox team={team} player={player} />
        </DeskCard>
      ) : null}
    </>
  );
}

function Hitting({ player }: { player: OsPlayer }) {
  const os = useTeams();
  const s = player.stats || {};
  if (!Number(s.gp)) {
    return (
      <TeamsEmpty
        title="No stats in the book."
        copy="This player has not appeared in a scored game yet."
        action="Open game day"
        onAction={() => os.openTeam(player.teamId, "game-day")}
      />
    );
  }
  return (
    <DeskCard eyebrow="Stats" title="The work shows up here.">
      <NumRows
        rows={[
          { label: "G", value: String(s.gp ?? 0) },
          { label: "AB", value: String(s.ab ?? 0) },
          { label: "H", value: String(s.h ?? 0) },
          { label: "HR", value: String(s.hr ?? 0) },
          { label: "RBI", value: String(s.rbi ?? 0) },
          { label: "BB", value: String(s.bb ?? 0) },
          { label: "K", value: String(s.k ?? 0) },
          { label: "SB", value: String(s.sb ?? 0) },
          { label: "AVG", value: fmtAvg(s.avg) },
          { label: "OBP", value: fmtAvg(s.obp) },
          { label: "OPS", value: fmtAvg(s.ops) },
        ]}
      />
      {Number(s.ip) > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            Pitching
          </p>
          <NumRows
            rows={[
              { label: "IP", value: String(s.ip) },
              { label: "ER", value: String(s.er ?? 0) },
              { label: "SO", value: String(s.so ?? 0) },
              { label: "ERA", value: String(s.era ?? "—") },
              { label: "WHIP", value: String(s.whip ?? "—") },
            ]}
          />
        </div>
      ) : null}
    </DeskCard>
  );
}

function Measurables({ team, player }: { team: OsTeam; player: OsPlayer }) {
  const os = useTeams();
  const s = player.stats || {};
  const pitch = os.pitchFor(team, player.id);
  const limit = os.pitchLimit[team.age] ?? 95;
  const has = s.ev || s.pop || s.velo || pitch.last;
  if (!has) {
    return (
      <TeamsEmpty
        title="No measurables yet."
        copy="Exit velo, pop time, and velo land here after a look."
        action="Open pitches"
        onAction={() => os.openTeam(team.id, "pitches")}
      />
    );
  }
  return (
    <DeskCard eyebrow="Measurables" title="What the gun said.">
      <NumRows
        rows={[
          ...(s.ev ? [{ label: "Exit velo", value: `${s.ev} mph` }] : []),
          ...(s.pop ? [{ label: "Pop", value: String(s.pop) }] : []),
          ...(s.velo ? [{ label: "Velo", value: `${s.velo} mph` }] : []),
          {
            label: "Pitch Smart",
            value: pitch.available
              ? "Available"
              : `Rest ${pitch.need} · ready ${pitch.readyOn}`,
            alert: !pitch.available,
          },
          { label: `${team.age} limit`, value: String(limit) },
        ]}
      />
    </DeskCard>
  );
}

function Documents({ player }: { player: OsPlayer }) {
  const os = useTeams();
  const miss = os.docsMissing(player);
  const keys = Object.keys(os.docLabels);
  const clear = os.clearanceFor(player);
  return (
    <DeskCard
      eyebrow="Documents"
      title="Paper that keeps him on the field."
      copy="Waiver, birth certificate, insurance, physical. Missing one means he is not cleared."
    >
      <NumRows
        rows={[
          {
            label: "Cleared",
            value: clear.ok ? "Yes" : `No · ${clear.reason}`,
            alert: !clear.ok,
          },
          ...keys.map((k) => ({
            label: os.docLabels[k],
            value: player.docs?.[k] ? "On file" : "Missing",
            alert: !player.docs?.[k],
          })),
        ]}
      />
      {miss.length === 0 ? (
        <p className="mt-3 text-sm text-teams-muted">All four are in.</p>
      ) : null}
    </DeskCard>
  );
}

function Emergency({ player }: { player: OsPlayer }) {
  const os = useTeams();
  const e = player.emergency;
  const blank =
    !e ||
    (!e.allergies &&
      !e.conditions &&
      !e.insurer &&
      !e.physician &&
      !(e.pickup || []).length);
  if (blank) {
    return (
      <TeamsEmpty
        title="No emergency card."
        copy="Allergies, asthma, pickup list, and the pediatrician live here."
        action="Open documents"
        onAction={() => os.openPlayer(player.teamId, player.id, "documents")}
      />
    );
  }
  return (
    <DeskCard eyebrow="Emergency" title="What the coach needs at 9:15.">
      <NumRows
        rows={[
          { label: "Allergies", value: e.allergies || "None listed", alert: Boolean(e.allergies) },
          { label: "Conditions", value: e.conditions || "None listed", alert: Boolean(e.conditions) },
          { label: "Insurer", value: e.insurer || "—" },
          { label: "Policy", value: e.policyNo || "—" },
          { label: "Physician", value: e.physician || "—" },
          { label: "Pickup", value: (e.pickup || []).join(", ") || "—" },
        ]}
      />
    </DeskCard>
  );
}

function Account({ team, player }: { team: OsTeam; player: OsPlayer }) {
  const os = useTeams();
  if (!os.canSeeAccount(player)) {
    return (
      <TeamsEmpty
        title="This invoice is not yours."
        copy="Players never see money. Parents see only their own player's fees."
      />
    );
  }
  const plan = os.planFor(team, player);
  const fee = os.feeFor(team, player);
  const due = os.balanceFor(team, player);
  const credits = os.creditsFor(player);
  const drift = os.driftFor(team, player);
  const amend = os.amendmentFor(player);
  const deadline = os.deadlineFor(team);
  const deposit = os.depositAmount(team);
  const breakdown = os.breakdownFor(team, player);
  const includes = os.viewer.membershipIncludes;
  return (
    <div data-teams-account="true">
      <DeskCard
        eyebrow="Account"
        title="What you still owe."
        copy="Once they sign, the number is frozen. Later price changes become amendments."
      >
        <NumRows
          rows={[
            { label: "Season fee", value: formatTeamMoney(fee) },
            {
              label: player.feeLock ? "Signed fee" : "Live price",
              value: formatTeamMoney(player.feeLock?.amount ?? fee),
            },
            ...(player.feeLock
              ? [
                  {
                    label: "Live vs signed",
                    value: drift
                      ? `${drift > 0 ? "+" : ""}${formatTeamMoney(drift)}`
                      : "No drift",
                    alert: drift !== 0,
                  },
                ]
              : []),
            { label: "Credits", value: formatTeamMoney(credits) },
            { label: "Paid", value: formatTeamMoney(plan?.paid ?? 0) },
            { label: "Balance", value: formatTeamMoney(due), alert: due > 0 },
            {
              label: "Roster deposit",
              value: `${player.depositPaid ? "Paid" : "Due"} · ${formatTeamMoney(plan?.dep ?? deposit)}`,
              alert: !player.depositPaid,
            },
            ...(player.depositCharge
              ? [
                  { label: "Deposit amount", value: formatTeamMoney(player.depositCharge.amount) },
                  { label: "Card fee", value: formatTeamMoney(player.depositCharge.fee) },
                  {
                    label: "Total charged",
                    value: formatTeamMoney(player.depositCharge.totalCharged),
                  },
                ]
              : []),
            { label: "Plan", value: player.planType || "—" },
            {
              label: "Paid in full by",
              value: deadline || "After schedule posts",
            },
          ]}
        />
      </DeskCard>
      {breakdown ? (
        <DeskCard
          eyebrow="What's in the fee"
          title="Four lines. Membership is included, not itemised."
          copy="The individual membership is in the season fee. We list what it covers — never a price."
        >
          <NumRows
            rows={breakdown.lines.map((line) => ({
              label: line.label,
              value: formatTeamMoney(line.amount),
            }))}
          />
          {includes.length ? (
            <ul className="mt-4 grid gap-1 text-sm text-teams-ink">
              {includes.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          ) : null}
        </DeskCard>
      ) : null}
      {amend ? (
        <DeskCard
          eyebrow="Amendment"
          title="The live price moved. Your signed fee did not."
          copy={
            amend.note ||
            "Accept the amendment to update the fee you agreed to. Until then the signed number is what we bill."
          }
        >
          <NumRows
            rows={[
              { label: "Status", value: amend.status || "Pending", alert: true },
              ...(typeof amend.delta === "number"
                ? [
                    {
                      label: "What changed",
                      value: `${amend.delta > 0 ? "+" : ""}${formatTeamMoney(amend.delta)}`,
                    },
                  ]
                : []),
              { label: "Agreed", value: formatTeamMoney(player.feeLock?.amount ?? fee) },
              {
                label: "New total",
                value: formatTeamMoney((player.feeLock?.amount ?? fee) + (Number(amend.delta) || 0)),
              },
            ]}
          />
          <div className="mt-4 grid gap-2">
            <Button
              type="button"
              data-teams-amend-accept="true"
              onClick={() => os.acceptAmendment(team.id, player.id)}
            >
              Accept new total
            </Button>
            <Button
              type="button"
              variant="outlineDark"
              onClick={() => os.questionAmendment(team.id, player.id)}
            >
              Ask a question
            </Button>
          </div>
        </DeskCard>
      ) : null}
      {plan?.rows?.length ? (
        <DeskCard
          eyebrow="Schedule"
          title={plan.locked ? "The plan you signed." : "When it drafts."}
          copy={
            plan.locked
              ? "Installments froze at signature. A family who agreed to four payments never sees three next month."
              : "This schedule locks when the agreement is signed."
          }
        >
          <NumRows
            rows={plan.rows.map((row) => ({
              label: `${row.label} · ${row.due}`,
              value: formatTeamMoney(row.amount),
              alert: row.status === "due" || row.status === "urgent",
            }))}
          />
        </DeskCard>
      ) : (
        <TeamsEmpty
          title="No payment plan yet."
          copy="The plan locks when the family accepts the invite."
        />
      )}
      <DeskCard eyebrow="Card on file" title="How we draft.">
        {player.cards?.length ? (
          <NumRows
            rows={player.cards.map((c) => ({
              label: `${c.brand} ···· ${c.last4}`,
              value: c.primary ? "Primary" : c.exp,
            }))}
          />
        ) : (
          <p className="text-sm text-teams-muted">No card on file.</p>
        )}
      </DeskCard>
    </div>
  );
}

function Uniform({ team, player }: { team: OsTeam; player: OsPlayer }) {
  const os = useTeams();
  const pkg = os.state.uniforms.find((u) => u.id === team.uniformPackageId);
  const need = sizeFieldsOf(pkg);
  const submitted = player.order?.submitted;
  const canEdit =
    os.canSeeAccount(player) ||
    os.role === "admin" ||
    os.role === "coach" ||
    os.identity.playerId === player.id ||
    (os.identity.familyId && player.familyId === os.identity.familyId);
  const [number, setNumber] = useState(String(player.order?.number ?? player.number ?? ""));
  const [sizes, setSizes] = useState<Record<string, string>>({ ...(player.order?.sizes || {}) });
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const result = os.submitSizes(team.id, player.id, number, sizes);
    if (!result.ok) {
      setError(result.reason === "number" ? "That jersey number is taken." : "Could not save.");
      return;
    }
    setError(null);
  };

  return (
    <DeskCard
      eyebrow="Uniform"
      title={submitted ? "Order is in." : "Sizes are still out."}
      copy={
        player.uniformWaived
          ? "Uniform is waived on this player."
          : pkg
            ? `${pkg.name}. Jersey number is conflict-checked on this roster.`
            : `Jersey #${player.order?.number ?? player.number}.`
      }
    >
      {pkg && !os.canSeeTeamMoney ? (
        <p className="mb-3 text-sm text-teams-muted">{pkg.blurb}</p>
      ) : null}
      {canEdit ? (
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-teams-muted">Jersey number</span>
            <input
              className="min-h-11 rounded-xl border border-line bg-paper-2 px-3"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              inputMode="numeric"
              data-teams-jersey="true"
            />
          </label>
          {need.map((field) => (
            <label key={field} className="grid gap-1 text-sm">
              <span className="text-teams-muted">{field}</span>
              <select
                className="min-h-11 rounded-xl border border-line bg-paper-2 px-3"
                value={sizes[field] || ""}
                onChange={(e) => setSizes((cur) => ({ ...cur, [field]: e.target.value }))}
              >
                <option value="">Select</option>
                {sizeOpts(field).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {error ? <p className="text-sm text-ok-maroon">{error}</p> : null}
          <Button type="button" data-teams-submit-sizes="true" onClick={save}>
            Submit sizes
          </Button>
        </div>
      ) : submitted ? (
        <NumRows
          rows={Object.entries(player.order?.sizes || {}).map(([k, v]) => ({
            label: k,
            value: String(v),
          }))}
        />
      ) : (
        <p className="text-sm text-teams-muted">Family has not submitted sizes.</p>
      )}
    </DeskCard>
  );
}

function Recruiting({ player, team }: { player: OsPlayer; team: OsTeam }) {
  const os = useTeams();
  const pub = player.publicProfile;
  const share = recruitingShareUrl(player);
  if (!pub?.enabled) {
    return (
      <TeamsEmpty
        title="Recruiting profile is off."
        copy="Turn it on when film and a bio are ready. High school only."
        action="Open profile"
        onAction={() => os.openPlayer(team.id, player.id, "profile")}
      />
    );
  }
  return (
    <div data-teams-print="profile">
    <DeskCard
      eyebrow="Recruiting profile"
      title="Public when you say so."
      copy={pub.bio || "No bio yet. Family contact never goes on the one-pager."}
    >
      <NumRows
        rows={[
          { label: "Enabled", value: "Yes" },
          { label: "Share link", value: share },
        ]}
      />
      <div className="mt-4 grid gap-2">
        <Button type="button" variant="outlineDark" onClick={() => navigator.clipboard?.writeText(share)}>
          Copy share link
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-teams-one-pager="true"
          onClick={() => downloadText(`${player.name}-one-pager.txt`, recruitingOnePager(player, team))}
        >
          Download one-pager
        </Button>
      </div>
    </DeskCard>
    </div>
  );
}

function Body({
  team,
  player,
  tab,
}: {
  team: OsTeam;
  player: OsPlayer;
  tab: string;
}) {
  if (tab === "stats") return <Hitting player={player} />;
  if (tab === "measurables") return <Measurables team={team} player={player} />;
  if (tab === "documents") return <Documents player={player} />;
  if (tab === "emergency") return <Emergency player={player} />;
  if (tab === "account") return <Account team={team} player={player} />;
  if (tab === "uniform") return <Uniform team={team} player={player} />;
  if (tab === "recruiting") return <Recruiting player={player} team={team} />;
  return <Profile team={team} player={player} />;
}

export function PlayerRecord({
  teamId,
  playerId,
  tab,
}: {
  teamId: string;
  playerId: string;
  tab: string;
}) {
  const os = useTeams();
  const team = os.teamById(teamId);
  const player = os.playerById(teamId, playerId);
  const tabs = os.playerTabs.filter((t) => t.id !== "account" || os.canSeeAccount(player));
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id ?? "profile";
  if (!team || !player) {
    return (
      <TeamsEmpty
        title="That player is not on this desk."
        copy="He may have withdrawn, or he belongs to another family."
        action="Back to team"
        onAction={() => (team ? os.openTeam(team.id, "roster") : os.closeRecord())}
      />
    );
  }
  const section = `Teams · ${player.name} · ${activeTab}`;
  return (
    <div
      data-teams-player={player.id}
      data-teams-player-tab={activeTab}
      data-teams-record={team.id}
      data-teams-active-tab={activeTab}
      className="min-w-0 max-w-full"
    >
      <div className="mb-3">
        <BackLink
          label={team.name}
          onClick={() => os.openTeam(team.id, "roster")}
        />
      </div>
      <RecordTabs
        label={`${player.name} record`}
        tabs={tabs}
        active={activeTab}
        onChange={os.setRecordTab}
      />
      <div className="teams-stack mt-5">
        <TeamsErrorBoundary section={section}>
          <Body team={team} player={player} tab={activeTab} />
        </TeamsErrorBoundary>
      </div>
    </div>
  );
}
