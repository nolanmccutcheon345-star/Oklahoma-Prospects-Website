import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeskCard, NumRows } from "@/components/teams/desk-kit";
import { TeamsEmpty } from "@/components/teams/empty-state";
import { useTeams } from "@/lib/teams/context";
import { formatTeamMoney } from "@/lib/teams/os";
import {
  PAY_CATEGORIES,
  complianceOf,
  divertCap,
  electionOf,
  isReportable,
  payrollRows,
  payrollSchedule,
  type PayCategory,
} from "@/lib/teams/staff";
import { cn } from "@/lib/utils";

function pct(n: number) {
  return `${Math.round(n)}%`;
}

export function StaffPayBoard() {
  const os = useTeams();
  const staff = os.visibleTeams.flatMap((t) =>
    t.staff.map((m) => ({ team: t, member: m })),
  );
  if (staff.length === 0) {
    return (
      <TeamsEmpty
        title="No staff on file."
        copy="Add a head coach before the season posts."
        action="Open teams"
        onAction={() => os.closeRecord()}
      />
    );
  }
  return (
    <div className="teams-stack" data-teams-office="staff">
      {staff.map(({ team, member }) => {
        const kid = member.childId
          ? team.roster.find((p) => p.id === member.childId && !p.withdrawn)
          : null;
        const elect = electionOf(os.state, team, member);
        return (
          <DeskCard
            key={`${team.id}-${member.id}`}
            eyebrow={team.name}
            title={member.name}
            copy={`${member.role}. 1099 contractor — never employee. Pay lives on this record, not a team number.`}
          >
            <NumRows
              rows={[
                { label: "Gross", value: formatTeamMoney(elect.gross) },
                { label: "Applied to fees", value: formatTeamMoney(elect.applied) },
                { label: "Cash", value: formatTeamMoney(elect.cash) },
                {
                  label: "contractor record",
                  value: member.w9 ? "On file" : "Missing",
                  alert: !member.w9,
                },
              ]}
            />
            {kid ? (
              <PayElection
                teamId={team.id}
                staffId={member.id}
                childName={kid.name}
                cap={divertCap(os.state, team, member)}
                applied={elect.applied}
                cash={elect.cash}
                remaining={elect.remaining}
                gross={elect.gross}
              />
            ) : (
              <p className="mt-3 text-sm text-teams-muted">
                No child on this roster. Season pay is cash.
              </p>
            )}
          </DeskCard>
        );
      })}
    </div>
  );
}

function PayElection({
  teamId,
  staffId,
  childName,
  cap,
  applied,
  cash,
  remaining,
  gross,
}: {
  teamId: string;
  staffId: string;
  childName: string;
  cap: number;
  applied: number;
  cash: number;
  remaining: number;
  gross: number;
}) {
  const os = useTeams();
  const [value, setValue] = useState(String(applied));
  useEffect(() => {
    setValue(String(applied));
  }, [applied]);
  const n = Math.max(0, Math.min(cap, Math.round(Number(value) || 0)));
  const liveCash = Math.max(0, gross - n);
  const liveRemain = Math.max(0, remaining + applied - n);

  function commit(next: number) {
    const capped = Math.max(0, Math.min(cap, Math.round(next)));
    setValue(String(capped));
    os.electPay(teamId, staffId, capped);
  }

  return (
    <div className="mt-4 grid gap-3" data-teams-elect={staffId}>
      <p className="text-sm">
        Apply to {childName}. Credit never exceeds what they owe. Leftover stays cash.
        Nothing is waived — this is a credit with a reason attached.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outlineDark" size="sm" onClick={() => commit(0)}>
          All cash
        </Button>
        <Button type="button" variant="maroon" size="sm" onClick={() => commit(cap)}>
          All to fees
        </Button>
      </div>
      <label className="grid gap-1">
        <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">
          Split — applied to fees
        </span>
        <input
          type="range"
          min={0}
          max={cap}
          step={25}
          value={n}
          data-teams-elect-range={staffId}
          className="min-h-11 w-full accent-maroon"
          onChange={(e) => {
            const next = Number(e.target.value) || 0;
            setValue(String(next));
            os.electPay(teamId, staffId, next);
          }}
        />
      </label>
      <NumRows
        rows={[
          { label: "Applied now", value: formatTeamMoney(n) },
          { label: "Cash left", value: formatTeamMoney(liveCash) },
          { label: `${childName} remaining`, value: formatTeamMoney(liveRemain) },
        ]}
      />
    </div>
  );
}

export function PayrollBoard() {
  const os = useTeams();
  const rows = payrollRows(os.state);
  const pay = os.state.settings.payroll;
  const team = os.visibleTeams[0];
  const schedule = team ? payrollSchedule(os.state, team) : [];
  const [blocked, setBlocked] = useState<string | null>(null);

  return (
    <div className="teams-stack" data-teams-office="contractor payouts">
      <DeskCard
        eyebrow="Contractor payouts"
        title="Gross is what gets reported."
        copy="Three columns, always. Applied to a child's fee does not shrink the 1099."
      >
        {rows.length === 0 ? (
          <p className="text-sm text-teams-muted">No staff on a roster.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li
                key={`${row.team.id}-${row.member.id}`}
                className="py-3"
                data-teams-payroll={row.member.id}
              >
                <p className="text-sm font-semibold">
                  {row.member.name} · {row.member.role}
                </p>
                <p className="text-xs text-teams-muted">
                  {row.team.name}
                  {row.childName ? ` · child ${row.childName}` : ""}
                </p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div data-teams-gross={row.member.id}>
                    <dt className="text-xs tracking-wide text-teams-muted uppercase">Gross</dt>
                    <dd className="teams-num text-sm font-semibold">{formatTeamMoney(row.gross)}</dd>
                  </div>
                  <div data-teams-applied={row.member.id}>
                    <dt className="text-xs tracking-wide text-teams-muted uppercase">Applied</dt>
                    <dd className="teams-num text-sm font-semibold">{formatTeamMoney(row.applied)}</dd>
                  </div>
                  <div data-teams-cash={row.member.id}>
                    <dt className="text-xs tracking-wide text-teams-muted uppercase">Cash</dt>
                    <dd className="teams-num text-sm font-semibold">{formatTeamMoney(row.cash)}</dd>
                  </div>
                </dl>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {row.needs1099 ? (
                    <span className="text-xs font-semibold tracking-wide text-ok-maroon uppercase" data-teams-1099={row.member.id}>
                      1099-NEC
                    </span>
                  ) : null}
                  {!row.w9 ? (
                    <span className="text-xs font-semibold tracking-wide text-ok-maroon uppercase" data-teams-w9-block={row.member.id}>
                      contractor record required
                    </span>
                  ) : (
                    <span className="text-xs text-teams-muted">contractor record on file</span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={row.canPay ? "outlineDark" : "ghost"}
                    disabled={!row.canPay}
                    onClick={() => {
                      const result = os.recordPayout(row.team.id, row.member.id, row.cash);
                      setBlocked(result.ok ? null : "contractor record has to be on file before the first dollar leaves.");
                    }}
                  >
                    Record cash
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {blocked ? (
          <p className="mt-3 text-sm text-ok-maroon" data-teams-w9-block="true">
            {blocked}
          </p>
        ) : null}
      </DeskCard>

      {schedule.length ? (
        <DeskCard
          eyebrow={team?.name || "Season"}
          title="Schedule from season dates."
          copy="Monthly cash is what actually leaves. Gross still posts in full every month."
        >
          <ul className="divide-y divide-line">
            {schedule.map((m) => (
              <li key={m.month} className="teams-row flex items-center justify-between gap-3">
                <span className="text-sm">{m.label}</span>
                <span className="teams-num text-xs font-semibold">
                  {formatTeamMoney(m.gross)} · {formatTeamMoney(m.applied)} applied · {formatTeamMoney(m.cash)} cash
                </span>
              </li>
            ))}
          </ul>
        </DeskCard>
      ) : null}

      <DeskCard
        eyebrow="1099 contractors"
        title="Nothing is withheld."
        copy={POLICY_COPY(pay.seTaxGuidancePct)}
      >
        <NumRows
          rows={[
            { label: "Classification", value: "1099 — never employee" },
            { label: "1099-NEC at", value: formatTeamMoney(pay.form1099Threshold) },
            { label: "Suggested set-aside", value: pct(pay.seTaxGuidancePct) },
            { label: "Accountable plan", value: pay.accountablePlan ? "On" : "Off" },
          ]}
        />
        <p className="mt-4 text-sm text-teams-muted">
          Confirm with your own CPA. This desk is a working picture, not tax advice.
        </p>
      </DeskCard>
    </div>
  );
}

function POLICY_COPY(pctSet: number) {
  return `contractor record before the first dollar. Gross is always reported, even when it is applied to a child's fee. Nothing is withheld, so the contractor sets aside about ${pctSet}% for self-employment tax. Contractor status is a facts test — it depends on written agreements scoped by deliverable, not a job title.`;
}

export function ReimburseBoard() {
  const os = useTeams();
  const rows = os.state.reimbursements || [];
  const staff = os.visibleTeams.flatMap((t) =>
    t.staff.map((m) => ({
      team: t,
      member: m,
      email: m.email || t.coachEmail,
    })),
  );
  const [amount, setAmount] = useState("85");
  const [note, setNote] = useState("Hotel");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState<PayCategory>("hotel");
  const [receipt, setReceipt] = useState(false);
  const [who, setWho] = useState(staff[0]?.email || "");
  const missing = rows.filter((r) => isReportable(r));

  return (
    <div className="teams-stack" data-teams-office="reimburse">
      <DeskCard
        eyebrow="Accountable plan"
        title="Receipt and a business purpose, or it is pay."
        copy="Travel, hotel, mileage, equipment. Substantiated stays off the 1099. Missing a receipt is reportable pay."
      >
        {missing.length ? (
          <p className="mb-3 rounded-xl bg-cream px-4 py-3 text-sm text-ok-maroon" data-teams-receipt-missing="true">
            {missing.length} reimbursement{missing.length > 1 ? "s" : ""} missing a receipt or purpose. They will sit on the 1099.
          </p>
        ) : null}
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const loud = isReportable(r);
            return (
              <li key={r.id} className="py-3">
                <p className="text-sm font-semibold">{r.note}</p>
                <p className={cn("text-xs", loud ? "font-semibold text-ok-maroon" : "text-teams-muted")}>
                  {formatTeamMoney(r.amount)} · {r.category || "other"} · {r.date}
                  {loud ? " · REPORTABLE — no receipt" : " · off the 1099"}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Staff</span>
            <select
              className="teams-control min-h-11 rounded-lg bg-paper px-3 text-sm shadow-border"
              value={who}
              onChange={(e) => setWho(e.target.value)}
            >
              {staff.map((s) => (
                <option key={`${s.team.id}-${s.member.id}`} value={s.email}>
                  {s.member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Category</span>
            <select
              className="teams-control min-h-11 rounded-lg bg-paper px-3 text-sm shadow-border"
              value={category}
              onChange={(e) => setCategory(e.target.value as PayCategory)}
            >
              {PAY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Amount</span>
            <input
              className="teams-control min-h-11 rounded-lg bg-paper px-3 text-sm shadow-border"
              value={amount}
              inputMode="numeric"
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">What for</span>
            <input
              className="teams-control min-h-11 rounded-lg bg-paper px-3 text-sm shadow-border"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">Business purpose</span>
            <input
              className="teams-control min-h-11 rounded-lg bg-paper px-3 text-sm shadow-border"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={receipt}
              onChange={(e) => setReceipt(e.target.checked)}
              className="size-5"
            />
            Receipt on file
          </label>
          <Button
            type="button"
            variant="maroon"
            onClick={() => {
              const row = staff.find((s) => s.email === who) || staff[0];
              if (!row) return;
              os.addReimbursement({
                teamId: row.team.id,
                staffEmail: row.email,
                amount: Number(amount) || 0,
                date: "2026-09-15",
                note,
                category,
                purpose,
                receipt,
              });
            }}
          >
            Add reimbursement
          </Button>
        </div>
      </DeskCard>
    </div>
  );
}

export function ComplianceBoard() {
  const os = useTeams();
  const staff = os.visibleTeams.flatMap((t) =>
    t.staff.map((m) => ({ team: t, member: m, c: complianceOf(m) })),
  );
  const flagged = staff.filter((s) => !s.c.ok || s.c.dueSoon);
  return (
    <div className="teams-stack" data-teams-office="compliance">
      <DeskCard
        eyebrow="Compliance"
        title="Everyone with roster access."
        copy="Background check and SafeSport, with an expiry. A red date is coming due or already gone."
      >
        {flagged.length ? (
          <p className="mb-3 text-sm text-ok-maroon">
            {flagged.length} coach{flagged.length > 1 ? "es" : ""} need attention.
          </p>
        ) : (
          <p className="mb-3 text-sm text-teams-muted">All clear this week.</p>
        )}
        <ul className="divide-y divide-line">
          {staff.map(({ team, member, c }) => (
            <li key={`${team.id}-${member.id}`} className="py-3">
              <p className="text-sm font-semibold">
                {member.name} · {member.role}
              </p>
              <p className={cn("text-xs", !c.ok || c.dueSoon ? "font-semibold text-ok-maroon" : "text-teams-muted")}>
                {team.name} · background {c.background ? "on file" : "missing"} · SafeSport{" "}
                {c.safeSport ? "on file" : "missing"} · expires {c.expires || "—"}
                {c.expired ? " · expired" : c.dueSoon ? " · due inside 30 days" : ""}
                {!member.w9 ? " · contractor record missing" : ""}
              </p>
            </li>
          ))}
        </ul>
      </DeskCard>
    </div>
  );
}

export function StaffDesk({ pane }: { pane: "pay" | "contractor payouts" | "reimburse" | "compliance" }) {
  if (pane === "contractor payouts") return <PayrollBoard />;
  if (pane === "reimburse") return <ReimburseBoard />;
  if (pane === "compliance") return <ComplianceBoard />;
  return (
    <div className="teams-stack">
      <StaffPayBoard />
      <ReimburseBoard />
      <ComplianceBoard />
    </div>
  );
}
