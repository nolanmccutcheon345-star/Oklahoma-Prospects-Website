import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
  getOperationalLessonCompletions,
  saveOperationalLessonCompletion,
} from "@/lib/pd/operational-lesson-api";
export function OrganizationLessonCompletion() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getOperationalLessonCompletions>>>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [recap, setRecap] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await getOperationalLessonCompletions());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load lesson attendance.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const lesson = data?.lessons.find((r) => r.id === selected);
  return (
    <section
      className="grid gap-4 rounded-xl border border-line p-4"
      aria-label="Operational lesson attendance"
    >
      <h2 className="text-2xl">Lesson Attendance & Recap</h2>
      <p>
        Record a new operational observation after the lesson ends. Historical guided evidence stays
        intact. Financial recognition requires its separate authorized workflow.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading ended lessons…</p>}
      <Button variant="outlineDark" disabled={busy} onClick={() => void load()}>
        Refresh attendance
      </Button>
      {data && !data.canRecord && (
        <p role="status">Independent completion is awaiting financial cutover review.</p>
      )}
      {data?.lessons.length === 0 && <p>No ended lessons are available.</p>}
      {data && (
        <label>
          Ended lesson
          <select
            className="min-h-11 w-full rounded border border-line p-2"
            value={selected}
            disabled={busy}
            onChange={(e) => {
              setSelected(e.target.value);
              setRecap("");
              setReviewed(false);
            }}
          >
            <option value="">Choose a lesson</option>
            {data.lessons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.player} · {r.service} ·{" "}
                {new Date(r.endsAt).toLocaleDateString("en-US", { timeZone: "America/Chicago" })}
                {r.recorded ? " · recorded" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {lesson?.requiresGuidedReview && (
        <p role="status">
          Unpublished guided evidence requires owner classification and review. This form cannot
          publish or replace that evidence.
        </p>
      )}
      {lesson?.recorded && (
        <p role="status">An operational completion observation has already been recorded.</p>
      )}
      {lesson && !lesson.recorded && !lesson.requiresGuidedReview && (
        <form
          className="grid gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              await saveOperationalLessonCompletion({
                data: {
                  bookingId: lesson.id,
                  expectedEndsAt: lesson.endsAt,
                  attendance: "present",
                  recap,
                  qualifiedReview: true,
                },
              });
              setSelected("");
              setRecap("");
              setReviewed(false);
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not record attendance.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            New lesson recap
            <textarea
              className="min-h-28 w-full rounded border border-line p-2"
              minLength={10}
              maxLength={5000}
              required
              value={recap}
              onChange={(e) => setRecap(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              required
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              disabled={busy}
            />{" "}
            I verified that the athlete attended and the lesson ended.
          </label>
          <Button
            type="submit"
            disabled={busy || !data?.canRecord || !reviewed || recap.trim().length < 10}
          >
            {busy ? "Saving…" : "Record attendance and recap"}
          </Button>
        </form>
      )}
    </section>
  );
}
