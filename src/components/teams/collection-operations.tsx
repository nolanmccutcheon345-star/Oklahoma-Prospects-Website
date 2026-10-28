import { useState } from "react";
import { Button } from "../ui/button";
import {
  getCollectionOperations,
  pauseCollectionAuthorization,
} from "@/lib/teams/collection-operations-api";
import { money } from "@/lib/teams/fee-model";
export function CollectionOperations() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCollectionOperations>>>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = async () => {
    setData(undefined);
    setData(await getCollectionOperations());
  };
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setData(undefined);
      setError(e instanceof Error ? e.message : "Collection status unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-bold">
        Automatic installment administration
      </summary>
      <p className="my-3">
        Review failures in Payments before retrying an uncertain charge. Pausing an authorization
        stops new attempts; an already submitted charge may finish. A failed installment can be paid
        through the family's one-time team checkout. Card changes require fresh guardian
        authorization.
      </p>
      <Button type="button" disabled={busy} onClick={() => void run(load)}>
        Load collection status
      </Button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            Live automatic collection: {data.enabled ? "enabled" : "paused"}. Sandbox settings in
            this deployment: {data.sandboxConfigured ? "present" : "not present"}. Provider
            acceptance evidence: {data.sandboxVerified ? "recorded" : "not recorded"}.
          </p>
          <p>
            Sandbox credentials belong on an isolated test deployment. Their absence here does not
            mean that the separate test deployment is unconfigured.
          </p>
          {data.blockers.length > 0 && (
            <ul className="list-disc pl-5">
              {data.blockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {data.rows.length === 0 && <p>No saved automatic-payment authorizations.</p>}
          {data.rows.map((r) => (
            <article key={r.id} className="my-3 rounded-lg border p-3">
              <p>
                {r.team} · {r.player} · {r.environment} · {r.status}
              </p>
              <ul>
                {r.runs.map((p) => (
                  <li key={p.index}>
                    Installment {p.index + 1}: {money(p.amount)} · {p.status}
                  </li>
                ))}
              </ul>
              {r.status === "active" && (
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const reason = String(new FormData(e.currentTarget).get("reason"));
                    void run(async () => {
                      await pauseCollectionAuthorization({
                        data: { id: r.id, reason, confirmed: true },
                      });
                      await load();
                    });
                  }}
                >
                  <label>
                    Reason for pausing
                    <input
                      name="reason"
                      required
                      minLength={10}
                      maxLength={1000}
                      className="office-control w-full"
                    />
                  </label>
                  <label>
                    <input type="checkbox" required />I reviewed this agreement and want to stop
                    future automatic attempts.
                  </label>
                  <Button type="submit" disabled={busy}>
                    Pause this authorization
                  </Button>
                </form>
              )}
            </article>
          ))}
        </>
      )}
    </details>
  );
}
