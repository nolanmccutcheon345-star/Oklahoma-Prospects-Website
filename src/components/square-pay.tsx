import { useState } from "react";
import type { PayLine, PaySearch } from "@/lib/pay";
import { createSquareCheckout } from "@/lib/square";
import { CANCEL_POLICY } from "@/lib/club";
import { Button } from "@/components/ui/button";

export function OrderLines({ lines, total }: { lines: PayLine[]; total: number }) {
  return (
    <ul className="mt-4 grid gap-2 text-sm" data-order-lines="true">
      {lines.map((line) => (
        <li key={line.label} className="flex items-baseline justify-between gap-3">
          <span>{line.label}</span>
          <span className="tabular-nums font-semibold">${line.amount}</span>
        </li>
      ))}
      <li className="mt-1 flex items-baseline justify-between gap-3 border-t border-fg-inverse/15 pt-2 font-display text-2xl">
        <span>Total</span>
        <span data-order-total={total}>${total}</span>
      </li>
    </ul>
  );
}

export function CancelNote({ tone = "muted" }: { tone?: "muted" | "soft" }) {
  return (
    <p className={tone === "soft" ? "text-sm text-fg-soft" : "text-sm text-muted"} data-cancel-policy="true">
      {CANCEL_POLICY.copy}
    </p>
  );
}

export function SquarePayButton({
  amount,
  title,
  lines,
  search,
  hasAssessment,
  disabled,
  busy,
  onPay,
  label,
}: {
  amount: number;
  title: string;
  lines: PayLine[];
  search: PaySearch;
  hasAssessment?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onPay: () => void;
  label?: string;
}) {
  const [phase, setPhase] = useState<"ready" | "opening" | "confirm">("ready");
  const [error, setError] = useState("");

  async function start() {
    setError("");
    setPhase("opening");
    try {
      const result = await createSquareCheckout({
        data: {
          ...search,
          hasAssessment,
          returnUrl: typeof window !== "undefined" ? `${window.location.origin}/paid` : undefined,
        },
      });
      if (result.error) {
        setError(result.error);
        setPhase("ready");
        return;
      }
      if (result.amount !== amount) {
        setError(`This order is $${result.amount}. Refresh and pay the amount on the receipt.`);
        setPhase("ready");
        return;
      }
      if (result.mode === "square" && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        setPhase("confirm");
        return;
      }
      onPay();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start card checkout.");
      setPhase("ready");
    }
  }

  if (phase === "confirm") {
    return (
      <div className="grid gap-2">
        <p className="text-sm text-muted">
          Square should charge <strong className="text-ink">${amount}</strong> for {title}. If that screen shows a
          different total, close it and text the desk — do not confirm.
        </p>
        <Button type="button" className="w-full" disabled={busy} data-square-confirm="true" onClick={onPay}>
          {busy ? "Saving your receipt…" : `I paid $${amount} — show my receipt`}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        className="w-full"
        disabled={disabled || busy || phase === "opening"}
        data-square-pay="true"
        data-square-amount={amount}
        onClick={() => void start()}
      >
        {busy || phase === "opening" ? "Opening card payment…" : label ?? `Pay $${amount} with debit or credit`}
      </Button>
      <p className="text-center text-xs text-muted">
        Debit or credit only. Square charges ${amount} — the same total as this Oklahoma Prospects order.
        {lines.length > 1 ? ` ${lines.length} line items.` : ""}
      </p>
      {error ? <p className="text-sm text-maroon">{error}</p> : null}
    </div>
  );
}
