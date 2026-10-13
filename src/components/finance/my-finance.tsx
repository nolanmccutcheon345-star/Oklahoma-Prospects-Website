import { useEffect, useState } from "react";
import { getMyFinance, setMyPaymentPreference } from "@/lib/finance/api";
import { formatMoney as money } from "@/lib/pricing";
import { Button } from "../ui/button";
export function MyFinance() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getMyFinance>>>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setData(await getMyFinance());
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  return (
    <details className="my-5 rounded-xl border bg-white p-4">
      <summary className="min-h-11 cursor-pointer text-xl font-semibold">
        My compensation & payment history
      </summary>
      <p className="text-sm">
        Earned, approved and paid are separate. Bank payments are handled by Front Office; this page
        does not initiate transfers.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>Loading…</p>
      ) : (
        <>
          {data.rows.length === 0 && <p>No compensation recorded yet.</p>}
          {data.rows.map((p) => (
            <article key={p.id} className="my-3 rounded-lg border p-3">
              <h3>{p.reason}</h3>
              <p>
                {p.category} · {p.state} · Next due {p.due}
              </p>
              <p>
                Budget {money(p.amount)} · Earned {money(p.earned)} · Not yet earned{" "}
                {money(Math.max(0, p.amount - p.earned))}
              </p>
              <p>
                Approved {money(p.approved)} · Paid {money(p.paid)} · Remaining{" "}
                {money(Math.max(0, p.earned - p.paid))}
              </p>
              {p.gross > 0 && (
                <p>
                  Lesson revenue {money(p.gross)} · Refund adjustment {money(p.adjustment)}
                </p>
              )}
            </article>
          ))}
          {data.payments.map((p) => (
            <p key={p.id}>
              {p.date} · {money(p.amount)} · {p.state}
            </p>
          ))}
          {data.profile && (
            <form
              className="mt-4 grid gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const v = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  await setMyPaymentPreference({
                    data: {
                      method: String(v.get("method")) as "check",
                      reference: String(v.get("reference")),
                    },
                  });
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not save preference");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Preferred payment method
                <select
                  className="min-h-11 w-full rounded-lg border p-2"
                  name="method"
                  defaultValue={data.profile.method}
                >
                  {["bank transfer", "check", "business debit", "other"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Masked reference or safe instructions
                <input
                  className="min-h-11 w-full rounded-lg border p-2"
                  name="reference"
                  maxLength={500}
                  defaultValue={data.profile.reference}
                />
              </label>
              <p className="text-xs">
                Only you and financial admins can see your preference. Never enter full bank/card
                numbers, CVV, PIN or passwords.
              </p>
              <Button type="submit" disabled={busy}>Save payment preference</Button>
            </form>
          )}
        </>
      )}
    </details>
  );
}
