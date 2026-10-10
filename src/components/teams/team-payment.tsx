import { useState } from "react";
import { Button } from "../ui/button";
import { SquareCard } from "../commerce/square-card";
import { startTeamCheckout } from "@/lib/teams/payment-api";
import { submitSquarePayment } from "@/lib/commerce/api";
import { money } from "@/lib/teams/fee-model";
export function TeamPayment({
  teamId,
  playerId,
  balance,
  next,
}: {
  teamId: string;
  playerId: string;
  balance: number;
  next: number;
}) {
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof startTeamCheckout>>>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [amount, setAmount] = useState(String(Math.min(next || balance, balance) / 100)),
    [requestId] = useState(() => crypto.randomUUID());
  return (
    <details className="rounded-xl border p-3">
      <summary className="min-h-11 cursor-pointer font-bold">Pay team fee securely</summary>
      <p className="text-sm">
        Remaining accepted fee: {money(balance)}. Pay an installment or your remaining balance. This
        is a one-time payment through Square; it does not set up automatic charges.
      </p>
      {!prepared ? (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              setPrepared(
                await startTeamCheckout({
                  data: {
                    teamId,
                    playerId,
                    amount: Math.round(Number(amount) * 100),
                    requestId,
                    consent: true,
                  },
                }),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not prepare payment.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Payment amount ($)
            <input
              className="office-control w-full"
              type="number"
              min="0.01"
              max={balance / 100}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I authorize this amount toward my player’s accepted team fee.
          </label>
          <Button disabled={busy || !consent}>
            {busy ? "Preparing payment…" : "Review secure payment"}
          </Button>
        </form>
      ) : (
        <>
          <p className="font-bold">Pay {money(prepared.totalCents)} toward the team fee</p>
          {prepared.square && (
            <SquareCard
              config={prepared.square}
              amountCents={prepared.totalCents}
              expiresAt={prepared.holdUntil}
              name={prepared.name}
              email={prepared.email}
              onToken={async (sourceId, attemptId) => {
                const r = await submitSquarePayment({
                  data: { orderId: prepared.orderId, sourceId, attemptId },
                });
                if (r.url) window.location.assign(r.url);
                return r;
              }}
            />
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
