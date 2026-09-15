import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDevelopment, type AthleteSlice } from "@/lib/pd/context";
import { exerciseById, loadBandForAge, type Exercise } from "@/lib/pd/content/exercises";
import { DAY_TYPES, THROWING_PLANS } from "@/lib/pd/content/throwing";
import { WARMUP_PRINCIPLES } from "@/lib/pd/content/warmups";
import { ageOnClubDay } from "@/lib/pd/engines";
import {
  EMPHASES,
  PHASES,
  TRACKS,
  e1rmTrend,
  generateStrengthProgram,
  suggestLoad,
  throwingForSlice,
  warmupForSlice,
  type Emphasis,
  type SeasonPhase,
  type StrengthTrack,
} from "@/lib/pd/programs";
import { cn } from "@/lib/utils";

export function StrengthProgramView({
  slice,
  role,
}: {
  slice: AthleteSlice;
  role: string;
}) {
  const coach = role === "admin" || role === "coach";
  const age = ageOnClubDay(slice.athlete.birthDate);
  const generated = useMemo(() => generateStrengthProgram(slice), [slice]);
  const [track, setTrack] = useState<StrengthTrack>(generated.track);
  const [phase, setPhase] = useState<SeasonPhase>(generated.phase);
  const [emphasis, setEmphasis] = useState<Emphasis>(generated.emphasis);
  const program = useMemo(
    () => generateStrengthProgram(slice, { track, phase, emphasis }),
    [slice, track, phase, emphasis],
  );
  const [running, setRunning] = useState(false);

  return (
    <div className="pd-stack" data-strength-program={slice.athlete.id}>
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Strength — generated, not a template
          </p>
          <h3 className="mt-2 text-2xl italic">
            {program.track} · {program.phase}
          </h3>
          <p className="mt-2 font-display text-3xl uppercase">{program.emphasis}</p>
          <p className="mt-2 text-sm text-fg-soft">{program.emphasisReason}</p>
          <p className="mt-2 text-sm text-fg-soft">{program.sessionNote}</p>
        </div>
      </section>

      {program.healthOverride ? (
        <p className="rounded-xl bg-maroon px-4 py-3 text-sm text-fg-inverse" data-health-override="true">
          Health status outranks goals. Returning from injury — this is a return-to-play block, not velocity.
        </p>
      ) : null}
      {program.inSeasonBlockedVelocity ? (
        <p className="rounded-xl bg-navy px-4 py-3 text-sm text-fg-inverse">
          Velocity work belongs in the offseason, not in-season. Calendar outranked the goal.
        </p>
      ) : null}

      {coach ? (
        <div className="grid gap-2">
          <Select
            label="Track"
            value={track}
            onChange={(v) => setTrack(v as StrengthTrack)}
            options={TRACKS}
          />
          <Select
            label="Season phase"
            value={phase}
            onChange={(v) => setPhase(v as SeasonPhase)}
            options={PHASES}
          />
          <Select
            label="Emphasis"
            value={emphasis}
            onChange={(v) => setEmphasis(v as Emphasis)}
            options={EMPHASES}
          />
        </div>
      ) : null}

      {running ? (
        <SessionRunner slice={slice} program={program} age={age} onDone={() => setRunning(false)} />
      ) : (
        <Button type="button" className="min-h-12 w-full" data-run-session="true" onClick={() => setRunning(true)}>
          Run this session
        </Button>
      )}

      <ul className="grid gap-2">
        {program.slots.map((slot) => {
          const ex = exerciseById(slot.exerciseId);
          if (!ex) return null;
          return <ExerciseCard key={slot.exerciseId} exercise={ex} slot={slot} slice={slice} age={age} />;
        })}
      </ul>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <select
        className="pd-control min-h-12 rounded-md border border-line bg-paper-2 px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((row) => (
          <option key={row} value={row}>
            {row}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExerciseCard({
  exercise,
  slot,
  slice,
  age,
}: {
  exercise: Exercise;
  slot: { sets: number; reps: string; restSec: number; targetRpe: number; whySlot: string; stopRule?: string };
  slice: AthleteSlice;
  age: number;
}) {
  const college = slice.athlete.opLevel === 7 || age >= 19;
  const suggest = suggestLoad(exercise, age, college, slice.strengthSets, slot.targetRpe);
  const trend = e1rmTrend(slice.strengthSets, exercise.id);
  const band = loadBandForAge(age, college);
  return (
    <details className="rounded-2xl bg-paper-2 shadow-border" data-exercise={exercise.id}>
      <summary className="pd-row min-h-12 cursor-pointer list-none">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-display text-xl uppercase">{exercise.name}</span>
          <span className="pd-num text-sm font-semibold text-maroon">
            {slot.sets} × {slot.reps}
          </span>
        </span>
        <span className="mt-1 block text-sm text-muted">
          {exercise.category} · rest {slot.restSec}s · RPE {slot.targetRpe}
        </span>
      </summary>
      <div className="pd-card grid gap-2 pt-0 text-sm">
        <p>{slot.whySlot}</p>
        {slot.stopRule ? <p className="font-semibold text-maroon">{slot.stopRule}</p> : null}
        <p>
          <strong>Tempo {exercise.tempo}. </strong>
          {exercise.tempoWhy}
        </p>
        <p>
          <strong>Load. </strong>
          {suggest.display} · {suggest.note}
        </p>
        <p>
          <strong>Age start ({band}). </strong>
          {exercise.loads[band]}
        </p>
        <p>
          <strong>Setup. </strong>
          {exercise.setup}
        </p>
        <p>
          <strong>How. </strong>
          {exercise.howto}
        </p>
        <p>
          <strong>Focus. </strong>
          {exercise.focus}
        </p>
        <p>
          <strong>Why it’s programmed. </strong>
          {exercise.why}
        </p>
        <p className="text-muted">
          <strong>Common mistakes. </strong>
          {exercise.mistakes.join(" · ")}
        </p>
        {trend.length ? (
          <p className="pd-num text-muted">
            Estimated 1RM trend: {trend.map((row) => `${row.date.slice(5)} ${row.e1rm}`).join(" → ")}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function SessionRunner({
  slice,
  program,
  age,
  onDone,
}: {
  slice: AthleteSlice;
  program: ReturnType<typeof generateStrengthProgram>;
  age: number;
  onDone: () => void;
}) {
  const { logStrengthSet } = useDevelopment();
  const [index, setIndex] = useState(0);
  const [setNumber, setSetNumber] = useState(1);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rpe, setRpe] = useState("");
  const [rest, setRest] = useState(0);
  const slot = program.slots[index];
  const exercise = slot ? exerciseById(slot.exerciseId) : undefined;
  const college = slice.athlete.opLevel === 7 || age >= 19;

  useEffect(() => {
    if (!slot || !exercise) return;
    const suggest = suggestLoad(exercise, age, college, slice.strengthSets, slot.targetRpe);
    setWeight(suggest.weight != null ? String(suggest.weight) : "");
    setReps(slot.reps.replace(/[^\d].*/, "") || "5");
    setRpe(String(slot.targetRpe));
    setSetNumber(1);
    setRest(0);
  }, [index, slot?.exerciseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rest <= 0) return;
    const id = window.setInterval(() => setRest((n) => n - 1), 1000);
    return () => window.clearInterval(id);
  }, [rest]);

  if (!slot || !exercise) {
    return (
      <section className="rounded-2xl bg-maroon p-5 text-fg-inverse" data-session-runner="done">
        <h3 className="text-2xl italic">Session in the book.</h3>
        <Button type="button" variant="outline" className="mt-4 min-h-12 w-full" onClick={onDone}>
          Close runner
        </Button>
      </section>
    );
  }

  const suggest = suggestLoad(exercise, age, college, slice.strengthSets, slot.targetRpe);

  function log() {
    logStrengthSet({
      athleteId: slice.athlete.id,
      date: "2026-09-14",
      exerciseId: exercise!.id,
      setNumber,
      weight: Number(weight) || 0,
      reps: Number(reps) || 0,
      rpe: Number(rpe) || slot.targetRpe,
    });
    if (setNumber >= slot.sets) {
      setIndex((n) => n + 1);
    } else {
      setSetNumber((n) => n + 1);
      setRest(slot.restSec);
    }
  }

  return (
    <section className="rounded-2xl bg-ink p-4 text-fg-inverse" data-session-runner="true">
      <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
        Live session · {index + 1} of {program.slots.length}
      </p>
      <h3 className="mt-2 text-2xl italic">{exercise.name}</h3>
      <p className="mt-1 text-sm text-fg-soft">
        Set {setNumber} of {slot.sets} · target RPE {slot.targetRpe} · {suggest.note}
      </p>
      {slot.stopRule ? <p className="mt-2 text-sm text-powder">{slot.stopRule}</p> : null}
      {rest > 0 ? (
        <p className="pd-num mt-4 font-display text-6xl leading-none" data-rest-clock="true">
          {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, "0")}
        </p>
      ) : (
        <p className="mt-4 text-sm text-powder">Rest is done. Next set.</p>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <label className="text-xs font-semibold tracking-wide uppercase">
          Weight
          <input
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            className="pd-control mt-1 min-h-12 w-full rounded-md border border-fg-inverse/20 bg-navy px-2 pd-num text-fg-inverse"
          />
        </label>
        <label className="text-xs font-semibold tracking-wide uppercase">
          Reps
          <input
            inputMode="numeric"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            className="pd-control mt-1 min-h-12 w-full rounded-md border border-fg-inverse/20 bg-navy px-2 pd-num text-fg-inverse"
          />
        </label>
        <label className="text-xs font-semibold tracking-wide uppercase">
          RPE
          <input
            inputMode="decimal"
            value={rpe}
            onChange={(event) => setRpe(event.target.value)}
            className="pd-control mt-1 min-h-12 w-full rounded-md border border-fg-inverse/20 bg-navy px-2 pd-num text-fg-inverse"
          />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" className="min-h-12" onClick={log} data-log-set="true">
          Log set
        </Button>
        <Button type="button" variant="outline" className="min-h-12" onClick={() => setRest(0)}>
          Skip rest
        </Button>
      </div>
      <button type="button" className="mt-2 min-h-12 text-xs tracking-wide text-powder uppercase" onClick={onDone}>
        End session
      </button>
    </section>
  );
}

export function WarmupLibraryView({ slice }: { slice: AthleteSlice }) {
  const plan = warmupForSlice(slice);
  const age = ageOnClubDay(slice.athlete.birthDate);
  return (
    <div className="pd-stack" data-warmup-plan={plan.id}>
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Warm-up · RAMP · age {age}
          </p>
          <h3 className="mt-2 text-2xl italic">{plan.title}</h3>
          <p className="mt-2 text-sm text-fg-soft">{plan.principle}</p>
          <p className="mt-2 pd-num text-sm text-powder">{plan.minutes} minutes</p>
        </div>
      </section>
      <p className="text-sm text-muted">{WARMUP_PRINCIPLES.ramp}</p>
      <p className="text-sm text-muted">{WARMUP_PRINCIPLES.static}</p>
      {plan.steps.map((step) => (
        <section key={step.letter + step.name} className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              {step.letter} · {step.name}
              {step.play ? " · play" : ""}
            </p>
            <p className="pd-num mt-2 font-display text-2xl uppercase">{step.reps}</p>
            <p className="mt-2 text-sm text-muted">{step.why}</p>
          </div>
        </section>
      ))}
    </div>
  );
}

export function ThrowingPlanView({
  slice,
  role,
}: {
  slice: AthleteSlice;
  role: string;
}) {
  const { assignThrowing } = useDevelopment();
  const options = throwingForSlice(slice);
  const assigned = slice.throwingAssignments[0];
  const fallback = options[0] ?? THROWING_PLANS.find((row) => row.goal === "Command");
  const template =
    THROWING_PLANS.find((row) => row.id === assigned?.templateId) ?? fallback;
  const [dayType, setDayType] = useState(assigned?.dayType ?? template?.days[0]?.type ?? "Catch play");
  const today = template?.days.find((row) => row.type === dayType) ?? template?.days[0];
  const coach = role === "admin" || role === "coach";

  if (!template) {
    return (
      <div className="rounded-xl bg-paper-2 px-4 py-3 shadow-border" data-empty-state="true">
        <p className="text-sm text-muted">No throwing template for this athlete yet.</p>
        <p className="mt-2 text-sm font-semibold text-maroon">Assign from the throwing library after assessment</p>
      </div>
    );
  }

  return (
    <div className="pd-stack" data-throwing-plan={template.id}>
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">Throwing plan</p>
          <h3 className="mt-2 text-2xl italic">{template.name}</h3>
          <p className="mt-2 text-sm text-fg-soft">{template.blurb}</p>
        </div>
      </section>
      {coach && options.length ? (
        <label className="grid gap-1 text-sm font-semibold">
          Assign template
          <select
            className="pd-control min-h-12 rounded-md border border-line bg-paper-2 px-3"
            value={template.id}
            onChange={(event) => {
              const id = event.target.value;
              const next = THROWING_PLANS.find((row) => row.id === id);
              assignThrowing({
                athleteId: slice.athlete.id,
                templateId: id,
                dayType: next?.days[0]?.type ?? "Catch play",
              });
            }}
          >
            {options.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="grid gap-1 text-sm font-semibold">
        Today’s day type
        <select
          className="pd-control min-h-12 rounded-md border border-line bg-paper-2 px-3"
          value={dayType}
          data-day-type="true"
          onChange={(event) => {
            const next = event.target.value;
            setDayType(next);
            assignThrowing({ athleteId: slice.athlete.id, templateId: template.id, dayType: next });
          }}
        >
          {(coach ? DAY_TYPES : template.days.map((row) => row.type)).map((row) => (
            <option key={row} value={row}>
              {row}
            </option>
          ))}
        </select>
      </label>
      {today ? (
        <section className="rounded-2xl bg-paper-2 shadow-border" data-throw-day={today.type}>
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">{today.type}</p>
            <p className="pd-num mt-2 font-display text-2xl uppercase">{today.throws}</p>
            <p className="mt-2 text-sm">{today.intent}</p>
            <p className="mt-2 text-sm text-muted">{today.notes}</p>
          </div>
        </section>
      ) : null}
      <ul className="grid gap-2">
        {template.days.map((row) => (
          <li
            key={row.type + row.throws}
            className={cn(
              "pd-row rounded-xl shadow-border",
              row.type === dayType ? "bg-maroon text-fg-inverse" : "bg-paper-2",
            )}
          >
            <strong>{row.type}</strong>
            <span className="mt-1 block text-sm opacity-80">{row.throws}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WarmupAndThrowView({ slice, role }: { slice: AthleteSlice; role: string }) {
  return (
    <div className="pd-stack">
      <WarmupLibraryView slice={slice} />
      <ThrowingPlanView slice={slice} role={role} />
    </div>
  );
}
