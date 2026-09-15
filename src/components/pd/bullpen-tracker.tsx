import { useMemo, useState } from "react";
import { SCORE_LABELS, scorePitch, tciOf } from "@/lib/pd/core-algorithms.js";
import type { Bullpen, BullpenPitch } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

const CELLS = [0, 1, 2, 3, 4];

function cellClass(row: number, col: number, mark: "intent" | "actual" | null) {
  const zone = row >= 1 && row <= 3 && col >= 1 && col <= 3;
  return cn(
    "pd-control min-h-11 rounded-md text-xs font-semibold",
    zone ? "bg-paper" : "bg-ink/10",
    mark === "intent" && "bg-maroon text-fg-inverse",
    mark === "actual" && "bg-navy text-fg-inverse",
  );
}

export function BullpenTracker({
  pen,
  interactive,
}: {
  pen: Bullpen;
  interactive?: boolean;
}) {
  const seed = useMemo(() => {
    const chart = (pen.chart ?? []).map((p) => ({
      ...p,
      score: p.score ?? scorePitch(p.intent, p.actual),
    }));
    return chart;
  }, [pen]);
  const [extra, setExtra] = useState<BullpenPitch[]>([]);
  const [intent, setIntent] = useState<{ row: number; col: number } | null>(null);
  const pitches = [...seed, ...extra];
  const tci = tciOf(pitches);
  const last = pitches[pitches.length - 1];

  function tap(row: number, col: number) {
    if (!interactive) return;
    if (!intent) {
      setIntent({ row, col });
      return;
    }
    const actual = { row, col };
    const score = scorePitch(intent, actual);
    setExtra((rows) => [...rows, { intent, actual, score }]);
    setIntent(null);
  }

  return (
    <div className="pd-stack" data-bullpen-tracker={pen.id}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">
          {pen.date} · {pitches.length} pitches scored
        </p>
        <p className="pd-num font-display text-3xl">TCI {tci}</p>
      </div>
      <p className="text-xs text-muted">
        4 Dot · 3 Quality miss · 2 Control · 1 Competitive ball · 0 Noncompetitive. Catcher’s view.
      </p>
      <div className="grid grid-cols-5 gap-1">
        {CELLS.map((row) =>
          CELLS.map((col) => {
            const isIntent = intent?.row === row && intent?.col === col;
            const isLast = last && last.actual.row === row && last.actual.col === col;
            return (
              <button
                key={`${row}-${col}`}
                type="button"
                disabled={!interactive}
                onClick={() => tap(row, col)}
                className={cellClass(row, col, isIntent ? "intent" : isLast ? "actual" : null)}
                aria-label={`Row ${row} column ${col}`}
              >
                {row},{col}
              </button>
            );
          }),
        )}
      </div>
      {interactive ? (
        <p className="text-sm text-muted">
          {intent ? "Tap the result." : "Tap the called location, then the result."}
        </p>
      ) : null}
      {pitches.length ? (
        <ul className="grid gap-1">
          {pitches.slice(-8).reverse().map((p, i) => (
            <li
              key={`${p.intent.row}${p.intent.col}${i}`}
              className="pd-row flex items-baseline justify-between rounded-xl bg-paper"
            >
              <span className="text-sm">
                Call {p.intent.row},{p.intent.col} → {p.actual.row},{p.actual.col}
              </span>
              <span className="pd-num font-display text-lg">
                {p.score} {SCORE_LABELS[p.score as 0 | 1 | 2 | 3 | 4]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No pitches charted yet.</p>
      )}
    </div>
  );
}
