import { useEffect, useState } from "react";
import * as api from "@/lib/coordinator/api";
import { Button } from "../ui/button";
export function CoordinatorRecovery() {
  const [history, setHistory] =
      useState<Awaited<ReturnType<typeof api.getCoordinatorRecoveryHistory>>>(),
    [preview, setPreview] =
      useState<Awaited<ReturnType<typeof api.getCoordinatorRecoveryPreview>>>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load(beforeId?: number) {
    setPreview(undefined);
    setHistory(await api.getCoordinatorRecoveryHistory({ data: { beforeId } }));
  }
  useEffect(() => {
    let live = true;
    api
      .getCoordinatorRecoveryHistory({ data: {} })
      .then((r) => {
        if (live) setHistory(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setHistory(undefined);
      setPreview(undefined);
      setError(e instanceof Error ? e.message : "Unable to recover this change.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-3">
      <h3 className="text-xl">Recover a routine change</h3>
      <p>
        Review the current values and the proposed restoration. Newer conflicting edits and paid
        reservations block recovery. Transfer recovery is available in the Approval Queue; published
        events use a new reviewed change request.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <Button disabled={busy} onClick={() => void run(() => load())}>
        Refresh Recovery History
      </Button>
      {!history && !error && <p role="status">Loading recovery history…</p>}
      {history?.items.length === 0 && <p>No recoverable changes.</p>}
      {history?.items.map((r) => (
        <div className="rounded border p-3" key={r.id}>
          <p>
            {r.action} · {r.teamId} · {r.targetId} · {new Date(r.createdAt).toLocaleString()}
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () =>
                setPreview(await api.getCoordinatorRecoveryPreview({ data: { auditId: r.id } })),
              )
            }
          >
            Preview Recovery {r.id}
          </Button>
        </div>
      ))}
      {history?.nextId && (
        <Button disabled={busy} onClick={() => void run(() => load(history.nextId!))}>
          Older Recovery History
        </Button>
      )}
      {preview && (
        <form
          className="grid gap-3 rounded border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") || "");
            if (
              !window.confirm(
                "Restore these exact routine values? Current scope, revisions and reservations will be checked again.",
              )
            )
              return;
            void run(async () => {
              await api.applyCoordinatorRecovery({
                data: {
                  auditId: preview.auditId,
                  revision: preview.revision,
                  sourceDigest: preview.sourceDigest,
                  reason,
                  confirm: true,
                },
              });
              await load();
              setNotice("Recovery completed and recorded.");
            });
          }}
        >
          <h4>Current values</h4>
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(preview.current, null, 2)}
          </pre>
          <h4>Restore these values</h4>
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(preview.restore, null, 2)}
          </pre>
          <label>
            Reason
            <textarea
              className="min-h-24 w-full rounded border p-2"
              name="reason"
              minLength={10}
              maxLength={1000}
              required
            />
          </label>
          <Button type="submit" disabled={busy}>
            Confirm Recovery
          </Button>
        </form>
      )}
    </section>
  );
}
