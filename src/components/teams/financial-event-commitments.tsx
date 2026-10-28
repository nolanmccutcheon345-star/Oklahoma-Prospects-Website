import { useCallback, useEffect, useRef, useState } from "react";
import {
  getFinancialEventCommitments,
  saveFinancialEventCommitment,
  admitFinancialEventCommitment,
} from "@/lib/teams/fee-api";
import { Button } from "@/components/ui/button";
import { money } from "./ui";

type EventRow = {
  id: string;
  revision: number;
  title: string;
  kind: string;
  date: string;
  status: "scheduled" | "live" | "final" | "cancelled";
  entryFee?: number;
  travel?: "local" | "travel";
  overnightNights?: number;
};
type View = { basisVersion: number | null; events: EventRow[]; candidates: EventRow[] };
type Draft = EventRow & { admit: boolean; reason: string; confirmed: boolean };
export function FinancialEventCommitments({
  teamId,
  onSaved,
}: {
  teamId: string;
  onSaved: () => Promise<void>;
}) {
  const [data, setData] = useState<View>(),
    [draft, setDraft] = useState<Draft>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setBusy(true);
    setData(undefined);
    setDraft(undefined);
    setError("");
    setNotice("");
    try {
      const result = await getFinancialEventCommitments({ data: { teamId } });
      if (request === generation.current) setData(result);
    } catch (e) {
      if (request === generation.current)
        setError(e instanceof Error ? e.message : "Could not load financial events.");
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, [teamId]);
  useEffect(() => {
    const requests = generation;
    void refresh();
    return () => {
      requests.current++;
    };
  }, [refresh]);
  async function save() {
    if (!data?.basisVersion || !draft || busy) return;
    const request = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const fields = {
        teamId,
        activityId: draft.id,
        basisVersion: data.basisVersion,
        date: draft.date,
        status: draft.status,
        entryFee: draft.entryFee || 0,
        travel: draft.travel || "local",
        overnightNights: draft.overnightNights || 0,
        reason: draft.reason,
      };
      if (draft.admit) {
        if (!draft.confirmed) throw Error("Confirm the financial event before adding it.");
        await admitFinancialEventCommitment({
          data: { ...fields, sourceRevision: draft.revision, confirmed: true },
        });
      } else await saveFinancialEventCommitment({ data: { ...fields, revision: draft.revision } });
      if (request !== generation.current) return;
      const result = await getFinancialEventCommitments({ data: { teamId } });
      if (request !== generation.current) return;
      setDraft(undefined);
      setData(result);
      await onSaved();
      if (request === generation.current) setNotice("Financial commitment saved.");
    } catch (e) {
      if (request === generation.current)
        setError(e instanceof Error ? e.message : "Could not save financial commitment.");
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  const input = "office-control w-full";
  return (
    <section
      className="grid gap-3 rounded-xl border p-4"
      aria-label="Owner financial event commitments"
    >
      <h3 className="text-xl">Financial event commitments</h3>
      <Button variant="outlineDark" disabled={busy} onClick={() => void refresh()}>
        Refresh financial commitments
      </Button>
      <p className="text-sm">
        Review event costs and dates used for team finances. Saving here changes the financial
        commitment.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p role="status">
          {error ? "Financial events could not be loaded." : "Loading financial events…"}
        </p>
      ) : (
        <>
          {!data.events.length && <p>No financial event commitments yet.</p>}
          {data.events.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {e.title} · {e.date} · {money((e.entryFee || 0) / 100)}
              </span>
              <Button
                disabled={busy}
                variant="outlineDark"
                onClick={() => {
                  setDraft({ ...e, admit: false, reason: "", confirmed: false });
                  setNotice("");
                }}
              >
                Edit financial commitment
              </Button>
            </div>
          ))}
          {data.candidates.length > 0 && (
            <h4 className="font-semibold">Operational events awaiting financial review</h4>
          )}
          {data.candidates.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {e.title} · {e.date}
              </span>
              <Button
                disabled={busy}
                variant="outlineDark"
                onClick={() => {
                  setDraft({ ...e, entryFee: 0, admit: true, reason: "", confirmed: false });
                  setNotice("");
                }}
              >
                Review financial event
              </Button>
            </div>
          ))}
        </>
      )}
      {draft && (
        <form
          className="grid gap-3 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h4 className="font-semibold">{draft.title}</h4>
          <label>
            Financial commitment date
            <input
              type="date"
              required
              className={input}
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </label>
          <label>
            Entry / league fee ($)
            <input
              type="number"
              min="0"
              step="0.01"
              required
              className={input}
              value={(draft.entryFee || 0) / 100}
              onChange={(e) =>
                setDraft({ ...draft, entryFee: Math.round(Number(e.target.value) * 100) })
              }
            />
          </label>
          <label>
            Financial event status
            <select
              className={input}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })}
            >
              {["scheduled", "live", "final", "cancelled"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Travel
            <select
              className={input}
              value={draft.travel || "local"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  travel: e.target.value as Draft["travel"],
                  overnightNights: e.target.value === "local" ? 0 : draft.overnightNights,
                })
              }
            >
              <option value="local">Local</option>
              <option value="travel">Travel</option>
            </select>
          </label>
          {draft.travel === "travel" && (
            <label>
              Overnight nights
              <input
                type="number"
                min="0"
                max="30"
                step="1"
                className={input}
                value={draft.overnightNights || 0}
                onChange={(e) => setDraft({ ...draft, overnightNights: Number(e.target.value) })}
              />
            </label>
          )}
          <label>
            Reason
            <textarea
              required
              maxLength={1000}
              className={input}
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            />
          </label>
          {draft.admit && (
            <label className="flex gap-2">
              <input
                type="checkbox"
                required
                checked={draft.confirmed}
                onChange={(e) => setDraft({ ...draft, confirmed: e.target.checked })}
              />
              I approve adding this event, cost and travel details to team finances.
            </label>
          )}
          <div className="flex gap-2">
            <Button
              disabled={busy || !draft.reason.trim() || (draft.admit && !draft.confirmed)}
              type="submit"
            >
              {busy
                ? "Saving…"
                : draft.admit
                  ? "Add financial commitment"
                  : "Save financial commitment"}
            </Button>
            <Button
              disabled={busy}
              variant="outlineDark"
              type="button"
              onClick={() => setDraft(undefined)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
