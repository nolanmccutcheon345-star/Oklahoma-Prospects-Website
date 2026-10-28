import { useEffect, useRef, useState, type FormEvent } from "react";
import * as api from "@/lib/coordinator/api";
import {
  noticeKinds,
  noticePermission,
  type noticeProposalInput,
} from "@/lib/coordinator/communication-contracts";
import type { Capability, Sport, HistoryCursor } from "@/lib/coordinator/contracts";
import type { z } from "zod";
import { Button } from "../ui/button";
const field = "min-h-11 w-full rounded border border-line bg-white p-2 text-ink";
type Proposal = z.infer<typeof noticeProposalInput>;
export function ScheduledCommunications({
  sport,
  teamId,
  teams,
  allowed,
}: {
  sport: Sport;
  teamId: string;
  teams: { id: string; name: string }[];
  allowed: (p: Capability) => boolean;
}) {
  const kinds = noticeKinds.filter((k) => allowed(noticePermission(k)));
  const [kind, setKind] = useState<Proposal["kind"]>(kinds[0] || "team"),
    [targets, setTargets] = useState<{ id: string; title: string }[]>([]),
    [preview, setPreview] = useState<{
      proposal: Proposal;
      result: Awaited<ReturnType<typeof api.previewCoordinatorNotice>>;
    }>(),
    [rows, setRows] = useState<Awaited<ReturnType<typeof api.getCoordinatorNoticeHistory>>>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [before, setBefore] = useState<HistoryCursor>();
  const requestId = useRef(crypto.randomUUID());
  const canRead = allowed("communications.read") || allowed("communications.delivery.read");
  async function load() {
    if (canRead)
      setRows(await api.getCoordinatorNoticeHistory({ data: { sport, teamId, before } }));
  }
  useEffect(() => {
    let active = true;
    setTargets([]);
    setError("");
    if (kind === "practice" || kind === "event")
      void api
        .getCoordinatorNoticeTargets({ data: { teamId, kind } })
        .then((r) => {
          if (active) setTargets(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [teamId, kind]);
  useEffect(() => {
    let active = true;
    setRows(undefined);
    if (canRead)
      void api
        .getCoordinatorNoticeHistory({ data: { sport, teamId, before } })
        .then((r) => {
          if (active) setRows(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [sport, teamId, before, canRead]);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setRows(undefined);
      setPreview(undefined);
      setError(e instanceof Error ? e.message : "Could not complete communication.");
    } finally {
      setBusy(false);
    }
  }
  function prepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      const proposal: Proposal = {
        id: requestId.current,
        sport,
        teamIds: kind === "program" ? f.getAll("team").map(String) : [teamId],
        kind,
        targetId: String(f.get("target") || ""),
        body: String(f.get("body") || ""),
        sendAt: f.get("sendAt")
          ? new Date(String(f.get("sendAt"))).toISOString()
          : new Date().toISOString(),
        reason: String(f.get("reason") || ""),
      };
      setPreview({ proposal, result: await api.previewCoordinatorNotice({ data: proposal }) });
    });
  }
  return (
    <section className="grid gap-3 rounded border p-3">
      <h3 className="text-xl">Announcements & Reminders</h3>
      <p>
        Delivery is in authenticated team conversations. Only confirmed existing members can see
        these posts. Recipients and current permissions are checked again when a scheduled post
        runs.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {kinds.length > 0 && (
        <form className="grid gap-3" onSubmit={prepare} onChange={() => setPreview(undefined)}>
          <label>
            Message type
            <select
              className={field}
              value={kind}
              onChange={(e) => setKind(e.target.value as Proposal["kind"])}
            >
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          {kind === "program" && (
            <fieldset>
              <legend>Confirm program teams for owner review</legend>
              {teams.map((t) => (
                <label className="block min-h-11" key={t.id}>
                  <input type="checkbox" name="team" value={t.id} /> {t.name}
                </label>
              ))}
            </fieldset>
          )}
          {(kind === "practice" || kind === "event") && (
            <label>
              Current event
              <select className={field} name="target" required>
                <option value="">Choose event</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Message
            <textarea className={field} name="body" maxLength={3000} required rows={4} />
          </label>
          <p>
            Operational information only. Do not include financial, medical, confidential family or
            disciplinary information.
          </p>
          {(kind === "announcement" ||
            kind === "program" ||
            allowed("communications.announcement.schedule")) && (
            <label>
              Post at (your device’s time zone; blank means now)
              <input className={field} type="datetime-local" name="sendAt" />
            </label>
          )}
          <label>
            Reason
            <input className={field} name="reason" minLength={10} maxLength={1000} required />
          </label>
          <Button type="submit" disabled={busy}>
            Preview Recipients & Message
          </Button>
        </form>
      )}
      {preview && (
        <aside className="grid gap-3 rounded border p-3">
          <h4>Confirm this message</h4>
          <p className="whitespace-pre-wrap">{preview.proposal.body}</p>
          <ul>
            {preview.result.teams.map((t) => (
              <li key={t.id}>
                {t.name}: {t.recipientCount} verified members
              </li>
            ))}
          </ul>
          <p>
            {new Date(preview.proposal.sendAt).toLocaleString()} ·{" "}
            {preview.result.requiresApproval
              ? "Owner approval required before delivery"
              : "Queued for delivery after confirmation"}
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Confirm this exact message and these recipients?")) return;
              void run(async () => {
                const r = await api.queueCoordinatorNotice({
                  data: {
                    ...preview.proposal,
                    previewDigest: preview.result.previewDigest,
                    confirm: true,
                  },
                });
                setNotice(
                  r.status === "pending-review"
                    ? "Submitted for owner review; nothing sent."
                    : "Queued. Posting will occur through the notification worker.",
                );
                setPreview(undefined);
                requestId.current = crypto.randomUUID();
                await load();
              });
            }}
          >
            Confirm {preview.result.requiresApproval ? "Owner Review Request" : "Queue"}
          </Button>
        </aside>
      )}
      {canRead && (
        <>
          <h4>My communication archive</h4>
          <Button disabled={busy} variant="outlineDark" onClick={() => void run(load)}>
            Refresh Communication History
          </Button>
          {!rows && !error && <p role="status">Loading communications…</p>}
          {rows?.items.length === 0 && <p>No communications in this scope.</p>}
          {rows?.items.map((r) => (
            <article key={r.id} className="rounded border p-3">
              <strong>
                {r.kind} {r.status && "· " + r.status}
              </strong>
              {r.body && <p className="whitespace-pre-wrap">{r.body}</p>}
              <p>{new Date(r.send_at).toLocaleString()}</p>
              {allowed(noticePermission(r.kind as Proposal["kind"])) &&
                (!r.status || ["queued", "pending-review", "blocked"].includes(r.status)) && (
                  <Button
                    disabled={busy}
                    variant="outlineDark"
                    onClick={() => {
                      const reason = window.prompt(
                        "Reason for cancelling this queued message (at least 10 characters):",
                      );
                      if (
                        !reason ||
                        !window.confirm("Cancel this message if it has not been sent?")
                      )
                        return;
                      void run(async () => {
                        await api.cancelCoordinatorNotice({
                          data: { id: r.id, revision: r.revision, reason, confirm: true },
                        });
                        await load();
                        setNotice("Queued message cancelled; history retained.");
                      });
                    }}
                  >
                    Cancel Queued Message
                  </Button>
                )}
            </article>
          ))}
          {rows?.nextCursor && (
            <Button variant="outlineDark" onClick={() => setBefore(rows.nextCursor!)}>
              Older Communications
            </Button>
          )}
          {before && (
            <Button variant="outlineDark" onClick={() => setBefore(undefined)}>
              Newest Communications
            </Button>
          )}
        </>
      )}
    </section>
  );
}
export function TeamMessageReview({ teams }: { teams: { id: string; name: string }[] }) {
  const [teamId, setTeamId] = useState(""),
    [before, setBefore] = useState<HistoryCursor>(),
    [data, setData] = useState<Awaited<ReturnType<typeof api.getReviewableTeamMessages>>>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    if (teamId) setData(await api.getReviewableTeamMessages({ data: { teamId, before } }));
  };
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    if (teamId)
      void api
        .getReviewableTeamMessages({ data: { teamId, before } })
        .then((r) => {
          if (active) setData(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [teamId, before]);
  return (
    <section className="grid gap-3">
      <h3 className="text-xl">Review Historical Team Communications</h3>
      <p>
        Only approve messages containing operational information safe for explicitly authorized
        coordinators. Financial, medical, confidential family and disciplinary text must remain
        withheld. Approval applies to the exact current message.
      </p>
      <label>
        Team
        <select
          className={field}
          value={teamId}
          onChange={(e) => {
            setTeamId(e.target.value);
            setBefore(undefined);
          }}
        >
          <option value="">Choose team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {teamId && !data && !error && <p role="status">Loading messages…</p>}
      {data?.items.length === 0 && <p>No messages found.</p>}
      {data?.items.map((m) => (
        <article key={m.id} className="rounded border p-3">
          <strong>
            {m.author} · {m.operational ? "Reviewed operational" : "Withheld pending review"}
          </strong>
          <p className="whitespace-pre-wrap">{m.body}</p>
          <Button
            disabled={busy}
            variant="outlineDark"
            onClick={async () => {
              const reason = window.prompt(
                "Reason for this exact-message classification (at least 10 characters):",
              );
              if (
                !reason ||
                !window.confirm(
                  m.operational
                    ? "Withdraw coordinator visibility for this message?"
                    : "Confirm this exact message contains only permitted operational information?",
                )
              )
                return;
              setBusy(true);
              setError("");
              try {
                await api.reviewCoordinatorTeamMessage({
                  data: {
                    id: m.id,
                    sourceDigest: m.sourceDigest,
                    operational: !m.operational,
                    reason,
                    confirm: true,
                  },
                });
                await load();
              } catch (e) {
                setData(undefined);
                setError(e instanceof Error ? e.message : "Review failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {m.operational ? "Withdraw Visibility" : "Approve Operational Visibility"}
          </Button>
        </article>
      ))}
      {data?.nextCursor && (
        <Button variant="outlineDark" onClick={() => setBefore(data.nextCursor!)}>
          Older Messages
        </Button>
      )}
      {before && (
        <Button variant="outlineDark" onClick={() => setBefore(undefined)}>
          Newest Messages
        </Button>
      )}
      <Button
        disabled={busy || !teamId}
        variant="outlineDark"
        onClick={async () => {
          try {
            await load();
            setError("");
          } catch (e) {
            setData(undefined);
            setError(e instanceof Error ? e.message : "Read failed");
          }
        }}
      >
        Refresh Review
      </Button>
    </section>
  );
}

export function CommunicationArchive() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getOwnerCommunicationArchive>>>(),
    [beforeId, setBeforeId] = useState<number>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    api
      .getOwnerCommunicationArchive({ data: { beforeId } })
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [beforeId]);
  return (
    <section className="grid gap-3">
      <h3 className="text-xl">Controlled Communications Archive</h3>
      <p>
        Recorded message versions and delivery states. Email “sent” means provider acceptance, not
        proof of receipt. Team “sent” means posted to the confirmed members’ conversation. Replies
        remain in the original channel; email replies are not imported.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading archive…</p>}
      {data?.items.length === 0 && <p>No archived messages yet.</p>}
      {data?.items.map((m) => (
        <details key={m.id} className="rounded border p-3">
          <summary className="min-h-11">
            {m.source} · {m.status} · {new Date(m.recorded_at).toLocaleString()}
          </summary>
          <p>
            Sender account: {m.actor_id} · {m.sport}
          </p>
          <strong>{m.subject}</strong>
          <p className="whitespace-pre-wrap">{m.body}</p>
          <p>Approved recipients</p>
          <pre className="whitespace-pre-wrap break-words text-sm">
            {JSON.stringify(m.recipients, null, 2)}
          </pre>
        </details>
      ))}
      {data?.nextId && (
        <Button variant="outlineDark" onClick={() => setBeforeId(data.nextId!)}>
          Older Archive Entries
        </Button>
      )}
      {beforeId && (
        <Button variant="outlineDark" onClick={() => setBeforeId(undefined)}>
          Newest Archive Entries
        </Button>
      )}
    </section>
  );
}
