import { useState } from "react";
import { noticeQueues } from "@/lib/notifications/release-control-contracts";
import {
  getNoticeReleaseAudit,
  approveNoticeRelease,
  holdNoticeRelease,
  dispatchNoticeRelease,
} from "@/lib/notifications/release-control-api";

type Audit = Awaited<ReturnType<typeof getNoticeReleaseAudit>>;
type Row = Audit["rows"][number];
const keyFor = (row: { queue: string; id: string }) => `${row.queue}:${row.id}`;
const control = "min-h-11 rounded border px-4 disabled:opacity-50";

/** A preview never approves or sends. Every action is scoped to the displayed selection. */
export function NoticeReleaseControls() {
  const [data, setData] = useState<Audit>();
  const [queue, setQueue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const rows = data?.rows.filter((row) => selected.includes(keyFor(row))) ?? [];
  const items = rows.map(({ queue, id, digest }) => ({ queue, id, digest }));

  async function load(cursor?: string) {
    const next = await getNoticeReleaseAudit({
      data: {
        ...(queue ? { queue: queue as Row["queue"] } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 50,
      },
    });
    setData(next);
    setSelected([]);
    setConfirmed(false);
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not complete notification action. Refresh status before retrying.",
      );
      setSelected([]);
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="my-4 rounded-xl border border-navy p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Owner email controls — review, approve and send
      </summary>
      <p className="my-3">
        Queued does not mean sent. Old messages and new unapproved messages stay on hold. Review
        exact recipients and content before approving a selection. These controls do not change
        account access, fees or payment collection.
      </p>
      <p className="my-3 text-sm">
        Team notices are in-app posts, not email. Sending is an external action and cannot be
        recalled after submission. Provider acceptance does not confirm inbox delivery.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          Notification category
          <select
            className={control}
            value={queue}
            disabled={busy}
            onChange={(e) => {
              setQueue(e.target.value);
              setData(undefined);
              setSelected([]);
              setConfirmed(false);
            }}
          >
            <option value="">All categories</option>
            {noticeQueues.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <button className={control} disabled={busy} onClick={() => void run(() => load())}>
          {busy ? "Working…" : "Load / refresh held messages"}
        </button>
      </div>
      {error && (
        <p role="alert" className="my-3 text-maroon">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="my-3">
          {notice}
        </p>
      )}
      {results.length > 0 && (
        <ul className="my-3 list-disc pl-5" aria-label="Dispatch results">
          {results.map((result, i) => (
            <li key={i}>{result}</li>
          ))}
        </ul>
      )}
      {data && (
        <div className="mt-4 grid gap-3">
          <p role="status">
            {data.readiness.enabled
              ? "Owner-controlled delivery is configured."
              : "Owner-controlled delivery is unavailable."}{" "}
            Scheduled worker:{" "}
            {data.readiness.schedulerEnabled
              ? "enabled — exact approval still required"
              : "off; selected owner sends remain separate"}
            .
          </p>
          {data.readiness.blockers.length > 0 && (
            <ul className="list-disc pl-5">
              {data.readiness.blockers.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <h3 className="font-bold">Complete queue counts</h3>
          <ul className="list-disc pl-5">
            {data.counts.map((count) => (
              <li key={count.queue}>
                {count.queue}: {count.total} total · {count.held} held · {count.approved} approved ·{" "}
                {count.sent} submitted · {count.invalid} unavailable
              </li>
            ))}
          </ul>
          {!data.rows.length && <p>No messages in this page or category.</p>}
          {data.rows.map((row) => (
            <article key={keyFor(row)} className="min-w-0 rounded border p-3">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  disabled={
                    busy || row.approvalStatus === "sent" || row.approvalStatus === "invalid"
                  }
                  checked={selected.includes(keyFor(row))}
                  onChange={(e) => {
                    setSelected((prior) =>
                      e.target.checked
                        ? [...prior, keyFor(row)]
                        : prior.filter((key) => key !== keyFor(row)),
                    );
                    setConfirmed(false);
                  }}
                />
                <span className="break-words font-semibold">
                  {row.subject || "Untitled notice"}
                </span>
              </label>
              <p className="break-words text-sm">
                {row.channel} · {row.queue} · {row.approvalStatus} · Source: {row.status}
              </p>
              <p className="break-words text-sm">
                To: {row.recipients.join(", ") || "No current recipients"}
              </p>
              <p className="text-sm">
                Revision: {row.revision ?? "—"} · Attempts: {row.attempts} · Provider:{" "}
                {row.providerStatus || "not confirmed"}
              </p>
              <p className="break-words text-sm">
                Created: {String(row.createdAt)} · ID: {row.id}
              </p>
              <details>
                <summary className="min-h-11 cursor-pointer underline">
                  Review exact message
                </summary>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">{row.text}</pre>
              </details>
            </article>
          ))}
          <label className="flex min-h-11 items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmed}
              disabled={busy || !rows.length}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I reviewed the exact recipients and content of these {rows.length} selected messages.
              Approval applies only to these versions, not the backlog or future messages.
            </span>
          </label>
          <p className="text-sm">
            Approve up to 20 at a time. Send at most 2 per batch so each provider result can be
            checked before continuing.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className={control}
              disabled={busy || !confirmed || !items.length || items.length > 20}
              onClick={() =>
                void run(async () => {
                  await approveNoticeRelease({ data: { items, confirmed: true } });
                  await load();
                  setNotice(
                    "Selected versions approved. Nothing sent by approval alone. Select the approved messages to send them.",
                  );
                })
              }
            >
              Approve selected messages ({items.length})
            </button>
            <button
              className={`${control} bg-navy text-white`}
              disabled={
                busy ||
                !confirmed ||
                !items.length ||
                items.length > 2 ||
                rows.some((r) => r.approvalStatus !== "approved")
              }
              onClick={() =>
                void run(async () => {
                  const result = await dispatchNoticeRelease({ data: { items, confirmed: true } });
                  setResults(
                    result.results.map(
                      (r) =>
                        `${r.queue} · ${r.id}: ${r.status}${r.message ? ` — ${r.message}` : ""}`,
                    ),
                  );
                  await load();
                  setNotice(
                    "Dispatch checked. Read each result below; queued or attempted is not proof of provider acceptance.",
                  );
                })
              }
            >
              Send only selected approved messages ({items.length})
            </button>
          </div>
          <label className="grid gap-1">
            Reason to hold selected messages
            <input
              className="min-h-11 rounded border px-3"
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className={control}
            disabled={busy || !items.length || items.length > 20 || reason.trim().length < 10}
            onClick={() =>
              void run(async () => {
                await holdNoticeRelease({ data: { items, reason } });
                await load();
                setNotice(
                  "Selected messages held. Historical records preserved; already-submitted messages cannot be recalled.",
                );
              })
            }
          >
            Hold selected messages without deleting
          </button>
          {data.nextCursor && (
            <button
              className={control}
              disabled={busy}
              onClick={() => void run(() => load(data.nextCursor ?? undefined))}
            >
              Next page — clears selection
            </button>
          )}
        </div>
      )}
    </details>
  );
}
