import { TrainingQuality } from "./training-review";
import { DevelopmentContext } from "./development-context";
import { developmentPrograms, compatibleProgram } from "@/lib/pd/development-programs";
import { CurriculumEditor } from "./curriculum-editor";
import { useReadOnlyPreview } from "@/lib/pd/preview";
import {
  useCallback,
  useEffect,
  useState,
  useId,
  cloneElement,
  isValidElement,
  type ReactNode,
} from "react";
import { Button } from "../ui/button";
import { loadTraining, assignTraining, logTraining, reviewTraining } from "@/lib/pd/training-api";
import {
  trainingDrills,
  programFamilies,
  skillBands,
  safetySources,
  ageBand,
} from "@/lib/pd/training-catalog";
import type {
  AssignmentInput,
  PracticeInput,
  TrainingAssignment,
  TrainingLog,
  TrainingReviewInput,
} from "@/lib/pd/training";
import { chicagoDate } from "@/lib/scheduling";
const control = "w-full min-w-0 min-h-11 rounded-lg border border-line bg-white p-2 text-ink";
const card = "rounded-xl border border-line bg-white p-4";
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      {isValidElement<Record<string, unknown>>(children)
        ? cloneElement(children, { id })
        : children}
    </div>
  );
}
function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-maroon/10 p-3 text-maroon">
      {children}
    </p>
  );
}
const isoAdd = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
export function MyTraining({
  athleteId,
  compact = false,
}: {
  athleteId: string;
  compact?: boolean;
}) {
  const readOnly = useReadOnlyPreview();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadTraining>>>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState("Today"),
    [adding, setAdding] = useState(false);
  const load = useCallback(
    async () => setData(await loadTraining({ data: { athleteId } })),
    [athleteId],
  );
  useEffect(() => {
    setData(undefined);
    setError("");
    let active = true;
    void loadTraining({ data: { athleteId } })
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [athleteId]);
  const today = chicagoDate(new Date()),
    weekEnd = isoAdd(today, 7);
  return (
    <section className="grid min-w-0 gap-4" aria-label="My Training">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-maroon">Player development</p>
          <h3 className="text-2xl">{compact ? "Development brief" : "My Training"}</h3>
          <p className="text-sm text-muted">
            {data?.athleteName} · Coach-reviewed practice and shared feedback
          </p>
        </div>
        {data?.coach && !compact && !readOnly && (
          <Button onClick={() => setAdding(!adding)}>
            {adding ? "Close assignment" : "Assign training"}
          </Button>
        )}
      </header>
      {error && <Problem>{error}</Problem>}
      {!data && !error && <p>Loading training…</p>}
      {data && (
        <>
          {data.assignments.some((a) => a.status === "paused") && (
            <Problem>
              Training is on hold. Stop painful activity and tell your guardian and coach. Your
              coach must review the concern and any required professional clearance before activity
              resumes.
            </Problem>
          )}
          <DevelopmentContext data={data} />
          {data.admin && !compact && <TrainingQuality athleteId={athleteId} />}
          {compact ? (
            <>
              <p>
                {data.assignments.filter((a) => a.status === "active").length} active programs ·{" "}
                {data.logs.length} practice records
              </p>
              {data.assignments.map((a) => (
                <div key={a.id} className={card}>
                  <strong>
                    {a.document.title} · {a.status}
                  </strong>
                  <p>Phase: {a.document.phases[a.document.phase]}</p>
                  <p>Goal: {a.document.goal}</p>
                  <p>Workload reviewed: {a.document.workload}</p>
                </div>
              ))}
              <p>
                {
                  data.assignments
                    .filter((a) => a.status === "active")
                    .flatMap((a) =>
                      a.document.tasks.filter(
                        (t) =>
                          t.date < today &&
                          !data.logs.some((l) => l.assignment_id === a.id && l.task_id === t.id),
                      ),
                    ).length
                }{" "}
                overdue / unreported tasks. Ask before assuming practice was missed.
              </p>
              {data.events
                .filter((e) => e.kind === "coach review" || e.kind === "safety hold")
                .slice(0, 3)
                .map((e) => (
                  <p key={e.id}>{e.document.feedback}</p>
                ))}
              {data.logs.slice(0, 5).map((l) => (
                <p key={l.id}>
                  {l.document.status} · {l.document.source} · {l.document.notes}{" "}
                  {l.document.question && `Question: ${l.document.question}`}{" "}
                  {l.document.pain ? "Pain reported" : ""}
                </p>
              ))}
            </>
          ) : (
            <>
              {adding && data.coach && !readOnly && (
                <AssignmentForm
                  athleteId={athleteId}
                  data={data}
                  onSaved={async () => {
                    await load();
                    setAdding(false);
                    setTab("My Programs");
                  }}
                />
              )}
              <nav className="flex flex-wrap gap-2" aria-label="Training sections">
                {[
                  "Today",
                  "This Week",
                  "My Programs",
                  "My Progress",
                  "My Coach",
                  "Drill Library",
                ].map((t) => (
                  <Button
                    key={t}
                    variant={tab === t ? "maroon" : "outlineDark"}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </Button>
                ))}
              </nav>
              {(tab === "Today" || tab === "This Week") && (
                <>
                  <p className="text-sm text-muted">
                    Days without assigned tasks are unscheduled or recovery days. Check team
                    activities and existing throwing plans before training.
                  </p>
                  {tab === "This Week" && (
                    <ol className="grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: 7 }, (_, i) => isoAdd(today, i)).map((date) => {
                        const planned = data.assignments
                          .filter((a) => a.status === "active" || a.status === "paused")
                          .flatMap((a) => a.document.tasks.filter((t) => t.date === date));
                        return (
                          <li key={date} className={card}>
                            <strong>{date}</strong>
                            <p>
                              {planned.length
                                ? `${planned.length} assigned activities — see instructions below`
                                : "No assigned home work. Confirm team activity; allow planned recovery."}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {data.assignments
                    .filter((a) => a.status === "active" || a.status === "paused")
                    .flatMap((a) =>
                      a.document.tasks
                        .filter((t) =>
                          tab === "Today"
                            ? t.date <= today &&
                              !data.logs.some((l) => l.assignment_id === a.id && l.task_id === t.id)
                            : t.date >= today && t.date < weekEnd,
                        )
                        .map((t) => (
                          <TaskCard
                            key={a.id + t.id}
                            assignment={a}
                            task={t}
                            log={data.logs.find(
                              (l) => l.assignment_id === a.id && l.task_id === t.id,
                            )}
                            coach={data.coach}
                            readOnly={readOnly}
                            onSaved={load}
                          />
                        )),
                    )}
                  {!data.assignments.length && (
                    <p className={card}>
                      No training assigned yet. Your coach will choose a plan after reviewing your
                      goals, experience and workload.
                    </p>
                  )}
                </>
              )}
              {tab === "My Programs" && (
                <>
                  {!data.assignments.length && <p>No programs assigned.</p>}
                  {data.assignments.map((a) => (
                    <article className={`${card} grid gap-3`} key={a.id}>
                      <h4 className="text-xl">{a.document.title}</h4>
                      <p>
                        {a.document.sport} · {a.document.discipline} · {a.status} ·{" "}
                        {a.document.weeks} weeks
                      </p>
                      <p>
                        Coach: {a.document.coachName} · Review: {a.document.reviewDate}
                      </p>
                      <p>Why this program: {a.document.reason}</p>
                      <p>Goal: {a.document.goal}</p>
                      <p>Baseline: {a.document.baseline}</p>
                      <p>Current phase: {a.document.phases[a.document.phase]}</p>
                      <p>Workload and recovery: {a.document.workload}</p>
                      <p className="text-sm text-muted">
                        Phases advance only after a coach reviews evidence. The calendar never
                        increases your load automatically.
                      </p>
                      <details>
                        <summary className="cursor-pointer font-semibold">
                          Practice calendar and instructions
                        </summary>
                        <div className="mt-3 grid gap-3">
                          {a.document.tasks.map((t) => (
                            <TaskCard
                              key={t.id}
                              assignment={a}
                              task={t}
                              log={data.logs.find(
                                (l) => l.assignment_id === a.id && l.task_id === t.id,
                              )}
                              coach={data.coach}
                              readOnly={readOnly}
                              onSaved={load}
                            />
                          ))}
                        </div>
                      </details>
                      {data.coach && !readOnly && <ReviewForm assignment={a} onSaved={load} />}
                    </article>
                  ))}
                </>
              )}
              {tab === "My Progress" &&
                data.assignments.map((a) => {
                  const logs = data.logs.filter((l) => l.assignment_id === a.id),
                    due = a.document.tasks.filter((t) => t.date < today);
                  return (
                    <article key={a.id} className={card}>
                      <h4>{a.document.title}</h4>
                      <p>
                        {logs.filter((l) => l.document.status === "full").length} full ·{" "}
                        {logs.filter((l) => l.document.status === "partial").length} partial ·{" "}
                        {logs.filter((l) => l.document.status === "modified").length} modified ·{" "}
                        {logs.filter((l) => l.document.status === "skipped").length} skipped ·{" "}
                        {due.filter((t) => !logs.some((l) => l.task_id === t.id)).length} overdue /
                        unreported
                      </p>
                      <p>
                        {a.document.tasks.length} assigned tasks ·{" "}
                        {logs.filter((l) => l.document.source === "coach-observed").length}{" "}
                        coach-observed records
                      </p>
                      <p>Baseline: {a.document.baseline}</p>
                      <p>Target: {a.document.goal}</p>
                      <p>
                        Current checkpoint:{" "}
                        {a.document.program?.phases[a.document.phase]?.checkpoint ||
                          a.document.phases[a.document.phase]}
                      </p>
                      <div className="overflow-x-auto">
                        <table className="my-3 w-full text-left text-sm">
                          <caption>
                            Recorded outcomes — self-reports remain separate from observations
                          </caption>
                          <thead>
                            <tr>
                              <th>Planned date</th>
                              <th>Source</th>
                              <th>Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logs.map((l) => (
                              <tr key={l.id}>
                                <td className="p-2">
                                  {a.document.tasks.find((t) => t.id === l.task_id)?.date}
                                </td>
                                <td className="p-2">{l.document.source}</td>
                                <td className="p-2">
                                  {l.document.status}: {l.document.successful}/
                                  {l.document.repetitions} successful; {l.document.minutes} minutes;
                                  effort {l.document.rpe}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-sm text-muted">
                        Practice reports are not verified recruiting metrics or standardized ability
                        scores.
                      </p>
                    </article>
                  );
                })}
              {tab === "My Coach" && (
                <>
                  <p>
                    Questions entered with practice appear here for your coach. Coach feedback is
                    shared with the player and linked guardians.
                  </p>
                  {data.logs
                    .filter((l) => l.document.question || l.document.notes)
                    .map((l) => (
                      <div className={card} key={l.id}>
                        <p>
                          {l.document.source} · {l.document.status}
                        </p>
                        <p>{l.document.notes}</p>
                        <p>{l.document.question}</p>
                      </div>
                    ))}
                  {data.events
                    .filter((e) => e.kind === "coach review" || e.kind === "safety hold")
                    .map((e) => (
                      <div key={e.id} className={card}>
                        <strong>{e.kind}</strong>
                        <p>{e.document.feedback}</p>
                      </div>
                    ))}
                </>
              )}
              {tab === "Drill Library" && (
                <>
                  <DrillLibrary drills={data.drills} />
                  {data.coach && !readOnly && <CurriculumEditor onChanged={load} />}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
function DrillLibrary({ drills }: { drills: typeof trainingDrills }) {
  const [q, setQ] = useState(""),
    [sport, setSport] = useState("baseball"),
    [discipline, setDiscipline] = useState("Hitting"),
    [age, setAge] = useState(""),
    [skill, setSkill] = useState(4);
  return (
    <div className="grid gap-3">
      <p>
        Instruction drafts for qualified coach review. Only assigned drills carry your individual
        dose and approval; browsing is not a prescription.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Sport">
          <select className={control} value={sport} onChange={(e) => setSport(e.target.value)}>
            <option>baseball</option>
            <option>softball</option>
          </select>
        </Field>
        <Field label="Discipline">
          <select
            className={control}
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
          >
            {["Pitching", "Hitting", "Catching", "Fielding", "Strength/Speed"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Athlete age filter (optional)">
          <input
            type="number"
            min="5"
            max="100"
            className={control}
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </Field>
        <Field label="Maximum reviewed skill">
          <select
            className={control}
            value={skill}
            onChange={(e) => setSkill(Number(e.target.value))}
          >
            {skillBands.map((v, i) => (
              <option key={v} value={i}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Search drills">
          <input className={control} value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
      </div>
      {drills
        .filter(
          (d) =>
            d.sports.includes(sport as "baseball" | "softball") &&
            d.discipline === discipline &&
            (!age || d.minAge <= Number(age)) &&
            d.minimumSkill <= skill &&
            `${d.name} ${d.purpose} ${d.equipment}`.toLowerCase().includes(q.toLowerCase()),
        )
        .map((d) => (
          <details key={d.id} className={card}>
            <summary className="cursor-pointer">{d.name}</summary>
            <p>{d.purpose}</p>
            <p>Equipment: {d.equipment}</p>
            <ol className="list-inside list-decimal">
              {d.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p>Cue: {d.cue}</p>
            <p>Correction: {d.correction}</p>
            <p>Easier: {d.regression}</p>
            <p>Progression: {d.progression}</p>
            <p>Measure: {d.measure}</p>
            <p>{d.safety}</p>
            <p className="text-sm text-muted">
              {d.provenance} · {d.version}{" "}
              {d.demoUrl ? (
                <a className="underline" href={d.demoUrl} target="_blank" rel="noreferrer">
                  Demonstration video
                </a>
              ) : (
                " · No demonstration video attached."
              )}
            </p>
          </details>
        ))}
      <details className={card}>
        <summary>Safety references</summary>
        {safetySources.map((s) => (
          <p key={s.url}>
            <a className="underline" href={s.url} target="_blank" rel="noreferrer">
              {s.name}
            </a>
          </p>
        ))}
      </details>
    </div>
  );
}
function AssignmentForm({
  athleteId,
  data,
  onSaved,
}: {
  athleteId: string;
  data: Awaited<ReturnType<typeof loadTraining>>;
  onSaved: () => Promise<void>;
}) {
  const [family, setFamily] = useState(
      programFamilies.find((p) => p.sport === data.sport)?.id || programFamilies[0].id,
    ),
    [programId, setProgramId] = useState(""),
    [skill, setSkill] = useState<(typeof skillBands)[number]>("beginner"),
    [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState<AssignmentInput>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const program = programFamilies.find((p) => p.id === family)!;
  const specialty = developmentPrograms.find((p) => p.id === programId);
  const available = data.drills.filter(
    (d) =>
      d.sports.includes(program.sport) &&
      d.discipline === program.discipline &&
      d.minAge <= (data.age || 0) &&
      d.minimumSkill <= skillBands.indexOf(skill),
  );
  async function publish() {
    if (!preview) return;
    setBusy(true);
    try {
      await assignTraining({ data: preview });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={`${card} grid gap-3`}
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const f = new FormData(e.currentTarget),
          startDate = String(f.get("startDate")),
          weeks = Number(f.get("weeks")) as AssignmentInput["weeks"],
          frequency = Number(f.get("frequency"));
        if (!specialty && !selected.length) {
          setError("Choose at least one drill.");
          return;
        }
        const tasks: AssignmentInput["tasks"] = [];
        if (specialty) {
          const sessions = Math.max(4, weeks * frequency);
          for (let n = 0; n < sessions; n++) {
            const phase = Math.min(3, Math.floor((n * 4) / sessions));
            for (const drillId of specialty.phases[phase].drillIds)
              tasks.push({
                id: crypto.randomUUID(),
                drillId,
                phase,
                date: isoAdd(startDate, Math.floor((n * weeks * 7) / sessions)),
                dose: String(f.get("dose")),
                rest: String(f.get("rest")),
                target: specialty.phases[phase].checkpoint,
              });
          }
        } else
          for (let week = 0; week < weeks; week++)
            for (let day = 0; day < frequency; day++)
              tasks.push({
                id: crypto.randomUUID(),
                drillId: selected[(week * frequency + day) % selected.length],
                date: isoAdd(startDate, week * 7 + day * 2),
                dose: String(f.get("dose")),
                rest: String(f.get("rest")),
                target: String(f.get("goal")),
              });
        setPreview({
          id: crypto.randomUUID(),
          athleteId,
          ...(specialty ? { programId: specialty.id } : {}),
          reviewedAssignmentIds: data.assignments
            .filter((a) => a.status === "active")
            .map((a) => a.id),
          sport: program.sport,
          discipline: program.discipline,
          title: String(f.get("title")),
          skill,
          weeks,
          startDate,
          reviewDate: String(f.get("reviewDate")),
          goal: String(f.get("goal")),
          baseline: String(f.get("baseline")),
          workload: String(f.get("workload")),
          equipment: String(f.get("equipment")),
          reason: String(f.get("reason")),
          qualifiedReview: true,
          tasks,
        });
      }}
    >
      <h4 className="text-xl">Build a reviewed practice plan</h4>
      {error && <Problem>{error}</Problem>}
      {data.age === null ? (
        <Problem>
          Record the player’s private birthday before assigning an age-appropriate plan.
        </Problem>
      ) : (
        <p>
          Age band: {ageBand(data.age)}. Skill is reviewed separately; age does not grant advanced
          eligibility.
        </p>
      )}
      <p>
        Existing goals:{" "}
        {data.goals.map((g) => `${g.title}: ${g.target}`).join("; ") ||
          "Not recorded — discuss before assignment."}
      </p>
      <p>
        Other active programs:{" "}
        {data.assignments
          .filter((a) => a.status === "active")
          .map((a) => `${a.document.title} (${a.document.coachName})`)
          .join("; ") || "None"}
      </p>
      <p>
        Recorded recent throwing:{" "}
        {data.recentWorkload.map((w) => `${w.date}: ${w.throws} throws, RPE ${w.rpe}`).join("; ") ||
          "Not recorded — do not assume zero."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Program family">
          <select
            className={control}
            value={family}
            onChange={(e) => {
              setFamily(e.target.value);
              setProgramId("");
              setSelected([]);
              setPreview(undefined);
            }}
          >
            {programFamilies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reviewed skill level">
          <select
            className={control}
            value={skill}
            onChange={(e) => {
              setSkill(e.target.value as typeof skill);
              setProgramId("");
              setSelected([]);
              setPreview(undefined);
            }}
          >
            {skillBands.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Specialty program">
        <select
          className={control}
          value={programId}
          onChange={(e) => {
            setProgramId(e.target.value);
            setPreview(undefined);
            setSelected([]);
          }}
        >
          <option value="">Custom individualized plan</option>
          {developmentPrograms
            .filter(
              (p) =>
                p.discipline === program.discipline &&
                compatibleProgram(
                  p,
                  program.sport,
                  data.age || 0,
                  skillBands.indexOf(skill),
                  data.drills,
                ),
            )
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </Field>
      {specialty && (
        <section className={card}>
          <h5 className="font-semibold">{specialty.name}</h5>
          <p>{specialty.objective}</p>
          <p>Baseline: {specialty.baseline}</p>
          <p>{specialty.frequency}</p>
          <p>{specialty.recovery}</p>
          {specialty.phases.map((p, i) => (
            <details key={p.name}>
              <summary>
                Phase {i + 1}: {p.name}
              </summary>
              <p>
                {p.drillIds.map((id) => data.drills.find((d) => d.id === id)?.name).join(" → ")}
              </p>
              <p>Checkpoint: {p.checkpoint}</p>
              <p>{p.regression}</p>
            </details>
          ))}
          <p>{specialty.completion}</p>
          <p>{specialty.next}</p>
          <p>
            Later-phase tasks stay locked until coach review. Adjust dates when progression takes
            longer.
          </p>
        </section>
      )}
      <Field label="Program title">
        <input
          className={control}
          name="title"
          required
          minLength={3}
          maxLength={150}
          key={programId}
          defaultValue={specialty?.name || "Individual development plan"}
        />
      </Field>
      {(["goal", "baseline", "reason", "equipment", "workload", "dose", "rest"] as const).map(
        (name) => (
          <Field
            key={name}
            label={
              {
                goal: "Measurable goal and mastery target",
                baseline: "Observed baseline and prerequisites",
                reason: "Why this plan fits the player’s history and goals",
                equipment: "Available equipment, space and adult supervision",
                workload:
                  "Confirm games, team practices, other coaches, throwing/rest restrictions and recovery",
                dose: "Individual dose: sets, repetitions or time; include intensity",
                rest: "Rest between efforts and recovery between sessions",
              }[name]
            }
          >
            <textarea
              key={`${programId}:${name}`}
              className={control}
              name={name}
              required
              minLength={5}
              maxLength={3000}
              defaultValue={
                specialty
                  ? {
                      goal: specialty.objective,
                      baseline: specialty.baseline,
                      equipment: specialty.equipment,
                      rest: specialty.recovery,
                      reason: "",
                      workload: "",
                      dose: "",
                    }[name]
                  : ""
              }
            />
          </Field>
        ),
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Start date">
          <input
            className={control}
            name="startDate"
            type="date"
            required
            defaultValue={chicagoDate(new Date())}
          />
        </Field>
        <Field label="Coach review date">
          <input
            className={control}
            name="reviewDate"
            type="date"
            required
            defaultValue={isoAdd(chicagoDate(new Date()), 14)}
          />
        </Field>
        <Field label="Program weeks">
          <select className={control} name="weeks">
            {[2, 4, 6, 8, 12].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="Practice days per week">
          <select className={control} name="frequency">
            {[1, 2, 3].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
      </div>
      {!specialty && (
        <fieldset>
          <legend className="font-semibold">
            Compatible drills — preview each instruction before selecting
          </legend>
          {available.map((d) => (
            <label key={d.id} className="flex items-start gap-2 py-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(d.id)}
                onChange={(e) => {
                  setSelected((s) =>
                    e.target.checked ? [...s, d.id] : s.filter((id) => id !== d.id),
                  );
                  setPreview(undefined);
                }}
              />
              <span>
                <strong>{d.name}</strong> — {d.steps.join(" ")}{" "}
                <span className="text-muted">Measure: {d.measure}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="flex items-start gap-2">
        <input type="checkbox" required />
        <span>
          I am qualified to review this discipline and have reviewed this athlete, technique,
          equipment, individual dose, current workload and restrictions. I approve these
          instructions for this player. This does not provide medical clearance.
        </span>
      </label>
      <Button type="submit" disabled={busy || data.age === null}>
        Preview family assignment
      </Button>
      {preview && (
        <div className="grid gap-3 rounded-lg bg-paper p-4">
          <h4>Family preview: {preview.title}</h4>
          <p>{preview.goal}</p>
          <p>Why: {preview.reason}</p>
          <p>
            {preview.tasks.length} tasks. {preview.tasks[0].date} through{" "}
            {preview.tasks.at(-1)?.date}. Other days have no assigned activity.
          </p>
          <p>
            Dose: {preview.tasks[0].dose} · Rest: {preview.tasks[0].rest}
          </p>
          <details>
            <summary className="cursor-pointer font-semibold">
              Review and adjust every assigned session
            </summary>
            <div className="mt-3 grid gap-3">
              {preview.tasks.map((task, index) => (
                <div key={task.id} className="grid gap-2 rounded-lg border bg-white p-3">
                  <strong>
                    Session {index + 1}: {data.drills.find((d) => d.id === task.drillId)?.name}
                  </strong>
                  <p>{data.drills.find((d) => d.id === task.drillId)?.steps.join(" ")}</p>
                  {(["date", "dose", "rest", "target"] as const).map((field) => (
                    <Field key={field} label={`Session ${index + 1} ${field}`}>
                      <input
                        className={control}
                        type={field === "date" ? "date" : "text"}
                        value={task[field]}
                        maxLength={3000}
                        onChange={(e) =>
                          setPreview((p) =>
                            p
                              ? {
                                  ...p,
                                  tasks: p.tasks.map((t, i) =>
                                    i === index ? { ...t, [field]: e.target.value } : t,
                                  ),
                                }
                              : p,
                          )
                        }
                      />
                    </Field>
                  ))}
                </div>
              ))}
            </div>
          </details>
          <p>Stop for pain or unusual fatigue and tell a guardian and coach.</p>
          <Button type="button" disabled={busy} onClick={() => void publish()}>
            {busy ? "Publishing…" : "Approve and publish assignment"}
          </Button>
          <p className="text-sm">
            After editing the form, preview again before publishing. This button publishes the
            preview shown above.
          </p>
        </div>
      )}
    </form>
  );
}
function TaskCard({
  assignment: a,
  task: t,
  log,
  coach,
  readOnly,
  onSaved,
}: {
  assignment: TrainingAssignment;
  task: AssignmentInput["tasks"][number];
  log?: TrainingLog;
  coach: boolean;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState(false);
  const drill = a.document.drills.find((d) => d.id === t.drillId)!;
  return (
    <article className={`${card} grid gap-2`}>
      <h4 className="font-semibold">{drill.name}</h4>
      <p>
        {t.date} · {a.document.title}
      </p>
      {t.phase !== undefined && (
        <p>
          Phase {t.phase + 1}
          {t.phase > a.document.phase ? " — awaiting coach approval; do not start" : " — available"}
        </p>
      )}
      <p>Purpose: {drill.purpose}</p>
      <p>Equipment: {drill.equipment}</p>
      {drill.demoUrl && (
        <a className="underline" href={drill.demoUrl} target="_blank" rel="noreferrer">
          Watch demonstration
        </a>
      )}
      <ol className="list-inside list-decimal">
        {drill.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p>Cue: {drill.cue}</p>
      <p>Dose: {t.dose}</p>
      <p>Rest: {t.rest}</p>
      <p>Target: {t.target}</p>
      <p className="text-sm">{drill.safety}</p>
      {log && (
        <p role="status">
          Saved: {log.document.status} · {log.document.source} · {log.document.repetitions} attempts
          / {log.document.successful} successful · {log.document.notes}
        </p>
      )}
      {log?.document.source === "coach-observed" && !coach ? (
        <p className="text-sm text-muted">
          Coach observation retained. Use My Coach or Messages for questions.
        </p>
      ) : (
        <Button
          variant="outlineDark"
          disabled={a.status !== "active" || readOnly}
          onClick={() => setEdit(!edit)}
        >
          {edit
            ? "Close log"
            : log
              ? "Update practice report"
              : coach
                ? "Record observed practice"
                : "Log practice or ask coach"}
        </Button>
      )}
      {error && <Problem>{error}</Problem>}
      {edit && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget),
              val = (n: string) => String(f.get(n) || ""),
              num = (n: string) => Number(f.get(n) || 0);
            try {
              await logTraining({
                data: {
                  assignmentId: a.id,
                  taskId: t.id,
                  revision: log?.revision || 0,
                  status: val("status") as PracticeInput["status"],
                  notes: val("notes"),
                  question: val("question"),
                  repetitions: num("repetitions"),
                  successful: num("successful"),
                  sets: num("sets"),
                  load: num("load"),
                  minutes: num("minutes"),
                  throws: num("throws"),
                  throwType: val("throwType"),
                  distance: val("distance"),
                  intensity: val("intensity") as PracticeInput["intensity"],
                  rpe: num("rpe"),
                  fatigue: val("fatigue") as PracticeInput["fatigue"],
                  pain: f.has("pain"),
                },
              });
              await onSaved();
              setEdit(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Completion">
            <select className={control} name="status" defaultValue={log?.document.status || "full"}>
              {["full", "partial", "skipped", "modified"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {[
              "repetitions",
              "successful",
              "sets",
              "load",
              "minutes",
              ...(["Pitching", "Catching", "Fielding"].includes(a.document.discipline)
                ? ["throws"]
                : []),
            ].map((n) => (
              <Field
                key={n}
                label={
                  n === "successful"
                    ? "Successful outcomes"
                    : n === "load"
                      ? "Load used (record unit in notes)"
                      : n
                }
              >
                <input
                  className={control}
                  name={n}
                  type="number"
                  min="0"
                  step={n === "load" || n === "minutes" ? "0.1" : "1"}
                  defaultValue={Number(log?.document[n as keyof PracticeInput] || 0)}
                />
              </Field>
            ))}
          </div>
          {["Pitching", "Catching", "Fielding"].includes(a.document.discipline) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Throw type">
                <input
                  className={control}
                  name="throwType"
                  maxLength={100}
                  defaultValue={log?.document.throwType}
                />
              </Field>
              <Field label="Distance with units">
                <input
                  className={control}
                  name="distance"
                  maxLength={100}
                  defaultValue={log?.document.distance}
                />
              </Field>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Intensity">
              <select
                className={control}
                name="intensity"
                defaultValue={log?.document.intensity || "none"}
              >
                {["none", "easy", "moderate", "high"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Effort / RPE (0–10)">
              <input
                className={control}
                name="rpe"
                type="number"
                min="0"
                max="10"
                defaultValue={log?.document.rpe || 0}
              />
            </Field>
            <Field label="Fatigue">
              <select
                className={control}
                name="fatigue"
                defaultValue={log?.document.fatigue || "none"}
              >
                {["none", "mild", "unusual"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="pain" defaultChecked={log?.document.pain} />
            Pain reported — stop activity and notify guardian/coach
          </label>
          <Field label="Practice notes, outcomes or modifications">
            <textarea
              className={control}
              name="notes"
              maxLength={3000}
              defaultValue={log?.document.notes}
            />
          </Field>
          <Field label="Question for coach">
            <textarea
              className={control}
              name="question"
              maxLength={3000}
              defaultValue={log?.document.question}
            />
          </Field>
          <p className="text-sm text-muted">
            {coach ? "Saved as coach-observed practice." : "Saved as self-reported practice."}{" "}
            Recruiting verification stays separate.
          </p>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save practice report"}
          </Button>
        </form>
      )}
    </article>
  );
}
function ReviewForm({
  assignment: a,
  onSaved,
}: {
  assignment: TrainingAssignment;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          await reviewTraining({
            data: {
              assignmentId: a.id,
              revision: a.revision,
              action: String(f.get("action")) as TrainingReviewInput["action"],
              feedback: String(f.get("feedback")),
              safetyReviewed: f.has("safetyReviewed"),
            },
          });
          await onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Problem>{error}</Problem>}
      <Field label="Coach decision">
        <select className={control} name="action">
          {[
            "continue",
            "advance",
            "repeat",
            "modify",
            "reassess",
            "pause",
            "complete",
            "discontinue",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Shared feedback and evidence for the decision">
        <textarea className={control} required minLength={5} maxLength={3000} name="feedback" />
      </Field>
      <label className="flex gap-2">
        <input name="safetyReviewed" type="checkbox" />
        <span>
          I reviewed any safety hold and documented any required professional clearance in the
          feedback.
        </span>
      </label>
      <p className="text-sm">
        Advance and complete require a coach-observed reassessment. To change individual dose or
        dates, discontinue and issue a new reviewed plan; history is retained.
      </p>
      <Button
        type="submit"
        disabled={busy || a.status === "completed" || a.status === "discontinued"}
      >
        Save coach review
      </Button>
    </form>
  );
}
