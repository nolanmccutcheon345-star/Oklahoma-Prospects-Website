import { useEffect, useState } from "react";
import { getBudgetMaster, saveBudgetMaster } from "@/lib/teams/fee-api";
import {
  rowKey,
  seasonNames,
  allocateMonthlyBusiness,
  type MasterMatrix,
  type MatrixRow,
} from "@/lib/teams/budget-matrix";
import { money, project } from "@/lib/teams/fee-model";
import { Button } from "../ui/button";
import type { getFeeWorkspace } from "@/lib/teams/fee-api";
type Teams = Awaited<ReturnType<typeof getFeeWorkspace>>["teams"];
export function BudgetMasterEditor({ teams }: { teams: Teams }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getBudgetMaster>>>(),
    [key, setKey] = useState("baseball:6:winter"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
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
  const patch = (p: Partial<MasterMatrix>) => setData({ ...data, value: { ...m, ...p } });
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
          future teams; existing team overrides and accepted fees stay intact. No match means manual
          admin setup.
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
        <h3>Common defaults</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Baseline full-paying players", m.baseline, (n) => patch({ baseline: n }), 1)}
          {field("Membership per player per month ($)", m.membershipMonthly, (n) =>
            patch({ membershipMonthly: n }),
          )}
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
          {field("Monthly facility overhead ($)", m.monthlyOverhead, (n) =>
            patch({ monthlyOverhead: n }),
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
              setNotice("Master saved. New teams will use these defaults.");
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
          is allocated once by paying-player count. Reserve uses positive contribution, is limited
          by net funds and the remaining target, and is separate from 15% team contingency. Enter
          the actual reserve balance above; these estimates do not transfer money.
        </p>
        {report.rows.map((r) => (
          <p key={r.id}>
            {r.name}: {r.players} paying players · overhead {money(r.overhead)} · reserve{" "}
            {money(r.reserve)}
          </p>
        ))}
        <p>
          Business overhead: {money(report.overhead)} · Unallocated:{" "}
          {money(report.unallocatedOverhead)} · Reserve contribution: {money(report.reserve)} ·
          Projected distributable after overhead and reserve: {money(report.distributable)}
        </p>
      </div>
    </details>
  );
}
