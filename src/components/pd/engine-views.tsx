import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { BullpenTracker } from "@/components/pd/bullpen-tracker";
import { ChartFigure } from "@/components/pd/polish";
import type { AthleteSlice } from "@/lib/pd/context";
import { useDevelopment } from "@/lib/pd/context";
import {
  featuresForTier,
  rescheduleFor,
  scorecardIndex,
  scoredChart,
  sessionRestWarning,
  stepsForPlan,
  toEngineAthlete,
  velocityFor,
  workloadFor,
} from "@/lib/pd/engines";
import type { Booking, ViewerRole } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

function Empty({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action: string;
}) {
  return (
    <div className="rounded-2xl bg-paper-2 shadow-border" data-empty-state="true">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Nothing on file</p>
        <h3 className="mt-2 text-2xl">{title}</h3>
        <p className="mt-2 text-sm text-muted">{copy}</p>
        <p className="mt-3 text-sm font-semibold text-maroon">{action}</p>
        <Button asChild className="mt-3 min-h-12" variant="outlineDark">
          <Link to="/training">{action}</Link>
        </Button>
      </div>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-paper-2 shadow-border">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">{eyebrow}</p>
        <h3 className="mt-2 text-2xl">{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

export function VelocityEngineView({ slice }: { slice: AthleteSlice }) {
  const out = velocityFor(slice);
  const missing = (out.missing as string[]) ?? [];
  if (out.current == null && out.ceiling == null) {
    return (
      <Empty
        title="No velocity on file."
        copy={`We will not invent a number. Radar lives here after the first measured session. Missing: ${missing.join(", ") || "a current velocity reading"}.`}
        action="Book an assessment"
      />
    );
  }
  const band =
    out.floor != null && out.ceiling != null
      ? `${Number(out.floor).toFixed(1)} – ${Number(out.ceiling).toFixed(1)} mph`
      : "—";
  const history = [...slice.velocity].sort((a, b) => a.date.localeCompare(b.date));
  const first = history[0]?.mph;
  const last = history[history.length - 1]?.mph;
  const spoken =
    history.length >= 2 && first != null && last != null
      ? `Velocity trend from ${first} to ${last} miles per hour across ${history.length} readings.`
      : `Current velocity ${out.current ?? "unknown"} miles per hour. Projection band ${band}.`;
  return (
    <Panel eyebrow="Velocity potential" title={out.current != null ? `${out.current} mph now` : "Projection band"}>
      {out.ceiling != null ? (
        <>
          <p className="pd-num font-display text-4xl leading-none">{band}</p>
          <p className="mt-2 text-sm text-muted">
            ±{out.ci} mph error band. {out.method}.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">Need height and a current reading before a band.</p>
      )}
      <p className="mt-3 rounded-xl bg-ink px-4 py-3 text-sm text-fg-inverse">
        No projection predicts an individual athlete. This is a published range, not a promise.
      </p>
      {history.length ? (
        <ChartFigure label={spoken}>
          <div className="flex h-16 items-end gap-1">
            {history.map((row) => (
              <div
                key={row.id}
                className="flex-1 rounded-t bg-maroon"
                style={{ height: `${Math.max(8, ((row.mph - 40) / 60) * 100)}%` }}
                title={`${row.date} ${row.mph}`}
              />
            ))}
          </div>
        </ChartFigure>
      ) : null}
      {out.drivers?.length ? (
        <ul className="mt-4 grid gap-2">
          {out.drivers.map((row: { label: string; value: string; effect: string; note?: string }) => (
            <li key={row.label} className="pd-row rounded-xl bg-paper">
              <span className="flex items-baseline justify-between gap-3">
                <strong>{row.label}</strong>
                <span className="pd-num font-display text-xl">{row.effect}</span>
              </span>
              <span className="mt-1 block text-sm text-muted">
                {row.value}
                {row.note ? ` · ${row.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

export function WorkloadEngineView({ slice }: { slice: AthleteSlice }) {
  const w = workloadFor(slice);
  if (!slice.workload.length) {
    return (
      <Empty
        title="No workload yet."
        copy="Throws and RPE chart here. Empty means they haven’t thrown for us."
        action="Log after first session"
      />
    );
  }
  const tone =
    w.stats.tone === "warn" ? "text-maroon" : w.stats.tone === "good" ? "text-ink" : "text-muted";
  const upcoming = slice.bookings.filter((row) => row.date >= "2026-09-14" && row.status === "paid");
  const days = [...slice.workload].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  const spoken = `Workload last ${days.length} days. Acute ${w.stats.acuteAvg}, chronic ${w.stats.chronicAvg}, ratio ${w.stats.acwr || "unknown"}.`;
  return (
    <Panel eyebrow="Workload" title={w.stats.band}>
      <p className={cn("pd-num font-display text-4xl leading-none", tone)}>ACWR {w.stats.acwr || "—"}</p>
      <p className="mt-2 text-sm text-muted">
        Acute {w.stats.acuteAvg} · chronic {w.stats.chronicAvg} · last 7 vs last 28 days.
      </p>
      <ChartFigure label={spoken}>
        <div className="flex h-16 items-end gap-1">
          {days.map((row) => (
            <div
              key={row.id}
              className="flex-1 rounded-t bg-navy"
              style={{ height: `${Math.min(100, (row.throws / 120) * 100)}%` }}
              title={`${row.date} ${row.throws} throws`}
            />
          ))}
        </div>
      </ChartFigure>
      {w.pitchCount ? (
        <p className="mt-3 rounded-xl bg-ink px-4 py-3 text-sm text-fg-inverse">
          Pitch Smart: {w.pitchCount} pitches on {w.restFrom} needs {w.restDays} day
          {w.restDays === 1 ? "" : "s"} of rest (age {w.age}).
        </p>
      ) : null}
      {upcoming.map((row) => {
        const warn = sessionRestWarning(slice, row);
        if (!warn) return null;
        return (
          <p key={row.id} className="mt-2 text-sm font-semibold text-maroon" data-rest-warning="true">
            {row.date} {row.time} sits inside required rest. Clear {warn.clearOn}.
          </p>
        );
      })}
      <ul className="mt-4 grid gap-2">
        {[...slice.workload]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 8)
          .map((row) => (
            <li key={row.id} className="pd-row flex items-baseline justify-between rounded-xl bg-paper">
              <span className="text-sm">
                {row.date} · RPE {row.rpe}
              </span>
              <span className="pd-num font-display text-xl">{row.throws}</span>
            </li>
          ))}
      </ul>
    </Panel>
  );
}

export function BullpenEngineView({
  slice,
  role,
}: {
  slice: AthleteSlice;
  role: ViewerRole;
}) {
  if (slice.bullpens.length === 0) {
    return (
      <Empty
        title="No bullpens / TCI."
        copy="Every pitch scored to a called location — after they throw one here."
        action="Book a lab day"
      />
    );
  }
  const staff = role === "admin" || role === "coach";
  const pen = [...slice.bullpens].sort((a, b) => b.date.localeCompare(a.date))[0];
  const live = scoredChart(pen);
  const trend = [...slice.bullpens].sort((a, b) => a.date.localeCompare(b.date));
  const spoken = `Command index ${live.tci}. ${trend.length} bullpens on file, latest ${pen.date}.`;
  return (
    <Panel eyebrow="Bullpens / TCI" title={`TCI ${live.tci}`}>
      <ChartFigure label={spoken}>
        <p className="sr-only">{spoken}</p>
      </ChartFigure>
      <BullpenTracker pen={{ ...pen, chart: live.pitches }} interactive={staff} />
      {slice.bullpens.length > 1 ? (
        <ul className="mt-4 grid gap-2">
          {slice.bullpens.map((row) => {
            const scored = scoredChart(row);
            return (
              <li key={row.id} className="pd-row flex items-baseline justify-between rounded-xl bg-paper">
                <span className="text-sm">
                  {row.date} · {scored.pitches.length || row.pitches} pitches
                </span>
                <span className="pd-num font-display text-xl">TCI {scored.tci || row.tci}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="mt-3 text-sm text-muted">{pen.notes}</p>
    </Panel>
  );
}

export function ScorecardEngineView({ slice }: { slice: AthleteSlice }) {
  if (slice.scorecards.length === 0) return null;
  const pdi = scorecardIndex(slice);
  if (!pdi) return null;
  return (
    <div className="mt-4">
      <p className="pd-num font-display text-4xl leading-none">PDI {pdi.index}</p>
      <p className="mt-1 text-sm text-muted">{pdi.completeness}% of the 10-category card scored.</p>
    </div>
  );
}

export function PlanEngineView({ slice }: { slice: AthleteSlice }) {
  const steps = stepsForPlan(slice.family, toEngineAthlete(slice));
  const features = featuresForTier(slice.family?.plan?.tier ?? slice.family?.plan?.type);
  if (!steps.length && !slice.family?.plan) return null;
  return (
    <div className="mt-4 grid gap-3">
      {steps.length ? (
        <ol className="grid gap-2">
          {steps.map((step: { id: string; when: string; label: string }) => (
            <li key={step.id} className="pd-row rounded-xl bg-paper">
              <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">{step.when}</p>
              <p className="mt-1 text-sm">{step.label}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {features.length ? (
        <ul className="grid gap-1">
          {features.map((row) => (
            <li key={row.feature} className="pd-row flex items-baseline justify-between rounded-xl bg-paper">
              <span className="text-sm">{row.feature}</span>
              <span className={cn("text-sm font-semibold", row.has ? "text-ink" : "text-maroon")}>
                {row.has ? "On plan" : `Needs ${row.min}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RestWarning({
  slice,
  booking,
}: {
  slice: AthleteSlice;
  booking: Booking;
}) {
  const warn = sessionRestWarning(slice, booking);
  if (!warn) return null;
  return (
    <p className="text-sm font-semibold text-maroon" data-rest-warning="true">
      Pitch Smart rest: {warn.pitchCount} pitches on {warn.restFrom} need {warn.days} days. This slot is inside the
      window.
    </p>
  );
}

export function BookingReschedule({
  slice,
  booking,
}: {
  slice: AthleteSlice;
  booking: Booking;
}) {
  const { data } = useDevelopment();
  if (!slice.family) return null;
  const gate = rescheduleFor(booking, slice.family, data);
  return (
    <p className="text-sm text-muted">
      {gate.ok
        ? `${gate.remaining} reschedule left this month · 5 days’ notice.`
        : `${gate.reason}. ${gate.detail}`}
    </p>
  );
}

export function BookAssessmentLink() {
  return (
    <Button asChild className="mt-4" variant="outlineDark">
      <Link to="/training">Book an assessment</Link>
    </Button>
  );
}
