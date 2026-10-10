import { BudgetMasterEditor } from "./budget-master-editor";
import { getBudgetMaster } from "@/lib/teams/fee-api";
import { rowKey, seasonNames, type MasterMatrix } from "@/lib/teams/budget-matrix";
import { TeamFundingNotice } from "./team-funding-notice";
import { UniformGallery, UniformPhotoEditor } from "./uniform-photos";
import { useEffect, useState, type ReactNode } from "react";
import { getFeeWorkspace, changeFeePlan, saveFeeBusiness } from "@/lib/teams/fee-api";
import {
  calculateFees,
  project,
  businessProjection,
  deadline,
  money,
  installments,
  scheduleRows,
  type FeeBudget,
} from "@/lib/teams/fee-model";
import type { FeePlan, FeeBusiness } from "@/lib/teams/fee-contracts";
import { Button } from "../ui/button";
import { recordTeamPayment } from "@/lib/teams/store";
type Workspace = Awaited<ReturnType<typeof getFeeWorkspace>>;
type TeamView = Workspace["teams"][number];
function Panel({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open || undefined} className="rounded-xl border border-line bg-white p-4">
      <summary className="min-h-11 cursor-pointer text-lg font-semibold">{title}</summary>
      <div className="mt-3 grid gap-3">{children}</div>
    </details>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      {label}
      <input
        className="office-control min-w-0 w-full"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Dollars({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Field
      label={label + " ($)"}
      type="number"
      value={String(value / 100)}
      onChange={(s) => onChange(Math.max(0, Math.round(Number(s) * 100)))}
    />
  );
}
function Numbers({ rows }: { rows: [string, number][] }) {
  return (
    <dl className="grid gap-2">
      {rows.map(([label, n]) => (
        <div className="flex flex-wrap justify-between gap-2 border-b border-line py-2" key={label}>
          <dt className="text-sm">{label}</dt>
          <dd className="font-semibold tabular-nums">{money(n)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function TeamFeeWorkspace({ teamId }: { teamId?: string }) {
  const [data, setData] = useState<Workspace>(),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(teamId || ""),
    [notice, setNotice] = useState("");
  const load = async () => {
    try {
      setData(await getFeeWorkspace());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load team fees.");
    }
  };
  useEffect(() => {
    void load();
    const changed = () => void load();
    window.addEventListener("team-budget-updated", changed);
    return () => window.removeEventListener("team-budget-updated", changed);
  }, []);
  useEffect(() => {
    if (teamId) setSelected(teamId);
  }, [teamId]);
  const team = data?.teams.find((t) => t.id === (teamId || selected)) || data?.teams[0];
  return (
    <section className="my-5 grid min-w-0 gap-4">
      <header>
        <p className="text-xs tracking-widest text-maroon uppercase">Team planning</p>
        <h2 className="text-3xl">
          {data?.admin ? "Team Fees & Profitability" : "Team Fees & Payment Status"}
        </h2>
        <p className="text-sm text-muted">
          Approved season fees, payment schedules, and roster readiness.
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data?.admin && <BudgetMasterEditor teams={data.teams} />}
      {!data ? (
        <Button onClick={() => void load()}>Load team fee plans</Button>
      ) : !team ? (
        <p>No assigned teams are available.</p>
      ) : (
        <>
          {!teamId && (
            <label className="grid gap-1">
              Team
              <select
                className="office-control"
                value={team.id}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setNotice("");
                }}
              >
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <TeamFundingNotice teamId={team.id} />
          <TeamPlan
            key={team.id + ":" + team.revision}
            team={team}
            refresh={load}
            notify={setNotice}
          />
          {data.admin && data.business && (
            <BusinessModel
              teams={data.teams}
              value={data.business.value}
              revision={data.business.revision}
              refresh={load}
            />
          )}
        </>
      )}
    </section>
  );
}
function TeamPlan({
  team,
  refresh,
  notify,
}: {
  team: TeamView;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [plan, setPlan] = useState<FeePlan | undefined>(team.private?.plan),
    [tournament, setTournament] = useState(team.choices?.tournament || 0),
    [uniformId, setUniform] = useState(team.choices?.uniformId || ""),
    [busy, setBusy] = useState(false),
    [photoUploads, setPhotoUploads] = useState(0),
    [master, setMaster] = useState<MasterMatrix>(),
    [matrixKey, setMatrixKey] = useState(team.private?.plan.defaults?.key || ""),
    [error, setError] = useState(""),
    [full, setFull] = useState(10),
    [po, setPo] = useState(0),
    [name, setName] = useState(""),
    [consent, setConsent] = useState(false);
  useEffect(() => {
    if (team.access !== "admin") return;
    const load = () => {
      void getBudgetMaster()
        .then((d) => setMaster(d.value))
        .catch(() => {});
    };
    load();
    window.addEventListener("budget-master-updated", load);
    return () => window.removeEventListener("budget-master-updated", load);
  }, [team.id, team.access]);
  async function act(action: Parameters<typeof changeFeePlan>[0]["data"]) {
    setBusy(true);
    setError("");
    try {
      await changeFeePlan({ data: action });
      window.dispatchEvent(new CustomEvent("team-uniform-updated", { detail: team.id }));
      window.dispatchEvent(new CustomEvent("team-budget-updated", { detail: team.id }));
      if (action.action === "accept") {
        window.location.reload();
        return;
      }
      await refresh();
      notify(
        action.action === "save"
          ? "Draft saved. Publish after reviewing the fee and policy."
          : action.action === "propose"
            ? "Selections submitted for Front Office approval."
            : "Changes saved.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const update = (patch: Partial<FeeBudget>) =>
    setPlan((p) => (p ? { ...p, budget: { ...p.budget, ...patch } } : p));
  const base = { teamId: team.id, revision: team.revision };
  let preview: ReturnType<typeof project> | undefined;
  try {
    if (plan) preview = project(plan.budget, full, po, plan.expenses, plan.status === "closed");
  } catch {}
  const publication = team.publication;
  return (
    <div className="grid gap-4">
      <p className="rounded-lg bg-ink p-3 text-white">
        {team.name} · {team.status}
        {publication ? " · Published fee version " + publication.revision : ""}
      </p>
      {error && (
        <p role="alert" className="text-maroon">
          {error}
        </p>
      )}
      {publication && (
        <Panel title="Published player fees" open>
          <Numbers
            rows={[
              ["Full player", publication.full],
              ["Pitcher only", publication.po],
            ]}
          />
          <p className="text-sm">
            Final payment due {publication.finalDue}. The accepted schedule is listed in the policy
            below. Early payment in full is allowed.
          </p>
          <p className="whitespace-pre-wrap text-sm">{publication.policy}</p>
        </Panel>
      )}
      {team.access === "coach" && team.choices && (
        <Panel title="Coach budget selections" open>
          <p className="text-sm">
            Only authorized selections can be changed. Front Office must approve them before new
            fees are published.
          </p>
          {team.choices.canTournament && (
            <Dollars
              label="Tournament and league budget"
              value={tournament}
              onChange={setTournament}
            />
          )}
          {team.choices.canUniform && (
            <label>
              Uniform package
              <select
                className="office-control w-full"
                value={uniformId}
                onChange={(e) => setUniform(e.target.value)}
              >
                <option value="">No package</option>
                {team.choices.uniforms.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {money(u.price)} · {u.items}
                  </option>
                ))}
              </select>
            </label>
          )}
          {team.choices.uniforms
            .filter((u) => u.id === uniformId)
            .map((u) => (
              <UniformGallery key={u.id} name={u.name} photos={u.photos} />
            ))}
          <p>
            Season hotel stipend: {team.choices.hotelNights} nights ×{" "}
            {money(team.choices.hotelNightly)} ={" "}
            {money(team.choices.hotelNights * team.choices.hotelNightly)}. The nightly rate is set
            by Front Office.
          </p>
          <Numbers
            rows={[
              ["Current draft full-player fee", team.choices.full],
              ["Current draft pitcher-only fee", team.choices.po],
            ]}
          />
          <Button
            disabled={busy}
            onClick={() => void act({ ...base, action: "propose", tournament, uniformId })}
          >
            Submit selections & calculate fee
          </Button>
        </Panel>
      )}
      {plan && (
        <>
          <Panel title="Budget defaults & approval checklist" open>
            <p>
              {plan.defaults
                ? `Created from ${plan.defaults.key} · master revision ${plan.defaults.revision}. Team edits override this snapshot.`
                : "No master snapshot. Existing budgets are unchanged; choose a row to initialize an unpublished draft."}
            </p>
            {!plan.published && master && (
              <>
                <label>
                  Apply master row
                  <select
                    className="office-control w-full"
                    value={matrixKey}
                    onChange={(e) => setMatrixKey(e.target.value)}
                  >
                    <option value="">Choose sport, age and season</option>
                    {master.rows.map((r) => (
                      <option key={rowKey(r)} value={rowKey(r)}>
                        {r.sport} · {r.age}U · {seasonNames[r.season]}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="outlineDark"
                  disabled={busy || !matrixKey}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Replace this draft's default cost assumptions with the selected master row? Save any other edits first. Uniform packages, expenses and accepted player agreements are preserved.",
                      )
                    )
                      void act({
                        ...base,
                        action: "applyDefaults",
                        key: matrixKey,
                        confirmed: true,
                      });
                  }}
                >
                  Apply master defaults to draft
                </Button>
              </>
            )}
            {plan.defaults && plan.budget.readiness && (
              <>
                <p>
                  Schedule-driven costs begin at $0 / pending. A reviewed zero is allowed;
                  unreviewed costs block publication.
                </p>
                {(
                  [
                    ["schedule", "Tournament / league entries and event schedule reviewed"],
                    ["gas", "Season gas stipend reviewed"],
                    ["hotels", "Hotel nights and nightly stipend reviewed"],
                    ["other", "Umpires, extra coaching and other direct costs reviewed"],
                    ["processing", "Actual payment-processing rate and fixed fee reviewed"],
                    ["noUniform", "No uniform purchase required (only if no package is selected)"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={plan.budget.readiness![k]}
                      onChange={(e) =>
                        update({ readiness: { ...plan.budget.readiness!, [k]: e.target.checked } })
                      }
                    />
                    {label}
                  </label>
                ))}
              </>
            )}
          </Panel>
          <Panel title="Season & private pricing assumptions" open>
            <p className="text-sm">
              These assumptions are admin-only. All costs below are season totals unless labeled per
              player or per month.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Season start"
                type="date"
                value={plan.budget.start}
                onChange={(start) => update({ start })}
              />
              <Field
                label="Season end"
                type="date"
                value={plan.budget.end}
                onChange={(end) => update({ end })}
              />
              <Field
                label="Billable season months (partial months allowed)"
                type="number"
                value={String(plan.budget.months)}
                onChange={(s) => update({ months: Number(s) })}
              />
              <Field
                label="Baseline full paying players"
                type="number"
                value={String(plan.budget.baseline)}
                onChange={(s) => update({ baseline: Number(s) })}
              />
              {(
                [
                  ["membershipMonthly", "Membership / facility per player per month"],
                  ["fullOrg", "Organization fee per full player"],
                  ["poOrg", "Organization fee per pitcher-only player"],
                  ["fullIncremental", "Other direct cost per full player (exclude uniform)"],
                  ["poIncremental", "Other direct cost per pitcher-only player (exclude uniform)"],
                  ["poSharedAllocation", "Pitcher-only shared-cost allocation"],
                  ["serviceCostMonthly", "Membership service cost per player per month"],
                  ["overhead", "Manual season overhead estimate / override"],
                  ["reserve", "Required business reserve contribution"],
                  ["processingFixed", "Fixed processing cost per payment"],
                ] as const
              ).map(([key, label]) => (
                <Dollars
                  key={key}
                  label={label}
                  value={plan.budget[key]}
                  onChange={(v) => update({ [key]: v })}
                />
              ))}
              {(
                [
                  ["contingencyBps", "Contingency (%)"],
                  ["processingBps", "Processing rate (%)"],
                  ["nolanBps", "Nolan ownership (%) — Steve receives remainder"],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  type="number"
                  value={String(plan.budget[key] / 100)}
                  onChange={(s) => update({ [key]: Math.round(Number(s) * 100) })}
                />
              ))}
            </div>
            <p className="text-xs">
              Membership service costs reduce contribution separately; do not include those costs
              again in facility overhead. Processing is included in the published fee, with a
              three-payment allowance.
            </p>
          </Panel>
          <Panel title="Direct team costs">
            <Field
              label="Head coach premium (%)"
              type="number"
              value={String((plan.budget.headPremiumBps || 0) / 100)}
              onChange={(s) => update({ headPremiumBps: Math.round(Number(s) * 100) })}
            />
            <Field
              label="Assistant coach premium (%)"
              type="number"
              value={String((plan.budget.assistantPremiumBps || 0) / 100)}
              onChange={(s) => update({ assistantPremiumBps: Math.round(Number(s) * 100) })}
            />
            <p className="text-sm">
              Matrix coaching totals apply to every paid coach, including owners. Admin premiums up
              to 25% add to the matrix coaching cost lines.
            </p>
            <Dollars
              label="Round player fee upward to"
              value={plan.budget.roundTo || 0}
              onChange={(roundTo) => update({ roundTo })}
            />
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={plan.budget.scheduleCostsAutomatic || false}
                onChange={(e) => update({ scheduleCostsAutomatic: e.target.checked })}
              />
              Calculate entry budget from selected / scheduled events
            </label>
            {plan.budget.scheduleCostsAutomatic && (
              <p className="text-sm">
                Tournament entry total below is recalculated from saved events. Enter a tournament's
                fee once, with $0 on its individual games. Admins can disable automatic entry totals
                for a manual budget.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {master?.gas.map((gas, i) => (
                <Button
                  key={i}
                  variant="outlineDark"
                  onClick={() =>
                    update({
                      costs: plan.budget.costs.map((c) =>
                        c.id === "cost-3" ? { ...c, cents: gas } : c,
                      ),
                    })
                  }
                >
                  {["Local gas", "Limited OKC", "Regional", "Heavy regional"][i]} · {money(gas)}
                </Button>
              ))}
            </div>
            <Dollars
              label="Nightly hotel stipend"
              value={plan.budget.hotelNightly || 0}
              onChange={(hotelNightly) => update({ hotelNightly })}
            />
            <p>
              {plan.budget.hotelNights || 0} overnight stays ×{" "}
              {money(plan.budget.hotelNightly || 0)} ={" "}
              <strong>
                {money((plan.budget.hotelNights || 0) * (plan.budget.hotelNightly || 0))}
              </strong>{" "}
              season hotel stipend.
            </p>
            <p className="text-sm">
              Automatically added to shared team costs from non-cancelled travel games and
              tournaments within these season dates. Save after changing season dates to recalculate
              nights. Do not enter the same stipend again under Hotels or Coach travel. Schedule
              changes update draft fees; publish after review. Accepted player fees remain locked.
            </p>
            {plan.budget.scheduleCostsAutomatic ? (
              <p>
                Tournament and league entries: <strong>{money(plan.budget.tournament)}</strong>{" "}
                (from saved schedule)
              </p>
            ) : (
              <Dollars
                label="Tournament and league entries"
                value={plan.budget.tournament}
                onChange={(tournament) => update({ tournament })}
              />
            )}
            {plan.budget.costs.map((c, i) => (
              <div key={c.id} className="grid gap-2 sm:grid-cols-2">
                <Field
                  label="Expense category"
                  value={c.name}
                  onChange={(name) =>
                    update({
                      costs: plan.budget.costs.map((x, j) => (j === i ? { ...x, name } : x)),
                    })
                  }
                />
                <Dollars
                  label={c.name}
                  value={c.cents}
                  onChange={(cents) =>
                    update({
                      costs: plan.budget.costs.map((x, j) => (j === i ? { ...x, cents } : x)),
                    })
                  }
                />
              </div>
            ))}
            <Button
              variant="outlineDark"
              onClick={() =>
                update({
                  costs: [
                    ...plan.budget.costs,
                    { id: crypto.randomUUID(), name: "Additional direct cost", cents: 0 },
                  ],
                })
              }
            >
              Add expense category
            </Button>
          </Panel>
          <Panel title="Uniform packages & coach permissions">
            <p className="text-sm">
              Vendor cost funds the fee calculation. Display price is the coach-facing package
              price; any desired margin belongs in the organization fee.
            </p>
            {plan.uniforms.map((u, i) => (
              <div className="grid gap-2 rounded border p-3 sm:grid-cols-2" key={u.id}>
                <Field
                  label="Package name"
                  value={u.name}
                  onChange={(name) =>
                    setPlan({
                      ...plan,
                      uniforms: plan.uniforms.map((x, j) => (j === i ? { ...x, name } : x)),
                    })
                  }
                />
                <Field
                  label="Included items"
                  value={u.items}
                  onChange={(items) =>
                    setPlan({
                      ...plan,
                      uniforms: plan.uniforms.map((x, j) => (j === i ? { ...x, items } : x)),
                    })
                  }
                />
                <Dollars
                  label="Display price"
                  value={u.price}
                  onChange={(price) =>
                    setPlan({
                      ...plan,
                      uniforms: plan.uniforms.map((x, j) => (j === i ? { ...x, price } : x)),
                    })
                  }
                />
                <Dollars
                  label="Vendor cost"
                  value={u.cost}
                  onChange={(cost) => {
                    setPlan({
                      ...plan,
                      uniforms: plan.uniforms.map((x, j) => (j === i ? { ...x, cost } : x)),
                      budget: {
                        ...plan.budget,
                        uniformCost:
                          plan.budget.uniformId === u.id ? cost : plan.budget.uniformCost,
                      },
                    });
                  }}
                />
                <UniformPhotoEditor
                  name={u.name}
                  photos={u.photos}
                  disabled={busy || photoUploads > 0 || plan.status === "closed"}
                  onProcessing={(working) => setPhotoUploads((n) => n + (working ? 1 : -1))}
                  onChange={(photos) =>
                    setPlan((current) =>
                      current
                        ? {
                            ...current,
                            uniforms: current.uniforms.map((x) =>
                              x.id === u.id ? { ...x, photos } : x,
                            ),
                          }
                        : current,
                    )
                  }
                />
                <label>
                  <input
                    type="checkbox"
                    checked={u.active}
                    onChange={(e) =>
                      setPlan({
                        ...plan,
                        uniforms: plan.uniforms.map((x, j) =>
                          j === i ? { ...x, active: e.target.checked } : x,
                        ),
                      })
                    }
                  />{" "}
                  Active package
                </label>
              </div>
            ))}
            <Button
              variant="outlineDark"
              onClick={() =>
                setPlan({
                  ...plan,
                  uniforms: [
                    ...plan.uniforms,
                    {
                      id: crypto.randomUUID(),
                      name: "New package",
                      items: "",
                      price: 0,
                      cost: 0,
                      active: true,
                    },
                  ],
                })
              }
            >
              Add uniform package
            </Button>
            <label>
              Selected uniform
              <select
                className="office-control w-full"
                value={plan.budget.uniformId}
                onChange={(e) =>
                  update({
                    uniformId: e.target.value,
                    uniformCost: plan.uniforms.find((u) => u.id === e.target.value)?.cost || 0,
                  })
                }
              >
                <option value="">No package</option>
                {plan.uniforms
                  .filter((u) => u.active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={plan.budget.coachTournament}
                onChange={(e) => update({ coachTournament: e.target.checked })}
              />{" "}
              Coach may propose tournament / league budget
            </label>
            <label>
              <input
                type="checkbox"
                checked={plan.budget.coachUniform}
                onChange={(e) => update({ coachUniform: e.target.checked })}
              />{" "}
              Coach may propose uniform package
            </label>
          </Panel>
          <Panel title="Payment deadlines & written policy">
            <PaymentScheduleEditor
              budget={plan.budget}
              update={update}
              full={preview?.full || 0}
              po={preview?.po || 0}
              final={deadline(plan.budget, team.events)}
            />
            <Field
              label="Days before first tournament that final payment is due"
              type="number"
              value={String(plan.budget.daysBeforeTournament ?? 28)}
              onChange={(v) => update({ daysBeforeTournament: Number(v) })}
            />
            <p>
              Uses the earliest tournament assigned to this team. Add the tournament to the team
              schedule first, or enter an explicit final deadline override.
            </p>
            <label>
              Legacy payment-trigger competition (used only for older schedules)
              <select
                className="office-control w-full"
                value={plan.budget.triggerEventId}
                onChange={(e) => update({ triggerEventId: e.target.value })}
              >
                <option value="">Select scheduled event</option>
                {team.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.start}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Calculated final deadline:{" "}
              {deadline({ ...plan.budget, deadlineOverride: "" }, team.events) || "Select an event"}
            </p>
            {(
              [
                ["deadlineOverride", "Final deadline override"],

                ["uniformCutoff", "Uniform order cutoff"],
              ] as const
            ).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                type="date"
                value={plan.budget[key]}
                onChange={(v) => update({ [key]: v })}
              />
            ))}
            {(
              [
                ["graceDays", "Grace period (days overdue)"],
                ["holdDays", "Roster hold eligibility (days overdue)"],
                ["removalDays", "Removal eligibility (days overdue)"],
              ] as const
            ).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                type="number"
                value={String(plan.budget[key])}
                onChange={(v) => update({ [key]: Number(v) })}
              />
            ))}
            <Dollars
              label="Policy late fee (requires admin review)"
              value={plan.budget.lateFee}
              onChange={(lateFee) => update({ lateFee })}
            />
            <label>
              Approved payment / refund policy
              <textarea
                className="office-control w-full"
                rows={6}
                value={plan.budget.policy}
                onChange={(e) => update({ policy: e.target.value })}
              />
            </label>
            <label>
              Reinstatement rules
              <textarea
                className="office-control w-full"
                rows={3}
                value={plan.budget.reinstatement}
                onChange={(e) => update({ reinstatement: e.target.value })}
              />
            </label>
            <p className="text-sm">
              Overdue status never automatically removes a player or charges a late fee. Front
              Office reviews and applies roster actions.
            </p>
          </Panel>
          {preview && (
            <Panel title="Fee calculator & profitability" open>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Projected full players"
                  type="number"
                  value={String(full)}
                  onChange={(s) => setFull(Number(s))}
                />
                <Field
                  label="Projected pitcher-only players"
                  type="number"
                  value={String(po)}
                  onChange={(s) => setPo(Number(s))}
                />
              </div>
              <Numbers
                rows={[
                  ["Full-player fee", preview.full],
                  ["Pitcher-only fee", preview.po],

                  [
                    "Baseline direct team costs",
                    preview.fixed +
                      plan.budget.baseline *
                        (plan.budget.uniformCost + plan.budget.fullIncremental),
                  ],
                  ["Protected baseline team budget", preview.protectedBudget],
                  ["Total player revenue", preview.totalRevenue],
                  ["Direct costs for projected roster", preview.direct],
                  ["Contingency reserve", preview.reserve],
                  ["Membership / facility revenue — all players", preview.membership],
                  ["Organization revenue — all players", preview.organization],
                  ["Additional-player revenue", preview.extraRevenue],
                  ["Additional-player incremental costs", preview.extraCosts],
                  [
                    "Additional-player contribution (includes their membership & org revenue)",
                    preview.extraContribution,
                  ],
                  ["Processing allocation", preview.processing],
                  ["Membership service costs", preview.serviceCosts],
                  ["Projected team contribution", preview.contribution],
                  ["Contingency used", preview.used],
                  ["Potential unused contingency", preview.remaining],
                  ["Unexpected expense above reserve", preview.unexpected],
                  ["Projected profit before facility overhead", preview.beforeOverhead],
                  ["Allocated facility overhead", plan.budget.overhead],
                  ["Projected net business profit", preview.net],
                  ["Required business reserve", plan.budget.reserve],
                  ["Projected distributable profit", preview.distributable],
                  ["Nolan projected distribution", preview.nolan],
                  ["Steve projected distribution", preview.steve],
                  ["Baseline funding shortfall", preview.baselineShortfall],
                ]}
              />
              <p className="text-sm">
                Additional contribution already contains the extra players’ membership and
                organization allocations. Do not add it again to all-player revenue totals.
                Contingency stays protected until season close. Projections are not permission to
                distribute cash.
              </p>
            </Panel>
          )}
          <Panel title="Actual expenses & season reconciliation">
            <p className="text-sm">
              Record all actual team expenses, including per-player service and processing costs.
              Facility overhead is accounted for separately above.
            </p>
            {plan.expenses.map((e, i) => (
              <div key={e.id} className="grid gap-2 rounded border p-3 sm:grid-cols-2">
                <Field
                  label="Expense description"
                  value={e.name}
                  onChange={(name) =>
                    setPlan({
                      ...plan,
                      expenses: plan.expenses.map((x, j) => (j === i ? { ...x, name } : x)),
                    })
                  }
                />
                <Dollars
                  label="Actual amount"
                  value={e.cents}
                  onChange={(cents) =>
                    setPlan({
                      ...plan,
                      expenses: plan.expenses.map((x, j) => (j === i ? { ...x, cents } : x)),
                    })
                  }
                />
                <Field
                  label="Expense date"
                  type="date"
                  value={e.date}
                  onChange={(date) =>
                    setPlan({
                      ...plan,
                      expenses: plan.expenses.map((x, j) => (j === i ? { ...x, date } : x)),
                    })
                  }
                />
                {(["paid", "contingency"] as const).map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={e[key]}
                      onChange={(ev) =>
                        setPlan({
                          ...plan,
                          expenses: plan.expenses.map((x, j) =>
                            j === i ? { ...x, [key]: ev.target.checked } : x,
                          ),
                        })
                      }
                    />
                    {key === "paid" ? "Paid" : "Unexpected expense charged against contingency"}
                  </label>
                ))}
              </div>
            ))}
            <Button
              variant="outlineDark"
              onClick={() =>
                setPlan({
                  ...plan,
                  expenses: [
                    ...plan.expenses,
                    {
                      id: crypto.randomUUID(),
                      name: "Actual expense",
                      cents: 0,
                      date: "",
                      paid: false,
                      contingency: false,
                    },
                  ],
                })
              }
            >
              Add actual expense
            </Button>
            {team.private && (
              <Numbers
                rows={[
                  ["Cash collected", team.private.actual.totalCollected],
                  [
                    "Contingency funded from collected fees (pro rata)",
                    team.private.actual.contingencyFunded,
                  ],
                  ["Funded contingency remaining", team.private.actual.fundedContingencyRemaining],
                  ["Credits applied (not cash)", team.private.actual.totalCredits],
                  ["Actual expenses paid", team.private.actual.expensesPaid],
                  ["Actual expenses unpaid", team.private.actual.expensesUnpaid],
                  ["Membership earned by service delivery", team.private.actual.earned],
                  ["Membership not yet earned", team.private.actual.deferred],
                  [
                    "Potential actual distributable profit after close",
                    team.private.actual.actualDistributable,
                  ],
                  ["Nolan actual allocation", team.private.actual.nolan],
                  ["Steve actual allocation", team.private.actual.steve],
                ]}
              />
            )}
          </Panel>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || photoUploads > 0 || plan.status === "closed"}
              onClick={() =>
                void act({
                  ...base,
                  action: "save",
                  budget: plan.budget,
                  uniforms: plan.uniforms,
                  expenses: plan.expenses,
                })
              }
            >
              Save draft & expenses
            </Button>
            <Button
              variant="outlineDark"
              disabled={busy || photoUploads > 0 || plan.status === "closed"}
              onClick={() => {
                if (JSON.stringify(plan) !== JSON.stringify(team.private?.plan)) {
                  setError("Save your changes before publishing.");
                  return;
                }
                if (
                  window.confirm(
                    "Approve the saved budget, written policy, and publish these fees to team families? Existing signed fees stay unchanged.",
                  )
                )
                  void act({ ...base, action: "publish", confirmed: true });
              }}
            >
              Approve & publish fees
            </Button>
            <Button
              variant="outlineDark"
              disabled={busy || photoUploads > 0 || plan.status === "closed"}
              onClick={() => {
                if (JSON.stringify(plan) !== JSON.stringify(team.private?.plan)) {
                  setError("Save expenses before closing.");
                  return;
                }
                if (
                  window.confirm(
                    "Confirm all expenses, refunds, processing, overhead and reserves are recorded and satisfied. Close this season financially? This does not send owner payments.",
                  )
                )
                  void act({ ...base, action: "close", confirmed: true });
              }}
            >
              Financially close season
            </Button>
          </div>
        </>
      )}
      <Panel title="Player payments & uniform readiness" open>
        {!team.players.length ? (
          <p>No roster players yet.</p>
        ) : (
          team.players.map((p) => (
            <article key={p.id} className="grid gap-2 rounded-xl border p-3">
              <h3 className="text-xl">{p.name}</h3>
              <p>
                {p.role === "po" ? "Pitcher only" : "Full player"} · {p.rosterStatus} · {p.status}
                {p.signed ? " · Agreed fee" : " · Fee not yet accepted"}
              </p>
              <Numbers
                rows={[
                  ["Total fee", p.total],
                  ["Paid", p.paid],
                  ["Credits", p.credit],
                  ["Remaining balance", p.balance],
                ]}
              />
              {p.rows.map((r) => (
                <p className="text-sm" key={r.label}>
                  {r.label}: {money(r.amount)} · {r.due || "At roster acceptance"} ·{" "}
                  {r.remaining ? money(r.remaining) + " remaining" : "Paid"}
                </p>
              ))}
              <p className="text-sm">
                Uniform order:{" "}
                {p.uniformReady
                  ? "Deposit paid and roster confirmed"
                  : "Withheld until deposit is paid and roster is confirmed"}
                {p.uniformCutoff ? " · cutoff " + p.uniformCutoff : ""}
              </p>
              {team.access === "admin" &&
                p.agreedLateFee > 0 &&
                !p.lateFeeApplied &&
                p.days > 0 && (
                  <Button
                    disabled={busy}
                    variant="outlineDark"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Apply the one-time late fee of " +
                            money(p.agreedLateFee) +
                            " from this family’s accepted policy?",
                        )
                      )
                        void act({ ...base, action: "lateFee", playerId: p.id });
                    }}
                  >
                    Review & apply agreed late fee
                  </Button>
                )}
              {team.access === "admin" && p.signed && p.balance > 0 && (
                <details>
                  <summary className="min-h-11 cursor-pointer">
                    Record payment received outside the website
                  </summary>
                  <form
                    className="grid gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      setBusy(true);
                      try {
                        await recordTeamPayment({
                          data: {
                            teamId: team.id,
                            playerId: p.id,
                            amount: Number(f.get("amount")),
                            method: String(f.get("method")),
                            label: String(f.get("reference")),
                          },
                        });
                        await refresh();
                        notify("External payment recorded. No card was charged.");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Could not record payment.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <p className="text-sm">
                      Use only after verifying receipt. This records a payment; it does not charge a
                      card or send an invoice.
                    </p>
                    <label>
                      Amount received ($)
                      <input
                        name="amount"
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={p.balance / 100}
                        className="office-control w-full"
                      />
                    </label>
                    <label>
                      Payment method
                      <select name="method" className="office-control w-full">
                        <option>Cash</option>
                        <option>Check</option>
                        <option>Square invoice</option>
                        <option>Bank transfer</option>
                      </select>
                    </label>
                    <label>
                      Receipt / reference
                      <input
                        name="reference"
                        required
                        maxLength={200}
                        className="office-control w-full"
                      />
                    </label>
                    <Button disabled={busy}>Record verified payment</Button>
                  </form>
                </details>
              )}
              {p.acceptedPolicy && (
                <details>
                  <summary>Accepted payment policy</summary>
                  <p className="whitespace-pre-wrap text-sm">{p.acceptedPolicy}</p>
                </details>
              )}
              {p.uniformReleasedAt ? (
                <p>Uniform released for ordering: {p.uniformReleasedAt.slice(0, 10)}</p>
              ) : (
                team.access === "admin" && (
                  <Button
                    disabled={busy || !p.uniformReady || !p.signed}
                    variant="outlineDark"
                    onClick={() => void act({ ...base, action: "releaseUniform", playerId: p.id })}
                  >
                    Release uniform for ordering
                  </Button>
                )
              )}
              {team.access === "admin" && (
                <label>
                  Roster action
                  <select
                    className="office-control w-full"
                    disabled={busy}
                    value={p.rosterStatus}
                    onChange={(e) => {
                      const status = e.target.value as
                        "Confirmed" | "Roster Hold" | "Removed" | "Invited";
                      const note = window.prompt(
                        "Reason for this roster action (recorded in the audit history)",
                      );
                      if (note)
                        void act({ ...base, action: "roster", playerId: p.id, status, note });
                    }}
                  >
                    <option>Invited</option>
                    <option>Confirmed</option>
                    <option>Roster Hold</option>
                    <option>Removed</option>
                  </select>
                </label>
              )}
              {team.access === "admin" && !p.signed && (
                <label>
                  Player fee type
                  <select
                    className="office-control w-full"
                    disabled={busy}
                    value={p.role}
                    onChange={(e) =>
                      void act({
                        ...base,
                        action: "playerRole",
                        playerId: p.id,
                        role: e.target.value as "full" | "po",
                      })
                    }
                  >
                    <option value="full">Full player</option>
                    <option value="po">Pitcher only</option>
                  </select>
                </label>
              )}
              {p.canAccept && !p.signed && publication && (
                <div className="grid gap-2">
                  <Field label="Guardian full name" value={name} onChange={setName} />
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />{" "}
                    I accept the published fee, payment schedule, and payment/refund policy above.
                  </label>
                  <Button
                    disabled={busy || !consent || name.trim().length < 3}
                    onClick={() =>
                      void act({ ...base, action: "accept", playerId: p.id, consent: true, name })
                    }
                  >
                    Accept season fee
                  </Button>
                </div>
              )}
            </article>
          ))
        )}
      </Panel>
    </div>
  );
}
function BusinessModel({
  teams,
  value,
  revision,
  refresh,
}: {
  teams: TeamView[];
  value: FeeBusiness;
  revision: number;
  refresh: () => Promise<void>;
}) {
  const [v, setV] = useState(value),
    [error, setError] = useState("");
  const chosen = v.teamIds
    .map((id) => teams.find((t) => t.id === id))
    .filter((t): t is TeamView => Boolean(t?.private && !t.closed));
  const projections = chosen.map((t) =>
    project(
      t.private!.plan.budget,
      t.private!.plan.budget.baseline,
      0,
      t.private!.plan.expenses,
      t.status === "closed",
    ),
  );
  return (
    <Panel title="Organization-wide 1–5 team model">
      <p className="text-sm">
        Select teams in scenario order and one reporting period. Each selected team uses its
        baseline full-player roster. Fixed overhead below is counted once per scenario, replacing
        team allocations. Do not combine unlike reporting periods.
      </p>
      <Field
        label="Reporting period"
        value={v.period}
        onChange={(period) => setV({ ...v, period })}
      />
      <Dollars
        label="Fixed facility / business overhead for this period"
        value={v.overhead}
        onChange={(overhead) => setV({ ...v, overhead })}
      />
      <Dollars
        label="Required reserve for this period"
        value={v.reserve}
        onChange={(reserve) => setV({ ...v, reserve })}
      />
      <Field
        label="Nolan ownership (%)"
        type="number"
        value={String(v.nolanBps / 100)}
        onChange={(s) => setV({ ...v, nolanBps: Math.round(Number(s) * 100) })}
      />
      {teams
        .filter((t) => !t.closed)
        .map((t) => (
          <label key={t.id}>
            <input
              type="checkbox"
              checked={v.teamIds.includes(t.id)}
              onChange={(e) =>
                setV({
                  ...v,
                  teamIds: e.target.checked
                    ? [...v.teamIds, t.id]
                    : v.teamIds.filter((id) => id !== t.id),
                })
              }
            />{" "}
            {t.name}
            {v.teamIds.includes(t.id) ? " · scenario order " + (v.teamIds.indexOf(t.id) + 1) : ""}
          </label>
        ))}
      {[
        ...new Set([
          ...Array.from({ length: Math.min(5, projections.length) }, (_, i) => i + 1),
          projections.length,
        ]),
      ]
        .filter(Boolean)
        .map((n) => {
          const r = businessProjection(projections.slice(0, n), v.overhead, v.reserve, v.nolanBps);
          return (
            <Panel
              key={n}
              title={
                n +
                " active team" +
                (n === 1 ? "" : "s") +
                (n === projections.length ? " · all selected" : "")
              }
            >
              <Numbers
                rows={[
                  ["Team revenue", r.revenue],
                  ["Membership revenue", r.membership],
                  ["Organization revenue", r.organization],
                  ["Direct costs", r.direct],
                  ["Contingencies", r.contingency],
                  ["Facility overhead", r.overhead],
                  ["Net business profit", r.net],
                  ["Distributable profit projection", r.distributable],
                  ["Nolan", r.nolan],
                  ["Steve", r.steve],
                ]}
              />
            </Panel>
          );
        })}
      {error && <p role="alert">{error}</p>}
      <Button
        onClick={async () => {
          try {
            await saveFeeBusiness({ data: { revision, value: v } });
            await refresh();
            setError("Assumptions saved.");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          }
        }}
      >
        Save business assumptions
      </Button>
    </Panel>
  );
}

function PaymentScheduleEditor({
  budget,
  update,
  full,
  po,
  final,
}: {
  budget: FeeBudget;
  update: (p: Partial<FeeBudget>) => void;
  full: number;
  po: number;
  final: string;
}) {
  const schedule = budget.paymentSchedule;
  if (!schedule)
    return (
      <div className="grid gap-2">
        <p>Current default: 40% deposit, 30% second payment, 30% final payment.</p>
        <Field
          label="Second payment due"
          type="date"
          value={budget.secondDue}
          onChange={(secondDue) => update({ secondDue })}
        />
        <Button
          type="button"
          onClick={() =>
            update({
              paymentSchedule: {
                mode: "percent",
                rows: [
                  { full: 4000, po: 4000, due: "" },
                  { full: 3000, po: 3000, due: budget.secondDue },
                  { full: 3000, po: 3000, due: "" },
                ],
              },
              triggerEventId: "",
            })
          }
        >
          Customize this team’s payments
        </Button>
      </div>
    );
  const set = (value: typeof schedule) => update({ paymentSchedule: value });
  let error = "";
  let fullRows: ReturnType<typeof scheduleRows> = [],
    poRows: ReturnType<typeof scheduleRows> = [];
  try {
    fullRows = scheduleRows(budget, full, "full", final);
    poRows = scheduleRows(budget, po, "po", final);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <section className="grid gap-3">
      <h3 className="text-xl">Per-player payment schedule</h3>
      <p>
        Deposit is due when the guardian accepts. Choose 1–12 subsequent payments. Each player type
        must total its complete fee; the final percentage payment absorbs cent rounding. Existing
        signed agreements are preserved.
      </p>
      <label>
        Set payments as
        <select
          className="office-control w-full"
          value={schedule.mode}
          onChange={(e) =>
            set({
              ...schedule,
              mode: e.target.value as "percent" | "amount",
              rows: schedule.rows.map((r, i) => ({
                ...r,
                full:
                  e.target.value === "amount"
                    ? fullRows[i]?.amount || 0
                    : Math.floor(10000 / schedule.rows.length) +
                      (i === schedule.rows.length - 1 ? 10000 % schedule.rows.length : 0),
                po:
                  e.target.value === "amount"
                    ? poRows[i]?.amount || 0
                    : Math.floor(10000 / schedule.rows.length) +
                      (i === schedule.rows.length - 1 ? 10000 % schedule.rows.length : 0),
              })),
            })
          }
        >
          <option value="percent">Percentages</option>
          <option value="amount">Dollar amounts</option>
        </select>
      </label>
      <Field
        label="Number of subsequent payments"
        type="number"
        value={String(schedule.rows.length - 1)}
        onChange={(v) => {
          const count = Math.max(1, Math.min(12, Number(v) || 1)) + 1;
          set({
            ...schedule,
            rows: Array.from(
              { length: count },
              (_, i) => schedule.rows[i] || { full: 0, po: 0, due: "" },
            ),
          });
        }}
      />
      {schedule.rows.map((r, i) => (
        <fieldset key={i} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
          <legend>
            {i === 0
              ? "Deposit"
              : i === schedule.rows.length - 1
                ? "Final payment"
                : `Payment ${i + 1}`}
          </legend>
          {(["full", "po"] as const).map((role) => (
            <Field
              key={role}
              label={`${role === "full" ? "Full player" : "Pitcher only"} ${schedule.mode === "percent" ? "(%)" : "($)"}`}
              type="number"
              value={String(r[role] / 100)}
              onChange={(v) =>
                set({
                  ...schedule,
                  rows: schedule.rows.map((x, j) =>
                    j === i ? { ...x, [role]: Math.round(Number(v) * 100) } : x,
                  ),
                })
              }
            />
          ))}
          {i > 0 && i < schedule.rows.length - 1 ? (
            <Field
              label={`Payment ${i + 1} due`}
              type="date"
              value={r.due}
              onChange={(due) =>
                set({
                  ...schedule,
                  rows: schedule.rows.map((x, j) => (j === i ? { ...x, due } : x)),
                })
              }
            />
          ) : (
            <p>
              {i === 0
                ? "Due at acceptance"
                : `Due ${final || "after a tournament or deadline is selected"}`}
            </p>
          )}
        </fieldset>
      ))}
      {error ? (
        <p role="alert" className="text-maroon">
          {error} Full fee {money(full)} · Pitcher-only fee {money(po)}. Save a draft at any time;
          correct totals before publishing.
        </p>
      ) : (
        <Numbers
          rows={fullRows.map((r, i) => [
            `${r.label} — full / PO ${money(poRows[i].amount)}`,
            r.amount,
          ])}
        />
      )}
    </section>
  );
}
