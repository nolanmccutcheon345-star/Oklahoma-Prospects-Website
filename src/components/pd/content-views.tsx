import { useMemo, useState, type ReactNode } from "react";
import type { AthleteSlice } from "@/lib/pd/context";
import {
  AGE_CURRICULUM,
  DISCIPLINES,
  DRILLS,
  FLAWS,
  curriculumForAge,
  drillById,
  drillProblems,
  filterDrills,
  iqModulesFor,
  peerGrades,
  primaryDiscipline,
  rankedDiagnostics,
  type Discipline,
  type Drill,
  type GradedRow,
} from "@/lib/pd/content";
import { OP_LEVELS } from "@/lib/pd";
import { ageOnClubDay } from "@/lib/pd/engines";
import type { ViewerRole } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-paper-2 shadow-border">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-2xl">{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

export function DrillCard({
  drill,
  open,
}: {
  drill: Drill;
  open?: boolean;
}) {
  return (
    <details
      className="rounded-2xl bg-paper-2 shadow-border"
      data-drill-id={drill.id}
      open={open}
    >
      <summary className="pd-row min-h-11 cursor-pointer list-none">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-display text-xl uppercase">{drill.name}</span>
          <span className="shrink-0 text-xs font-semibold tracking-wide text-maroon uppercase">
            {drill.problem}
          </span>
        </span>
        <span className="mt-1 block text-sm text-muted">
          {drill.discipline}
          {drill.familySafe ? " · home-safe" : " · cage with staff"}
        </span>
      </summary>
      <div className="pd-card grid gap-3 pt-0 text-sm">
        <p>
          <strong>Fixes. </strong>
          {drill.solves}
        </p>
        <p>
          <strong>Why it works. </strong>
          {drill.why}
        </p>
        <p>
          <strong>Setup. </strong>
          {drill.setup}
        </p>
        <p>
          <strong>Dose. </strong>
          <span className="pd-num">{drill.dose}</span>
        </p>
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            Cues
          </p>
          <ul className="mt-2 grid gap-1">
            {drill.cues.map((cue) => (
              <li key={cue} className="rounded-xl bg-paper px-3 py-2">
                “{cue}”
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            Watch for
          </p>
          <ul className="mt-2 grid gap-1 text-muted">
            {drill.watch.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

function MissingDrill({ id }: { id: string }) {
  return (
    <p
      className="rounded-xl bg-paper px-3 py-2 text-sm text-muted"
      data-drill-missing={id}
    >
      Linked drill {id} isn’t in this library file.
    </p>
  );
}

export function LinkedDrills({
  ids,
  openId,
  onOpen,
}: {
  ids: string[];
  openId?: string | null;
  onOpen?: (id: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {ids.map((id) => {
        const drill = drillById(id);
        if (!drill) return <MissingDrill key={id} id={id} />;
        if (onOpen) {
          return (
            <div key={id} className="grid gap-2">
              <button
                type="button"
                onClick={() => onOpen(id)}
                className="pd-control min-h-11 rounded-xl bg-ink px-3 text-left text-sm font-semibold text-fg-inverse"
              >
                Open {drill.name}
              </button>
              {openId === id ? <DrillCard drill={drill} open /> : null}
            </div>
          );
        }
        return <DrillCard key={id} drill={drill} />;
      })}
    </div>
  );
}

export function DrillLibrary({
  role,
  defaultDiscipline,
  level,
}: {
  role: ViewerRole;
  defaultDiscipline?: Discipline;
  level?: number;
}) {
  const familySafeOnly = role === "parent" || role === "player";
  const [discipline, setDiscipline] = useState<Discipline | "All">(
    defaultDiscipline ?? "Pitching",
  );
  const [problem, setProblem] = useState<string>("All");
  const problems = drillProblems(discipline);
  const rows = filterDrills({
    discipline,
    problem,
    familySafeOnly,
    level: level && level > 0 ? level : undefined,
  });

  return (
    <div className="pd-stack" data-drill-library="true">
      <Panel eyebrow="Drill library" title="Filter, then open a card.">
        <p className="text-sm text-muted">
          What it fixes, why it works, setup, dose, cues, and what to watch for.
          {familySafeOnly
            ? " Home-safe drills only on this desk."
            : ` ${DRILLS.length} on file.`}
        </p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-sm font-semibold">
            Discipline
            <select
              className="pd-control min-h-11 w-full rounded-md border border-line bg-paper-2 px-3"
              value={discipline}
              onChange={(event) => {
                setDiscipline(event.target.value as Discipline | "All");
                setProblem("All");
              }}
            >
              <option value="All">All</option>
              {DISCIPLINES.map((row) => (
                <option key={row} value={row}>
                  {row}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Problem
            <select
              className="pd-control min-h-11 w-full rounded-md border border-line bg-paper-2 px-3"
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
            >
              <option value="All">All problems</option>
              {problems.map((row) => (
                <option key={row} value={row}>
                  {row}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Panel>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No drills in this filter.</p>
      ) : (
        rows.map((drill) => <DrillCard key={drill.id} drill={drill} />)
      )}
    </div>
  );
}

export function DiagnosticView({ slice }: { slice: AthleteSlice }) {
  const ranked = rankedDiagnostics(slice);
  const [openDrill, setOpenDrill] = useState<string | null>(null);
  const [symptom, setSymptom] = useState(ranked.rows[0]?.symptom ?? "");
  const active = ranked.rows.find((row) => row.symptom === symptom) ?? ranked.rows[0];

  return (
    <div className="pd-stack" data-diagnostic-view="true">
      <Panel eyebrow={`Diagnose · ${ranked.discipline}`} title="Start from what you can see.">
        {ranked.matched ? (
          <p className="rounded-xl bg-ink px-4 py-3 text-sm text-fg-inverse">
            Charted miss matches “{ranked.matched.symptom}.” Sorted to the top.
          </p>
        ) : (
          <p className="text-sm text-muted">
            No miss charted yet. Pick a symptom a coach can actually see. Causes stay in
            the order they were written.
          </p>
        )}
        <label className="mt-4 grid gap-1.5 text-sm font-semibold">
          Symptom
          <select
            className="pd-control min-h-11 w-full rounded-md border border-line bg-paper-2 px-3"
            value={active?.symptom ?? ""}
            onChange={(event) => setSymptom(event.target.value)}
          >
            {ranked.rows.map((row) => (
              <option key={row.symptom} value={row.symptom}>
                {row.symptom}
              </option>
            ))}
          </select>
        </label>
      </Panel>

      {slice.diagnose.length ? (
        <Panel eyebrow="On file" title="This athlete">
          <ul className="grid gap-2">
            {slice.diagnose.map((row) => (
              <li key={row.id} className="pd-row rounded-xl bg-paper">
                <strong>{row.date}</strong>
                <span className="mt-1 block text-sm text-muted">{row.finding}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {active
        ? active.causes.map((cause, index) => (
            <section key={cause.cause} className="rounded-2xl bg-paper-2 shadow-border">
              <div className="pd-card">
                <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
                  Cause {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-2 text-2xl">{cause.cause}</h3>
                <p className="mt-3 text-sm">
                  <strong>Confirm it. </strong>
                  {cause.confirm}
                </p>
                <p className="mt-2 text-sm">
                  <strong>Fix it. </strong>
                  {cause.fix}
                </p>
                <p className="mt-3 rounded-xl bg-ink px-4 py-3 text-sm text-fg-inverse">
                  “{cause.cue}”
                </p>
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
                    Linked drills
                  </p>
                  <LinkedDrills ids={cause.drills} openId={openDrill} onOpen={setOpenDrill} />
                </div>
              </div>
            </section>
          ))
        : null}
    </div>
  );
}

function KnotRow({ row }: { row: GradedRow }) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-2">
      {row.knots.map(([p, v]) => (
        <li
          key={`${row.key}-${p}`}
          className="pd-row flex items-baseline justify-between rounded-xl bg-paper"
        >
          <span className="text-sm">p{p}</span>
          <span className="pd-num font-display text-xl">
            {v}
            {row.unit ? ` ${row.unit}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PeerBenchmarkView({ slice }: { slice: AthleteSlice }) {
  const age = ageOnClubDay(slice.athlete.birthDate);
  const rows = peerGrades(slice, age);
  if (rows.length === 0) {
    return (
      <Panel eyebrow="Peer benchmarks" title="No table for this age yet.">
        <p className="text-sm text-muted">
          Published bands attach by sport and age. We will not invent a grade.
        </p>
        <p className="mt-3 text-sm font-semibold text-maroon">Book an assessment</p>
      </Panel>
    );
  }
  return (
    <div className="pd-stack" data-peer-benchmarks="true">
      {rows.map((row) => (
        <section key={row.key} className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              {row.band} · 20–80
            </p>
            <h3 className="mt-2 text-2xl">{row.label}</h3>
            {row.grade != null ? (
              <>
                <p className="pd-num mt-3 font-display text-5xl leading-none">{row.grade}</p>
                <p className="mt-1 text-sm font-semibold text-maroon">{row.gradeName}</p>
                <p className="mt-2 text-sm text-muted">
                  Reading {row.value}
                  {row.unit ? ` ${row.unit}` : ""} · p{row.percentile}
                  {row.lower ? " · lower is better" : ""}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">
                No reading on file. Table still shows. We will not invent a 20–80.
              </p>
            )}
            <KnotRow row={row} />
            <p className="mt-3 text-xs text-muted">{row.source}</p>
          </div>
        </section>
      ))}
    </div>
  );
}

export function AgeCurriculumView({
  age,
  showAll = false,
}: {
  age?: number;
  showAll?: boolean;
}) {
  const current = age != null ? curriculumForAge(age) : null;
  const rows = showAll ? AGE_CURRICULUM : current ? [current] : AGE_CURRICULUM;
  return (
    <div className="pd-stack" data-age-curriculum="true">
      {rows.map((row) => (
        <section
          key={row.band}
          className={cn(
            "rounded-2xl shadow-border",
            current && row.band === current.band ? "bg-ink text-fg-inverse" : "bg-paper-2",
          )}
        >
          <div className="pd-card">
            <p
              className={cn(
                "text-xs font-semibold tracking-[0.16em] uppercase",
                current && row.band === current.band ? "text-powder" : "text-maroon",
              )}
            >
              {row.band}
              {current && row.band === current.band ? " · this athlete" : ""}
            </p>
            <h3 className="mt-2 text-2xl">{row.title}</h3>
            <p className="mt-4 text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              Objectives
            </p>
            <ul className="mt-2 grid gap-1 text-sm">
              {row.objectives.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              Avoid
            </p>
            <ul className="mt-2 grid gap-1 text-sm">
              {row.avoid.map((item) => (
                <li key={item} className="rounded-xl bg-maroon/15 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}

export function GameIqLibrary({ slice }: { slice: AthleteSlice }) {
  const age = ageOnClubDay(slice.athlete.birthDate);
  const pack = iqModulesFor(slice, age);
  return (
    <div className="pd-stack" data-game-iq-library="true">
      <Panel
        eyebrow={`Game IQ · ${pack.discipline}`}
        title={`${pack.band} modules`}
      >
        <p className="text-sm text-muted">
          Why it matters, how to teach it, how to check it. Staff only.
        </p>
      </Panel>
      {slice.gameIq.length ? (
        <Panel eyebrow="Charted reads" title="This athlete">
          <ul className="grid gap-2">
            {slice.gameIq.map((row) => (
              <li key={row.id} className="pd-row rounded-xl bg-paper">
                <strong>{row.situation}</strong>
                <span className="mt-1 block text-sm text-muted">
                  {row.date} · {row.note}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {pack.rows.map((row) => (
        <section key={row.id} className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              {row.band}
            </p>
            <h3 className="mt-2 text-2xl">{row.t}</h3>
            <p className="mt-3 text-sm">
              <strong>Why. </strong>
              {row.why}
            </p>
            <p className="mt-2 text-sm">
              <strong>Teach. </strong>
              {row.teach}
            </p>
            <p className="mt-2 text-sm">
              <strong>Check. </strong>
              {row.check}
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}

export function FlawLibrary({
  slice,
}: {
  slice?: AthleteSlice;
}) {
  const sport = slice?.athlete.sport;
  const primary = slice
    ? primaryDiscipline(slice.athlete.position, slice.athlete.sport)
    : "Pitching";
  const [discipline, setDiscipline] = useState<Discipline | "All">(primary);
  const rows = useMemo(
    () =>
      FLAWS.filter((row) => {
        if (row.sport && sport && row.sport !== sport) return false;
        if (discipline !== "All" && row.discipline !== discipline) return false;
        return true;
      }),
    [discipline, sport],
  );
  const [openDrill, setOpenDrill] = useState<string | null>(null);

  return (
    <div className="pd-stack">
      <Panel eyebrow="Flaw library" title="Looks like. Then the cue.">
        <label className="grid gap-1.5 text-sm font-semibold">
          Discipline
          <select
            className="pd-control min-h-11 w-full rounded-md border border-line bg-paper-2 px-3"
            value={discipline}
            onChange={(event) => setDiscipline(event.target.value as Discipline | "All")}
          >
            <option value="All">All</option>
            {DISCIPLINES.map((row) => (
              <option key={row} value={row}>
                {row}
              </option>
            ))}
          </select>
        </label>
      </Panel>
      {rows.map((row) => (
        <section key={row.id} className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              {row.discipline}
              {row.sport ? ` · ${row.sport}` : ""}
            </p>
            <h3 className="mt-2 text-2xl">{row.name}</h3>
            <p className="mt-3 text-sm">
              <strong>Looks like. </strong>
              {row.looksLike}
            </p>
            <p className="mt-2 text-sm">
              <strong>Why. </strong>
              {row.why}
            </p>
            <ul className="mt-3 grid gap-1">
              {row.cues.map((cue) => (
                <li key={cue} className="rounded-xl bg-ink px-4 py-3 text-sm text-fg-inverse">
                  “{cue}”
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <LinkedDrills ids={row.drills} openId={openDrill} onOpen={setOpenDrill} />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

export function SkillPlanLibrary({
  slice,
  role,
}: {
  slice: AthleteSlice;
  role: ViewerRole;
}) {
  const ranked = rankedDiagnostics(slice);
  const drillIds = ranked.matched
    ? ranked.matched.causes.flatMap((cause) => cause.drills)
    : slice.skillPlans
        .map((row) => DRILLS.find((d) => d.name.toLowerCase().includes(row.drill.toLowerCase()))?.id)
        .filter((id): id is string => Boolean(id));
  const unique = Array.from(new Set(drillIds));

  return (
    <div className="pd-stack">
      {slice.skillPlans.length ? (
        <Panel eyebrow="Skill plan" title="This week">
          <ul className="grid gap-2">
            {slice.skillPlans.map((row) => (
              <li key={row.id} className="pd-row rounded-xl bg-paper">
                <strong>
                  {row.skill} · {row.drill}
                </strong>
                <span className="mt-1 block text-sm text-muted">{row.dose}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel eyebrow="Skill plan" title="Drills follow the constraint.">
          <p className="text-sm text-muted">
            {ranked.matched
              ? `Matching “${ranked.matched.symptom}.” Open the linked work.`
              : "No assignment yet. Browse the library — don’t invent a plan."}
          </p>
          {ranked.matched ? null : (
            <p className="mt-3 text-sm font-semibold text-maroon">Open a drill below</p>
          )}
        </Panel>
      )}
      {unique.length ? <LinkedDrills ids={unique} /> : null}
      <DrillLibrary
        role={role}
        defaultDiscipline={ranked.discipline}
        level={slice.athlete.opLevel || undefined}
      />
    </div>
  );
}

export function ProgramsCurriculum() {
  return (
    <div className="pd-stack">
      <Panel eyebrow="OP-1 through OP-7" title="Same ladder. One constraint at a time.">
        <ol className="grid gap-2">
          {OP_LEVELS.map((level) => (
            <li key={level.code} className="pd-row rounded-xl bg-paper">
              <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
                {level.code} · {level.ages}
              </p>
              <p className="font-display text-xl uppercase">{level.name}</p>
              <p className="text-sm text-muted">{level.goal}</p>
              <p className="mt-1 text-sm">{level.arsenal}</p>
            </li>
          ))}
        </ol>
      </Panel>
      <AgeCurriculumView showAll />
    </div>
  );
}
