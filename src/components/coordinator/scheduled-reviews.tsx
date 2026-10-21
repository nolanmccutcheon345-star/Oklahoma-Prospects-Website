import { useEffect, useState } from "react";
import { getScheduledCoordinatorReviews } from "@/lib/coordinator/api";
import { Button } from "../ui/button";
export function ScheduledCoordinatorReviews() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getScheduledCoordinatorReviews>>>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void getScheduledCoordinatorReviews()
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="grid gap-3" aria-label="Scheduled coordinator reviews">
      <h3 className="text-xl">Scheduled Integrity &amp; Activity Reports</h3>
      <p>
        Daily checks, weekly activity, monthly management, and quarterly access reports appear here
        after the scheduled worker runs. Reports never grant or change permissions. Email delivery
        uses the existing owner-alert settings and rechecks reviewer authority before sending.
      </p>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setRows(await getScheduledCoordinatorReviews());
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load reports.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Refresh Scheduled Reports
      </Button>
      {error && <p role="alert">{error}</p>}
      {!rows && !error && <p role="status">Loading scheduled reports…</p>}
      {rows && !rows.length && (
        <p>
          No scheduled review receipts yet. This does not confirm that integrity checks have run.
        </p>
      )}
      {rows?.map((r) => (
        <details key={r.id} className="rounded border p-3">
          <summary>
            {r.cadence} · {new Date(r.period_end).toLocaleDateString()} ·{" "}
            {r.findings.length
              ? `${r.findings.length} findings for review`
              : "No findings in performed checks"}
          </summary>
          <p>
            Completed period: {new Date(r.period_start).toLocaleString()} –{" "}
            {new Date(r.period_end).toLocaleString()}
          </p>
          <p>
            Active assignments: {r.summary.activeAssignments} · Zero permissions:{" "}
            {r.summary.zeroPermissionAssignments} · Pending approvals: {r.summary.pendingApprovals}{" "}
            · Access reviews due: {r.summary.overdueAccessReviews}
          </p>
          {r.findings.map((f) => (
            <p key={f.code}>
              {f.priority}: {f.code.replaceAll("-", " ")} ({f.count})
            </p>
          ))}
          <ul>
            {r.summary.actions.map((a, i) => (
              <li key={i}>
                {a.action} · {a.sport || "all scopes"} · {a.result}: {a.count}
              </li>
            ))}
          </ul>
          <p className="text-sm">
            Automated checks cover retained grants for disabled accounts, invalid team scope,
            retired blanket grants, audit trigger protections and repeated denials. Owner review
            remains required.
          </p>
        </details>
      ))}
    </section>
  );
}
