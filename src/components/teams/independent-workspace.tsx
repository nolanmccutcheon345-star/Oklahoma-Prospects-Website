import { FeeExplanationEditor, FeeExplanationView, FeeAgreementDownload } from "./fee-explanation";
import { independentPublishedPolicy } from "@/lib/teams/independent-model";
import { useEffect, useState, type ReactNode } from "react";
import {
  getIndependentWorkspace,
  changeIndependentTeam,
  downloadIndependentDocument,
  exportIndependentStatement,
  findIndependentManager,
} from "@/lib/teams/independent-api";
import { changeFeePlan } from "@/lib/teams/fee-api";
import {
  independentSchedule,
  independentDraft,
  type IndependentTerms,
} from "@/lib/teams/independent-model";
import {
  independentCapabilities,
  categoryNames,
  entryCapability,
  type IndependentCapability,
  type IndependentEntry,
  type IndependentSettings,
} from "@/lib/teams/independent-ledger";
import { money, organizationDay, type FeeBudget } from "@/lib/teams/fee-model";
import {
  emptyIndependentAdminBudget,
  independentBudgetProjection,
  withIndependentPlanning,
  type IndependentDepositPlanning,
  type IndependentAdminBudget,
} from "@/lib/teams/independent-admin-budget";
import { Button } from "../ui/button";
import { TeamPayment } from "./team-payment";
import { TeamCollectionSetup } from "./team-collection-setup";
type Workspace = Awaited<ReturnType<typeof getIndependentWorkspace>>;
type Space = Workspace["spaces"][number];
type Run = (work: () => Promise<unknown>, message?: string) => Promise<void>;
const day = () => organizationDay(new Date().toISOString());
function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  step,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <input
        className="office-control min-w-0 w-full"
        type={type}
        step={step ?? (type === "number" ? "0.01" : undefined)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <select
        aria-label={label}
        className="office-control min-w-0 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
function Text({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <textarea
        maxLength={maxLength}
        className="office-control min-h-24 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function download(filename: string, body: BlobPart, type = "application/json") {
  const url = URL.createObjectURL(new Blob([body], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Schedule({ budget }: { budget: FeeBudget }) {
  try {
    const rows = independentSchedule(budget);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="text-left font-semibold">
            Per-player Prospects schedule · America/Chicago
          </caption>
          <thead>
            <tr>
              <th className="p-2">Charge</th>
              <th className="p-2">Due</th>
              <th className="p-2">Base</th>
              <th className="p-2">Processing</th>
              <th className="p-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-2">{r.label}</td>
                <td className="p-2">{r.due}</td>
                <td className="p-2">{money(r.base)}</td>
                <td className="p-2">{money(r.processing)}</td>
                <td className="p-2">{money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 font-semibold">
          Total per player: {money(rows.reduce((s, r) => s + r.amount, 0))}
        </p>
      </div>
    );
  } catch (e) {
    return (
      <p role="status">
        {e instanceof Error ? e.message : "Complete the dates to preview installments."}
      </p>
    );
  }
}
function previewPolicy(budget: FeeBudget) {
  try {
    return independentPublishedPolicy(budget);
  } catch (e) {
    return e instanceof Error ? e.message : "Complete the schedule to preview terms.";
  }
}
function TermsFields({
  budget: b,
  setBudget,
  adminBudget,
  setAdminBudget,
}: {
  budget: FeeBudget;
  setBudget: (b: FeeBudget) => void;
  adminBudget: IndependentAdminBudget;
  setAdminBudget: (b: IndependentAdminBudget) => void;
}) {
  const t = b.independent!;
  const update = (patch: Partial<IndependentTerms>) =>
    setBudget({ ...b, independent: { ...t, ...patch } });
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-3">
          <Field
            label="Initial deposit per player ($)"
            type="number"
            value={t.uniformDeposit / 100}
            onChange={(v) => update({ uniformDeposit: Math.round(Number(v) * 100) })}
          />
          <Text
            label="Initial deposit includes (admin note)"
            value={adminBudget.depositNote}
            maxLength={2000}
            onChange={(v) => setAdminBudget({ ...adminBudget, depositNote: v })}
          />
          <p className="text-sm text-muted">
            Private admin budgeting. Never visible to parents. For example: uniforms; uniforms and
            coaching; or uniforms, coaching and coach travel.
          </p>
        </div>
        <Field
          label="Monthly Prospects dues per player ($)"
          type="number"
          value={t.monthlyDues / 100}
          onChange={(v) => update({ monthlyDues: Math.round(Number(v) * 100) })}
        />
        <Field
          label="Initial deposit due"
          type="date"
          value={t.uniformDue}
          onChange={(v) => update({ uniformDue: v })}
        />
        <Field
          label="First monthly due date"
          type="date"
          value={t.firstDue}
          onChange={(v) => update({ firstDue: v })}
        />
        <Field
          label="Monthly billing day (1–31)"
          type="number"
          value={t.billingDay}
          onChange={(v) => update({ billingDay: Number(v) })}
        />
        <Field
          label="Final billing date"
          type="date"
          value={t.lastDue}
          onChange={(v) => update({ lastDue: v })}
        />
        <Field
          label="Season end date"
          type="date"
          value={t.seasonEnd}
          onChange={(v) => update({ seasonEnd: v })}
        />
        <Field
          label="Disclosed processing rate (%)"
          type="number"
          value={b.processingBps / 100}
          onChange={(v) => setBudget({ ...b, processingBps: Math.round(Number(v) * 100) })}
        />
        <Field
          label="Disclosed fixed processing allowance per installment ($)"
          type="number"
          value={b.processingFixed / 100}
          onChange={(v) => setBudget({ ...b, processingFixed: Math.round(Number(v) * 100) })}
        />
      </div>
      <p className="text-sm">
        Short months use the last valid day. These amounts apply equally to each player. Team
        operating costs are collected separately.
      </p>
      <FeeExplanationEditor
        value={b.parentExplanation}
        onChange={(parentExplanation) => setBudget({ ...b, parentExplanation })}
      />
      <Text
        label="Processing-fee explanation (state explicitly if there are no fees)"
        value={t.processingExplanation}
        onChange={(v) => update({ processingExplanation: v })}
      />
      <Text
        label="Prospects enrollment, withdrawal and refund terms"
        value={b.policy}
        onChange={(v) => setBudget({ ...b, policy: v })}
      />
      <Schedule budget={b} />
      <details>
        <summary className="min-h-11 cursor-pointer font-semibold">
          Preview complete parent terms
        </summary>
        <p className="whitespace-pre-wrap text-sm">{previewPolicy(b)}</p>
      </details>
    </>
  );
}
function AdminCosts({
  value,
  onChange,
  onSave,
  busy,
  saveLabel = "Save draft fees and admin budget",
}: {
  value: IndependentAdminBudget;
  onChange: (value: IndependentAdminBudget) => void;
  onSave?: () => void;
  busy: boolean;
  saveLabel?: string;
}) {
  const p = withIndependentPlanning(value).planning;
  const update = (patch: Partial<IndependentDepositPlanning>) =>
    onChange({ ...value, planning: { ...p, ...patch } });
  const updateExpense = (
    id: string,
    patch: Partial<IndependentDepositPlanning["expenses"][number]>,
  ) => update({ expenses: p.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  return (
    <section
      className="grid gap-3 rounded-xl border bg-paper-2 p-4"
      aria-label="Admin-only Prospects budget"
    >
      <h4 className="font-bold">Private admin budgeting</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Players used to price the deposit"
          type="number"
          step="1"
          value={p.basisPlayers || ""}
          onChange={(v) => update({ basisPlayers: Number(v) })}
        />
        <Field
          label="Expected players on the team"
          type="number"
          step="1"
          value={p.expectedPlayers}
          onChange={(v) => update({ expectedPlayers: Number(v) })}
        />
        <Field
          label="Uniform cost per player ($)"
          type="number"
          value={p.uniformPerPlayer === null ? "" : p.uniformPerPlayer / 100}
          onChange={(v) =>
            update({ uniformPerPlayer: v.trim() === "" ? null : Math.round(Number(v) * 100) })
          }
        />
        <Field
          label="Organization contribution per player in deposit ($)"
          type="number"
          value={p.organizationPerPlayer / 100}
          onChange={(v) => update({ organizationPerPlayer: Math.round(Number(v) * 100) })}
        />
      </div>
      <p className="text-sm">
        Uniform cost is always per player. Team expenses below are fixed season totals divided by
        the pricing player count. Changing the expected roster only changes the forecast; every
        player keeps the same published deposit.
      </p>
      {value.uniforms !== null && p.uniformPerPlayer === null && (
        <p className="text-sm">
          The previous uniform entry, {money(value.uniforms)}, was stored as a team total. Enter the
          uniform cost per player above to use the new calculator.
        </p>
      )}
      <h5 className="font-semibold">Expenses included in the initial deposit</h5>
      <p className="text-sm">
        Select the expenses Prospects will cover from this deposit. Unchecked expenses are excluded
        from this organization budget. Enter the total once, even if more players join. Enter 0 when
        there is no cost; leave unknown costs blank.
      </p>
      <div className="grid gap-3">
        {p.expenses.map((e) => (
          <fieldset key={e.id} className="grid min-w-0 gap-2 rounded-lg border border-line p-3">
            <legend className="px-1 font-semibold">{e.name}</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={e.included}
                onChange={(event) => updateExpense(e.id, { included: event.target.checked })}
              />
              Include {e.name} in initial deposit
            </label>
            {!["coaching", "coach-travel", "tournaments"].includes(e.id) && (
              <Field
                label="Expense name"
                value={e.name}
                onChange={(name) => updateExpense(e.id, { name })}
              />
            )}
            <Field
              label={`Total ${e.name} — season ($)`}
              type="number"
              value={e.total === null ? "" : e.total / 100}
              onChange={(v) =>
                updateExpense(e.id, { total: v.trim() === "" ? null : Math.round(Number(v) * 100) })
              }
            />
            {e.included &&
              e.total !== null &&
              Number.isInteger(p.basisPlayers) &&
              p.basisPlayers > 0 && (
                <p className="text-sm">
                  About {money(Math.round(e.total / p.basisPlayers))} per player at the{" "}
                  {p.basisPlayers}-player pricing baseline.
                </p>
              )}
            {!["coaching", "coach-travel", "tournaments"].includes(e.id) && (
              <Button
                type="button"
                variant="outlineDark"
                disabled={busy}
                onClick={() => update({ expenses: p.expenses.filter((row) => row.id !== e.id) })}
              >
                Remove expense
              </Button>
            )}
          </fieldset>
        ))}
      </div>
      <Button
        type="button"
        variant="outlineDark"
        disabled={busy || p.expenses.length >= 25}
        onClick={() =>
          update({
            expenses: [
              ...p.expenses,
              { id: crypto.randomUUID(), name: "Other expense", total: null, included: true },
            ],
          })
        }
      >
        Add another deposit expense
      </Button>
      <p className="text-sm">
        Saving keeps the draft fees, pricing assumptions, selected expenses and note. Publication
        remains separate. Saving does not change accepted agreements, post expenses, collect money
        or share this private budget with families or coaches.
      </p>
      {onSave && (
        <Button type="button" disabled={busy} onClick={onSave}>
          {saveLabel}
        </Button>
      )}
    </section>
  );
}
function AdminPlanningSummary({
  budget,
  costs,
  onApply,
  busy,
}: {
  budget: FeeBudget;
  costs: IndependentAdminBudget;
  onApply?: (deposit: number) => void;
  busy: boolean;
}) {
  const s = independentBudgetProjection(budget, costs);
  const rows: [string, keyof typeof s.baseline][] = [
    ["Initial deposit revenue", "initialDeposits"],
    ["Uniform cost", "uniforms"],
    ["Total costs covered by deposits", "totalCosts"],
    ["Initial deposit profit", "depositProfit"],
    ["Monthly facility / organization revenue", "monthlyRevenue"],
    ["Monthly dues revenue over the season", "seasonMonthlyRevenue"],
    ["Total season revenue", "seasonRevenue"],
    ["Season profit before processing and facility overhead", "seasonProfit"],
  ];
  const amount = (v: number | null) => (v === null ? "Incomplete" : money(v));
  return (
    <section
      className="grid min-w-0 gap-3 rounded-xl border p-4"
      aria-label="Admin budget forecast"
    >
      <h4 className="font-bold">Deposit calculator and budget forecast · admins only</h4>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt>Selected fixed team expenses</dt>
          <dd className="font-bold">{amount(s.fixedCosts)}</dd>
        </div>
        <div>
          <dt>Team expense share per pricing player</dt>
          <dd className="font-bold">
            {amount(
              s.fixedCosts !== null && s.basisPlayers
                ? Math.ceil(s.fixedCosts / s.basisPlayers)
                : null,
            )}
          </dd>
        </div>
        <div>
          <dt>Uniform cost per player</dt>
          <dd className="font-bold">{amount(s.uniformPerPlayer)}</dd>
        </div>
        <div>
          <dt>Deposit needed to cover costs per player</dt>
          <dd className="font-bold">{amount(s.costCoveredDeposit)}</dd>
        </div>
        <div>
          <dt>Calculated deposit including organization contribution</dt>
          <dd className="font-bold" data-testid="calculated-deposit">
            {amount(s.calculatedDeposit)}
          </dd>
        </div>
        <div>
          <dt>Current draft initial deposit per player</dt>
          <dd className="font-bold">{money(budget.independent!.uniformDeposit)}</dd>
        </div>
      </dl>
      {onApply && (
        <Button
          type="button"
          variant="outlineDark"
          disabled={busy || s.calculatedDeposit === null || s.calculatedDeposit > 100_000_000}
          onClick={() => {
            if (s.calculatedDeposit !== null) onApply(s.calculatedDeposit);
          }}
        >
          Use calculated deposit
        </Button>
      )}
      <p className="text-sm">
        Use the calculated amount or edit the initial deposit above, then save the draft. The
        forecast uses that draft deposit for every player, including players who join above the
        pricing baseline. Team expense shares round up to the nearest cent. This private calculation
        does not create player obligations.
      </p>
      <p className="text-sm">
        {s.monthlyInstallments ?? "Incomplete"} monthly installments from the billing dates above.
        This preview updates while you edit, before publication or family acceptance.
      </p>
      <p className="text-sm sm:hidden">Scroll the comparison sideways to see both player counts.</p>
      <div
        className="min-w-0 overflow-x-auto"
        role="region"
        aria-label="Budget comparison"
        tabIndex={0}
      >
        <table className="w-full min-w-[36rem] text-left text-sm [overflow-wrap:normal]">
          <caption className="sr-only">
            Pricing baseline and expected team revenue and profit
          </caption>
          <thead>
            <tr>
              <th className="p-2">Budget item</th>
              <th className="whitespace-nowrap p-2">{s.basisPlayers ?? "—"}-player basis</th>
              <th className="whitespace-nowrap p-2">{s.expectedPlayers ?? "—"}-player forecast</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, key]) => (
              <tr key={key} className="border-t border-line">
                <th scope="row" className="p-2 font-medium">
                  {label}
                </th>
                <td className="whitespace-nowrap p-2">{amount(s.baseline[key])}</td>
                <td className="whitespace-nowrap p-2 font-bold">{amount(s.expected[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        Each additional player's deposit contributes {amount(s.additionalPlayerContribution)} after
        their uniform cost, before processing and other costs.{" "}
        {s.breakEvenPlayers === null
          ? "Complete the costs and deposit to calculate when fixed expenses are covered."
          : `Selected fixed expenses are covered at ${s.breakEvenPlayers} paying player(s).`}
        Coaching, travel and other selected team expenses stay fixed as players are added.
      </p>
      {(s.fixedCosts === null || s.uniformPerPlayer === null) && (
        <p className="text-sm">
          Enter the per-player uniform cost and every checked expense total, including explicit
          zeros, to calculate profit.
        </p>
      )}
      {s.monthlyInstallments === null && (
        <p className="text-sm">
          Complete valid billing dates to calculate full-season monthly revenue.
        </p>
      )}
      {(s.basisPlayers === null || s.expectedPlayers === null) && (
        <p className="text-sm">
          The pricing count must be 1–200 players; expected players must be 0–200. Use whole
          numbers.
        </p>
      )}
      <p className="text-sm">
        Monthly dues are facility / organization revenue. Processing allowances (
        {amount(s.expected.processingAllowance)} for the expected roster) are excluded from planned
        profit. Facility costs, other overhead, refunds and processing can reduce final profit.
        Verified collections are reported separately below.
      </p>
    </section>
  );
}
function AdminProfitSummary({ summary: s }: { summary: Space["adminFinance"] }) {
  if (!s) return null;
  const rows: [string, number | null][] = [
    ["Projected initial deposits", s.initialDeposits],
    ["Projected monthly Prospects dues", s.monthlyDues],
    ["Disclosed processing allowances", s.disclosedProcessing],
    ["Credits reducing projected collections", s.credits],
    ["Projected season collections", s.projectedRevenue],
    ["Cost allowance for published roster", s.projectedCosts],
    ["Cost allowance for accepted players", s.costsComplete ? s.totalCosts : null],
    ["Projected profit before processing and other overhead", s.projectedMarginBeforeProcessing],
    ["Gross verified Square collections", s.grossCollected],
    ["Refunds", s.refunded],
    ["Verified external Prospects receipts (net)", s.verifiedOffline],
    ["Net collections after refunds", s.netCollected],
    ["Reserved credits or unreconciled collections", s.reservedOrUnreconciled],
    ["Applied Prospects revenue", s.appliedRevenue],
    ["Known actual processing costs", s.processingFees],
    ["Collected contribution after cost allowance", s.collectedMargin],
  ];
  return (
    <section
      className="grid gap-3 rounded-xl border p-4"
      aria-label="Admin-only Prospects profit estimate"
    >
      <h4 className="font-bold">Published agreements and verified collections · admins only</h4>
      <p className="text-sm">
        {s.acceptedPlayers} accepted player agreement(s); {s.pendingPlayers} player(s) projected
        from published terms awaiting acceptance. Projections use current accepted schedules and
        published offers, not the planning headcount or unsaved fee edits. Entered costs use the
        saved budget. Uniform allowances use accepted players for collected contribution and the
        published roster for projections; selected fixed expenses are counted once. Planning
        headcounts and independent team funds are excluded from these collection figures.
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-paper-2 p-3">
            <dt className="text-sm">{label}</dt>
            <dd className="font-bold">{value === null ? "Incomplete" : money(value)}</dd>
          </div>
        ))}
      </dl>
      {!s.costsComplete && (
        <p className="text-sm">
          Complete the uniform unit cost and selected expense totals, including explicit zeros, to
          calculate the contribution.
        </p>
      )}
      {s.missingProcessingFees > 0 && (
        <p className="text-sm">
          Processing costs are missing for {s.missingProcessingFees} payment(s). Sync Square in
          Front Office Finance before calculating collected profit.
        </p>
      )}
      {s.needsReconciliation && (
        <p className="text-sm">
          Verified receipts and the player payment records need reconciliation. Review Square
          reconciliation and any unverified external receipts. Collected profit is withheld until
          they agree.
        </p>
      )}
      <p className="text-sm">
        Projected contribution = projected collections − the published roster's cost allowance,
        before processing and other overhead. Collected contribution = applied collections after
        refunds − the accepted players' cost allowance − known processing costs. Unpaid dues and
        refundable credits are not collected profit. External payment fees and other overhead are
        not included. These estimates reflect the costs entered here; they are not bank balances or
        funds approved for distribution.
      </p>
    </section>
  );
}
function Configure({
  team,
  run,
  busy,
}: {
  team: Workspace["availableTeams"][number];
  run: Run;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [adminBudget, setAdminBudget] = useState<IndependentAdminBudget>(
    withIndependentPlanning(team.adminBudget || emptyIndependentAdminBudget()),
  );
  const [b, setB] = useState<FeeBudget>(() => ({
    ...team.budget,
    fundingModel: "independent",
    independent: {
      seasonKey: crypto.randomUUID(),
      uniformDeposit: 25000,
      monthlyDues: 12500,
      uniformDue: "",
      firstDue: "",
      billingDay: 1,
      lastDue: "",
      seasonEnd: "",
      processingExplanation: "No processing fees are charged to the family.",
    },
    processingBps: 0,
    processingFixed: 0,
    policy: "",
  }));
  return (
    <details
      className="rounded-xl border border-line p-4"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer font-semibold">
        {team.name} · Funding model
      </summary>
      {!team.canConfigure ? (
        <p>
          Existing published terms or accepted obligations belong to this season. Preserve them;
          configure a new season explicitly.
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          <p>
            Select Independently Funded Team to collect only the published initial deposit and
            monthly Prospects dues. Suggested amounts below are drafts.
          </p>
          <TermsFields
            budget={b}
            setBudget={setB}
            adminBudget={adminBudget}
            setAdminBudget={setAdminBudget}
          />
          <AdminCosts value={adminBudget} onChange={setAdminBudget} busy={busy} />
          <AdminPlanningSummary
            budget={b}
            costs={adminBudget}
            busy={busy}
            onApply={(deposit) =>
              setB({ ...b, independent: { ...b.independent!, uniformDeposit: deposit } })
            }
          />
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  changeFeePlan({
                    data: {
                      action: "save",
                      teamId: team.id,
                      revision: team.revision,
                      basisVersion: team.basisVersion,
                      budget: independentDraft(b),
                      adminBudget,
                      uniforms: team.uniforms,
                      expenses: team.expenses,
                    },
                  }),
                "Independent team draft saved. No charges or notices were created.",
              )
            }
          >
            Select Independently Funded Team and save draft
          </Button>
        </div>
      )}
    </details>
  );
}

function ProspectsSettings({ space: s, run, busy }: { space: Space; run: Run; busy: boolean }) {
  const [adminBudget, setAdminBudget] = useState<IndependentAdminBudget>(
    withIndependentPlanning(s.plan!.independentAdmin || emptyIndependentAdminBudget()),
  );
  const [b, setB] = useState(s.plan!.budget),
    [playerId, setPlayerId] = useState(""),
    [payerId, setPayerId] = useState(""),
    [reason, setReason] = useState("");
  const [splitDeposit, setSplitDeposit] = useState(false);
  const [firstDepositAmount, setFirstDepositAmount] = useState(0);
  const [firstDepositDue, setFirstDepositDue] = useState("");
  const [secondDepositDue, setSecondDepositDue] = useState("");
  const individualBudget: FeeBudget = splitDeposit
    ? {
        ...b,
        independent: {
          ...b.independent!,
          uniformDue: firstDepositDue,
          depositInstallments: [
            { amount: firstDepositAmount, due: firstDepositDue },
            { amount: b.independent!.uniformDeposit - firstDepositAmount, due: secondDepositDue },
          ],
        },
      }
    : b;
  const base = { teamId: s.teamId, revision: s.planRevision, basisVersion: s.basisVersion };
  return (
    <details className="rounded-xl border border-line p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Admin · Prospects billing terms
      </summary>
      <div className="mt-3 grid gap-3">
        <p>
          Status: {s.plan!.independentCancellation ? "Canceled" : s.plan!.status}. Publishing does
          not authorize a payment. Existing accepted terms remain in place until an individual
          amendment is accepted.
        </p>
        <TermsFields
          budget={b}
          setBudget={setB}
          adminBudget={adminBudget}
          setAdminBudget={setAdminBudget}
        />
        <AdminCosts
          value={adminBudget}
          onChange={setAdminBudget}
          busy={busy}
          saveLabel={
            s.plan!.independentCancellation
              ? "Save admin budget and note"
              : "Save draft fees and admin budget"
          }
          onSave={() =>
            void run(
              () =>
                changeFeePlan({
                  data: s.plan!.independentCancellation
                    ? { ...base, action: "independentAdminBudget", adminBudget }
                    : {
                        ...base,
                        action: "save",
                        budget: independentDraft(b),
                        adminBudget,
                        uniforms: s.plan!.uniforms,
                        expenses: s.plan!.expenses,
                      },
                }),
              s.plan!.independentCancellation
                ? "Admin budget and note saved. Canceled billing terms are unchanged."
                : "Draft fees and admin budget saved. Published terms and accepted agreements are unchanged.",
            )
          }
        />
        <AdminPlanningSummary
          budget={b}
          costs={adminBudget}
          busy={busy}
          onApply={
            s.plan!.independentCancellation
              ? undefined
              : (deposit) =>
                  setB({ ...b, independent: { ...b.independent!, uniformDeposit: deposit } })
          }
        />
        <details>
          <summary className="min-h-11 cursor-pointer">
            Published agreements and verified collections
          </summary>
          <AdminProfitSummary summary={s.adminFinance} />
        </details>
        <Button
          disabled={busy || Boolean(s.plan!.independentCancellation)}
          onClick={() =>
            void run(
              () =>
                changeFeePlan({
                  data: {
                    ...base,
                    action: "publishIndependent",
                    budget: b,
                    adminBudget,
                    confirmed: true,
                  },
                }),
              "Prospects terms published. Families must accept and authorize collection separately.",
            )
          }
        >
          Publish these Prospects terms
        </Button>
        <details>
          <summary className="min-h-11 cursor-pointer">
            Late enrollment, amendment or designated payer
          </summary>
          <div className="grid gap-3">
            <p>
              Review the fields and schedule above for this player's explicit offer. Accrued and
              paid obligations retain their identities. No automatic proration or extra deposit is
              created.
            </p>
            <Select
              label="Player"
              value={playerId}
              onChange={(v) => {
                setPlayerId(v);
                setPayerId("");
                setSplitDeposit(false);
              }}
            >
              <option value="">Choose player</option>
              {s.roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select label="Designated verified payer" value={payerId} onChange={setPayerId}>
              <option value="">Choose payer</option>
              {s.payers
                .filter((p) => p.playerIds.includes(playerId))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={splitDeposit}
                disabled={busy || !playerId}
                onChange={(e) => {
                  setSplitDeposit(e.target.checked);
                  if (e.target.checked) {
                    setFirstDepositAmount(Math.floor(b.independent!.uniformDeposit / 2));
                    setFirstDepositDue(b.independent!.uniformDue);
                    setSecondDepositDue("");
                  }
                }}
              />
              Split this player's initial deposit into two payments
            </label>
            {splitDeposit && (
              <div className="grid gap-3 rounded-lg border border-line p-3">
                <p>
                  Individual offer only. The two amounts must equal the initial deposit. Processing
                  is calculated separately for each payment. Both deposits must be due before or on
                  the first monthly due date. Paid or accrued deposits cannot be reshaped here.
                </p>
                <Field
                  label="First deposit payment ($)"
                  type="number"
                  value={firstDepositAmount / 100}
                  onChange={(v) => setFirstDepositAmount(Math.round(Number(v) * 100))}
                />
                <p>
                  Second deposit payment:{" "}
                  {money(b.independent!.uniformDeposit - firstDepositAmount)} before processing.
                </p>
                <Field
                  label="First deposit payment due"
                  type="date"
                  value={firstDepositDue}
                  onChange={setFirstDepositDue}
                />
                <Field
                  label="Second deposit payment due"
                  type="date"
                  value={secondDepositDue}
                  onChange={setSecondDepositDue}
                />
                <Schedule budget={individualBudget} />
                <details>
                  <summary className="min-h-11 cursor-pointer">
                    Preview individual parent agreement
                  </summary>
                  <p className="whitespace-pre-wrap">{previewPolicy(individualBudget)}</p>
                </details>
              </div>
            )}
            <Text
              label="Reason and treatment of existing obligations"
              value={reason}
              onChange={setReason}
            />
            <Button
              disabled={busy || !playerId || !payerId || reason.trim().length < 10}
              onClick={() =>
                void run(
                  () =>
                    changeFeePlan({
                      data: {
                        ...base,
                        action: "independentOffer",
                        playerId,
                        payerUserId: payerId,
                        budget: individualBudget,
                        adminBudget,
                        reason,
                      },
                    }),
                  "Individual offer published. Acceptance and new autopay authorization are required.",
                )
              }
            >
              Publish individual offer
            </Button>
          </div>
        </details>
        <details>
          <summary className="min-h-11 cursor-pointer">Withdrawal or season cancellation</summary>
          <p className="my-2">
            Stops future installments and automatic retries. Existing due balances and documented
            uniform commitments within the accepted initial deposit remain due. Submitted payments
            may still complete and will be reconciled.
          </p>
          <Select
            label="Player to withdraw (or select whole season)"
            value={playerId}
            onChange={setPlayerId}
          >
            <option value="">Whole season</option>
            {s.roster.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Text label="Cancellation reason" value={reason} onChange={setReason} />
          <Button
            className="mt-3"
            disabled={busy || reason.trim().length < 10}
            onClick={() =>
              void run(
                () =>
                  changeFeePlan({
                    data: playerId
                      ? { ...base, action: "independentWithdraw", playerId, reason }
                      : { ...base, action: "independentSeasonCancel", reason },
                  }),
                "Future installments and local automatic collection stopped. Review any submitted payments and remaining balances.",
              )
            }
          >
            {playerId
              ? "Withdraw this player's future Prospects billing"
              : "Cancel this season's future Prospects billing"}
          </Button>
        </details>
      </div>
    </details>
  );
}

function PlayerProspects({
  space: s,
  player: p,
  run,
  busy,
}: {
  space: Space;
  player: Space["prospects"][number];
  run: Run;
  busy: boolean;
}) {
  const [name, setName] = useState(""),
    [consent, setConsent] = useState(false),
    [reference, setReference] = useState("");
  return (
    <article className="grid gap-3 rounded-xl border border-line p-4">
      <h4 className="font-bold">{p.name}</h4>
      <p>
        {p.accepted ? `Accepted · ${p.authorizationStatus}` : "Missing family acceptance"}
        {p.cancellation ? " · Future billing canceled" : ""}
      </p>
      <p>
        Outstanding: {money(p.outstanding)} · Overdue: {money(p.overdue)}
        {p.credit > 0 ? ` · Credit awaiting disposition: ${money(p.credit)}` : ""}
      </p>
      <FeeExplanationView
        value={p.explanation}
        status={
          p.accepted
            ? `Accepted agreement version ${p.agreementVersion}`
            : `Published terms version ${p.offer?.revision || s.published?.revision}`
        }
      />
      {!p.accepted && p.acceptancePreview && (
        <ul className="space-y-1 text-sm" aria-label="Published Prospects payment schedule">
          {p.acceptancePreview.rows.map((row) => (
            <li key={row.id}>
              {row.label} · {row.due} · {money(row.amount)}
            </li>
          ))}
        </ul>
      )}
      {p.rows.length > 0 && (
        <ul className="space-y-1 text-sm">
          {p.rows.map((r) => (
            <li key={r.id}>
              {r.label} · {r.due} · {money(r.amount)} · Remaining {money(r.outstanding)}
            </li>
          ))}
        </ul>
      )}
      {p.cancellation && (
        <p className="text-sm">
          Automatic collection stopped locally at {p.cancellation.at}. Submitted payments remain
          subject to reconciliation. Cancellation does not issue a refund.
        </p>
      )}
      {p.pendingPayments > 0 && (
        <p role="status" className="text-sm">
          {p.pendingPayments} payment attempt(s) awaiting reconciliation. Confirm the existing
          result before trying again.
        </p>
      )}
      {p.paymentsAfterCutoff > 0 && (
        <p className="text-sm">
          {p.paymentsAfterCutoff} payment(s) recorded after billing stopped. Prospects can review
          the transaction and any applicable refund; the recorded history is preserved.
        </p>
      )}
      {p.canAccept && !p.acceptancePreview && (
        <p role="status">
          This offer needs owner review before acceptance. Existing accepted obligations and payment
          history remain available; contact Prospects for a corrected individual schedule.
        </p>
      )}
      {p.canAccept && p.acceptancePreview && !s.plan?.independentCancellation && (
        <details>
          <summary className="min-h-11 cursor-pointer font-semibold">
            Review and accept Prospects terms
          </summary>
          <div className="grid gap-3">
            <FeeExplanationView
              value={p.acceptancePreview?.explanation}
              status={`Terms to accept · publication ${p.acceptancePreview?.publicationRevision}`}
            />
            <p className="max-h-96 overflow-auto whitespace-pre-wrap text-sm">
              {p.acceptancePreview?.policy}
            </p>
            <Field label="Accepting guardian's full name" value={name} onChange={setName} />
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I accept this player's displayed Prospects terms. I understand that team-managed
              expenses and automatic-payment authorization are separate.
            </label>
            <Button
              disabled={busy || !consent || name.trim().length < 3}
              onClick={() =>
                void run(
                  () =>
                    changeFeePlan({
                      data: {
                        action: "accept",
                        teamId: s.teamId,
                        playerId: p.id,
                        revision: s.planRevision,
                        basisVersion: s.basisVersion,
                        name,
                        consent: true,
                        independentOfferDigest: p.acceptancePreview?.digest,
                      },
                    }),
                  "Terms accepted. Review and authorize automatic payment separately.",
                )
              }
            >
              Accept this player's agreement
            </Button>
          </div>
        </details>
      )}
      {p.canPay && p.accepted && p.outstanding > 0 && (
        <TeamPayment
          teamId={s.teamId}
          playerId={p.id}
          balance={p.outstanding}
          next={p.rows.find((r) => r.outstanding > 0)?.outstanding || 0}
          label="Pay Prospects securely"
        />
      )}
      {p.canAuthorize && p.accepted && <TeamCollectionSetup teamId={s.teamId} playerId={p.id} />}
      <details>
        <summary className="min-h-11 cursor-pointer">Accepted policy</summary>
        <p className="whitespace-pre-wrap text-sm">{p.policy || "No accepted agreement yet."}</p>
      </details>
      {p.accepted && (
        <FeeAgreementDownload
          teamId={s.teamId}
          playerId={p.id}
          seasonId={s.id}
          version={p.agreementVersion}
        />
      )}
      {p.agreements.length > 1 && (
        <details>
          <summary className="min-h-11 cursor-pointer">Previous accepted agreements</summary>
          {p.agreements
            .filter((a) => a.version !== p.agreementVersion)
            .map((a) => (
              <div key={a.version}>
                <p>
                  Version {a.version} · accepted {a.at}
                </p>
                <FeeAgreementDownload
                  teamId={s.teamId}
                  playerId={p.id}
                  seasonId={s.id}
                  version={a.version}
                />
              </div>
            ))}
        </details>
      )}
      {s.plan && p.accepted && (
        <details>
          <summary className="min-h-11 cursor-pointer">Uniform purchase evidence</summary>
          <p className="text-sm">
            {p.uniformCommitted
              ? "A uniform purchase or payment is recorded."
              : "No purchase evidence recorded."}{" "}
            Vendor cost never creates an additional player charge.
          </p>
          <Field
            label="Purchase/payment reference or Finance record"
            value={reference}
            onChange={setReference}
          />
          <Button
            disabled={busy || reference.trim().length < 5}
            onClick={() =>
              void run(
                () =>
                  changeFeePlan({
                    data: {
                      action: "independentUniform",
                      teamId: s.teamId,
                      playerId: p.id,
                      revision: s.planRevision,
                      basisVersion: s.basisVersion,
                      reference,
                    },
                  }),
                "Uniform commitment evidence recorded; accepted player charges are unchanged.",
              )
            }
          >
            Record uniforms purchased or paid for
          </Button>
        </details>
      )}
    </article>
  );
}

function TeamSettings({ space: s, run, busy }: { space: Space; run: Run; busy: boolean }) {
  const [settings, setSettings] = useState<IndependentSettings>(s.settings),
    [reason, setReason] = useState("");
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Team budget, sharing and closeout
      </summary>
      <div className="mt-3 grid gap-3">
        {s.capabilities.includes("budget") && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(categoryNames).map(([key, name]) => (
                <Field
                  key={key}
                  label={name + " budget ($)"}
                  type="number"
                  value={(settings.categories.find((c) => c.category === key)?.budget || 0) / 100}
                  onChange={(v) =>
                    setSettings({
                      ...settings,
                      categories: [
                        ...settings.categories.filter((c) => c.category !== key),
                        {
                          category: key as keyof typeof categoryNames,
                          budget: Math.round(Number(v) * 100),
                        },
                      ],
                    })
                  }
                />
              ))}
            </div>
            <Text
              label="Team refund and season-disposition terms"
              value={settings.policy}
              onChange={(v) => setSettings({ ...settings, policy: v })}
            />
            <Text
              label="Independent payment instructions"
              value={settings.instructions}
              onChange={(v) => setSettings({ ...settings, instructions: v })}
            />
          </>
        )}
        {s.capabilities.includes("share") && (
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={settings.shared}
              onChange={(e) => setSettings({ ...settings, shared: e.target.checked })}
            />
            Share category budget totals with families. Individual payment details and receipts
            remain private.
          </label>
        )}
        {s.capabilities.includes("closeout") && (
          <>
            <Select
              label="Financial season state"
              value={settings.closed ? "closed" : settings.closing ? "closing" : "open"}
              onChange={(v) =>
                setSettings({ ...settings, closed: v === "closed", closing: v === "closing" })
              }
            >
              <option value="open">Open</option>
              <option value="closing">Closing — review balances and dispositions</option>
              <option value="closed">Closed — corrections and history only</option>
            </Select>
            <p className="text-sm">
              Closing preserves unpaid obligations, credits, funds and commitments. It does not move
              money, issue refunds or forgive balances. Record completed external dispositions
              separately.
            </p>
          </>
        )}
        <Text label="Reason for changes" value={reason} onChange={setReason} />
        <Button
          disabled={busy || reason.trim().length < 5}
          onClick={() =>
            void run(
              () =>
                changeIndependentTeam({
                  data: {
                    action: "settings",
                    seasonId: s.id,
                    revision: s.revision,
                    settings,
                    reason,
                  },
                }),
              "Team budget and settings saved.",
            )
          }
        >
          Save team settings
        </Button>
      </div>
    </details>
  );
}

const entryLabels: Record<IndependentEntry["kind"], string> = {
  obligation: "Player operating charge",
  payment: "Payment received externally",
  income: "Fundraising or sponsorship received",
  expense: "Expense paid externally",
  commitment: "Spending commitment",
  allocation: "Allocate a received payment",
  credit: "Credit an obligation",
  unallocate: "Correct a payment allocation",
  refund: "Refund completed externally",
  plannedRefund: "Plan a refund (no money moved)",
  reversal: "Reverse a recording error",
  reminder: "Private in-app balance reminder",
};
function EntryForm({ space: s, run, busy }: { space: Space; run: Run; busy: boolean }) {
  const allowed = Object.keys(entryLabels).filter((k) =>
    s.capabilities.includes(entryCapability(k as IndependentEntry["kind"])),
  ) as IndependentEntry["kind"][];
  const [kind, setKind] = useState<IndependentEntry["kind"]>(allowed[0]),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(day()),
    [due, setDue] = useState(day()),
    [category, setCategory] = useState<keyof typeof categoryNames>("other"),
    [note, setNote] = useState(""),
    [playerId, setPlayerId] = useState(""),
    [payerId, setPayerId] = useState(""),
    [paymentId, setPaymentId] = useState(""),
    [plannedId, setPlannedId] = useState(""),
    [obligationId, setObligationId] = useState(""),
    [targetId, setTargetId] = useState(""),
    [commitmentId, setCommitmentId] = useState(""),
    [method, setMethod] = useState(""),
    [reference, setReference] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  if (!allowed.length) return null;
  const external = ["payment", "income", "expense", "refund"].includes(kind);
  const targets = s.entries.filter((r) =>
    kind === "credit"
      ? r.payload.kind === "obligation"
      : kind === "unallocate"
        ? r.payload.kind === "allocation"
        : true,
  );
  async function submit() {
    const common = { amount: Math.round(Number(amount) * 100), date, category, note };
    const e = {
      ...common,
      kind,
      ...(external ? { method, reference } : {}),
      ...(kind === "obligation" ? { playerId, due } : {}),
      ...(kind === "payment" ? { payerUserId: payerId } : {}),
      ...(kind === "allocation" ? { paymentId, obligationId } : {}),
      ...(["credit", "unallocate", "reversal"].includes(kind) ? { targetId } : {}),
      ...(["refund", "plannedRefund"].includes(kind) ? { paymentId } : {}),
      ...(kind === "refund" && plannedId ? { plannedId } : {}),
      ...(kind === "expense" && commitmentId ? { commitmentId } : {}),
      ...(kind === "reminder" ? { playerId, recipientId: payerId } : {}),
    } as IndependentEntry;
    await changeIndependentTeam({ data: { action: "entry", seasonId: s.id, requestId, entry: e } });
    setRequestId(crypto.randomUUID());
    setAmount("");
    setNote("");
    setReference("");
  }
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Record team financial activity
      </summary>
      <form
        className="mt-3 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            submit,
            kind === "reminder"
              ? "Private reminder added to the recipient's team workspace. No email or group message was sent."
              : "Independent team entry recorded. The software did not move money.",
          );
        }}
      >
        <Select
          label="Activity"
          value={kind}
          onChange={(v) => {
            setKind(v as IndependentEntry["kind"]);
            setTargetId("");
          }}
        >
          {allowed.map((k) => (
            <option key={k} value={k}>
              {entryLabels[k]}
            </option>
          ))}
        </Select>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount ($)" type="number" value={amount} onChange={setAmount} required />
          <Field label="Date" type="date" value={date} onChange={setDate} required />
          <Select
            label="Category"
            value={category}
            onChange={(v) => setCategory(v as keyof typeof categoryNames)}
          >
            {Object.entries(categoryNames).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </Select>
          {kind === "obligation" && (
            <Field label="Payment deadline" type="date" value={due} onChange={setDue} required />
          )}
        </div>
        {["obligation", "reminder"].includes(kind) && (
          <Select label="Player" value={playerId} onChange={setPlayerId}>
            <option value="">Choose player</option>
            {s.roster.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
        {["payment", "reminder"].includes(kind) && (
          <Select
            label={kind === "reminder" ? "Verified recipient" : "Verified payer"}
            value={payerId}
            onChange={setPayerId}
          >
            <option value="">Choose billing party</option>
            {s.payers
              .filter((p) => kind !== "reminder" || p.playerIds.includes(playerId))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        )}
        {["allocation", "refund", "plannedRefund"].includes(kind) && (
          <Select
            label="Original received payment"
            value={paymentId}
            onChange={(v) => {
              setPaymentId(v);
              setPlannedId("");
            }}
          >
            <option value="">Choose payment</option>
            {s.payments.map((p) => (
              <option key={p.id} value={p.id}>
                {s.payers.find((u) => u.id === p.payerUserId)?.name || "Payer"} · {money(p.amount)}{" "}
                · Unapplied {money(p.unapplied)}
              </option>
            ))}
          </Select>
        )}
        {kind === "refund" && (
          <Select label="Related planned refund" value={plannedId} onChange={setPlannedId}>
            <option value="">No prior planned refund</option>
            {s.plannedRefunds
              .filter(
                (r) => r.payload.kind === "plannedRefund" && r.payload.paymentId === paymentId,
              )
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.payload.note} · Remaining {money(r.remaining)}
                </option>
              ))}
          </Select>
        )}
        {kind === "allocation" && (
          <Select label="Player obligation" value={obligationId} onChange={setObligationId}>
            <option value="">Choose obligation</option>
            {s.obligations.map((o) => (
              <option key={o.id} value={o.id}>
                {s.roster.find((p) => p.id === o.playerId)?.name} · {o.note} ·{" "}
                {money(o.outstanding)} outstanding
              </option>
            ))}
          </Select>
        )}
        {["credit", "unallocate", "reversal"].includes(kind) && (
          <Select label="Original entry" value={targetId} onChange={setTargetId}>
            <option value="">Choose entry</option>
            {targets.map((r) => (
              <option key={r.id} value={r.id}>
                {r.payload.kind} · {r.payload.date} · {r.payload.note} · {money(r.payload.amount)}
              </option>
            ))}
          </Select>
        )}
        {kind === "expense" && (
          <Select
            label="Related spending commitment"
            value={commitmentId}
            onChange={setCommitmentId}
          >
            <option value="">No existing commitment</option>
            {s.entries
              .filter((r) => r.payload.kind === "commitment")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.payload.note} · {money(r.payload.amount)}
                </option>
              ))}
          </Select>
        )}
        {external && (
          <>
            <Field label="External payment method" value={method} onChange={setMethod} required />
            <Field
              label="External receipt or transaction reference"
              value={reference}
              onChange={setReference}
              required
            />
            <p className="text-sm">
              Record money already received, paid or refunded through the team's arrangements. This
              action does not initiate a payment or refund.
            </p>
          </>
        )}
        <Text
          label={kind === "reminder" ? "Private reminder message" : "Purpose or correction reason"}
          value={note}
          onChange={setNote}
        />
        <Button type="submit" disabled={busy || !note.trim() || Number(amount) <= 0}>
          Record {entryLabels[kind].toLowerCase()}
        </Button>
      </form>
    </details>
  );
}

function Managers({ space: s, run, busy }: { space: Space; run: Run; busy: boolean }) {
  const [email, setEmail] = useState(""),
    [candidate, setCandidate] = useState<{ id: string; name: string }>(),
    [caps, setCaps] = useState<IndependentCapability[]>(["view"]);
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Appoint a team financial manager
      </summary>
      <div className="mt-3 grid gap-3">
        <p>
          Only this team's independent funds are delegated. Manager appointments grant no access to
          Prospects billing and no authority to appoint other managers.
        </p>
        <Field
          label="Manager's verified account email"
          type="email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            setCandidate(undefined);
          }}
        />
        <Button
          disabled={busy || !email}
          onClick={() =>
            void run(
              async () =>
                setCandidate(await findIndependentManager({ data: { seasonId: s.id, email } })),
              "Verified manager account found.",
            )
          }
        >
          Find verified account
        </Button>
        {candidate && (
          <>
            <p>{candidate.name}</p>
            <div className="grid grid-cols-2 gap-2">
              {independentCapabilities.map((cap) => (
                <label className="flex gap-2" key={cap}>
                  <input
                    type="checkbox"
                    checked={caps.includes(cap)}
                    disabled={cap === "view"}
                    onChange={(e) =>
                      setCaps(e.target.checked ? [...caps, cap] : caps.filter((c) => c !== cap))
                    }
                  />
                  {cap}
                </label>
              ))}
            </div>
            <Button
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    changeIndependentTeam({
                      data: {
                        action: "grant",
                        seasonId: s.id,
                        userId: candidate.id,
                        capabilities: caps,
                        revoke: false,
                      },
                    }),
                  "Team financial permissions saved.",
                )
              }
            >
              Save these team permissions
            </Button>
          </>
        )}
        {s.grants.map((g) => (
          <div key={g.user_id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {g.name} · {g.revoked_at ? "Revoked" : g.capabilities.join(", ")}
            </span>
            {!g.revoked_at && (
              <Button
                variant="outlineDark"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      changeIndependentTeam({
                        data: {
                          action: "grant",
                          seasonId: s.id,
                          userId: g.user_id,
                          capabilities: g.capabilities,
                          revoke: true,
                        },
                      }),
                    "Manager access revoked, including future receipt and export retrieval.",
                  )
                }
              >
                Revoke access
              </Button>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

function Receipts({ space: s, run, busy }: { space: Space; run: Run; busy: boolean }) {
  const [entryId, setEntryId] = useState("");
  const eligible = s.entries.filter(
    (r) =>
      r.payload.kind !== "carryIn" &&
      r.payload.kind !== "carryOut" &&
      s.capabilities.includes(entryCapability(r.payload.kind)),
  );
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Receipts and supporting documents
      </summary>
      <div className="mt-3 grid gap-3">
        {eligible.length > 0 && (
          <>
            <Select label="Attach receipt to recorded entry" value={entryId} onChange={setEntryId}>
              <option value="">Choose entry</option>
              {eligible.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.payload.date} · {r.payload.note} · {money(r.payload.amount)}
                </option>
              ))}
            </Select>
            <label className="grid gap-1 text-sm">
              PDF, PNG or JPEG · maximum 2 MB
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                disabled={busy || !entryId}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void run(async () => {
                    if (f.size > 2_000_000) throw Error("Choose a receipt under 2 MB.");
                    const body = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onerror = () => reject(Error("Could not read receipt."));
                      reader.onload = () => resolve(String(reader.result).split(",")[1]);
                      reader.readAsDataURL(f);
                    });
                    await changeIndependentTeam({
                      data: {
                        action: "document",
                        seasonId: s.id,
                        entryId,
                        requestId: crypto.randomUUID(),
                        filename: f.name,
                        mimeType: f.type as "application/pdf" | "image/png" | "image/jpeg",
                        body,
                      },
                    });
                  }, "Private receipt saved.");
                  e.target.value = "";
                }}
              />
            </label>
          </>
        )}
        {s.documents.map((d) => (
          <Button
            key={d.id}
            variant="outlineDark"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const f = await downloadIndependentDocument({
                  data: { seasonId: s.id, documentId: d.id },
                });
                const bytes = Uint8Array.from(atob(f.body), (c) => c.charCodeAt(0));
                download(f.filename, bytes, f.mimeType);
              }, "Receipt downloaded.")
            }
          >
            {d.filename}
          </Button>
        ))}
        {!s.documents.length && <p className="text-sm">No receipts available to your account.</p>}
      </div>
    </details>
  );
}

function CarryForm({
  space: s,
  spaces,
  run,
  busy,
}: {
  space: Space;
  spaces: Space[];
  run: Run;
  busy: boolean;
}) {
  const [destinationId, setDestination] = useState(""),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(day()),
    [note, setNote] = useState(""),
    [method, setMethod] = useState(""),
    [reference, setReference] = useState(""),
    [mode, setMode] = useState<"bookkeeping" | "external">("bookkeeping"),
    [category, setCategory] = useState<keyof typeof categoryNames>("other"),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Record an authorized season carryforward
      </summary>
      <div className="mt-3 grid gap-3">
        <p>
          Requires closeout authority and published disposition terms in both seasons. Unapplied
          payer credits remain reserved. Matching records move an existing balance; they do not
          create income or send money.
        </p>
        <Select label="Destination team season" value={destinationId} onChange={setDestination}>
          <option value="">Choose an authorized destination</option>
          {spaces
            .filter((x) => x.id !== s.id && x.capabilities.includes("closeout"))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.teamName} · {x.published?.finalDue || "Draft"}
              </option>
            ))}
        </Select>
        <Field label="Carryforward amount ($)" type="number" value={amount} onChange={setAmount} />
        <Field label="Completed date" type="date" value={date} onChange={setDate} />
        <Select
          label="Category"
          value={category}
          onChange={(v) => setCategory(v as keyof typeof categoryNames)}
        >
          {Object.entries(categoryNames).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </Select>
        <Select
          label="Type of completed transfer"
          value={mode}
          onChange={(v) => setMode(v as "bookkeeping" | "external")}
        >
          <option value="bookkeeping">Bookkeeping carryforward — no external cash movement</option>
          <option value="external">External cash transfer already completed</option>
        </Select>
        <Field label="Recorded method" value={method} onChange={setMethod} />
        <Field label="Reference" value={reference} onChange={setReference} />
        <Text label="Applicable disposition policy and reason" value={note} onChange={setNote} />
        <Button
          disabled={
            busy ||
            !destinationId ||
            Number(amount) <= 0 ||
            note.trim().length < 10 ||
            !method ||
            !reference
          }
          onClick={() =>
            void run(async () => {
              await changeIndependentTeam({
                data: {
                  action: "carry",
                  seasonId: s.id,
                  destinationId,
                  requestId,
                  amount: Math.round(Number(amount) * 100),
                  category,
                  date,
                  note,
                  mode,
                  method,
                  reference,
                },
              });
              setRequestId(crypto.randomUUID());
              setAmount("");
            }, "Matching carryforward records saved. No payment was initiated.")
          }
        >
          Record completed carryforward
        </Button>
      </div>
    </details>
  );
}

function SpaceView({
  space: s,
  spaces,
  run,
  busy,
}: {
  space: Space;
  spaces: Space[];
  run: Run;
  busy: boolean;
}) {
  const editable = s.capabilities.length > 1;
  return (
    <section className="grid min-w-0 gap-4 rounded-2xl border-2 border-navy p-4">
      <h2 className="text-2xl">{s.teamName}</h2>
      {s.plan && <ProspectsSettings key={s.planRevision} space={s} run={run} busy={busy} />}{" "}
      {s.prospects.length > 0 && (
        <section className="grid gap-3">
          <h3 className="text-xl font-bold">Payments to Prospects</h3>
          <p className="text-sm">
            Initial deposit and monthly Prospects dues, per player. Managed by Prospects.
          </p>
          {s.role !== "billing-party" && (
            <FeeExplanationView
              value={s.published?.explanation}
              status={`Current published team terms · version ${s.published?.revision}`}
            />
          )}
          {s.prospects.map((p) => (
            <PlayerProspects
              key={p.id + ":" + p.agreementVersion + ":" + s.planRevision}
              space={s}
              player={p}
              run={run}
              busy={busy}
            />
          ))}
        </section>
      )}
      <section className="grid min-w-0 gap-3">
        <h3 className="text-xl font-bold">Team-Managed Expenses</h3>
        <p className="text-sm">
          Managed and collected independently by this team.{" "}
          {s.role === "owner-read-only"
            ? "Your owner access is read-only."
            : s.role === "financial-manager"
              ? "Your manager permissions apply only to these independent funds."
              : ""}
        </p>
        <p className="font-semibold">Based on recorded transactions</p>
        <p className="text-sm">
          {s.settings.closed
            ? "Season closed"
            : s.settings.closing
              ? "Season closing"
              : "Season open"}
          . These records do not verify an external bank balance.
        </p>
        {s.summary && (
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ["Recorded funds on hand", s.summary.funds],
              ["Outstanding receivables", s.summary.outstanding],
              ["Committed spending", s.summary.committed],
              ["Funds available after commitments", s.summary.available],
              ["Unapplied payer credits", s.summary.unapplied],
              ["Available after commitments and payer credits", s.summary.spendable],
              ["Recorded expenses", s.summary.spent],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-paper-2 p-3">
                <dt className="text-sm">{label}</dt>
                <dd className="font-bold">{money(Number(value))}</dd>
              </div>
            ))}
          </dl>
        )}
        {s.teamPaymentRisk && (
          <p className="rounded-lg bg-paper-2 p-3 text-sm">
            Some team-managed payments need follow-up. Individual family balances remain private.
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm">
          {s.settings.instructions || "Ask your coach for independent payment instructions."}
        </p>
        <details>
          <summary className="min-h-11 cursor-pointer">Team financial terms</summary>
          <p className="whitespace-pre-wrap text-sm">
            {s.settings.policy || "The coach has not published a refund or remaining-funds policy."}
          </p>
        </details>
        {s.categories.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="text-left">
                {s.full
                  ? "Team category report"
                  : "Shared team budget — individual balances remain private"}
              </caption>
              <thead>
                <tr>
                  {["Category", "Budget", "Spent", "Committed", "Budget remaining"].map((x) => (
                    <th key={x} className="p-2">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.categories.map((c) => (
                  <tr key={c.key}>
                    <td className="p-2">{c.name}</td>
                    <td className="p-2">{money(c.budget)}</td>
                    <td className="p-2">{money(c.spent)}</td>
                    <td className="p-2">{money(c.committed)}</td>
                    <td className="p-2">{money(c.budgetRemaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid gap-2">
          {s.obligations.map((o) => (
            <article key={o.id} className="rounded-lg border p-3">
              <p className="font-semibold">
                {s.roster.find((p) => p.id === o.playerId)?.name} · {o.note}
              </p>
              <p className="text-sm">
                Due {o.due} · {money(o.amount)} · Recorded payment allocations {money(o.applied)} ·
                Credits {money(o.credits)} · Outstanding {money(o.outstanding)}
              </p>
            </article>
          ))}
        </div>
        {editable && <TeamSettings key={s.revision} space={s} run={run} busy={busy} />}
        <EntryForm key={s.capabilities.join(",")} space={s} run={run} busy={busy} />
        {s.capabilities.includes("closeout") && (
          <CarryForm space={s} spaces={spaces} run={run} busy={busy} />
        )}
        <div>
          {s.plannedRefunds.map((r) => (
            <p className="text-sm" key={r.id}>
              Planned refund still to record externally: {money(r.remaining)} · {r.payload.note}
            </p>
          ))}
        </div>
        {s.canGrant && <Managers space={s} run={run} busy={busy} />}
        <Receipts space={s} run={run} busy={busy} />
        {(!s.full ||
          s.role === "owner-read-only" ||
          s.plan ||
          s.capabilities.includes("export")) && (
          <Button
            variant="outlineDark"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const f = await exportIndependentStatement({ data: { seasonId: s.id } });
                download(f.filename, f.text);
              }, "Authorized team statement exported.")
            }
          >
            Export {s.full ? "team financial report" : "my statement"}
          </Button>
        )}
        <details>
          <summary className="min-h-11 cursor-pointer font-semibold">
            Recorded activity and corrections
          </summary>
          <div className="grid gap-2">
            {s.entries.map((r) => (
              <article className="border-b py-2 text-sm" key={r.id}>
                <p>
                  {r.payload.date} · {r.payload.kind} · {money(r.payload.amount)}
                </p>
                <p className="whitespace-pre-wrap">{r.payload.note}</p>
                {"method" in r.payload && (
                  <p>
                    {r.payload.method} · {r.payload.reference}
                  </p>
                )}
                {r.payload.kind === "plannedRefund" && <p>Planned only. No money moved.</p>}
                {r.payload.kind === "refund" && (
                  <p>Recorded external refund. The software did not send money.</p>
                )}
              </article>
            ))}
            {!s.entries.length && <p>No independent transactions recorded.</p>}
          </div>
        </details>
      </section>
    </section>
  );
}

export function IndependentWorkspace({ teamId, playerId }: { teamId?: string; playerId?: string }) {
  const [data, setData] = useState<Workspace>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () =>
    setData(await getIndependentWorkspace({ data: { ...(teamId ? { teamId } : {}) } }));
  useEffect(() => {
    let active = true;
    setData(undefined);
    getIndependentWorkspace({ data: { ...(teamId ? { teamId } : {}) } })
      .then((v) => {
        if (active) {
          setData(v);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [teamId]);
  const run: Run = async (work, message = "Saved.") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      setNotice(message);
      window.dispatchEvent(new Event("team-budget-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the action.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="my-4 grid min-w-0 gap-4" aria-label="Independent team finances">
      {error && (
        <p role="alert" className="rounded-lg border border-maroon p-3">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-paper-2 p-3">
          {notice}
        </p>
      )}
      {!data && !error && <p role="status">Loading independent team finances…</p>}
      {data?.availableTeams.map((t) => (
        <Configure key={t.id} team={t} run={run} busy={busy} />
      ))}
      {data?.spaces.map((s) => (
        <SpaceView
          key={s.id}
          space={playerId ? { ...s, prospects: s.prospects.filter((p) => p.id === playerId) } : s}
          spaces={data.spaces}
          run={run}
          busy={busy}
        />
      ))}
      {data && !data.spaces.length && !data.availableTeams.length && (
        <p className="text-sm">
          No independently funded team workspace is assigned to this account.
        </p>
      )}
    </section>
  );
}
