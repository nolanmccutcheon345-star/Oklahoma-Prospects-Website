import { useState } from "react";
import type { getFinance } from "@/lib/finance/api";
import { money } from "@/lib/teams/fee-model";
import { Button } from "../ui/button";
type View = Awaited<ReturnType<typeof getFinance>>["teamSpending"][number];
export function TeamSpending({
  teams,
  busy,
  save,
}: {
  teams: View[];
  busy: boolean;
  save: (action: unknown, reason: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const team = teams.find((t) => t.teamId === selected) || teams[0];
  return (
    <section className="grid gap-4 rounded-xl border p-4" aria-label="Team spending controls">
      <h3 className="text-2xl">Team spending</h3>
      <p>
        Only the team's own settled, reconciled funding may support its expenses. This is an owner
        certification supported by bank evidence, not an automatic bank connection. New approvals
        reserve cash; no payment is sent here.
      </p>
      <label className="grid gap-1">
        Team
        <select
          className="office-control"
          value={team?.teamId || ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {teams.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {team ? (
        <TeamReview
          key={
            team.teamId + ":" + (team.review?.asOf || "") + ":" + (team.review?.evidenceKey || "")
          }
          team={team}
          busy={busy}
          save={save}
        />
      ) : (
        <p>No financial team records.</p>
      )}
    </section>
  );
}
function TeamReview({
  team,
  busy,
  save,
}: {
  team: View;
  busy: boolean;
  save: (action: unknown, reason: string) => Promise<void>;
}) {
  const [cash, setCash] = useState("");
  const [evidence, setEvidence] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const dollars = (value: string) => Math.round(Number(value) * 100);
  return (
    <div className="grid gap-4">
      <p>
        {team.committed} of {team.roster} roster players have recorded accepted agreements and
        deposit coverage. Minimum roster: 9. Owners must verify the underlying receipts.{" "}
        {team.current
          ? `Current reviewed approval cash: ${money(team.remaining)}.`
          : "A current funding review is required before expense approval."}
      </p>
      <p>
        Published external-cost and contingency ceiling: {money(team.ceiling)}. Original budget
        lines remain fixed. Recorded contingency allocations preserve the team total. Internal
        program allocations stay separate from external spending.
      </p>
      <TeamBudgetDetails team={team} busy={busy} save={save} />
      <label className="grid gap-1">
        Available settled team cash after existing commitments and protections ($)
        <input
          className="office-control"
          type="number"
          min="0"
          step="0.01"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
        />
      </label>
      <label className="grid gap-1">
        Bank/settlement references and allocation evidence
        <textarea
          className="office-control"
          maxLength={1500}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="Masked statement references; this team's fee receipts; deductions for existing commitments, taxes, restricted and unformed-team funds. No account numbers."
        />
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I verified the final roster has at least nine players, every roster player accepted and paid
        their deposit, and this amount is this team's settled funding after all existing commitments
        and required protections. No other team's funds, pledges or unsettled payments are included.
      </label>
      <Button
        disabled={
          busy ||
          !confirmed ||
          cash === "" ||
          evidence.trim().length < 20 ||
          !team.formationReady ||
          !team.published ||
          team.closed
        }
        onClick={async () => {
          await save(
            {
              action: "teamFundingReview",
              value: {
                teamId: team.teamId,
                availableCents: dollars(cash),
                limits: team.ledger?.limits,
                evidence,
                formationVerified: true,
                protectedFundsVerified: true,
              },
            },
            "Owner certified team-only settled funding and preseason spending limits",
          );
          setConfirmed(false);
        }}
      >
        Save today's funding review
      </Button>
      <p className="text-sm">
        Review again whenever bank evidence, roster, payments or accepted terms change, and before
        external payment. Reconcile monthly; retain original records and post corrections
        separately. Payment authorization and required formation evidence are independent of
        enrollment or medical clearance.
      </p>
    </div>
  );
}

function TeamBudgetDetails({
  team,
  busy,
  save,
}: {
  team: View;
  busy: boolean;
  save: (action: unknown, reason: string) => Promise<void>;
}) {
  const [line, setLine] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const ledger = team.ledger;
  if (!ledger) return <p>Publish this team's fee budget to establish its spending ledger.</p>;
  function exportCsv() {
    const rows = [
      ["Team", team.name],
      ["Team ID", team.teamId],
      ["Published at", ledger!.publishedAt],
      ["Publication revision", ledger!.publicationRevision],
      ["Exported at", new Date().toISOString()],
      ["Currency", "USD"],
      [],
      [
        "Budget line",
        "Original budget",
        "Contingency adjustment",
        "Current budget",
        "Allocated payables",
        "Approved",
        "Bank reconciled paid",
        "Sent awaiting reconciliation",
        "Historical unverified paid",
        "Remaining unallocated",
      ],
      ...ledger!.rows.map((l) => [
        l.name,
        ...[
          l.budget,
          l.adjustment,
          l.currentBudget,
          l.allocated,
          l.approved,
          l.paid,
          l.sent,
          l.historicalPaid,
          l.remaining,
        ].map((n) => n / 100),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              (typeof v === "string" ? v.replace(/^[=+\-@\t\r]/, "'$&") : String(v)).replaceAll(
                '"',
                '""',
              ) +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "team-budget-" + team.teamId + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="grid gap-4">
      <div>
        <h4 className="text-xl">Published budget ledger</h4>
        <p className="text-sm">
          Fee publication version {ledger.publicationRevision} · {ledger.publishedAt.slice(0, 10)}.
          Amounts in USD. Draft edits and later fee publications do not rewrite this original
          budget.
        </p>
      </div>
      <Button variant="outline" onClick={exportCsv}>
        Export this team's budget ledger
      </Button>
      <div className="overflow-x-auto" tabIndex={0} aria-label="Budget ledger table">
        <table className="w-full min-w-[1100px] text-sm">
          <caption className="sr-only">
            Each published team budget line and spending to date
          </caption>
          <thead>
            <tr>
              {[
                "Budget line",
                "Original",
                "Contingency adjustment",
                "Current budget",
                "Allocated payables",
                "Approved",
                "Bank reconciled paid",
                "Sent, not reconciled",
                "Historical unverified paid",
                "Remaining unallocated",
              ].map((h) => (
                <th key={h} className="p-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ledger.rows.map((l) => (
              <tr key={l.id} className="border-t">
                <th className="p-2 text-left">{l.name}</th>
                {[
                  l.budget,
                  l.adjustment,
                  l.currentBudget,
                  l.allocated,
                  l.approved,
                  l.paid,
                  l.sent,
                  l.historicalPaid,
                  l.remaining,
                ].map((n, i) => (
                  <td
                    key={i}
                    className={`p-2 whitespace-nowrap ${i === 8 && n < 0 ? "font-bold text-red-700" : ""}`}
                  >
                    {money(n)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        Allocated payables include requests and full compensation/invoice amounts. Approved is the
        authorized amount to date. Sent payments are not counted as bank-reconciled until matched.
        Negative remaining amounts require owner resolution before approval.
      </p>
      <p className="text-sm">
        Internal program allocation: {money(ledger.internalProgram)}. Organization allocation:{" "}
        {money(ledger.organizationAllocation)}. {ledger.internalNotice} Published processing
        allowance: {money(ledger.processingAllowance)}; fee rounding: {money(ledger.feeRounding)}.
        Actual provider fees remain in Square reconciliation; unknown fees are not assumed to be
        zero.
      </p>
      {ledger.unallocated.length > 0 && (
        <section className="rounded-lg border border-amber-500 p-3">
          <h4 className="font-semibold">Expenses needing a budget-line assignment</h4>
          {ledger.unallocated.map((p) => (
            <BudgetAssignment key={p.id} payable={p} rows={ledger.rows} busy={busy} save={save} />
          ))}
        </section>
      )}
      {ledger.historicalExpenses.length > 0 && (
        <p className="text-sm">
          {ledger.historicalExpenses.length} historical paid expense entries have no Finance payable
          yet. Refresh accruals in Payout Center to bring them in as unverified history, then assign
          and reconcile them. They are not silently included as verified spending.
        </p>
      )}
      {ledger.rows
        .filter((l) => l.payables.length)
        .map((l) => (
          <details key={l.id} className="rounded-lg border p-3">
            <summary>
              {l.name} · {l.payables.length} payable records
            </summary>
            {l.payables.map((p) => (
              <div key={p.id} className="mt-3 border-t pt-3">
                <p className="font-semibold">{p.reason}</p>
                <p className="text-sm">
                  {p.payeeName} · Due {p.due} · {p.state} · Invoice{" "}
                  {p.invoiceReference || "not recorded"}
                </p>
                <p className="text-sm">
                  Allocated {money(p.amount)} · Approved {money(p.approved)} · Paid {money(p.paid)}
                  {p.legacyPaid ? " (unverified historical entry)" : ""}
                </p>
                {p.payments.map((payment) => (
                  <p key={payment.id} className="text-sm">
                    {payment.date} · {money(payment.amount)} · {payment.state} · {payment.reference}
                  </p>
                ))}
                <BudgetAssignment
                  payable={{
                    id: p.id,
                    name: p.reason,
                    amount: p.amount,
                    paid: p.paid,
                    state: p.state,
                  }}
                  rows={ledger.rows}
                  busy={busy}
                  save={save}
                />
              </div>
            ))}
          </details>
        ))}
      <details className="rounded-lg border p-3">
        <summary>Allocate contingency to a budget line</summary>
        <p className="my-2 text-sm">
          This records a budget adjustment, not a payment. Enter a positive allocation from
          contingency, or a negative amount to return unused previously allocated contingency.
          Original amounts and the team total are preserved. A fresh funding review is required
          afterward.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            Expense line
            <select
              className="office-control"
              value={line}
              onChange={(e) => setLine(e.target.value)}
            >
              <option value="">Choose…</option>
              {ledger.rows
                .filter((l) => l.id !== "reserve:contingency")
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Adjustment ($)
            <input
              className="office-control"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="sm:col-span-2">
            Reason / supporting reference
            <input
              className="office-control"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button
            disabled={
              busy ||
              team.closed ||
              !line ||
              Number(amount) === 0 ||
              !amount ||
              reason.trim().length < 5
            }
            onClick={() =>
              save(
                {
                  action: "teamBudgetTransfer",
                  id: crypto.randomUUID(),
                  teamId: team.teamId,
                  lineId: line,
                  cents: Math.round(Number(amount) * 100),
                },
                reason,
              )
            }
          >
            Record contingency allocation
          </Button>
        </div>
      </details>
      {ledger.transfers.length > 0 && (
        <details className="rounded-lg border p-3">
          <summary>Contingency allocation history</summary>
          {ledger.transfers.map((t) => (
            <p key={t.id} className="mt-2 text-sm">
              {String(t.at).slice(0, 10)} · {ledger.rows.find((l) => l.id === t.lineId)?.name} ·{" "}
              {money(t.cents)} · {t.reason}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
function BudgetAssignment({
  payable,
  rows,
  busy,
  save,
}: {
  payable: { id: string; name: string; amount: number; paid: number; state: string };
  rows: NonNullable<View["ledger"]>["rows"];
  busy: boolean;
  save: (action: unknown, reason: string) => Promise<void>;
}) {
  const [line, setLine] = useState(""),
    [reason, setReason] = useState("");
  return (
    <details className="my-2">
      <summary className="text-sm">
        Assign / reclassify {payable.name} · {money(payable.amount)}
      </summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          Published budget line
          <select className="office-control" value={line} onChange={(e) => setLine(e.target.value)}>
            <option value="">Choose…</option>
            {rows.map((l) => (
              <option value={l.id} key={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Reason
          <input
            className="office-control"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </label>
        <Button
          variant="outline"
          disabled={busy || !line || reason.trim().length < 5}
          onClick={() =>
            save({ action: "budgetAssignment", payableId: payable.id, lineId: line }, reason)
          }
        >
          Record assignment
        </Button>
      </div>
    </details>
  );
}
