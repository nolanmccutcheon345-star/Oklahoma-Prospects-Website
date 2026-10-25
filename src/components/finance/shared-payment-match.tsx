import { useState } from "react";
import { Button } from "../ui/button";
import { money } from "@/lib/teams/fee-model";
export function SharedPaymentMatch({
  bank,
  candidates,
  busy,
  save,
}: {
  bank: { id: string; amount: number };
  candidates: { id: string; label: string; amount: number }[];
  busy: boolean;
  save: (action: unknown, reason: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [reason, setReason] = useState("");
  if (bank.amount >= 0 || candidates.length < 2) return null;
  const total = candidates.filter((p) => selected.includes(p.id)).reduce((n, p) => n + p.amount, 0);
  return (
    <details className="mt-3 rounded-lg border p-3">
      <summary>Match shared invoice allocations to this bank debit</summary>
      <p className="my-2 text-sm">
        Select recorded payments for one vendor and shared invoice reference. Their sum must equal{" "}
        {money(-bank.amount)}. This matches evidence; it sends no money.
      </p>
      <p className="mb-2 text-sm">
        Record one payable and payment allocation per team. Use the same invoice reference on each
        payable, and a unique payment reference for each allocation, such as “Check 123 / Team A”.
      </p>
      <div className="grid gap-2">
        {candidates.map((p) => (
          <label className="flex items-start gap-2 text-sm" key={p.id}>
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id),
                )
              }
            />
            {p.label} · {money(p.amount)}
          </label>
        ))}
        <p>Selected total: {money(total)}</p>
        <label className="text-sm">
          Bank / invoice evidence
          <input
            className="office-control"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </label>
        <Button
          disabled={
            busy || selected.length < 2 || total !== -bank.amount || reason.trim().length < 5
          }
          onClick={() =>
            save({ action: "matchPayments", bankId: bank.id, paymentIds: selected }, reason)
          }
        >
          Reconcile these payment allocations
        </Button>
      </div>
    </details>
  );
}
