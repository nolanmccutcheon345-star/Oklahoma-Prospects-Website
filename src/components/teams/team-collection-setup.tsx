import { independentCollectionConsent } from "@/lib/teams/independent-model";
import { useState } from "react";
import { Button } from "../ui/button";
import { SquareCard } from "../commerce/square-card";
import {
  getTeamCollection,
  saveTeamCollectionCard,
  changeTeamCollection,
} from "@/lib/teams/collection-api";
import { collectionConsent } from "@/lib/teams/collection-policy";
import { money } from "@/lib/teams/fee-model";
export function TeamCollectionSetup({ teamId, playerId }: { teamId: string; playerId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getTeamCollection>>>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [storageConsent, setStorageConsent] = useState(false),
    [purpose, setPurpose] = useState<"primary" | "backup" | null>(null);
  const load = async () => {
    try {
      setData(await getTeamCollection({ data: { teamId, playerId } }));
    } catch (e) {
      setData(undefined);
      throw e;
    }
  };
  async function run(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      window.dispatchEvent(new window.Event("enrollment-progress-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Collection settings unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border p-3">
      <summary className="min-h-11 cursor-pointer font-bold">
        Automatic installments and backup card
      </summary>
      <p>
        Cards are stored by Square. Revoking authorization stops future attempts; a payment already
        submitted may still finish. Your accepted season obligation remains due. With only one valid
        saved card, pay each installment through individual checkout by its agreed due date. Two
        different cards are needed to enable automatic installments and the backup retry.
      </p>
      <Button type="button" disabled={busy} onClick={() => void run(load)}>
        Review automatic payment setup
      </Button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <div className="grid gap-3 mt-3">
          <p>
            Status: {data.status}.{" "}
            {data.enabled
              ? "Scheduled collection is enabled."
              : "Scheduled collection is paused pending launch verification; no scheduled charge will be submitted."}
          </p>
          <ul>
            {data.terms.rows.map((r, i) => (
              <li key={i}>
                {i === 0 ? "Initial deposit" : `Installment ${i + 1}`}: {money(r.amountCents)} due{" "}
                {r.date}, 9 a.m. Central. Remaining:{" "}
                {money(data.remaining?.[i]?.remainingCents ?? r.amountCents)}
              </li>
            ))}
          </ul>
          <p>
            Final scheduled billing date: {data.terms.rows.at(-1)?.date}. Verified payments and
            permitted credits reduce collection amounts; a satisfied initial deposit is not
            collected again.
          </p>
          {data.canManage && (
            <>
              <p>
                Primary:{" "}
                {data.primary ? `${data.primary.brand} ending ${data.primary.last4}` : "Not saved"}.
                Backup:{" "}
                {data.backup ? `${data.backup.brand} ending ${data.backup.last4}` : "Not saved"}.
              </p>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={storageConsent}
                  onChange={(e) => setStorageConsent(e.target.checked)}
                />
                I authorize Square to securely save this card for this athlete's installment
                payments. Saving or changing a card pauses collection until I authorize the schedule
                again.
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy || !storageConsent}
                  onClick={() => setPurpose("primary")}
                >
                  Save primary card
                </Button>
                <Button
                  type="button"
                  disabled={busy || !storageConsent}
                  onClick={() => setPurpose("backup")}
                >
                  Save backup card
                </Button>
              </div>
              {purpose && storageConsent && (
                <SquareCard
                  key={purpose}
                  config={data.square}
                  amountCents={0}
                  name={data.name}
                  email={data.email}
                  intent="STORE"
                  onToken={async (sourceId, requestId) => {
                    await saveTeamCollectionCard({
                      data: { teamId, playerId, purpose, sourceId, requestId, consent: true },
                    });
                    setPurpose(null);
                    setStorageConsent(false);
                    setConsent(false);
                    await load();
                    window.dispatchEvent(new window.Event("enrollment-progress-updated"));
                    setNotice(
                      "Card saved with Square. Review and authorize the installment schedule.",
                    );
                    return {};
                  }}
                />
              )}
              <p>
                {data.terms.fundingModel === "independent"
                  ? independentCollectionConsent
                  : collectionConsent}
              </p>
              {data.terms.fundingModel !== "independent" && (
                <p>
                  Grace period: {data.terms.graceDays} calendar days overdue. A 20% late fee
                  requires both confirmed card failures and owner review. Late fees are shown
                  separately and never compound.
                </p>
              )}
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I agree to the automatic-payment authorization above for this athlete and schedule.
              </label>
              <Button
                type="button"
                disabled={busy || !consent || !data.primary || !data.backup || !data.enabled}
                onClick={() =>
                  void run(async () => {
                    await changeTeamCollection({
                      data: { teamId, playerId, action: "activate", consent: true },
                    });
                    setNotice("Automatic-payment authorization saved.");
                  })
                }
              >
                Authorize automatic installments
              </Button>
            </>
          )}
        </div>
      )}
      <Button
        type="button"
        variant="outlineDark"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await changeTeamCollection({
              data: { teamId, playerId, action: "revoke", consent: true },
            });
            setNotice(
              "Future automatic charges revoked. Any attempt already submitted may still complete.",
            );
          })
        }
      >
        Revoke my future automatic charges
      </Button>
    </details>
  );
}
