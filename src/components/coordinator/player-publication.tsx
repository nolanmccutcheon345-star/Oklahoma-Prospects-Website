import { useEffect, useState } from "react";
import * as api from "@/lib/coordinator/api";
import { Button } from "../ui/button";
const field = "min-h-11 w-full rounded border border-line bg-white p-2 text-ink";
export function PlayerPublicationRequest({
  teamId,
  kind,
}: {
  teamId: string;
  kind: "roster" | "photo";
}) {
  const [items, setItems] =
      useState<Awaited<ReturnType<typeof api.getPlayerPublicationCandidates>>>(),
    [preview, setPreview] = useState<Awaited<ReturnType<typeof api.getPlayerPublicationPreview>>>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [requestId, setRequestId] = useState("");
  useEffect(() => {
    let live = true;
    setItems(undefined);
    setPreview(undefined);
    setError("");
    api
      .getPlayerPublicationCandidates({ data: { teamId, kind } })
      .then((r) => {
        if (live) setItems(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [teamId, kind]);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setPreview(undefined);
      setItems(undefined);
      setError(
        e instanceof Error
          ? e.message
          : "Publication request failed. Refresh to review current access.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-3 rounded border p-3">
      <h3 className="text-lg">
        Request public {kind === "roster" ? "roster identity" : "player photo"}
      </h3>
      <p>
        Only current guardian-consented records appear here. An owner must approve the exact
        identity or photo. Changing the reviewed data or withdrawing consent hides controlled
        publication until reviewed again.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!items && !error && <p role="status">Loading consented records…</p>}
      {items?.length === 0 && (
        <p>
          No eligible consented records. The verified guardian must use the existing family
          publication-consent screen first.
        </p>
      )}
      {!!items?.length && (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const playerId = String(new FormData(e.currentTarget).get("playerId") || "");
            void run(async () => {
              const p = await api.getPlayerPublicationPreview({ data: { teamId, kind, playerId } });
              setPreview(p);
              setRequestId(crypto.randomUUID());
            });
          }}
        >
          <label>
            Consented athlete
            <select
              name="playerId"
              className={field}
              required
              onChange={() => setPreview(undefined)}
            >
              <option value="">Choose athlete</option>
              {items.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            Preview publication
          </Button>
        </form>
      )}
      {preview && (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") || "");
            if (!window.confirm("Request owner approval of this exact public identity or photo?"))
              return;
            void run(async () => {
              await api.submitPlayerPublication({
                data: {
                  id: requestId,
                  teamId,
                  kind,
                  playerId: preview.playerId,
                  sourceDigest: preview.sourceDigest,
                  reason,
                  confirm: true,
                },
              });
              setPreview(undefined);
              setNotice("Submitted for owner review. No publication was enabled.");
            });
          }}
        >
          <p>
            {preview.display.name}
            {preview.display.number && ` · Jersey ${preview.display.number}`}
          </p>
          {preview.display.photo && (
            <img
              src={preview.display.photo}
              alt="Exact photo proposed for owner review"
              className="max-h-64 max-w-64 object-contain"
              referrerPolicy="no-referrer"
            />
          )}
          <label>
            Reason
            <textarea name="reason" className={field} minLength={10} maxLength={1000} required />
          </label>
          <label>
            <input type="checkbox" required /> I reviewed the exact preview and understand owner
            approval is required.
          </label>
          <Button type="submit" disabled={busy}>
            Request owner publication approval
          </Button>
        </form>
      )}
    </section>
  );
}
export function OwnerPlayerPublications() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.getOwnerPlayerPublications>>>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const refresh = async () => setRows(await api.getOwnerPlayerPublications());
  useEffect(() => {
    let live = true;
    api
      .getOwnerPlayerPublications()
      .then((r) => {
        if (live) setRows(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="grid gap-3">
      <h3 className="text-xl">Controlled player publications</h3>
      <p>
        Approval remains valid only while the reviewed data, guardian consent and reviewing owner’s
        authority remain current. Withdrawal preserves history. New proposals are reviewed in the
        Approval Queue.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!rows && !error && <p role="status">Loading publications…</p>}
      {rows?.length === 0 && <p>No controlled publications.</p>}
      {rows?.map((r) => (
        <div className="rounded border p-3" key={r.kind + ":" + r.targetId}>
          <p>
            {r.kind} · Record {r.targetId} · Team {r.teamId} ·{" "}
            {r.visible ? "Approved, subject to current consent" : "Withheld"} · Revision{" "}
            {r.revision}
          </p>
          {r.visible && (
            <Button
              disabled={busy}
              variant="outlineDark"
              onClick={() => {
                const reason = window.prompt(
                  "Reason for withdrawing publication (at least 10 characters):",
                );
                if (!reason || !window.confirm("Withdraw this public identity or photo?")) return;
                setBusy(true);
                setError("");
                setNotice("");
                void api
                  .withdrawOwnerPlayerPublication({
                    data: {
                      kind: r.kind,
                      targetId: r.targetId,
                      revision: r.revision,
                      reason,
                      confirm: true,
                    },
                  })
                  .then(async () => {
                    await refresh();
                    setNotice("Publication withdrawn. Records and history preserved.");
                  })
                  .catch((e) => {
                    setRows(undefined);
                    setError(e.message);
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Withdraw publication
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
