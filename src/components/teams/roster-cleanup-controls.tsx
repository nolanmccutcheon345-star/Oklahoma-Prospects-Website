import { useState, useEffect, useRef } from "react";
import {
  coachRemoveRosterPlayer,
  previewRosterRemoval,
  previewRosterMerge,
  mergeRosterDuplicates,
} from "@/lib/teams/store";
import type { ClubRecord } from "@/lib/teams/types";

export function RosterCleanupControls({
  teamId,
  playerId,
  onDone,
  mergeCandidates = [],
}: {
  teamId: string;
  playerId: string;
  onDone?: (club: ClubRecord) => void;
  mergeCandidates?: { id: string; name: string }[];
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [survivorId, setSurvivorId] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewRosterRemoval>> | null>(
    null,
  );
  const [merge, setMerge] = useState<Awaited<ReturnType<typeof previewRosterMerge>> | null>(null);
  const [reason, setReason] = useState(""),
    [requestId, setRequestId] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setPreview(null);
    setMerge(null);
    setReason("");
    setError("");
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [teamId, playerId]);
  const finish = (club: ClubRecord) => {
    setPreview(null);
    setMerge(null);
    setReason("");
    if (onDone) onDone(club);
    else window.location.reload();
  };
  async function review(isMerge: boolean) {
    const token = ++generation.current;
    setBusy(true);
    setError("");
    setPreview(null);
    setMerge(null);
    try {
      setRequestId(crypto.randomUUID());
      setReason("");
      if (isMerge) {
        const result = await previewRosterMerge({ data: { teamId, playerId, survivorId } });
        if (token === generation.current) setMerge(result);
      } else {
        const result = await previewRosterRemoval({ data: { teamId, playerId } });
        if (token === generation.current) setPreview(result);
      }
    } catch (err) {
      if (token === generation.current)
        setError(err instanceof Error ? err.message : "Could not review roster change.");
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  return (
    <div className="grid gap-2 p-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-11 rounded border px-3"
          disabled={busy}
          onClick={() => void review(false)}
        >
          Remove player
        </button>
        {mergeCandidates.length > 0 && (
          <>
            <select
              aria-label="Surviving player record"
              value={survivorId}
              disabled={busy}
              onChange={(e) => {
                generation.current++;
                setSurvivorId(e.target.value);
                setMerge(null);
                setPreview(null);
                setError("");
              }}
              className="min-h-11 rounded border"
            >
              <option value="">Choose survivor for duplicate merge</option>
              {mergeCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="min-h-11 rounded border px-3"
              disabled={busy || !survivorId}
              onClick={() => void review(true)}
            >
              Review merge duplicates
            </button>
          </>
        )}
      </div>
      {(preview || merge) && (
        <form
          className="grid gap-2 rounded border p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reason.trim() || busy) return;
            const token = generation.current;
            setBusy(true);
            setError("");
            try {
              const row = merge
                ? await mergeRosterDuplicates({
                    data: {
                      teamId: merge.teamId,
                      playerId: merge.playerId,
                      survivorId: merge.survivorId,
                      baseRev: merge.baseRev,
                      reason,
                      requestId,
                      confirmed: true,
                    },
                  })
                : await coachRemoveRosterPlayer({
                    data: {
                      teamId: preview!.teamId,
                      playerId: preview!.playerId,
                      baseRev: preview!.baseRev,
                      expectedDue: preview!.due,
                      reason,
                      requestId,
                      confirmed: true,
                    },
                  });
              if (token === generation.current) finish(row.club);
            } catch (err) {
              if (token === generation.current)
                setError(err instanceof Error ? err.message : "Could not save roster change.");
            } finally {
              if (token === generation.current) setBusy(false);
            }
          }}
        >
          <p className="font-semibold">
            {merge ? "Confirm duplicate merge" : "Confirm player removal"}
          </p>
          <p>Team: {(preview || merge)!.teamName}</p>
          <p>
            Player: {preview?.playerName || merge?.duplicateName} ({playerId})
          </p>
          <p>Parent email: {(preview || merge)!.parentEmail || "Not recorded"}</p>
          {preview && (
            <p>
              Outstanding accepted balance:{" "}
              {preview.due === null
                ? "Unavailable. Review Finance; obligations remain unchanged."
                : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                    preview.due,
                  )}
            </p>
          )}
          {merge && (
            <p>
              Surviving record: {merge.survivorName} ({merge.survivorId}). The duplicate is retained
              as an audited alias. Household invitations stay unchanged.
            </p>
          )}
          <p>
            This removes only active roster participation. Payments, contracts, financial
            obligations and historical records are retained. This does not remove the team.
          </p>
          <label>
            Required reason
            <textarea
              required
              maxLength={1000}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              className="block w-full rounded border p-2"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !reason.trim()}
              className="min-h-11 rounded border px-3"
            >
              {busy ? "Saving…" : merge ? "Confirm merge" : "Confirm removal"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded border px-3"
              onClick={() => {
                setPreview(null);
                setMerge(null);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
