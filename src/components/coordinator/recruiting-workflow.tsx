import { useRef, useState } from "react";
import { Button } from "../ui/button";
import * as api from "@/lib/coordinator/api";
import type { Capability } from "@/lib/coordinator/contracts";
const field = "min-h-11 rounded border border-line bg-white p-2 text-ink";
export function RecruitingWorkflow({
  requestId,
  kind,
  revision,
  allowed,
  onSaved,
}: {
  requestId: string;
  kind: string;
  revision: number;
  allowed: (p: Capability) => boolean;
  onSaved: () => Promise<void>;
}) {
  const [followup, setFollowup] =
    useState<Awaited<ReturnType<typeof api.getCoordinatorFollowup>>>();
  const [delivery, setDelivery] =
    useState<Awaited<ReturnType<typeof api.getCoordinatorRecruitingDelivery>>>();
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function run(work: () => Promise<unknown>, message = "") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workflow.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-3">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {allowed("recruiting.followups") && (
        <details>
          <summary className="min-h-11 cursor-pointer">Follow-up task</summary>
          <Button
            variant="outlineDark"
            disabled={busy}
            onClick={() =>
              void run(async () =>
                setFollowup(await api.getCoordinatorFollowup({ data: requestId })),
              )
            }
          >
            Load current follow-up
          </Button>
          {followup && (
            <form
              className="mt-3 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  await api.saveCoordinatorFollowup({
                    data: {
                      requestId,
                      revision: followup.revision,
                      assigneeId: String(f.get("assigneeId") || ""),
                      dueDate: String(f.get("dueDate") || ""),
                    },
                  });
                  setFollowup(await api.getCoordinatorFollowup({ data: requestId }));
                  await onSaved();
                }, "Follow-up saved.");
              }}
            >
              <label className="grid gap-1">
                Authorized assignee
                <select
                  name="assigneeId"
                  className={field}
                  defaultValue={followup.assigneeId}
                  key={followup.revision}
                  disabled={busy}
                >
                  <option value="">Unassigned</option>
                  {followup.assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                Follow-up date
                <input
                  name="dueDate"
                  type="date"
                  className={field}
                  defaultValue={followup.dueDate}
                  key={followup.revision}
                  disabled={busy}
                />
              </label>
              <p className="text-sm">
                Only staff with current access to this record can be assigned. This saves the task;
                it does not send a guardian message.
              </p>
              <Button type="submit" disabled={busy}>
                Save follow-up task
              </Button>
            </form>
          )}
        </details>
      )}
      {kind === "tryout" && allowed("tryouts.attendance") && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outlineDark"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.saveCoordinatorTryoutAttendance({
                  data: { requestId, revision, status: "attended" },
                });
                await onSaved();
              }, "Attendance saved.")
            }
          >
            Mark attended
          </Button>
          <Button
            variant="outlineDark"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.saveCoordinatorTryoutAttendance({
                  data: { requestId, revision, status: "no-show" },
                });
                await onSaved();
              }, "Attendance saved.")
            }
          >
            Mark no-show
          </Button>
        </div>
      )}
      {allowed("communications.delivery.read") && (
        <details>
          <summary className="min-h-11 cursor-pointer">My recruiting message delivery</summary>
          <Button
            variant="outlineDark"
            disabled={busy}
            onClick={() =>
              void run(async () =>
                setDelivery(await api.getCoordinatorRecruitingDelivery({ data: requestId })),
              )
            }
          >
            Refresh delivery status
          </Button>
          {delivery && (
            <>
              <p className="text-sm">
                Sent means accepted by the email provider; it does not confirm inbox receipt or
                reading.
              </p>
              {!delivery.length ? (
                <p>No messages sent by you for this registration.</p>
              ) : (
                <ul>
                  {delivery.map((d) => (
                    <li key={d.id}>
                      {new Date(d.created_at).toLocaleString()} · {d.status} · attempts:{" "}
                      {d.attempts}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </details>
      )}
    </div>
  );
}
