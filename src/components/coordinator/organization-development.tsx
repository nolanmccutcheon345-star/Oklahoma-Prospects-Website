import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../ui/button";
import {
  assignOrganizationDevelopmentDay,
  getOrganizationDevelopment,
  reviewOrganizationDevelopmentCurriculum,
  saveOrganizationDevelopmentMetric,
  saveOrganizationDevelopmentProfile,
} from "@/lib/coordinator/organization-development-api";
import {
  developmentMetricKinds,
  organizationDevelopmentCurriculumInput,
  organizationDevelopmentDayInput,
  organizationDevelopmentMetricInput,
  organizationDevelopmentProfileInput,
  type OrganizationDevelopment as DevelopmentWorkspace,
  type OrganizationDevelopmentAthlete,
  type OrganizationDevelopmentControl,
  type OrganizationDevelopmentCurriculumInput,
  type OrganizationDevelopmentDayInput,
  type OrganizationDevelopmentMetric,
  type OrganizationDevelopmentMetricInput,
  type OrganizationDevelopmentProfileInput,
} from "@/lib/coordinator/organization-development-contracts";
import { skillBands, type TrainingDrill } from "@/lib/pd/training-catalog";
import type { DevelopmentProgram } from "@/lib/pd/development-programs";

const field = "min-h-11 w-full min-w-0 rounded border border-line bg-white p-2 text-ink";
const panel = "grid min-w-0 gap-4 rounded-lg border border-line p-4";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to complete the request. Please try again.";
const metricLabels = {
  velocity: "Velocity",
  "average-velocity": "Average velocity",
  spin: "Spin",
  ivb: "Induced vertical break (IVB)",
  hb: "Horizontal break (HB)",
};
const metricUnits = {
  velocity: "mph",
  "average-velocity": "mph",
  spin: "rpm",
  ivb: "in",
  hb: "in",
};
const skills = skillBands;
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function ProfileForm({
  athlete,
  busy,
  onSave,
}: {
  athlete: OrganizationDevelopmentAthlete;
  busy: boolean;
  onSave: (input: OrganizationDevelopmentProfileInput) => Promise<void>;
}) {
  const [input, setInput] = useState<OrganizationDevelopmentProfileInput>(() => ({
    athleteId: athlete.athleteId,
    revision: athlete.revision,
    position: athlete.position,
    throws: athlete.throws,
    bats: athlete.bats,
    graduationYear: athlete.graduationYear,
    school: athlete.school,
    city: athlete.city,
  }));
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !athlete.profileEditable) return;
    const parsed = organizationDevelopmentProfileInput.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the profile fields.");
      return;
    }
    setError("");
    await onSave(parsed.data);
  }
  return (
    <form onSubmit={(event) => void submit(event)} className={panel}>
      <fieldset disabled={busy || !athlete.profileEditable} className="grid min-w-0 gap-4">
        <legend className="mb-3 text-lg font-semibold">Athlete profile</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            Athlete name
            <input className={field} value={athlete.name} readOnly />
          </label>
          <label className="grid gap-1">
            Recorded sport
            <input className={field} value={athlete.sport || "Not recorded"} readOnly />
          </label>
          <label className="grid gap-1">
            Position
            <input
              className={field}
              maxLength={80}
              value={input.position}
              onChange={(event) => setInput({ ...input, position: event.target.value })}
            />
          </label>
          {(["throws", "bats"] as const).map((key) => (
            <label key={key} className="grid gap-1">
              {key === "throws" ? "Throws" : "Bats"}
              <select
                className={field}
                value={input[key]}
                onChange={(event) =>
                  setInput({ ...input, [key]: event.target.value as "" | "R" | "L" })
                }
              >
                <option value="">Not recorded</option>
                <option value="R">Right</option>
                <option value="L">Left</option>
              </select>
            </label>
          ))}
          <label className="grid gap-1">
            Graduation year
            <input
              className={field}
              type="number"
              min={0}
              max={2200}
              step={1}
              placeholder="Not recorded"
              value={input.graduationYear || ""}
              onChange={(event) =>
                setInput({
                  ...input,
                  graduationYear: event.target.value === "" ? 0 : event.target.valueAsNumber,
                })
              }
            />
          </label>
          {(["school", "city"] as const).map((key) => (
            <label key={key} className="grid gap-1">
              {key === "school" ? "School" : "City"}
              <input
                className={field}
                maxLength={150}
                value={input[key]}
                onChange={(event) => setInput({ ...input, [key]: event.target.value })}
              />
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {athlete.profileEditable && (
          <Button type="submit" className="justify-self-start">
            Save Athlete Profile
          </Button>
        )}
      </fieldset>
      {!athlete.profileEditable && (
        <p className="text-sm text-muted-foreground">
          This profile needs owner review before its fields can be edited.
        </p>
      )}
    </form>
  );
}

function MetricForm({
  athleteId,
  revision,
  metric,
  busy,
  onSave,
}: {
  athleteId: string;
  revision: number;
  metric?: OrganizationDevelopmentMetric;
  busy: boolean;
  onSave: (input: OrganizationDevelopmentMetricInput) => Promise<void>;
}) {
  const [id] = useState(() => metric?.id || crypto.randomUUID());
  const [kind, setKind] = useState<OrganizationDevelopmentMetricInput["kind"]>(
    metric?.kind || "velocity",
  );
  const [date, setDate] = useState(metric?.date || today());
  const [value, setValue] = useState(metric ? String(metric.value) : "");
  const [error, setError] = useState("");
  const movement = kind === "ivb" || kind === "hb";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = organizationDevelopmentMetricInput.safeParse({
      id,
      athleteId,
      revision,
      kind,
      date,
      value: value.trim() ? Number(value) : NaN,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the measured value and date.");
      return;
    }
    setError("");
    await onSave(parsed.data);
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy} className="grid gap-4">
        <legend className="mb-3 font-semibold">
          {metric ? "Edit measurement" : "Record measurement"}
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1">
            Metric type
            <select
              className={field}
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              {developmentMetricKinds.map((key) => (
                <option key={key} value={key}>
                  {metricLabels[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            Measurement date
            <input
              className={field}
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Measured value ({metricUnits[kind]})
            <input
              className={field}
              type="number"
              required
              step="any"
              min={movement ? -100 : 0}
              max={kind === "spin" ? 10000 : movement ? 100 : 150}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="justify-self-start">
          {metric ? "Save Measurement" : "Record Measurement"}
        </Button>
      </fieldset>
    </form>
  );
}

function Metrics({
  athleteId,
  workspace,
  busy,
  onSave,
}: {
  athleteId: string;
  workspace: DevelopmentWorkspace;
  busy: boolean;
  onSave: (input: OrganizationDevelopmentMetricInput) => Promise<void>;
}) {
  const [metricId, setMetricId] = useState("");
  const metrics = workspace.metrics
    .filter((item) => item.athleteId === athleteId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const metric = metrics.find((item) => item.id === metricId);
  return (
    <section className={panel} aria-label="Athlete measurements">
      <h3 className="text-lg font-semibold">Validated metric history</h3>
      <p className="text-sm text-muted-foreground">
        Supported numeric measurements are checked for format and range. These checks do not verify
        how a measurement was taken.
      </p>
      {!metrics.length ? (
        <p>No validated measurements are recorded for this athlete.</p>
      ) : (
        <ul className="grid gap-2">
          {metrics.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-3"
            >
              <span>
                {item.date} · {metricLabels[item.kind]} · {item.value} {metricUnits[item.kind]}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                aria-label={`Edit ${metricLabels[item.kind]} from ${item.date}`}
                onClick={() => setMetricId(item.id)}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
      <label className="grid gap-1">
        Measurement to edit
        <select
          className={field}
          value={metric?.id || ""}
          disabled={busy}
          onChange={(event) => setMetricId(event.target.value)}
        >
          <option value="">Record a new measurement</option>
          {metrics.map((item) => (
            <option key={item.id} value={item.id}>
              {item.date} · {metricLabels[item.kind]} · {item.value} {metricUnits[item.kind]}
            </option>
          ))}
        </select>
      </label>
      <MetricForm
        key={`${athleteId}:${metric?.id || "new"}:${workspace.revision}`}
        athleteId={athleteId}
        revision={workspace.revision}
        metric={metric}
        busy={busy}
        onSave={onSave}
      />
    </section>
  );
}

function DrillContent({ drill, drills }: { drill: TrainingDrill; drills: TrainingDrill[] }) {
  return (
    <article className="grid min-w-0 gap-2 rounded-lg bg-cream p-3">
      <h4 className="font-semibold">{drill.name}</h4>
      <p>
        {drill.sports.join(" / ")} · {drill.discipline} · Age {drill.minAge}+ · Minimum skill:{" "}
        {skills[drill.minimumSkill] || "Review required"}
      </p>
      <p>{drill.purpose}</p>
      <ol className="list-decimal space-y-1 pl-5">
        {drill.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {[
        ["Equipment", drill.equipment],
        ["Cues", drill.cue],
        ["Correction", drill.correction],
        ["Easier version", drill.regression],
        ["Progression", drill.progression],
        ["Measure", drill.measure],
        ["Dose", drill.dose],
        ["Supervision", drill.supervision],
        ["Safety", drill.safety],
        ["Review requirement", drill.review],
        ["Source", drill.provenance],
      ].map(([label, value]) => (
        <p key={label}>
          <strong>{label}:</strong> {value}
        </p>
      ))}
      {drill.demoUrl && /^https?:\/\//i.test(drill.demoUrl) && (
        <p>
          <a className="underline" href={drill.demoUrl} target="_blank" rel="noopener noreferrer">
            Published demonstration for {drill.name}
          </a>
        </p>
      )}
      {!!drill.relatedIds?.length && (
        <p>
          <strong>Related drills:</strong>{" "}
          {drill.relatedIds
            .map((id) => drills.find((item) => item.id === id)?.name || id)
            .join("; ")}
        </p>
      )}
      <p className="text-sm">
        Version {drill.version}
        {drill.contentUpdatedAt ? ` · Updated ${drill.contentUpdatedAt}` : ""}
        {drill.lastQualifiedReviewAt ? ` · Qualified review ${drill.lastQualifiedReviewAt}` : ""}
      </p>
    </article>
  );
}

function ProgramContent({
  program,
  drills,
}: {
  program: DevelopmentProgram;
  drills: TrainingDrill[];
}) {
  return (
    <article className="grid min-w-0 gap-2 rounded-lg bg-cream p-3">
      <h4 className="font-semibold">{program.name}</h4>
      <p>
        {program.sport} · {program.discipline} · Age {program.minAge}+ · Minimum skill:{" "}
        {skills[program.minimumSkill] || "Review required"}
      </p>
      <p>
        <strong>Objective:</strong> {program.objective}
      </p>
      <p>
        <strong>Baseline:</strong> {program.baseline}
      </p>
      <p>
        <strong>Equipment:</strong> {program.equipment}
      </p>
      {program.phases.map((phase, index) => (
        <section key={index} className="grid gap-2 border-t border-line pt-3">
          <h5 className="font-semibold">
            Phase {index + 1}: {phase.name}
          </h5>
          <p>
            <strong>Checkpoint:</strong> {phase.checkpoint}
          </p>
          <p>
            <strong>Easier version:</strong> {phase.regression}
          </p>
          {phase.drillIds.map((id, drillIndex) => {
            const drill = drills.find((item) => item.id === id);
            return (
              <details key={`${id}:${drillIndex}`} className="rounded border border-line p-2">
                <summary className="cursor-pointer font-medium">
                  {drill?.name || id}: complete drill instructions
                </summary>
                {drill ? (
                  <DrillContent drill={drill} drills={drills} />
                ) : (
                  <p>
                    Published drill content is unavailable. Do not approve this program until it is
                    available for review.
                  </p>
                )}
              </details>
            );
          })}
        </section>
      ))}
      <p>
        <strong>Frequency:</strong> {program.frequency}
      </p>
      <p>
        <strong>Recovery:</strong> {program.recovery}
      </p>
      <p>
        <strong>Completion:</strong> {program.completion}
      </p>
      <p>
        <strong>Next:</strong> {program.next}
      </p>
      <p>
        <strong>Keywords:</strong> {program.keywords.join(", ")}
      </p>
      <p className="text-sm">Version {program.version}</p>
    </article>
  );
}

function DailyPlanForm({
  athlete,
  workspace,
  busy,
  onSave,
}: {
  athlete: OrganizationDevelopmentAthlete;
  workspace: DevelopmentWorkspace;
  busy: boolean;
  onSave: (input: OrganizationDevelopmentDayInput) => Promise<void>;
}) {
  const availableDrills = workspace.curriculum.drills.filter(
    (drill) =>
      drill.sports.some((sport) => sport.toLowerCase() === athlete.sport) &&
      !workspace.curriculum.controls.some(
        (control) =>
          control.kind === "drill" && control.id === drill.id && control.status === "retired",
      ),
  );
  const [day, setDay] = useState(today());
  const [skill, setSkill] = useState<"" | (typeof skillBands)[number]>("");
  const drills = availableDrills.filter(
    (drill) => skill && drill.minimumSkill <= skillBands.indexOf(skill),
  );
  const [items, setItems] = useState(() => [
    { id: crypto.randomUUID(), drillId: "", version: "", sets: "", reps: "", restSeconds: "" },
  ]);
  const [qualifiedReview, setQualifiedReview] = useState(false);
  const [error, setError] = useState("");
  const exists = workspace.days.some(
    (item) => item.athleteId === athlete.athleteId && item.day === day,
  );
  const selectedDrills = [...new Set(items.map((item) => item.drillId))]
    .map((id) => drills.find((drill) => drill.id === id))
    .filter((drill): drill is TrainingDrill => Boolean(drill));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (exists) {
      setError("A daily plan already exists for this athlete and day. Choose a new day.");
      return;
    }
    if (!qualifiedReview) {
      setError("Confirm the qualified review before assigning this training day.");
      return;
    }
    if (!skill) {
      setError("Select the athlete’s reviewed skill level.");
      return;
    }
    if (items.some((item) => !drills.some((drill) => drill.id === item.drillId))) {
      setError("Choose an available drill for this athlete’s sport and reviewed skill level.");
      return;
    }
    if (
      items.some(
        (item) => drills.find((drill) => drill.id === item.drillId)?.version !== item.version,
      )
    ) {
      setError(
        "Published drill instructions changed. Reload development records and review the current content before assigning.",
      );
      return;
    }
    const parsed = organizationDevelopmentDayInput.safeParse({
      athleteId: athlete.athleteId,
      day,
      skill,
      qualifiedReview,
      items: items.map((item) => ({
        ...item,
        sets: item.sets.trim() ? Number(item.sets) : NaN,
        reps: item.reps.trim() ? Number(item.reps) : NaN,
        restSeconds: item.restSeconds.trim() ? Number(item.restSeconds) : NaN,
      })),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message || "Check the day, drill volume and qualified review.",
      );
      return;
    }
    setError("");
    await onSave(parsed.data);
  }
  return (
    <section className={panel} aria-label="New daily training plan">
      <h3 className="text-lg font-semibold">Assign a new daily training plan</h3>
      <p className="text-sm text-muted-foreground">
        Choose built-in drills and review their full instructions below. Existing daily plans cannot
        be overwritten here. Age, sport, retired content and active training holds are checked when
        saved.
      </p>
      {!availableDrills.length ? (
        <p>
          No available built-in drills match the athlete’s recorded sport. The athlete’s sport or
          curriculum may need review.
        </p>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy} className="grid min-w-0 gap-4">
            <legend className="sr-only">New day and drills</legend>
            <label className="grid gap-1">
              Reviewed athlete skill
              <select
                className={field}
                required
                value={skill}
                onChange={(event) => {
                  const nextSkill = event.target.value as typeof skill;
                  const eligible = availableDrills.filter(
                    (drill) => nextSkill && drill.minimumSkill <= skillBands.indexOf(nextSkill),
                  );
                  setSkill(nextSkill);
                  setQualifiedReview(false);
                  setItems(
                    items.map((item) =>
                      eligible.some(
                        (drill) => drill.id === item.drillId && drill.version === item.version,
                      )
                        ? item
                        : {
                            ...item,
                            drillId: eligible[0]?.id || "",
                            version: eligible[0]?.version || "",
                            sets: "",
                            reps: "",
                            restSeconds: "",
                          },
                    ),
                  );
                }}
              >
                <option value="">Select the reviewed skill level</option>
                {skillBands.map((band) => (
                  <option key={band} value={band}>
                    {band}
                  </option>
                ))}
              </select>
            </label>
            {!skill && (
              <p className="text-sm">
                Select the athlete’s reviewed skill level to see eligible drills.
              </p>
            )}
            {skill && !drills.length && (
              <p role="status">No available drills match this sport and reviewed skill level.</p>
            )}
            <label className="grid gap-1">
              Training day
              <input
                className={field}
                type="date"
                required
                value={day}
                onChange={(event) => {
                  setQualifiedReview(false);
                  setDay(event.target.value);
                }}
              />
            </label>
            {exists && (
              <p role="status">
                A plan already exists on this day. Choose another day to create a new plan.
              </p>
            )}
            {items.map((item, index) => (
              <div
                key={item.id}
                className="grid gap-3 rounded border border-line p-3 sm:grid-cols-2"
              >
                <label className="grid gap-1 sm:col-span-2">
                  Drill {index + 1}
                  <select
                    className={field}
                    required
                    disabled={!drills.length}
                    value={item.drillId}
                    onChange={(event) => {
                      setQualifiedReview(false);
                      setItems(
                        items.map((row) =>
                          row.id === item.id
                            ? {
                                ...row,
                                drillId: event.target.value,
                                version:
                                  drills.find((drill) => drill.id === event.target.value)
                                    ?.version || "",
                                sets: "",
                                reps: "",
                                restSeconds: "",
                              }
                            : row,
                        ),
                      );
                    }}
                  >
                    {!drills.length && <option value="">No eligible drill selected</option>}
                    {drills.map((drill) => (
                      <option key={drill.id} value={drill.id}>
                        {drill.name} · {drill.discipline} · Age {drill.minAge}+ ·{" "}
                        {skills[drill.minimumSkill]}+
                      </option>
                    ))}
                  </select>
                </label>
                {(["sets", "reps", "restSeconds"] as const).map((key) => (
                  <label key={key} className="grid gap-1">
                    {key === "sets"
                      ? "Sets"
                      : key === "reps"
                        ? "Reps per set"
                        : "Rest between sets (seconds)"}{" "}
                    for drill {index + 1}
                    <input
                      className={field}
                      type="number"
                      required
                      disabled={!drills.length}
                      min={1}
                      max={key === "sets" ? 100 : key === "reps" ? 1000 : 3600}
                      step={1}
                      value={item[key]}
                      onChange={(event) => {
                        setQualifiedReview(false);
                        setItems(
                          items.map((row) =>
                            row.id === item.id ? { ...row, [key]: event.target.value } : row,
                          ),
                        );
                      }}
                    />
                  </label>
                ))}
                {items.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start"
                    aria-label={`Remove drill ${index + 1}`}
                    onClick={() => {
                      setQualifiedReview(false);
                      setItems(items.filter((row) => row.id !== item.id));
                    }}
                  >
                    Remove Drill
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={items.length >= 20 || !drills.length}
              className="justify-self-start"
              onClick={() => {
                setQualifiedReview(false);
                setItems([
                  ...items,
                  {
                    id: crypto.randomUUID(),
                    drillId: drills[0].id,
                    version: drills[0].version,
                    sets: "",
                    reps: "",
                    restSeconds: "",
                  },
                ]);
              }}
            >
              Add Another Drill
            </Button>
            <p className="text-sm">
              Set athlete-specific volume and rest after reviewing the published dose and current
              workload. Sets, repetitions and rest seconds must all be entered.
            </p>
            {selectedDrills.map((drill) => (
              <DrillContent key={drill.id} drill={drill} drills={workspace.curriculum.drills} />
            ))}
            <label className="flex min-h-11 items-start gap-2">
              <input
                type="checkbox"
                required
                checked={qualifiedReview}
                className="mt-1"
                onChange={(event) => setQualifiedReview(event.target.checked)}
              />
              I am qualified to assign these drills and have reviewed the athlete’s eligibility,
              current restrictions, workload, prerequisites, complete instructions, supervision and
              safety requirements.
            </label>
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={exists || !drills.length}
              className="justify-self-start"
            >
              Assign New Training Day
            </Button>
          </fieldset>
        </form>
      )}
    </section>
  );
}

function StructuredHistory({
  athleteId,
  workspace,
}: {
  athleteId: string;
  workspace: DevelopmentWorkspace;
}) {
  const sessions = workspace.sessionMetrics
    .filter((item) => item.athleteId === athleteId)
    .sort((a, b) => b.day.localeCompare(a.day));
  const days = workspace.days
    .filter((item) => item.athleteId === athleteId)
    .sort((a, b) => b.day.localeCompare(a.day));
  const assignments = workspace.assignments.filter((item) => item.athleteId === athleteId);
  const drillName = (id: string) =>
    workspace.curriculum.drills.find((drill) => drill.id === id)?.name || id;
  return (
    <section className={panel} aria-label="Structured training history">
      <h3 className="text-lg font-semibold">Structured training history</h3>
      <p className="text-sm text-muted-foreground">
        This view contains structured measurements, session counts, daily-plan metadata and
        assignment metadata. Historical narrative and clinical notes are withheld; this is not a
        complete athlete history.
      </p>
      <h4 className="font-semibold">Session counts</h4>
      {!sessions.length ? (
        <p>No structured session counts are available.</p>
      ) : (
        <ul className="grid gap-2">
          {sessions.map((item) => (
            <li key={item.id} className="rounded border border-line p-3">
              {item.day} · {item.track} · {item.successes} successes / {item.attempts} attempts ·{" "}
              {item.verified ? "Verified" : "Unverified"}
            </li>
          ))}
        </ul>
      )}
      <h4 className="font-semibold">Existing daily plans</h4>
      {!days.length ? (
        <p>No existing daily plans are available.</p>
      ) : (
        <div className="grid gap-2">
          {days.map((day) => (
            <details key={day.day} className="rounded border border-line p-3">
              <summary className="cursor-pointer">
                {day.day} · {day.items.length} {day.items.length === 1 ? "item" : "items"}
              </summary>
              <ul className="mt-2 grid gap-1">
                {day.items.map((item) => (
                  <li key={item.id}>
                    {item.track} · Sets: {item.sets ?? "not recorded"} · Reps:{" "}
                    {item.reps ?? "not recorded"}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
      <h4 className="font-semibold">Program assignment metadata</h4>
      {!assignments.length ? (
        <p>No program assignment metadata is available.</p>
      ) : (
        <div className="grid gap-2">
          {assignments.map((assignment) => (
            <article key={assignment.id} className="grid gap-2 rounded border border-line p-3">
              <p className="font-medium">
                {assignment.sport || "Sport not recorded"} ·{" "}
                {assignment.discipline || "Discipline not recorded"} · {assignment.status}
              </p>
              <p>
                Start: {assignment.startDate || "not recorded"} · Review:{" "}
                {assignment.reviewDate || "not recorded"} · Phase:{" "}
                {assignment.phase ?? "not recorded"}
              </p>
              {!assignment.tasks.length ? (
                <p>No structured tasks are available.</p>
              ) : (
                <ul className="grid gap-1">
                  {assignment.tasks.map((task) => (
                    <li key={task.id}>
                      {task.date || "Date not recorded"} · {drillName(task.drillId)} · Phase:{" "}
                      {task.phase ?? "not recorded"}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CurriculumReviewForm({
  kind,
  content,
  decision,
  complete,
  busy,
  onSave,
}: {
  kind: "drill" | "program";
  content: TrainingDrill | DevelopmentProgram;
  decision?: OrganizationDevelopmentControl;
  complete: boolean;
  busy: boolean;
  onSave: (input: OrganizationDevelopmentCurriculumInput) => Promise<void>;
}) {
  const current = decision?.version === content.version;
  const [status, setStatus] = useState<OrganizationDevelopmentCurriculumInput["status"]>(
    decision?.status === "retired" ? "retired" : current ? decision.status : "review-required",
  );
  const [recommended, setRecommended] = useState(
    Boolean(current && decision?.status === "approved" && decision.recommended),
  );
  const [reason, setReason] = useState("");
  const [qualifiedReview, setQualifiedReview] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!complete && status === "approved") {
      setError("Complete published content is required before approving a program.");
      return;
    }
    if (!qualifiedReview) {
      setError("Confirm the qualified review before saving this content decision.");
      return;
    }
    const parsed = organizationDevelopmentCurriculumInput.safeParse({
      kind,
      id: content.id,
      version: content.version,
      revision: decision?.revision || 0,
      status,
      recommended,
      reason,
      qualifiedReview,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the decision and qualified review.");
      return;
    }
    setError("");
    await onSave(parsed.data);
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy} className="grid min-w-0 gap-4">
        <legend className="mb-3 font-semibold">Record academy content decision</legend>
        <label className="grid gap-1">
          Academy content decision
          <select
            className={field}
            value={status}
            onChange={(event) => {
              const next = event.target.value as typeof status;
              setStatus(next);
              if (next !== "approved") setRecommended(false);
            }}
          >
            <option value="review-required">Require individual qualified review</option>
            <option value="approved" disabled={!complete}>
              Academy reviewed
            </option>
            <option value="retired">Retire from future assignments</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={recommended}
            disabled={status !== "approved"}
            onChange={(event) => setRecommended(event.target.checked)}
          />
          Mark approved version as academy recommended
        </label>
        <label className="grid gap-1">
          Reviewer qualifications, findings and reason
          <textarea
            className={field}
            rows={4}
            required
            minLength={10}
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="flex min-h-11 items-start gap-2">
          <input
            type="checkbox"
            required
            className="mt-1"
            checked={qualifiedReview}
            onChange={(event) => setQualifiedReview(event.target.checked)}
          />
          I am qualified to review this discipline and have reviewed the full published content, all
          listed drills, prerequisites and safety constraints.
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="justify-self-start">
          Save Academy Content Decision
        </Button>
      </fieldset>
    </form>
  );
}

function Curriculum({
  catalog,
  busy,
  onSave,
}: {
  catalog: DevelopmentWorkspace["curriculum"];
  busy: boolean;
  onSave: (input: OrganizationDevelopmentCurriculumInput) => Promise<void>;
}) {
  const [requestedSelection, setSelection] = useState("");
  const selection =
    catalog.drills.some((item) => `drill:${item.id}` === requestedSelection) ||
    catalog.programs.some((item) => `program:${item.id}` === requestedSelection)
      ? requestedSelection
      : catalog.drills[0]
        ? `drill:${catalog.drills[0].id}`
        : catalog.programs[0]
          ? `program:${catalog.programs[0].id}`
          : "";
  const separator = selection.indexOf(":");
  const kind = selection.slice(0, separator) as "drill" | "program";
  const id = selection.slice(separator + 1);
  const drill = kind === "drill" ? catalog.drills.find((item) => item.id === id) : undefined;
  const program = kind === "program" ? catalog.programs.find((item) => item.id === id) : undefined;
  const content = drill || program;
  const decision = catalog.controls.find((item) => item.kind === kind && item.id === id);
  const current = decision?.version === content?.version;
  const complete =
    !program ||
    program.phases.every((phase) =>
      phase.drillIds.every((drillId) => catalog.drills.some((item) => item.id === drillId)),
    );
  return (
    <section className={panel} aria-label="Academy curriculum standards">
      <h3 className="text-lg font-semibold">Academy curriculum standards</h3>
      <p className="text-sm text-muted-foreground">
        Review complete published content before recording a decision. Retirement prevents new
        assignments. Existing athlete instructions are preserved, and a new content version requires
        a new approval.
      </p>
      {!content ? (
        <p>No published built-in drills or programs are available for review.</p>
      ) : (
        <>
          <label className="grid gap-1">
            Content to review
            <select
              className={field}
              value={selection}
              disabled={busy}
              onChange={(event) => setSelection(event.target.value)}
            >
              <optgroup label="Drills">
                {catalog.drills.map((item) => (
                  <option key={item.id} value={`drill:${item.id}`}>
                    {item.name} · {item.sports.join(" / ")}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Programs">
                {catalog.programs.map((item) => (
                  <option key={item.id} value={`program:${item.id}`}>
                    {item.name} · {item.sport}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <p>
            Current version: {content.version} ·{" "}
            {decision?.status === "retired"
              ? "Retired"
              : current && decision?.status === "approved"
                ? "Academy reviewed"
                : "Qualified review required"}
            {current && decision?.recommended && decision.status === "approved"
              ? " · Academy recommended"
              : ""}
          </p>
          {decision && !current && (
            <p className="text-sm">
              The previous decision applies to version {decision.version}. Review this version
              before approving it.
            </p>
          )}
          {drill && <DrillContent drill={drill} drills={catalog.drills} />}
          {program && <ProgramContent program={program} drills={catalog.drills} />}
          <CurriculumReviewForm
            key={`${selection}:${content.version}:${decision?.revision || 0}`}
            kind={kind}
            content={content}
            decision={decision}
            complete={complete}
            busy={busy}
            onSave={onSave}
          />
        </>
      )}
    </section>
  );
}

export function OrganizationDevelopment({ onSaved }: { onSaved?: () => void | Promise<void> }) {
  const [workspace, setWorkspace] = useState<DevelopmentWorkspace | null>(null);
  const [tab, setTab] = useState<"athletes" | "curriculum">("athletes");
  const [athleteId, setAthleteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const request = useRef(0);
  const mounted = useRef(false);
  const savingRef = useRef(false);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = await getOrganizationDevelopment();
      if (mounted.current && id === request.current) setWorkspace(next);
      return true;
    } catch (cause) {
      if (mounted.current && id === request.current) {
        setWorkspace(null);
        setError(message(cause));
      }
      return false;
    } finally {
      if (mounted.current && id === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, [load]);
  async function save(action: () => Promise<unknown>, notice: string) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await action();
      if (!mounted.current) return;
      setSuccess(notice);
      await load();
      if (mounted.current && onSaved) {
        try {
          await onSaved();
        } catch {
          if (mounted.current)
            setError(
              "Changes were saved, but the surrounding workspace could not refresh. Reload your workspace to see the latest summary.",
            );
        }
      }
    } catch (cause) {
      if (mounted.current) setError(message(cause));
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  const athlete =
    workspace?.athletes.find((item) => item.athleteId === athleteId) || workspace?.athletes[0];
  return (
    <section
      aria-label="Player development operations"
      aria-busy={loading || saving}
      className="grid min-w-0 gap-4 rounded-xl border border-line bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Player Development</h2>
        <Button
          type="button"
          variant="outline"
          disabled={loading || saving}
          onClick={() => {
            setSuccess("");
            void load();
          }}
        >
          Reload Development Records
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Manage existing athlete profile fields, supported measurements, new daily training plans and
        built-in curriculum reviews.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Development section">
        {(
          [
            ["athletes", "Athlete Records"],
            ["curriculum", "Curriculum Standards"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? "primary" : "outline"}
            disabled={loading || saving}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setError("");
              setSuccess("");
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {success && (
        <p role="status" className="text-green-800">
          {success}
        </p>
      )}
      {error && (
        <div role="alert" className="grid gap-1 text-red-700">
          <p>{error}</p>
          {workspace && (
            <p className="text-sm">
              If these records changed, reload development records and review the current values
              before trying again.
            </p>
          )}
        </div>
      )}
      {saving && <p role="status">Saving development changes…</p>}
      {loading && <p role="status">Loading development records…</p>}
      {!workspace ? null : tab === "curriculum" ? (
        <Curriculum
          catalog={workspace.curriculum}
          busy={loading || saving}
          onSave={(input) =>
            save(
              () => reviewOrganizationDevelopmentCurriculum({ data: input }),
              "Academy content decision saved. Existing athlete instructions are preserved.",
            )
          }
        />
      ) : !athlete ? (
        <p>No athletes are available in this workspace.</p>
      ) : (
        <>
          <label className="grid gap-1">
            Athlete
            <select
              className={field}
              value={athlete.athleteId}
              disabled={loading || saving}
              onChange={(event) => {
                setAthleteId(event.target.value);
                setError("");
                setSuccess("");
              }}
            >
              {workspace.athletes.map((item) => (
                <option key={item.athleteId} value={item.athleteId}>
                  {item.name} · {item.sport || "Sport not recorded"}
                </option>
              ))}
            </select>
          </label>
          <ProfileForm
            key={`profile:${athlete.athleteId}:${athlete.revision}`}
            athlete={athlete}
            busy={loading || saving}
            onSave={(input) =>
              save(
                () => saveOrganizationDevelopmentProfile({ data: input }),
                "Athlete profile saved.",
              )
            }
          />
          <Metrics
            key={`metrics:${athlete.athleteId}`}
            athleteId={athlete.athleteId}
            workspace={workspace}
            busy={loading || saving}
            onSave={(input) =>
              save(() => saveOrganizationDevelopmentMetric({ data: input }), "Measurement saved.")
            }
          />
          <StructuredHistory athleteId={athlete.athleteId} workspace={workspace} />
          <DailyPlanForm
            key={`day:${athlete.athleteId}:${workspace.revision}:${workspace.curriculum.drills.map((drill) => `${drill.id}:${drill.version}`).join("|")}`}
            athlete={athlete}
            workspace={workspace}
            busy={loading || saving}
            onSave={(input) =>
              save(
                () => assignOrganizationDevelopmentDay({ data: input }),
                "New daily training plan assigned.",
              )
            }
          />
        </>
      )}
    </section>
  );
}
