import {LessonChoices} from "./lesson-choices";
import {MyTraining} from "./my-training";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
  openBookedLesson,
  saveBookedLesson,
  reviewBookedLesson,
  getBookedLessonHistory,
  getLessonExceptions,
} from "@/lib/pd/lesson-session-api";
import {
  lessonDisciplines,
  type LessonDocument,
  type LessonDiscipline,
} from "@/lib/pd/lesson-templates";
import { scoreChart } from "@/lib/pd/lesson";
import { LessonRecruitingMetrics } from "../lesson-recruiting-metrics";
type Opened = Awaited<ReturnType<typeof openBookedLesson>>;
const control = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-white p-2 text-ink";
export function BookedGuidedLesson({
  bookingId,
  onClose,
}: {
  bookingId: string;
  onClose: () => void;
}) {
  const [opened, setOpened] = useState<Opened>(),
    [doc, setDoc] = useState<LessonDocument>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const load = useCallback(async () => {
    const value = await openBookedLesson({ data: { bookingId } });
    setOpened(value);
    setDoc(value.session?.document);
    setDirty(false);
  }, [bookingId]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const session = opened?.session,
    template = session?.snapshot.template,
    readonly = session?.status === "published" || opened?.bookingStatus !== "confirmed";
  const patch = (next: Partial<LessonDocument>) => {
    setDoc((d) => (d ? { ...d, ...next } : d));
    setDirty(true);
    setNotice("");
  };
  async function save(complete: boolean) {
    if (!doc || !session) return;
    setBusy(true);
    setError("");
    try {
      const result = await saveBookedLesson({
        data: { bookingId, revision: session.revision, document: doc, complete },
      });
      setOpened((o) =>
        o && o.session
          ? {
              ...o,
              bookingStatus: complete ? "completed" : o.bookingStatus,
              session: {
                ...o.session,
                revision: result.revision,
                status: complete ? "published" : "draft",
                document: doc,
              },
            }
          : o,
      );
      setDirty(false);
      setNotice(
        complete
          ? "Session completed. Training history and applicable instructor earnings were recorded once. No payment was collected."
          : "Draft saved to the player’s lesson. You can safely return later.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Your form remains here.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-paper p-4 pb-28 text-ink"
      role="dialog"
      aria-modal="true"
      aria-label="Booked guided lesson"
    >
      <div className="mx-auto grid max-w-4xl gap-4">
        <header className=" rounded-xl bg-ink p-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl">Guided lesson</h2>
            <Button
              variant="outline"
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm(
                    "Close without saving your current edits? The last saved draft will remain.",
                  )
                )
                  onClose();
              }}
            >
              Close
            </Button>
          </div>
          {template && (
            <p>
              {opened?.athleteName} · {template.sport} · {session?.snapshot.service.service.name} ·{" "}
              {template.minutes} min
            </p>
          )}
          {session && (
            <p className="text-sm">
              {new Date(session.snapshot.startsAt).toLocaleString("en-US", {
                timeZone: "America/Chicago",
              })}{" "}
              Central · {opened?.bookingStatus}
            </p>
          )}
        </header>
        {error && (
          <p role="alert" className="rounded-lg border border-maroon p-3">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {!opened && !error && <p>Resolving the booked lesson…</p>}
        {opened && "legacyCompleted" in opened && opened.legacyCompleted && (
          <section className="rounded-lg border bg-white p-4">
            <h3>Previously completed lesson</h3>
            <p>{opened.legacyCompleted.recap}</p>
            <p>
              This earlier record is read-only. Its original development history and financial
              records are unchanged.
            </p>
          </section>
        )}
        {session && <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Development brief · programs and home practice</summary><div className="mt-4"><MyTraining athleteId={session.athlete_id} compact/></div></details>}
        {opened?.resolutionError && (
          <section className="rounded-xl border p-4">
            <p>{opened.resolutionError}</p>
            {opened.canReview && (
              <form
                className="mt-3 grid gap-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setBusy(true);
                  setError("");
                  try {
                    await reviewBookedLesson({
                      data: {
                        bookingId,
                        sport: String(f.get("sport")) as "baseball" | "softball",
                        discipline: String(f.get("discipline")) as LessonDiscipline,
                        reason: String(f.get("reason")),
                      },
                    });
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Verified booked sport
                  <select
                    aria-label="Verified booked sport"
                    required
                    className={control}
                    name="sport"
                  >
                    <option value="">Select sport</option>
                    <option value="baseball">Baseball</option>
                    <option value="softball">Softball</option>
                  </select>
                </label>
                <label>
                  Verified booked discipline
                  <select
                    aria-label="Verified booked discipline"
                    required
                    className={control}
                    name="discipline"
                  >
                    <option value="">Select discipline</option>
                    {lessonDisciplines.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Source checked and reason for this resolution
                  <textarea
                    aria-label="Source checked and reason for this resolution"
                    required
                    minLength={10}
                    className={control}
                    name="reason"
                  />
                </label>
                <p>
                  This preserves the existing appointment and payment and records an explicit legacy
                  configuration review.
                </p>
                <Button type="submit" disabled={busy}>
                  Save reviewed configuration
                </Button>
              </form>
            )}
          </section>
        )}
        {session && template && doc && (
          <>
            <p className="text-sm">
              Template {template.version} · {template.ageBand} ·{" "}
              {readonly ? "Read-only saved session" : dirty ? "Unsaved changes" : "Saved draft"}
            </p>
            {!readonly && <LessonChoices bookingId={bookingId} revision={session.revision} template={template} canReview={Boolean(opened?.canReview)} disabled={busy||dirty} onSaved={load}/>}
            <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Lesson stages">
              {template.stages.map((s, i) => (
                <button
                  key={s.name}
                  className={`min-h-11 min-w-0 break-words rounded-lg border p-2 text-sm ${doc.stage === i ? "bg-maroon text-white" : "bg-white"}`}
                  disabled={busy}
                  aria-current={doc.stage === i ? "step" : undefined}
                  onClick={() => (readonly ? setDoc({ ...doc, stage: i }) : patch({ stage: i }))}
                >
                  {i + 1}. {s.name} · {s.minutes}m
                </button>
              ))}
            </nav>
            <progress
              className="w-full"
              max={8}
              value={doc.stage + 1}
              aria-label="Lesson progress"
            />
            <section className="grid gap-3 rounded-xl border bg-white p-4">
              <h3 className="text-2xl">
                {doc.stage + 1}. {template.stages[doc.stage].name}
              </h3>
              <p>
                Planned: {template.stages[doc.stage].minutes} minutes. Actual time is recorded
                separately.
              </p>
              <ul className="list-disc pl-5">
                {template.stages[doc.stage].instructions.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
              <fieldset disabled={readonly || busy} className="grid min-w-0 gap-3">
                {doc.stage === 0 && (
                  <>
                    <label>
                      Attendance
                      <select
                        aria-label="Attendance"
                        className={control}
                        value={doc.attendance}
                        onChange={(e) =>
                          patch({ attendance: e.target.value as LessonDocument["attendance"] })
                        }
                      >
                        {["unconfirmed", "present", "partial", "no-show"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Readiness
                      <select
                        aria-label="Readiness"
                        className={control}
                        value={doc.readiness}
                        onChange={(e) =>
                          patch({ readiness: e.target.value as LessonDocument["readiness"] })
                        }
                      >
                        {["unchecked", "ready", "restricted"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Current restrictions and recent workload review
                      <textarea
                        aria-label="Current restrictions and recent workload review"
                        className={control}
                        maxLength={500}
                        value={doc.restrictions}
                        onChange={(e) => patch({ restrictions: e.target.value })}
                      />
                    </label>
                  </>
                )}
                {doc.stage === 1 && (
                  <>
                    <label>
                      Session objective
                      <textarea
                        aria-label="Session objective"
                        className={control}
                        maxLength={500}
                        value={doc.objective}
                        onChange={(e) => patch({ objective: e.target.value })}
                      />
                    </label>
                    <label>
                      Documented adaptation / override reason
                      <textarea
                        aria-label="Documented adaptation / override reason"
                        className={control}
                        maxLength={500}
                        value={doc.overrideReason}
                        onChange={(e) => patch({ overrideReason: e.target.value })}
                      />
                    </label>
                  </>
                )}
                {(doc.stage === 2 || doc.stage === 3) && template.warmupReference && (
                  <article className="rounded-lg border p-3">
                    <h4>{template.warmupReference.title}</h4>
                    <p>
                      Use appropriate elements within the planned stage time; adapt dose to
                      readiness.
                    </p>
                    {template.warmupReference.steps
                      .filter((w) => (doc.stage === 2 ? w.letter !== "P" : w.letter === "P"))
                      .map((w, i) => (
                        <p key={i}>
                          <strong>{w.name}</strong> · {w.reps} — {w.why}
                        </p>
                      ))}
                  </article>
                )}
                {doc.stage === 4 &&
                  template.drills.map((d) => (
                    <article key={d.id} className="rounded-lg border p-3">
                      <h4 className="font-bold">{d.name}</h4>
                      <p>{d.setup}</p>
                      <p>{d.dose}</p>
                      <p>Cues: {d.cues.join(" · ")}</p>
                      <p>Watch: {d.watch.join(" · ")}</p>
                    </article>
                  ))}
                {doc.stage === 5 && (
                  <PracticeTracker
                    discipline={template.discipline}
                    doc={doc}
                    patch={patch}
                    readonly={readonly || busy}
                  />
                )}
                {doc.stage === 7 && (
                  <>
                    <label>
                      Family recap
                      <textarea
                        aria-label="Family recap"
                        className={control}
                        maxLength={5000}
                        value={doc.familyRecap}
                        onChange={(e) => patch({ familyRecap: e.target.value })}
                      />
                    </label>
                    <label>
                      Private instructor notes
                      <textarea
                        aria-label="Private instructor notes"
                        className={control}
                        maxLength={5000}
                        value={doc.coachNotes}
                        onChange={(e) => patch({ coachNotes: e.target.value })}
                      />
                    </label>
                    <label>
                      Homework and dose (or explain why none)
                      <textarea
                        aria-label="Homework and dose (or explain why none)"
                        className={control}
                        maxLength={2000}
                        value={doc.homework}
                        onChange={(e) => patch({ homework: e.target.value })}
                      />
                    </label>
                    <label>
                      Next steps
                      <textarea
                        aria-label="Next steps"
                        className={control}
                        maxLength={500}
                        value={doc.nextSteps}
                        onChange={(e) => patch({ nextSteps: e.target.value })}
                      />
                    </label>
                  </>
                )}
                <label>
                  Stage notes — document completed, modified or skipped activities
                  <textarea
                    aria-label="Stage notes — document completed, modified or skipped activities"
                    className={control}
                    maxLength={2000}
                    value={doc.stageNotes[doc.stage]}
                    onChange={(e) => {
                      const notes = [...doc.stageNotes];
                      notes[doc.stage] = e.target.value;
                      patch({ stageNotes: notes });
                    }}
                  />
                </label>
                <label>
                  Actual minutes spent
                  <input
                    aria-label="Actual minutes spent"
                    className={control}
                    type="number"
                    min={0}
                    max={300}
                    step="0.5"
                    value={doc.actualMinutes[doc.stage]}
                    onChange={(e) => {
                      const actual = [...doc.actualMinutes];
                      actual[doc.stage] = Number(e.target.value);
                      patch({ actualMinutes: actual });
                    }}
                  />
                </label>
              </fieldset>
            </section>
            <details className="rounded-xl border bg-white p-4">
              <summary className="min-h-11 cursor-pointer">
                Player context, workload and safety review
              </summary>
              <p>
                Age band: {template.ageBand}. Goals and priorities are guidance; review current
                readiness before prescribing work.
              </p>
              <ul className="list-disc pl-5">
                {template.safety.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              {Object.entries(session.snapshot.context)
                .filter(([k]) => !["age", "name", "level"].includes(k))
                .map(([k, v]) => (
                  <section key={k}>
                    <h4 className="mt-3 font-bold capitalize">{k}</h4>
                    <RecordDetails value={v} />
                  </section>
                ))}
            </details>
            <p>
              Planned total: {template.stages.reduce((n, s) => n + s.minutes, 0)} min · Actual
              recorded: {doc.actualMinutes.reduce((a, b) => a + b, 0)} min
            </p>
            <p className="text-sm">
              Practice logs are not verified recruiting metrics. Use the separate verified
              measurement action only for personally observed, appropriately measured results.
            </p>
            <LessonRecruitingMetrics bookingId={bookingId} />
            {!readonly && (
              <div className="flex flex-wrap gap-3 rounded-xl border bg-paper p-3">
                <Button variant="outlineDark" disabled={busy} onClick={() => void save(false)}>
                  Save Draft
                </Button>
                <Button disabled={busy || doc.stage !== 7} onClick={() => void save(true)}>
                  Publish &amp; Complete Session
                </Button>
                {doc.stage < 7 && (
                  <Button
                    variant="outlineDark"
                    disabled={busy}
                    onClick={() => patch({ stage: doc.stage + 1 })}
                  >
                    Continue
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
const fields: Record<LessonDiscipline, [string, string, boolean?][]> = {
  Pitching: [
    ["pitchType", "Pitch type"],
    ["velocity", "Velocity (mph)", true],
    ["outcome", "Outcome"],
    ["repetitions", "Throw count", true],
  ],
  Hitting: [
    ["repetitions", "Swings / repetitions", true],
    ["contactQuality", "Contact quality"],
    ["outcome", "Outcome"],
    ["mechanics", "Mechanical observations"],
  ],
  Catching: [
    ["skill", "Receiving / blocking / throwing"],
    ["repetitions", "Repetitions", true],
    ["outcome", "Rep outcome"],
    ["transfer", "Transfer"],
    ["footwork", "Footwork"],
  ],
  Fielding: [
    ["position", "Position"],
    ["ballType", "Fielded-ball type"],
    ["repetitions", "Repetitions", true],
    ["execution", "Execution"],
    ["errors", "Errors", true],
    ["footwork", "Footwork"],
    ["throwQuality", "Throw quality"],
  ],
  "Strength/Speed": [
    ["exercise", "Exercise"],
    ["sets", "Sets", true],
    ["repetitions", "Repetitions", true],
    ["load", "Load", true],
    ["loadUnit", "Load unit: lb / kg / bodyweight"],
    ["distance", "Distance"],
    ["timeSeconds", "Time (seconds)", true],
    ["outcome", "Performance result"],
  ],
};
function PracticeTracker({
  discipline,
  doc,
  patch,
  readonly,
}: {
  discipline: LessonDiscipline;
  doc: LessonDocument;
  patch: (p: Partial<LessonDocument>) => void;
  readonly: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const input = (key: string, label: string, numeric = false) => (
    <label key={key}>
      {label}
      <input
        aria-label={label}
        className={control}
        disabled={readonly}
        type={numeric ? "number" : "text"}
        min={numeric ? 0 : undefined}
        step={numeric ? "any" : undefined}
        maxLength={500}
        value={values[key] || ""}
        onChange={(e) => setValues({ ...values, [key]: e.target.value })}
      />
    </label>
  );
  const chart = scoreChart(
    doc.logs
      .filter((l) => l.kind === "Pitching" && l.intent && l.actual)
      .map((l) => ({ intent: l.intent!, actual: l.actual!, velo: l.velocity })),
  );
  return (
    <div className="grid gap-3">
      <h4 className="text-xl">{discipline} practice tracker</h4>
      {discipline === "Pitching" && (
        <p>
          Command TCI: {chart.tci} · {chart.pitches.length} charted pitches
        </p>
      )}
      {!readonly && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {input("drill", "Drill / task")}
            {fields[discipline].map(([key, label, n]) => input(key, label, n))}
            {input("observations", "Instructor observations")}
            {input("measurement", "Optional measurement name")}
            {input("measurementValue", "Measured value", true)}
            {input("measurementUnit", "Measurement unit")}
            {discipline === "Pitching" &&
              ["intent", "actual"].map((kind) => (
                <fieldset key={kind}>
                  <legend>
                    {kind === "intent" ? "Called location" : "Actual location"} — catcher’s view,
                    0–4 grid
                  </legend>
                  {["row", "col"].map((axis) => (
                    <label key={axis}>
                      {axis}
                      <select
                        className={control}
                        value={values[kind + axis] || ""}
                        onChange={(e) => setValues({ ...values, [kind + axis]: e.target.value })}
                      >
                        <option value="">Not charted</option>
                        {[0, 1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </fieldset>
              ))}
          </div>
          <Button
            type="button"
            variant="outlineDark"
            onClick={() => {
              const log: Record<string, unknown> = {
                id: crypto.randomUUID(),
                kind: discipline,
                drill: values.drill || "",
                observations: values.observations || "",
              };
              for (const [key, , numeric] of [
                ...fields[discipline],
                ["measurement", ""],
                ["measurementValue", "", true],
                ["measurementUnit", ""],
              ] as [string, string, boolean?][])
                if (values[key]) log[key] = numeric ? Number(values[key]) : values[key];
              for (const kind of ["intent", "actual"])
                if (
                  values[kind + "row"] !== undefined &&
                  values[kind + "row"] !== "" &&
                  values[kind + "col"] !== undefined &&
                  values[kind + "col"] !== ""
                )
                  log[kind] = {
                    row: Number(values[kind + "row"]),
                    col: Number(values[kind + "col"]),
                  };
              patch({ logs: [...doc.logs, log as LessonDocument["logs"][number]] });
              setValues({});
            }}
          >
            Add practice record
          </Button>
        </>
      )}
      <p>{doc.logs.length} practice records · Save Draft to store them durably.</p>
      {doc.logs.map((log, i) => (
        <details key={log.id} className="rounded border p-2">
          <summary className="min-h-11">
            {i + 1}. {log.drill || log.kind} ·{" "}
            {log.outcome || log.execution || "Practice observation"}
          </summary>
          <RecordDetails value={log} />
          {!readonly && (
            <Button
              variant="outlineDark"
              onClick={() => patch({ logs: doc.logs.filter((l) => l.id !== log.id) })}
            >
              Remove this draft record
            </Button>
          )}
        </details>
      ))}
    </div>
  );
}
export function BookedLessonHistory({ athleteId }: { athleteId: string }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getBookedLessonHistory>>>([]),
    [error, setError] = useState("");
  useEffect(() => {
    void getBookedLessonHistory({ data: { athleteId } })
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [athleteId]);
  return (
    <section>
      <h3 className="text-2xl">Completed guided sessions</h3>
      {error && <p role="alert">{error}</p>}
      {rows.map((r) => (
        <details key={r.id} className="my-3 rounded-lg border p-3">
          <summary className="min-h-11">
            {new Date(r.date).toLocaleDateString("en-US", { timeZone: "America/Chicago" })} ·{" "}
            {r.sport} {r.discipline} · {r.minutes} min
          </summary>
          <p>{r.document.familyRecap}</p>
          <p>Homework: {r.document.homework}</p>
          <p>Next: {r.document.nextSteps}</p>
          <p>Template: {r.templateVersion} · Practice results, not recruiting verification</p>
          {r.document.logs.map((l) => (
            <RecordDetails key={l.id} value={l} />
          ))}
          {r.document.coachNotes && <p>Private notes: {r.document.coachNotes}</p>}
        </details>
      ))}
    </section>
  );
}
export function LessonExceptionReport() {
  const [report, setReport] = useState<Awaited<ReturnType<typeof getLessonExceptions>>>(),
    [error, setError] = useState("");
  return (
    <details className="rounded-lg border p-4">
      <summary className="min-h-11">Lesson history exception review</summary>
      <Button
        onClick={() =>
          void getLessonExceptions()
            .then(setReport)
            .catch((e) => setError(e.message))
        }
      >
        Run read-only report
      </Button>
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <p>{report.note}</p>
          <p>
            {report.legacy.length} historical candidates · {report.changedBookings.length}{" "}
            changed-booking exceptions
          </p>
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(report, null, 2)}</pre>
        </>
      )}
    </details>
  );
}

function RecordDetails({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "")
    return <p className="text-sm text-muted-foreground">Not recorded</p>;
  if (Array.isArray(value))
    return value.length ? (
      <div className="grid gap-2">
        {value.map((v, i) => (
          <div key={i} className="rounded border p-2">
            <RecordDetails value={v} />
          </div>
        ))}
      </div>
    ) : (
      <p className="text-sm">None recorded</p>
    );
  if (typeof value === "object")
    return (
      <dl className="grid min-w-0 gap-1 text-sm">
        {Object.entries(value)
          .filter(
            ([k, v]) =>
              !/(^id$|Ids?$|^createdBy$|^updatedBy$)/.test(k) &&
              v !== "" &&
              v !== null &&
              v !== undefined,
          )
          .map(([k, v]) => (
            <div key={k} className="break-words">
              <dt className="font-semibold capitalize">
                {k.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}
              </dt>
              <dd>
                <RecordDetails value={v} />
              </dd>
            </div>
          ))}
      </dl>
    );
  return <span className="break-words">{String(value)}</span>;
}
