import { useEffect, useState } from "react";
import { getSavedPaymentMethods, activateBackupCard } from "@/lib/commerce/portal-api";
import { Button } from "../ui/button";
export function SavedMethods() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getSavedPaymentMethods>>>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    getSavedPaymentMethods()
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="grid gap-3">
      <h3>Saved payment methods</h3>
      <p className="text-sm">
        Square securely stores your cards. A backup is not charged automatically. Choose “Make
        backup primary” to authorize it for future renewal billing. Use your invoice payment link to
        resolve an outstanding invoice.
      </p>
      {error && <p role="alert">{error}</p>}
      {rows.map((r) => (
        <article key={r.subscription_id} className="rounded-lg border p-3">
          <p>Membership {r.subscription_id}</p>
          <p>
            Primary:{" "}
            {r.primary_display
              ? `${r.primary_display.brand} •••• ${r.primary_display.last4}`
              : "Current card held by Square"}
          </p>
          {r.backup_display && (
            <>
              <p>
                Backup: {r.backup_display.brand} •••• {r.backup_display.last4}
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await activateBackupCard({ data: { id: r.subscription_id, consent: true } });
                    setRows(await getSavedPaymentMethods());
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not update card");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label className="flex gap-2">
                  <input type="checkbox" required />I authorize this card as my primary renewal
                  payment method.
                </label>
                <Button type="submit" disabled={busy}>Make backup primary</Button>
              </form>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
