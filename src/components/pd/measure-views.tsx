import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useDevelopment, type AthleteSlice } from "@/lib/pd/context";
import {
  BANDS,
  CALIB_CASES,
  CALIB_DOMAINS,
  type CalibScores,
  bandForAge,
  cohortCopy,
  evidenceRows,
  facilityCaseReport,
  fmtDelta,
  parseTrackingFile,
} from "@/lib/pd/measure";
import { ageOnClubDay } from "@/lib/pd/engines";
import { cn } from "@/lib/utils";

export function InterventionEvidence() {
  const { data } = useDevelopment();
  const [coachId, setCoachId] = useState("");
  const [band, setBand] = useState("");
  const rows = useMemo(
    () => evidenceRows(data, { coachId: coachId || undefined, band: band || undefined }),
    [data, coachId, band],
  );
  return (
    <section className="pd-stack" data-evidence="true">
      <div className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Intervention evidence
          </p>
          <h3 className="mt-2 text-2xl italic">Kept. Not how good it felt.</h3>
          <p className="mt-2 text-sm text-fg-soft">
            Retention rate is how often the intervention was kept. Under 10 tests is a hint, not a
            finding. Be suspicious of your own favourites at the top.
          </p>
        </div>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-semibold">
          Coach
          <select
            className="pd-control mt-1 min-h-12 w-full rounded-md border border-line bg-paper-2 px-3"
            value={coachId}
            onChange={(event) => setCoachId(event.target.value)}
            data-evidence-coach="true"
          >
            <option value="">All coaches</option>
            {data.coaches.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Age band
          <select
            className="pd-control mt-1 min-h-12 w-full rounded-md border border-line bg-paper-2 px-3"
            value={band}
            onChange={(event) => setBand(event.target.value)}
            data-evidence-band="true"
          >
            <option value="">All bands</option>
            {BANDS.map((row: { key: string; label: string }) => (
              <option key={row.key} value={row.key}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No logged interventions in this filter.</p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.method} className="rounded-2xl bg-paper-2 shadow-border" data-evidence-method={row.method}>
              <div className="pd-card">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-xl uppercase">{row.method}</span>
                  <span className="pd-num font-display text-2xl text-maroon">{row.retainRate}%</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {row.n} tests · {row.retained} kept
                  {row.avgDelta != null ? ` · avg same-day change ${row.avgDelta > 0 ? "+" : ""}${row.avgDelta}` : ""}
                </p>
                {row.hint ? (
                  <p className="mt-2 rounded-lg bg-maroon/15 px-3 py-2 text-sm">
                    n={row.n} is under 10. Treat this as a hint, not a finding.
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function emptyScores(): CalibScores {
  return { posture: 2, direction: 2, stride: 2, separation: 2, slot: 2, balance: 2 };
}

export function CalibrationDesk({ coachId }: { coachId: string }) {
  const { data, saveCalibration } = useDevelopment();
  const [caseId, setCaseId] = useState(CALIB_CASES[0].id);
  const kase = CALIB_CASES.find((row) => row.id === caseId) ?? CALIB_CASES[0];
  const existing = data.calibrationScores.find((row) => row.caseId === caseId && row.coachId === coachId);
  const [scores, setScores] = useState<CalibScores>(existing?.scores ?? emptyScores());
  const report = facilityCaseReport(data, caseId);
  return (
    <div className="pd-stack" data-calibration="true">
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">Coach calibration</p>
          <h3 className="mt-2 text-2xl italic">Score the film. Then see the spread.</h3>
          <p className="mt-2 text-sm text-fg-soft">
            0–3. Exact, within 1, or 2-or-more apart. A 2-point spread across coaches means the
            rubric needs a sentence, not that someone is wrong.
          </p>
        </div>
      </section>
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-paper p-1">
        {CALIB_CASES.map((row) => (
          <button
            key={row.id}
            type="button"
            className={cn(
              "pd-control shrink-0 rounded-lg px-3 text-xs font-semibold uppercase",
              row.id === caseId ? "bg-maroon text-fg-inverse" : "text-muted",
            )}
            onClick={() => {
              setCaseId(row.id);
              const mine = data.calibrationScores.find((item) => item.caseId === row.id && item.coachId === coachId);
              setScores(mine?.scores ?? emptyScores());
            }}
          >
            {row.title}
          </button>
        ))}
      </div>
      <section className="rounded-2xl bg-paper-2 shadow-border">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            {kase.hand} · {kase.sport}
          </p>
          <h3 className="mt-2 text-2xl">{kase.title}</h3>
          <p className="mt-2 text-sm">{kase.prompt}</p>
          {kase.conservativeNote ? (
            <p className="mt-2 rounded-lg bg-maroon/15 px-3 py-2 text-sm">{kase.conservativeNote}</p>
          ) : null}
          <div className={cn("mt-4 grid gap-3", kase.views.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {kase.views.map((view) => (
              <figure key={view.label} className="overflow-hidden rounded-xl bg-ink">
                <img src={view.src} alt={view.label} className="h-40 w-full object-cover" />
                <figcaption className="px-3 py-2 text-xs text-fg-inverse">
                  <strong>{view.label}.</strong> {view.hint}
                </figcaption>
              </figure>
            ))}
          </div>
          <ul className="mt-4 grid gap-2">
            {CALIB_DOMAINS.map((domain) => (
              <li key={domain.key} className="pd-row rounded-xl bg-paper">
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{domain.label}</span>
                  <span className="flex gap-1">
                    {[0, 1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={cn(
                          "min-h-12 min-w-12 rounded-md text-sm font-semibold",
                          scores[domain.key] === n ? "bg-maroon text-fg-inverse" : "bg-paper-2 shadow-border",
                        )}
                        onClick={() => setScores((prev) => ({ ...prev, [domain.key]: n }))}
                      >
                        {n}
                      </button>
                    ))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            className="mt-4 min-h-12 w-full"
            data-save-calibration="true"
            onClick={() => saveCalibration({ caseId, coachId, scores })}
          >
            Save my scores
          </Button>
        </div>
      </section>
      {report && report.n > 0 ? <AgreementCard report={report} /> : null}
    </div>
  );
}

function AgreementCard({
  report,
}: {
  report: NonNullable<ReturnType<typeof facilityCaseReport>>;
}) {
  return (
    <section className="rounded-2xl bg-paper-2 shadow-border" data-calib-agreement={report.kase.id}>
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Facility agreement</p>
        <h3 className="mt-2 text-2xl">{report.n} coaches scored this case</h3>
        <ul className="mt-3 grid gap-2">
          {report.coaches.map((row) => (
            <li key={row.coachId} className="pd-row rounded-xl bg-paper">
              <strong>{row.name}</strong>
              {row.vsTruth ? (
                <span className="mt-1 block text-sm text-muted">
                  Exact {row.vsTruth.exact}/{row.vsTruth.total} · within 1: {row.vsTruth.within1} · 2+ apart:{" "}
                  {row.vsTruth.off2} · {row.vsTruth.status}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <ul className="mt-3 grid gap-2">
          {report.spread.map((row) => (
            <li
              key={row.key}
              className={cn("pd-row rounded-xl", row.flag ? "bg-maroon text-fg-inverse" : "bg-paper")}
              data-spread-flag={row.flag ? row.key : undefined}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{row.label}</span>
                <span className="pd-num">
                  {row.min}–{row.max}
                </span>
              </span>
              {row.flag ? (
                <span className="mt-1 block text-sm">
                  Spread of {row.spread}. The rubric needs a sentence on {row.label.toLowerCase()} — not a
                  coach being wrong.
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function AdminCalibration() {
  return (
    <div className="pd-stack">
      {CALIB_CASES.map((row) => (
        <CaseAgreement key={row.id} caseId={row.id} />
      ))}
    </div>
  );
}

function CaseAgreement({ caseId }: { caseId: string }) {
  const { data } = useDevelopment();
  const report = facilityCaseReport(data, caseId);
  if (!report) return null;
  return <AgreementCard report={report} />;
}

export function TrackingImport({ slice }: { slice: AthleteSlice }) {
  const { applyTracking } = useDevelopment();
  const [text, setText] = useState("");
  const parsed = text.trim() ? parseTrackingFile(text) : null;
  const error = parsed && "error" in parsed ? parsed.error : null;
  const ok = parsed && !("error" in parsed) ? parsed : null;
  return (
    <section className="pd-stack" data-tracking-import={slice.athlete.id}>
      <div className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">Ball tracking</p>
          <h3 className="mt-2 text-2xl italic">Paste the CSV. We will not guess a velocity.</h3>
          <p className="mt-2 text-sm text-fg-soft">
            Matches velocity / rel speed / release speed / pitch speed, spin rate / total spin, IVB,
            HB. Rows without 20–110 mph are named and skipped.
          </p>
        </div>
      </div>
      <label className="text-sm font-semibold">
        Upload
        <input
          type="file"
          accept=".csv,text/csv"
          className="mt-1 block w-full text-sm"
          data-tracking-file="true"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setText(await file.text());
          }}
        />
      </label>
      <textarea
        className="min-h-32 rounded-md border border-line bg-paper-2 px-3 py-2 font-mono text-xs"
        placeholder="Pitch Type,Release Speed,Spin Rate,IVB,HB"
        value={text}
        data-tracking-paste="true"
        onChange={(event) => setText(event.target.value)}
      />
      {error ? <p className="rounded-xl bg-maroon/15 px-4 py-3 text-sm">{error}</p> : null}
      {ok ? (
        <div className="rounded-2xl bg-paper-2 shadow-border" data-tracking-preview="true">
          <div className="pd-card">
            <p className="text-sm">
              {ok.count} usable rows. Max {ok.maxVelo} mph. Avg {ok.avgVelo} mph.
            </p>
            {ok.skipped.length ? (
              <ul className="mt-3 grid gap-1" data-tracking-skipped="true">
                {ok.skipped.map((row) => (
                  <li key={row.row} className="text-sm text-maroon">
                    Row {row.row}: {row.why}
                  </li>
                ))}
              </ul>
            ) : null}
            <ul className="mt-3 grid gap-2">
              {ok.byType.map((row) => (
                <li key={row.type} className="pd-row rounded-xl bg-paper">
                  <strong>
                    {row.type || "Unspecified"} · {row.n}
                  </strong>
                  <span className="mt-1 block text-sm text-muted">
                    avg {row.avgVelo} · max {row.maxVelo}
                    {row.spin != null ? ` · spin ${row.spin}` : ""}
                    {row.ivb != null ? ` · IVB ${row.ivb}` : ""}
                    {row.hb != null ? ` · HB ${row.hb}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              className="mt-4 min-h-12 w-full"
              data-tracking-apply="true"
              onClick={() => applyTracking(slice.athlete.id, text)}
            >
              Apply to {slice.athlete.firstName}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function CohortEngineCopy({ slice }: { slice: AthleteSlice }) {
  const { data } = useDevelopment();
  const [metric, setMetric] = useState("velo");
  const out = cohortCopy(slice, data, metric);
  const unit = metric === "velo" ? "mph" : " points";
  if (out.status === "no-baseline") {
    return (
      <Empty
        title="No baseline to match."
        copy="Cohort comparison waits on a first measured number. We will not borrow someone else's."
        action="Book an assessment"
      />
    );
  }
  if (out.status === "thin") {
    return (
      <Empty
        title="Not enough matched peers."
        copy={`${out.found} athlete${out.found === 1 ? "" : "s"} started near ${out.myStart}${unit}. Need ${out.needed}. A comparison below n=3 is a story, not a sample.`}
        action="Wait for a thicker cohort"
      />
    );
  }
  if (out.status !== "ok") {
    return <Empty title="Cohort unavailable." copy="Could not build a peer comparison from this file." action="Try another metric" />;
  }
  const startTol = metric === "velo" ? 8 : 8;
  return (
    <section className="rounded-2xl bg-paper-2 shadow-border" data-cohort="true">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Cohort</p>
        <label className="mt-2 block text-sm font-semibold">
          Metric
          <select
            className="pd-control mt-1 min-h-12 w-full rounded-md border border-line bg-paper-2 px-3"
            value={metric}
            onChange={(event) => setMetric(event.target.value)}
          >
            <option value="velo">Fastball velocity</option>
            <option value="tci">Command index (TCI)</option>
          </select>
        </label>
        <p className="mt-4 text-sm" data-cohort-copy="true">
          {out.n} athletes started within {startTol}
          {unit === "mph" ? " mph" : " points"} of {out.myStart}
          {unit === "mph" ? " mph" : ""} at a similar age. Median change {fmtDelta(Number(out.med), unit === "mph" ? "mph" : "")}.
          Middle half {fmtDelta(Number(out.q1), "")} to {fmtDelta(Number(out.q3), "")}. Full range{" "}
          {fmtDelta(Number(out.min), "")} to {fmtDelta(Number(out.max), "")}. {out.improved}% improved at
          all.
        </p>
        <p className="mt-3 rounded-xl bg-ink px-4 py-3 text-sm text-fg-inverse">
          This is not a prediction. It is what happened to {out.n} similar starting points. The spread
          is the story — never the median alone.
        </p>
        <ul className="mt-4 grid gap-2">
          <li className="pd-row flex items-baseline justify-between rounded-xl bg-paper">
            <span>N</span>
            <span className="pd-num font-display text-xl">{out.n}</span>
          </li>
          <li className="pd-row flex items-baseline justify-between rounded-xl bg-paper">
            <span>Interquartile (middle half)</span>
            <span className="pd-num font-display text-xl">
              {out.q1} – {out.q3}
            </span>
          </li>
          <li className="pd-row flex items-baseline justify-between rounded-xl bg-paper">
            <span>Full range</span>
            <span className="pd-num font-display text-xl">
              {out.min} – {out.max}
            </span>
          </li>
          <li className="pd-row flex items-baseline justify-between rounded-xl bg-paper">
            <span>Median (never shown alone)</span>
            <span className="pd-num font-display text-xl">{Number(out.med).toFixed(1)}</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

function Empty({ title, copy, action }: { title: string; copy: string; action?: string }) {
  const next = action ?? "Wait for a thicker file";
  const book = /book/i.test(next);
  return (
    <div className="rounded-2xl bg-paper-2 shadow-border" data-empty-state="true">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Nothing on file</p>
        <h3 className="mt-2 text-2xl">{title}</h3>
        <p className="mt-2 text-sm text-muted">{copy}</p>
        {book ? (
          <Button asChild className="mt-3 min-h-12" variant="outlineDark">
            <Link to="/training">{next}</Link>
          </Button>
        ) : (
          <p className="mt-3 text-sm font-semibold text-maroon">{next}</p>
        )}
      </div>
    </div>
  );
}

export function ageBandLabel(iso: string) {
  return bandForAge(ageOnClubDay(iso));
}
