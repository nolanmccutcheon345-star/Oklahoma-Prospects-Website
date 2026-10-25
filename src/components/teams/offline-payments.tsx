import { useState } from "react";
import { Button } from "../ui/button";
import { getOfflineTeamPayments, reviewOfflineTeamPayment } from "@/lib/teams/offline-payment-api";
import { money } from "@/lib/teams/fee-model";

export function OfflinePaymentReview({
  teamId,
  playerId,
  refresh,
}: {
  teamId: string;
  playerId: string;
  refresh: () => Promise<void>;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getOfflineTeamPayments>>>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = async () => setData(await getOfflineTeamPayments({ data: { teamId, playerId } }));
  return (
    <details className="rounded-xl border p-3">
      <summary className="min-h-11 cursor-pointer font-bold">
        Review offline receipts and recorded returns
      </summary>
      <p className="my-2 text-sm">
        Only verify money actually received and settled. These controls do not charge a card, send
        an invoice or return money. Record returns only after money was returned outside the
        website. Revoking verification requires a new enrollment clearance review.
      </p>
      <Button
        type="button"
        disabled={busy}
        onClick={() => {
          setError("");
          setBusy(true);
          void load()
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Load offline receipts
      </Button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data?.payments.length === 0 && <p>No offline receipts recorded.</p>}
      {data?.payments.map((p) => (
        <form
          key={p.receipt}
          className="mt-3 grid gap-2 rounded-lg border p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const action = String(f.get("action")) as "verify" | "revoke" | "reverse";
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await reviewOfflineTeamPayment({
                data: {
                  teamId,
                  playerId,
                  receipt: p.receipt,
                  action,
                  reason: String(f.get("reason")),
                  confirmed: true,
                  ...(action === "reverse" ? { remainingAmount: Number(f.get("remaining")) } : {}),
                  ...(data.basisVersion ? { expectedBasisVersion: data.basisVersion } : {}),
                },
              });
              await load();
              setNotice(
                "Receipt review saved. No money was moved. Enrollment clearance must be reviewed again.",
              );
              await refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not review receipt.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="font-semibold">
            {p.method} · {money(Math.round(p.amount * 100))} net received ·{" "}
            {p.verified ? "owner verified" : "not verified for enrollment"}
          </p>
          <p className="break-words text-sm">
            {p.date} · {p.label} · {p.receipt}
          </p>
          <label>
            Review action
            <select name="action" className="office-control w-full">
              <option value="verify">Verify received funds</option>
              <option value="revoke">Revoke verification pending review</option>
              <option value="reverse">Record money already returned / correct an entry</option>
            </select>
          </label>
          <label>
            Net amount still received after return or correction ($)
            <input
              name="remaining"
              type="number"
              min="0"
              max={p.amount}
              step="0.01"
              defaultValue="0"
              className="office-control w-full"
            />
          </label>
          <label>
            Evidence / reason
            <input
              name="reason"
              required
              minLength={10}
              maxLength={1000}
              className="office-control w-full"
            />
          </label>
          <label className="flex gap-2">
            <input type="checkbox" required />I verified the evidence and net funds. This records an
            office review; it does not move money.
          </label>
          <Button disabled={busy} type="submit">
            Save receipt review
          </Button>
        </form>
      ))}
    </details>
  );
}
