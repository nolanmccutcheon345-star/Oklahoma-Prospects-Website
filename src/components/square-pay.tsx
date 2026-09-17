import type { PayLine, PaySearch } from "@/lib/pay";
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
    <p
      className={tone === "soft" ? "text-sm text-fg-soft" : "text-sm text-muted"}
      data-cancel-policy="true"
    >
      {CANCEL_POLICY.copy}
    </p>
  );
}

/** Legacy entry points route into the verified checkout; they never save unpaid reservations. */
export function SquarePayButton({
  search,
  disabled,
  busy,
}: {
  amount: number;
  title: string;
  lines: PayLine[];
  search: PaySearch;
  hasAssessment?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onPay: () => void;
  onPrepare?: (id: string) => void;
  label?: string;
}) {
  function openCheckout() {
    const params = new URLSearchParams();
    for (const key of ["kind", "id", "cages", "date", "time", "minutes", "use"] as const) {
      const value = search[key];
      if (value !== undefined) params.set(key, String(value));
    }
    window.location.assign("/pay?" + params.toString());
  }
  return (
    <div className="grid gap-2">
      <Button type="button" className="w-full" disabled={disabled || busy} onClick={openCheckout}>
        Continue to secure checkout
      </Button>
      <p className="text-center text-xs text-muted">
        Payment is required to confirm a booking. Prices and assessment eligibility are checked on
        your account at checkout.
      </p>
    </div>
  );
}
