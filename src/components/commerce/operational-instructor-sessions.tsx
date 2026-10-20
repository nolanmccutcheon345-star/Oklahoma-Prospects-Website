import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { BookedGuidedLesson } from "../pd/booked-guided-lesson";
import {
  getOperationalInstructionBookings,
  recordInstructorAttendance,
} from "@/lib/operational-instruction-api";
type Row = Awaited<ReturnType<typeof getOperationalInstructionBookings>>[number];
function Attendance({
  row,
  busy,
  onSave,
}: {
  row: Row;
  busy: boolean;
  onSave: (row: Row, recap: string) => Promise<void>;
}) {
  const [recap, setRecap] = useState("");
  const [reviewed, setReviewed] = useState(false);
  if (row.recorded) return <p>Attendance observation recorded.</p>;
  if (new Date(row.ends_at).getTime() > Date.now())
    return <p>Attendance can be recorded after this lesson ends.</p>;
  if (row.has_draft)
    return (
      <p>The saved guided draft needs owner review before a separate attendance observation.</p>
    );
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && reviewed) void onSave(row, recap);
      }}
    >
      <label className="grid gap-1">
        Attendance recap
        <textarea
          aria-label={`Attendance recap for ${row.athlete_name}`}
          className="min-h-24 rounded border p-2"
          minLength={10}
          maxLength={5000}
          required
          value={recap}
          onChange={(event) => setRecap(event.target.value)}
          disabled={busy}
        />
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          required
          checked={reviewed}
          disabled={busy}
          onChange={(event) => setReviewed(event.target.checked)}
        />
        I reviewed this ended lesson and confirm the athlete attended.
      </label>
      <Button type="submit" className="justify-self-start" disabled={busy || !reviewed}>
        Record attendance observation
      </Button>
    </form>
  );
}
export function OperationalInstructorSessions() {
  const [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [lesson, setLesson] = useState<string | null>(null);
  const mounted = useRef(false),
    request = useRef(0),
    saving = useRef(false);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = await getOperationalInstructionBookings();
      if (mounted.current && id === request.current) setRows(next);
    } catch (cause) {
      if (mounted.current && id === request.current)
        setError(cause instanceof Error ? cause.message : "Sessions could not load.");
    } finally {
      if (mounted.current && id === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  async function save(row: Row, recap: string) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await recordInstructorAttendance({
        data: {
          bookingId: row.id,
          expectedEndsAt: new Date(row.ends_at).toISOString(),
          attendance: "present",
          recap,
          qualifiedReview: true,
        },
      });
      if (mounted.current) {
        setNotice(
          "Attendance observation recorded. The paid booking and assessment eligibility are unchanged.",
        );
        await load();
      }
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : "Attendance could not save.");
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Operational instructor sessions" className="grid gap-4">
      <h2 className="text-2xl">Assigned lesson sessions</h2>
      <p>
        View your schedule, prepare guided lesson drafts, and record attendance observations. Paid
        service assignments, published completion, assessment eligibility, and recruiting access
        require their existing approvals.
      </p>
      <Button
        variant="outlineDark"
        className="justify-self-start"
        disabled={busy || loading}
        onClick={() => void load()}
      >
        Refresh sessions
      </Button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <p role="status">Loading sessions…</p>
      ) : rows.length === 0 ? (
        <p>No lesson sessions are assigned to you.</p>
      ) : (
        rows.map((row) => (
          <article key={row.id} className="grid gap-3 rounded-xl border p-4">
            <h3 className="text-xl">
              {row.athlete_name} · {row.service}
            </h3>
            <p>
              {new Date(row.starts_at).toLocaleString("en-US", { timeZone: "America/Chicago" })}{" "}
              Central Time
            </p>
            <Button
              className="justify-self-start"
              variant="outlineDark"
              disabled={busy}
              onClick={() => setLesson(row.id)}
            >
              Open guided lesson draft
            </Button>
            <Attendance row={row} busy={busy} onSave={save} />
          </article>
        ))
      )}
      {lesson && (
        <BookedGuidedLesson
          key={lesson}
          bookingId={lesson}
          onClose={() => {
            setLesson(null);
            void load();
          }}
        />
      )}
    </section>
  );
}
