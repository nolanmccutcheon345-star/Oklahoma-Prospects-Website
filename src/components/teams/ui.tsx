import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function Section({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="rounded-xl bg-paper-2 shadow-border"
      open={defaultOpen}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 font-display text-lg tracking-wide uppercase">
        <span>{title}</span>
        {count != null ? (
          <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-fg-inverse">
            {count}
          </span>
        ) : null}
      </summary>
      <div className="border-t border-line px-4 py-3">{children}</div>
    </details>
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full px-3 text-xs font-semibold tracking-wide uppercase",
        active ? "bg-maroon text-fg-inverse" : "bg-paper text-ink shadow-border",
      )}
    >
      {children}
    </button>
  );
}

export function FailScreen({ message }: { message: string }) {
  return (
    <main id="main" className="grid min-h-[60dvh] place-items-center bg-paper px-6 text-ink">
      <div className="max-w-md">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          Oklahoma Prospects
        </p>
        <h1 className="mt-2 font-display text-4xl italic">Can't open this desk.</h1>
        <p role="alert" className="mt-3 text-lg text-muted">{message}</p>
        <p className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
          <a href="/account" className="text-maroon">
            Account
          </a>
          <a href="/login" className="text-maroon">
            Sign in
          </a>
          <a href="/" className="text-maroon">
            Home
          </a>
        </p>
      </div>
    </main>
  );
}

export function Meter({ value, cap }: { value: number; cap: number }) {
  const pct = cap <= 0 ? 0 : Math.min(100, Math.round((value / cap) * 100));
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <i
          className={cn("block h-full", pct > 100 ? "bg-maroon" : "bg-powder")}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        {pct}% of budget · {money(value)} / {money(cap)}
      </p>
    </div>
  );
}
