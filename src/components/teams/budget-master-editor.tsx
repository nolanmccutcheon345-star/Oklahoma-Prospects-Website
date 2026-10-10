import { facilityMonthly, initialFacilityCosts } from "@/lib/teams/facility-overhead";
import { OverheadRuleEditor } from "./overhead-rule-editor";
import { useEffect, useState } from "react";
import { getBudgetMaster, saveBudgetMaster } from "@/lib/teams/fee-api";
import {
  rowKey,
  seasonNames,
  allocateMonthlyBusiness,
  type MasterMatrix,
  type MatrixRow,
} from "@/lib/teams/budget-matrix";
import { money, project, defaultPOOrganization } from "@/lib/teams/fee-model";
import { Button } from "../ui/button";
import type { getFeeWorkspace } from "@/lib/teams/fee-api";
type Teams = Awaited<ReturnType<typeof getFeeWorkspace>>["teams"];
export function BudgetMasterEditor({ teams }: { teams: Teams }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getBudgetMaster>>>(),
    [key, setKey] = useState("baseball:6:winter"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [person, setPerson] = useState(""),
    [month, setMonth] = useState(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(new Date())
        .slice(0, 7),
    );
  useEffect(() => {
    getBudgetMaster()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (!data)
    return <p role={error ? "alert" : undefined}>{error || "Loading master budget defaults…"}</p>;
  const m = data.value,
    row = m.rows.find((r) => rowKey(r) === key)!;
  const patch = (p: Partial<MasterMatrix>) =>
    setData({
      ...data,
      value: {
        ...m,
        facilityCosts: m.facilityCosts || initialFacilityCosts(m.monthlyOverhead),
        ...p,
      },
    });
  const cell = (p: Partial<MatrixRow>) =>
    patch({ rows: m.rows.map((r) => (rowKey(r) === key ? { ...r, ...p } : r)) });
  const field = (label: string, value: number, change: (n: number) => void, scale = 100) => (
    <label className="grid min-w-0 gap-1 text-sm" key={label}>
      {label}
      <input
        className="office-control min-w-0 w-full"
        type="number"
        min={0}
        step={scale === 100 ? "0.01" : "0.1"}
        value={value / scale}
        onChange={(e) =>
          change(
            scale === 100
              ? Math.round(Number(e.target.value) * scale)
              : Number(e.target.value) * scale,
          )
        }
      />
    </label>
  );
  const eligible = teams.filter(
    (t) =>
      !t.closed &&
      t.private &&
      (!t.private.plan.budget.start || t.private.plan.budget.start.slice(0, 7) <= month) &&
      (!t.private.plan.budget.end || t.private.plan.budget.end.slice(0, 7) >= month),
  );
  const report = allocateMonthlyBusiness(
    m,
    eligible.map((t) => {
      const paying = t.players.filter(
        (p) => p.signed && p.paid > 0 && p.rosterStatus !== "Removed",
      );
      const b = t.private!.plan.budget;
      return {
        id: t.id,
        name: t.name,
        players: paying.length,
        overheadRule: b.overheadRule,
        contribution: Math.round(
          project(
            b,
            paying.filter((p) => p.role === "full").length,
            paying.filter((p) => p.role === "po").length,
          ).beforeOverhead / b.months,
        ),
      };
    }),
  );
  return (
    <details className="my-4 rounded-xl border bg-white p-4">
      <summary className="min-h-11 cursor-pointer text-xl">Master budget defaults</summary>
      <div className="mt-3 grid gap-4">
        <p>
          New 6U–17U teams receive the matching sport, age and season row. Changes here apply to
          future team cost snapshots; overhead contribution defaults apply to teams using the master
          rule. Existing team overrides and accepted fees stay intact. No match means manual admin
          setup.
        </p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <label className="grid gap-1">
          Matrix row
          <select
            className="office-control w-full"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          >
            {m.rows.map((r) => (
              <option key={rowKey(r)} value={rowKey(r)}>
                {r.sport} · {r.age}U · {seasonNames[r.season]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Season months", row.months, (n) => cell({ months: n }), 1)}
          {(
            [
              "head",
              "assistant",
              "organization",
              "insurance",
              "background",
              "balls",
              "equipment",
              "operations",
              "misc",
              "fields",
            ] as const
          ).map((k) =>
            field(
              {
                head: "Head coach — season ($)",
                assistant: "Assistant coach — season ($)",
                organization: "Organization fee per full player ($)",
                insurance: "Team insurance ($)",
                background: "Background checks ($)",
                balls: "Practice / game balls ($)",
                equipment: "Equipment ($)",
                operations: "Team operations ($)",
                misc: "Miscellaneous ($)",
                fields: "Outdoor fields ($)",
              }[k],
              row[k],
              (n) => cell({ [k]: n }),
            ),
          )}
        </div>
        {field(
          "PO organization fee for this age / season ($)",
          row.poOrganization ?? defaultPOOrganization(row.organization),
          (n) => cell({ poOrganization: n }),
        )}
        <p className="text-sm">
          PO organization defaults to 60% of the full-player fee, rounded up to $25. This field is
          an admin override.
        </p>
        <p className="text-sm">
          All PO cost allocations default to 100%. Reducing them causes other players or
          organization profit to subsidize the PO’s costs.
        </p>
        <label className="grid gap-1 text-sm">
          Admin reason for PO subsidy / zero organization fee
          <textarea
            className="office-control w-full"
            value={m.poOverrideReason || ""}
            onChange={(e) => patch({ poOverrideReason: e.target.value })}
          />
        </label>
        <h3>Common defaults</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Baseline full-paying players", m.baseline, (n) => patch({ baseline: n }), 1)}
          {field("Membership / facility per full player per month ($)", m.membershipMonthly, (n) =>
            patch({ membershipMonthly: n }),
          )}
          {field(
            "Membership / facility per pitcher-only player per month ($)",
            m.poMembershipMonthly ?? 15000,
            (n) => patch({ poMembershipMonthly: n }),
          )}
          {(
            [
              ["poTeamBps", "PO team-cost allocation (%)"],
              ["poUniformBps", "PO uniform cost allocation (%)"],
              ["poContingencyBps", "PO contingency allocation (%)"],
              ["poProcessingBps", "PO processing allocation (%)"],
            ] as const
          ).map(([k, label]) => field(label, m[k] ?? 10000, (n) => patch({ [k]: n })))}
          {field("Contingency (%)", m.contingencyBps, (n) => patch({ contingencyBps: n }))}
          {field("Hotel stipend per night — total, not per coach ($)", m.hotelNightly, (n) =>
            patch({ hotelNightly: n }),
          )}
          {field("Round player fee upward to ($)", m.roundTo, (n) => patch({ roundTo: n }))}
          {m.gas.map((n, i) =>
            field(
              [
                "Local gas ($)",
                "Limited OKC gas ($)",
                "Regional gas ($)",
                "Heavy regional gas ($)",
              ][i],
              n,
              (v) => patch({ gas: m.gas.map((x, j) => (i === j ? v : x)) }),
            ),
          )}

          {field("Operating reserve target ($)", m.reserveTarget, (n) =>
            patch({ reserveTarget: n }),
          )}
          {field("Current actual operating reserve balance ($)", m.reserveBalance, (n) =>
            patch({ reserveBalance: n }),
          )}
          {field("Reserve contribution until target (%)", m.reserveBps, (n) =>
            patch({ reserveBps: n }),
          )}
          {field("Reserve contribution after target (%)", m.afterTargetBps, (n) =>
            patch({ afterTargetBps: n }),
          )}
        </div>
        <h3>Monthly facility costs & staffing</h3>
        <p className="text-sm">
          Private to admins. Enter recurring monthly costs. Include each staffing expense once,
          either in other staffing or as a named person. Payroll entries are budget estimates;
          saving does not pay anyone or grant access.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(m.facilityCosts || initialFacilityCosts(m.monthlyOverhead)).map((c) =>
            field(c.name + " per month ($)", c.monthly, (n) =>
              patch({
                facilityCosts: (m.facilityCosts || initialFacilityCosts(m.monthlyOverhead)).map(
                  (x) => (x.id === c.id ? { ...x, monthly: n } : x),
                ),
              }),
            ),
          )}
        </div>
        <label className="grid gap-1">
          Add person to staffing budget
          <select
            className="office-control w-full"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="">Select an existing account</option>
            {(data.people || [])
              .filter((p) => !(m.payroll || []).some((x) => x.userId === p.userId))
              .map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name} · {p.role}
                </option>
              ))}
          </select>
        </label>
        <Button
          variant="outlineDark"
          disabled={!person}
          onClick={() => {
            const p = data.people?.find((p) => p.userId === person);
            if (p) {
              patch({
                payroll: [
                  ...(m.payroll || []),
                  { userId: p.userId, name: p.name, monthly: 0, active: true },
                ],
              });
              setPerson("");
            }
          }}
        >
          Add staffing person
        </Button>
        {(m.payroll || []).map((p) => (
          <div key={p.userId} className="grid gap-2 rounded-lg border p-3">
            {field(p.name + " per month ($)", p.monthly, (n) =>
              patch({
                payroll: m.payroll!.map((x) => (x.userId === p.userId ? { ...x, monthly: n } : x)),
              }),
            )}
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={p.active}
                onChange={(e) =>
                  patch({
                    payroll: m.payroll!.map((x) =>
                      x.userId === p.userId ? { ...x, active: e.target.checked } : x,
                    ),
                  })
                }
              />
              Include in monthly staffing total
            </label>
          </div>
        ))}
        <p>
          Total monthly facility overhead: <strong>{money(facilityMonthly(m))}</strong>
        </p>
        <OverheadRuleEditor
          value={m.overheadRule}
          onChange={(overheadRule) => patch({ overheadRule })}
        />
        <p className="text-sm">
          Each team follows this contribution rule unless an admin sets a team override. Percentage
          and fixed contributions run for the team's configured billable season months. Overhead is
          allocated from team revenue and does not create an additional family charge. Existing
          accepted player fees stay locked.
        </p>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={m.overheadReviewed || false}
            onChange={(e) => patch({ overheadReviewed: e.target.checked })}
          />
          Actual recurring facility expenses and staffing have been reviewed, including intentional
          zero amounts.
        </label>
        <p className="text-sm">
          Saving changed expense or staffing amounts clears this confirmation. Save those changes
          first, then confirm the completed review and save again.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await saveBudgetMaster({ data: { revision: data.revision, value: m } });
              setData(await getBudgetMaster());
              window.dispatchEvent(new CustomEvent("budget-master-updated"));
              window.dispatchEvent(new CustomEvent("team-budget-updated"));
              setNotice(
                "Master saved. New-team budgets and inherited overhead settings use these defaults.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save master defaults
        </Button>
        <h3>Monthly business allocation</h3>
        <label>
          Reporting month
          <input
            type="month"
            className="office-control w-full"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <p className="text-sm">
          Projection using active players with accepted fees and recorded payments, within each
          team's season dates. Season contribution is spread across its configured months. Overhead
          uses each team’s override or the master contribution rule. Automatic shares use
          paying-player counts. Reserve uses positive contribution, is limited by net funds and the
          remaining target, and is separate from 15% team contingency. Enter the actual reserve
          balance above; these estimates do not transfer money.
        </p>
        {report.rows.map((r) => (
          <p key={r.id}>
            {r.name}: {r.players} paying players · overhead {money(r.overhead)} · reserve{" "}
            {money(r.reserve)}
          </p>
        ))}
        <p>
          Business overhead: {money(report.overhead)} · Unallocated:{" "}
          {money(report.unallocatedOverhead)} · Allocated above facility costs:{" "}
          {money(report.overallocatedOverhead)} · Reserve contribution: {money(report.reserve)} ·
          Projected distributable after overhead and reserve: {money(report.distributable)}
        </p>
      </div>
    </details>
  );
}
