import { useEffect, useState } from "react";
import {
  getLessonAssignments,
  getLessonInstructors,
  saveLessonInstructor,
} from "@/lib/commerce/lesson-assignment-api";
import { Button } from "@/components/ui/button";
type Lesson = Awaited<ReturnType<typeof getLessonAssignments>>[number];
const date = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export function LessonAssignments() {
  const [lessons, setLessons] = useState<Lesson[]>(),
    [error, setError] = useState(""),
    [all, setAll] = useState(false),
    [notice, setNotice] = useState("");
  async function load() {
    setLessons(await getLessonAssignments());
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const pending = lessons?.filter((b) => !b.coachId).length || 0;
  return (
    <section
      className="grid gap-3 rounded-xl border border-line bg-white p-4"
      aria-label="Lesson instructor assignments"
    >
      <h3 className="text-2xl">Lesson instructor assignments</h3>
      <p>
        Assign an available instructor to an existing confirmed lesson. The booking, payment, price
        and scheduled time stay the same.
      </p>
      <p className="font-semibold">
        {pending} need{pending === 1 ? "s" : ""} an instructor
      </p>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        Show assigned lessons too
      </label>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!lessons && !error && <p>Loading lessons…</p>}
      {lessons && !(all ? lessons : lessons.filter((b) => !b.coachId)).length && (
        <p>
          {all
            ? "No upcoming confirmed lessons."
            : "All upcoming lessons have an instructor. Show assigned lessons to review or change an assignment."}
        </p>
      )}
      {(all ? lessons : lessons?.filter((b) => !b.coachId))?.map((b) => (
        <LessonAssignment
          key={`${b.id}:${b.coachId}:${b.startsAt}`}
          lesson={b}
          onSaved={async () => {
            setNotice("Instructor assigned. The existing booking and payment are unchanged.");
            await load();
          }}
        />
      ))}
      {lessons?.length === 200 && (
        <p>Showing the next 200 lessons, with unassigned lessons first.</p>
      )}
    </section>
  );
}
function LessonAssignment({
  lesson: b,
  onSaved,
}: {
  lesson: Lesson;
  onSaved: () => Promise<void>;
}) {
  const [choices, setChoices] = useState<Awaited<ReturnType<typeof getLessonInstructors>>>(),
    [coachId, setCoachId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function refresh() {
    setBusy(true);
    setError("");
    setChoices(undefined);
    setCoachId("");
    try {
      const available = await getLessonInstructors({ data: { id: b.id } });
      if (
        available.coachId !== b.coachId ||
        available.startsAt !== b.startsAt ||
        available.endsAt !== b.endsAt
      ) {
        throw new Error(
          "This lesson changed. Reload Bookings to review its current details before assigning an instructor.",
        );
      }
      setChoices(available);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load instructors.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="grid min-w-0 gap-2 rounded-lg border border-line p-3">
      <h4 className="font-semibold">
        {b.serviceName} · {b.playerName || "Player not listed"}
      </h4>
      <p>
        {date(b.startsAt)} –{" "}
        {new Date(b.endsAt).toLocaleTimeString("en-US", {
          timeZone: "America/Chicago",
          hour: "numeric",
          minute: "2-digit",
        })}{" "}
        Central
      </p>
      {b.customerEmail && <p className="break-all">{b.customerEmail}</p>}
      <p>
        Instructor: <strong>{b.coachName || "Needs instructor"}</strong>
      </p>
      <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
        {busy
          ? "Please wait…"
          : choices
            ? "Refresh available instructors"
            : b.coachId
              ? "Change instructor"
              : "Find available instructors"}
      </Button>
      {choices && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await saveLessonInstructor({
                data: {
                  id: b.id,
                  coachId,
                  expectedCoachId: choices.coachId,
                  startsAt: choices.startsAt,
                  endsAt: choices.endsAt,
                },
              });
              await onSaved();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Assignment did not save.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {choices.instructors.length ? (
            <>
              <label className="grid gap-1">
                Available instructor
                <select
                  className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-white p-2"
                  required
                  value={coachId}
                  disabled={busy}
                  onChange={(e) => setCoachId(e.target.value)}
                >
                  <option value="">Choose an instructor</option>
                  {choices.instructors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.id === choices.coachId ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm">
                Only instructors approved for this service and available for the entire lesson are
                listed.
              </p>
              <Button type="submit" disabled={busy || !coachId || coachId === choices.coachId}>
                Save instructor assignment
              </Button>
            </>
          ) : (
            <p>
              No qualified instructors are available for this full session. Review instructor
              service assignments and availability in Staff &amp; Access. The paid booking remains
              confirmed.
            </p>
          )}
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
