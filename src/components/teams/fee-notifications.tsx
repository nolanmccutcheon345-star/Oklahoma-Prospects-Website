import { useState } from "react";
import {
  getFeeNotifications,
  refreshFeeDelivery,
  sendFeeCatchup,
} from "@/lib/teams/fee-notifications-api";
type Data = Awaited<ReturnType<typeof getFeeNotifications>>;
export function FeeNotifications() {
  const [data, setData] = useState<Data>();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function run(work?: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (work) await work();
      const next = await getFeeNotifications();
      setData(next);
      setSelected((ids) => ids.filter((id) => next.preview.some((p) => p.id === id)));
      if (work)
        setNotice("Delivery records updated. Provider acceptance does not confirm inbox delivery.");
    } catch (e) {
      setData(undefined);
      setSelected([]);
      setError(e instanceof Error ? e.message : "Could not load fee notifications.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Parent fee emails — delivery and catch-up preview
      </summary>
      <p className="my-3">
        New fee publications and eligible invitations queue fee instructions automatically. Existing
        families are not emailed merely by deploying this feature. Review exact messages below
        before requesting a catch-up send.
      </p>
      <button className="min-h-11 rounded border px-4" disabled={busy} onClick={() => void run()}>
        Load / refresh email preview and delivery status
      </button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <div className="my-3 grid gap-3">
          <p>
            {data.enabled
              ? "Email worker configured. New queued messages are eligible for scheduled delivery."
              : "Email delivery is unavailable or paused. Queued messages have not been confirmed sent; contact the site operator."}
          </p>
          <h3 className="font-bold">Eligible catch-up recipients ({data.preview.length})</h3>
          {data.preview.map((item) => (
            <article key={item.id} className="rounded border p-3">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={(e) =>
                    setSelected((v) =>
                      e.target.checked ? [...v, item.id] : v.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.snapshot.player} · {item.snapshot.team} · {item.snapshot.recipient}
              </label>
              <details>
                <summary className="min-h-11 cursor-pointer underline">
                  Preview exact message and amounts
                </summary>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">{item.text}</pre>
              </details>
            </article>
          ))}
          <button
            className="min-h-11 rounded bg-navy px-4 text-white"
            disabled={busy || !selected.length}
            onClick={() =>
              void run(async () => {
                await sendFeeCatchup({ data: { ids: selected } });
                setSelected([]);
              })
            }
          >
            Queue selected fee emails ({selected.length})
          </button>
          <h3 className="font-bold">Recent delivery records</h3>
          {!data.rows.length && <p>No fee email requests yet.</p>}
          {data.rows.map((r) => (
            <article key={r.id} className="rounded border p-3 text-sm">
              <p>
                {r.snapshot.player} · {r.snapshot.team} · {r.snapshot.recipient}
              </p>
              <p>
                {r.status === "accepted"
                  ? "Provider accepted"
                  : r.status === "review"
                    ? "Needs review — automatic retries stopped"
                    : r.status === "queued" && r.attempts
                      ? "Attempt unconfirmed — queued for retry"
                      : r.status}{" "}
                · Delivery: {r.delivery_event || "not confirmed"} · Attempts: {r.attempts}
              </p>
              <button
                className="min-h-11 underline"
                disabled={busy || r.status !== "accepted"}
                onClick={() => void run(() => refreshFeeDelivery({ data: { id: r.id } }))}
              >
                Check provider delivery
              </button>
            </article>
          ))}
        </div>
      )}
    </details>
  );
}
