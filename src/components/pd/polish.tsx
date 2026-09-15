import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { searchPd, type SearchHit } from "@/lib/pd/polish";
import { useDevelopment } from "@/lib/pd/context";
import { cn } from "@/lib/utils";

type UndoItem = { id: string; label: string; run: () => void };

let undoItem: UndoItem | null = null;
const undoSubs = new Set<() => void>();

export function pushUndo(item: Omit<UndoItem, "id">) {
  undoItem = { id: `u-${Date.now()}`, ...item };
  undoSubs.forEach((fn) => fn());
  window.setTimeout(() => {
    if (undoItem?.label === item.label) {
      undoItem = null;
      undoSubs.forEach((fn) => fn());
    }
  }, 8000);
}

export function UndoDock() {
  const [, tick] = useState(0);
  useEffect(() => {
    const sub = () => tick((n) => n + 1);
    undoSubs.add(sub);
    return () => {
      undoSubs.delete(sub);
    };
  }, []);
  if (!undoItem) return null;
  const item = undoItem;
  return (
    <div
      className="sticky bottom-2 z-20 mt-3 flex items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-fg-inverse shadow-border"
      data-undo-dock="true"
      role="status"
    >
      <p className="text-sm">{item.label}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-12"
        onClick={() => {
          item.run();
          undoItem = null;
          undoSubs.forEach((fn) => fn());
        }}
      >
        Undo
      </Button>
    </div>
  );
}

export function ArmConfirm({
  label,
  armedLabel,
  onConfirm,
  className,
}: {
  label: string;
  armedLabel: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      type="button"
      variant="maroon"
      size="sm"
      className={cn("min-h-12", className)}
      data-arm-confirm={armed ? "armed" : "idle"}
      onClick={async () => {
        if (!armed) {
          setArmed(true);
          return;
        }
        await onConfirm();
        setArmed(false);
      }}
    >
      {armed ? armedLabel : label}
    </Button>
  );
}

export function PdSkeleton({
  variant = "card",
}: {
  variant?: "card" | "roster" | "desk";
}) {
  if (variant === "roster") {
    return (
      <div className="grid gap-2" data-skeleton="roster" aria-busy="true" aria-label="Loading roster">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="pd-skel h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  if (variant === "desk") {
    return (
      <div className="pd-stack" data-skeleton="desk" aria-busy="true" aria-label="Loading desk">
        <div className="pd-skel h-28 rounded-2xl" />
        <div className="pd-skel h-40 rounded-2xl" />
        <div className="grid gap-2">
          <div className="pd-skel h-14 rounded-xl" />
          <div className="pd-skel h-14 rounded-xl" />
          <div className="pd-skel h-14 rounded-xl" />
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-paper-2 shadow-border" data-skeleton="card" aria-busy="true">
      <div className="pd-card grid gap-3">
        <div className="pd-skel h-3 w-24 rounded" />
        <div className="pd-skel h-7 w-48 rounded" />
        <div className="pd-skel h-16 rounded-xl" />
        <div className="pd-skel h-16 rounded-xl" />
      </div>
    </div>
  );
}

export function ChartFigure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <figure role="img" aria-label={label} className="mt-4">
      {children}
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

export function PdSearch({
  onOpenAthlete,
  onOpenDesk,
}: {
  onOpenAthlete: (id: string) => void;
  onOpenDesk: (id: string) => void;
}) {
  const { data } = useDevelopment();
  const [q, setQ] = useState("");
  const hits = q.trim() ? searchPd(q, data) : [];
  return (
    <div className="mb-4" data-pd-search="true">
      <label className="sr-only" htmlFor="pd-search">
        Search athletes, coaches, drills, exercises
      </label>
      <input
        id="pd-search"
        type="search"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Search athletes, coaches, drills, exercises"
        className="min-h-12 w-full rounded-md border border-line bg-paper-2 px-3"
      />
      {hits.length ? (
        <ul className="mt-2 grid gap-1 rounded-2xl bg-paper-2 p-2 shadow-border" data-pd-search-hits="true">
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                className="pd-row min-h-12 w-full rounded-xl bg-paper text-left"
                onClick={() => {
                  if (hit.kind === "athlete" && hit.athleteId) onOpenAthlete(hit.athleteId);
                  else if (hit.desk) onOpenDesk(hit.desk);
                  setQ("");
                }}
              >
                <span className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
                  {hit.kind}
                </span>
                <span className="mt-0.5 block font-semibold">{hit.title}</span>
                <span className="block text-sm text-muted">{hit.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {q.trim() && hits.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No matches for “{q}”.</p>
      ) : null}
    </div>
  );
}

export function BreakProbe() {
  const [boom, setBoom] = useState(false);
  if (boom) throw new Error("Deliberate Train desk crash for QA.");
  return (
    <button
      type="button"
      data-pd-break="true"
      className="sr-only"
      onClick={() => setBoom(true)}
    >
      Break this desk
    </button>
  );
}

export function EmptyNext({
  title,
  copy,
  action,
  onAction,
}: {
  title: string;
  copy: string;
  action: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-paper-2 shadow-border" data-empty-state="true">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Nothing on file</p>
        <h3 className="mt-2 text-2xl">{title}</h3>
        <p className="mt-2 text-sm text-muted">{copy}</p>
        {onAction ? (
          <Button type="button" className="mt-3 min-h-12" onClick={onAction}>
            {action}
          </Button>
        ) : (
          <p className="mt-3 text-sm font-semibold text-maroon">{action}</p>
        )}
      </div>
    </div>
  );
}

export type { SearchHit };
