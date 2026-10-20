import { useEffect, useRef, useState } from "react";
import { ScheduledCoordinatorReviews } from "./scheduled-reviews";
import { Button } from "../ui/button";
import { capabilities } from "@/lib/coordinator/contracts";
import { reviewPeriods } from "@/lib/coordinator/review-contracts";
import {
  getCoordinatorAccessReviews,
  recordCoordinatorAccessReview,
  saveCoordinatorAccessReviewPolicy,
} from "@/lib/coordinator/api";
type Workspace = Awaited<ReturnType<typeof getCoordinatorAccessReviews>>;
export function CoordinatorAccessReviews() {
  const [data, setData] = useState<Workspace>();
  const [period, setPeriod] = useState<keyof typeof reviewPeriods>("monthly");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void getCoordinatorAccessReviews()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setData(await getCoordinatorAccessReviews());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reviews.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Coordinator access reviews" className="grid gap-4">
      <h3 className="text-xl">Access Reviews</h3>
      <ScheduledCoordinatorReviews />
      <p>
        Review weekly activity, monthly permissions, and quarterly role coverage. A permission
        change makes the saved review out of date. Recording a review does not grant, renew, or
        revoke access. Use Roles &amp; Permissions for changes.
      </p>
      <label>
        Review interval{" "}
        <select
          className="min-h-11 rounded border p-2"
          disabled={busy}
          value={period}
          onChange={(e) => setPeriod(e.target.value as keyof typeof reviewPeriods)}
        >
          {Object.entries(reviewPeriods).map(([key, days]) => (
            <option key={key} value={key}>
              {key} (
              {data?.policy[`${key}Days` as "weeklyDays" | "monthlyDays" | "quarterlyDays"] ?? days}{" "}
              days)
            </option>
          ))}
        </select>
      </label>
      <Button disabled={busy} onClick={() => void refresh()}>
        Refresh Reviews
      </Button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Loading authorized reviews…</p>}
      {data && !data.assignments.length && <p>No current coordinator assignments to review.</p>}
      {data && (
        <details>
          <summary>Review intervals and security alert settings</summary>
          <p>
            These settings control reminders and denied-action alerts shown in Staff Management.
            Email delivery is not enabled by these settings.
          </p>
          <form
            key={data.policy.revision}
            className="grid gap-3 p-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (pending.current) return;
              pending.current = true;
              setBusy(true);
              setError("");
              setNotice("");
              try {
                const fields = new FormData(e.currentTarget);
                await saveCoordinatorAccessReviewPolicy({
                  data: {
                    revision: data.policy.revision,
                    weeklyDays: Number(fields.get("weeklyDays")),
                    monthlyDays: Number(fields.get("monthlyDays")),
                    quarterlyDays: Number(fields.get("quarterlyDays")),
                    denialThreshold: Number(fields.get("denialThreshold")),
                    denialWindowHours: Number(fields.get("denialWindowHours")),
                  },
                });
                setData(await getCoordinatorAccessReviews());
                setNotice("Review and alert settings saved. Staff permissions were not changed.");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not save settings.");
              } finally {
                pending.current = false;
                setBusy(false);
              }
            }}
          >
            {(
              [
                ["weeklyDays", "Weekly review interval (days)", 1, 14],
                ["monthlyDays", "Monthly review interval (days)", 15, 60],
                ["quarterlyDays", "Quarterly review interval (days)", 61, 180],
                ["denialThreshold", "Denied actions before an alert", 1, 100],
                ["denialWindowHours", "Denied-action alert window (hours)", 1, 168],
              ] as const
            ).map(([name, label, min, max]) => (
              <label key={name} className="grid gap-1">
                {label}
                <input
                  className="min-h-11 rounded border p-2"
                  required
                  type="number"
                  name={name}
                  min={min}
                  max={max}
                  step="1"
                  defaultValue={data.policy[name]}
                />
              </label>
            ))}
            <Button type="submit" disabled={busy}>
              Save Review Settings
            </Button>
          </form>
        </details>
      )}

      {data?.assignments
        .filter((row) => row.period === period)
        .map((row) => (
          <form
            key={`${row.user_id}-${row.sport}-${period}-${row.revision}`}
            className="grid gap-3 rounded border border-line p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (pending.current) return;
              pending.current = true;
              const form = e.currentTarget;
              const reason = String(new FormData(form).get("reason") || "");
              setBusy(true);
              setError("");
              setNotice("");
              try {
                await recordCoordinatorAccessReview({
                  data: {
                    userId: row.user_id,
                    sport: row.sport,
                    revision: row.revision,
                    period,
                    reason,
                    confirmed: true,
                  },
                });
                setData(await getCoordinatorAccessReviews());
                form.reset();
                setNotice(
                  "Review recorded for the saved permission revision. Access was not changed.",
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not record review.");
              } finally {
                pending.current = false;
                setBusy(false);
              }
            }}
          >
            <h4 className="text-lg">
              {row.name} — {row.sport}
            </h4>
            <p>
              Status: {row.status}. Permission revision: {row.revision}.{" "}
              {row.due ? "Review due" : "Review current"}.
            </p>
            <p>
              Coverage:{" "}
              {row.coverage === "sport"
                ? `All ${row.sport} teams`
                : row.team_ids.join(", ") || "No teams selected"}
              .
            </p>
            <p>Separate roles: {row.independent_roles.join(", ") || "None recorded"}.</p>
            <details>
              <summary>Review {row.permissions.length} explicit permissions</summary>
              {row.permissions.length ? (
                <ul>
                  {row.permissions.map((permission) => (
                    <li key={permission}>{capabilities[permission]}</li>
                  ))}
                </ul>
              ) : (
                <p>Zero operational permissions.</p>
              )}
            </details>
            <p>
              Last {period} review:{" "}
              {row.lastReviewedAt ? new Date(row.lastReviewedAt).toLocaleString() : "Never"}
              {row.reviewedRevision ? ` (revision ${row.reviewedRevision})` : ""}.
            </p>
            <label className="grid gap-1">
              Review notes (no private athlete or financial information)
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={500}
                className="rounded border p-2"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" required /> I reviewed this saved assignment and the relevant
              activity and scope.
            </label>
            <Button type="submit" disabled={busy}>
              Record {period} Review
            </Button>
          </form>
        ))}
      {data && (
        <details>
          <summary>Recent review history ({data.history.length}, up to 200)</summary>
          {data.history.map((row) => (
            <p key={row.id}>
              {new Date(row.created_at).toLocaleString()} — {row.target_id}, {row.sport},{" "}
              {row.details.period}, revision {row.details.revision}: {row.details.reason} — reviewer{" "}
              {row.actor_id}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
