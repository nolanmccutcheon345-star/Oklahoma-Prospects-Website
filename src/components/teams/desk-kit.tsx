import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DeskCard({
  eyebrow,
  title,
  copy,
  children,
  id,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="overflow-hidden rounded-2xl bg-paper-2 shadow-border">
      <div className="h-1 bg-maroon" />
      <div className="teams-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-3xl">{title}</h2>
        {copy ? <p className="mt-2 text-sm text-teams-muted">{copy}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </section>
  );
}

export function NumRows({
  rows,
}: {
  rows: { label: string; value: string; alert?: boolean }[];
}) {
  if (rows.length === 0) return null;
  return (
    <ul className="divide-y divide-line">
      {rows.map((row, i) => (
        <li
          key={`${row.label}-${i}`}
          className="teams-row flex items-center justify-between gap-3"
        >
          <span className="text-sm text-teams-muted">{row.label}</span>
          <span
            data-teams-num="true"
            className={cn(
              "teams-num text-sm font-semibold",
              row.alert ? "text-ok-maroon" : "text-teams-ink",
            )}
          >
            {row.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RecordTabs({
  label,
  tabs,
  active,
  onChange,
}: {
  label: string;
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex w-full min-w-0 gap-1 overflow-x-auto rounded-xl bg-ink p-1 text-fg-inverse"
    >
      {tabs.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          data-teams-record-tab={item.id}
          aria-selected={active === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "teams-control shrink-0 rounded-lg px-3 text-xs font-semibold tracking-wide uppercase",
            active === item.id ? "bg-maroon text-fg-inverse" : "text-fg-soft",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function BackLink({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="teams-control min-h-11 text-xs font-semibold tracking-[0.16em] text-maroon uppercase"
    >
      ← {label}
    </button>
  );
}

export function BudgetMeter({
  label,
  spent,
  budget,
  spentLabel,
}: {
  label: string;
  spent: number;
  budget: number;
  spentLabel: string;
}) {
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-teams-muted">{label}</span>
        <span data-teams-num="true" className="teams-num text-sm font-semibold">
          {spentLabel}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${label}: ${spentLabel}. ${pct} percent of the budget is used.`}
        className="h-2 overflow-hidden rounded-full bg-line"
        data-teams-meter={pct}
      >
        <div className="h-full bg-maroon" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function downloadText(filename: string, body: string, mime = "text/plain") {
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  attr,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  attr?: Record<string, string>;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold tracking-wide text-teams-muted uppercase">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="teams-control min-h-11 w-full rounded-lg bg-paper px-3 text-sm text-teams-ink shadow-border"
        {...attr}
      />
    </label>
  );
}

export function Fold({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="overflow-hidden rounded-2xl bg-paper-2 shadow-border" open={open}>
      <summary className="teams-control flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
        {title}
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

export function DeskSkeleton() {
  return (
    <section
      className="overflow-hidden rounded-2xl bg-paper-2 shadow-border"
      data-teams-skel="true"
      aria-busy="true"
      aria-label="Loading desk"
    >
      <div className="h-1 bg-maroon" />
      <div className="teams-card grid gap-3">
        <div className="teams-skel h-3 w-24 rounded-full" />
        <div className="teams-skel h-8 w-3/4 rounded-lg" />
        <div className="teams-skel h-4 w-full rounded-full" />
        <div className="teams-skel h-4 w-5/6 rounded-full" />
        <div className="mt-2 grid gap-2">
          <div className="teams-skel h-11 rounded-xl" />
          <div className="teams-skel h-11 rounded-xl" />
          <div className="teams-skel h-11 rounded-xl" />
        </div>
      </div>
    </section>
  );
}
