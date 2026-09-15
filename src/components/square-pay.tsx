import { useEffect, useRef, useState } from "react";
import type { PayLine, PaySearch } from "@/lib/pay";
import { createSquareCheckout, getSquareStatus } from "@/lib/square";
import { CANCEL_POLICY } from "@/lib/club";
import { newReceiptId } from "@/lib/receipt";
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
  onPrepare,
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
  onPrepare?: (receiptId: string) => void;
  label?: string;
}) {
  const [phase, setPhase] = useState<"ready" | "opening">("ready");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const lock = useRef(false);
  void title;

  useEffect(() => {
    getSquareStatus()
      .then((row) => setConnected(row.connected))
      .catch(() => setConnected(false));
  }, []);

  function paidUrl(receiptId: string) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      if (value != null && String(value) !== "") params.set(key, String(value));
    }
    params.set("receipt", receiptId);
    return `${window.location.origin}/paid?${params.toString()}`;
  }

  async function start() {
    if (lock.current) return;
    lock.current = true;
    setError("");
    setPhase("opening");
    try {
      const receiptId = newReceiptId();
      const result = await createSquareCheckout({
        data: {
          ...search,
          hasAssessment,
          returnUrl: typeof window !== "undefined" ? paidUrl(receiptId) : undefined,
        },
      });
      if (result.error) {
        setError(result.error);
        setPhase("ready");
        lock.current = false;
        return;
      }
      if (result.amount !== amount) {
        setError(`This order is $${result.amount}. Refresh and pay the amount on the receipt.`);
        setPhase("ready");
        lock.current = false;
        return;
      }
      if (result.mode === "square" && result.url) {
        onPrepare?.(receiptId);
        window.location.assign(result.url);
        return;
      }
      if (!result.connected) {
        onPrepare?.(receiptId);
        onPay();
        return;
      }
      setError("Card checkout could not start. Call the desk to finish this booking.");
      setPhase("ready");
      lock.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setPhase("ready");
      lock.current = false;
    }
  }

  const cardReady = connected === true;
  const defaultLabel = cardReady
    ? `Pay $${amount} with debit or credit`
    : `Confirm reservation · $${amount}`;

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        className="w-full"
        disabled={disabled || busy || phase === "opening"}
        data-square-pay="true"
        data-square-amount={amount}
        aria-busy={busy || phase === "opening"}
        onClick={() => void start()}
      >
        {busy || phase === "opening"
          ? cardReady
            ? "Opening card payment…"
            : "Saving reservation…"
          : label ?? defaultLabel}
      </Button>
      <p className="text-center text-xs text-muted">
        {cardReady
          ? `Debit or credit. You’ll be charged $${amount} — the same total as this order.`
          : `Card checkout is not connected yet. This confirms the reservation on this club. Pay $${amount} at the desk with the receipt.`}
        {lines.length > 1 ? ` ${lines.length} line items.` : ""}
      </p>
      {error ? (
        <p className="text-sm text-maroon" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
