import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDevelopment, type AthleteSlice } from "@/lib/pd/context";
import {
  drillById,
  primaryDiscipline,
  type Discipline,
  type Drill,
} from "@/lib/pd/content";
import { FLAWS } from "@/lib/pd/content/flaws";
import { ageOnClubDay } from "@/lib/pd/engines";
import {
  INTERVENTION_METHODS,
  INTERVENTION_OUTCOMES,
  LESSON_STAGES,
  clearDraft,
  defaultConstraint,
  defaultCue,
  diagnosePanel,
  drillsForFlaws,
  emptyDraft,
  generateRecaps,
  iqChoices,
  lessonTypeFromBooking,
  matchFlaws,
  rampFor,
  readDrafts,
  scoreChart,
  sportWarmup,
  weeklyPoints,
  writeDraft,
  type LessonDraft,
} from "@/lib/pd/lesson";
import { SCORE_LABELS, scorePitch } from "@/lib/pd/core-algorithms.js";
import type { Booking, BullpenPitch } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

export type LessonStart = {
  athleteId: string;
  bookingId?: string;
  serviceId?: string;
  jumpTo?: "tracker";
};

export function LessonLaunch({ onStart }: { onStart: (start: LessonStart) => void }) {
  const { data, listAthletes } = useDevelopment();
  const drafts = typeof window === "undefined" ? {} : readDrafts();
  const floor = data.bookings.filter(
    (row) => row.status === "paid" && row.date >= "2026-09-14" && row.date <= "2026-09-18",
  );
  const athletes = listAthletes("coach");
  return (
    <div className="pd-stack" data-lesson-launch="true">
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Guided lesson
          </p>
          <h2 className="mt-2 text-3xl italic">On the mound. Phone in hand.</h2>
          <p className="mt-2 text-sm text-fg-soft">
            Eight stages. Thumb-zone continue. The pen drafts itself so a walk-away never dumps 35 pitches.
          </p>
        </div>
      </section>
      {Object.keys(drafts).length ? (
        <section className="rounded-2xl bg-maroon text-fg-inverse">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">Draft waiting</p>
            <ul className="mt-3 grid gap-2">
              {Object.values(drafts).map((row) => {
                const athlete = data.athletes.find((item) => item.id === row.athleteId);
                return (
                  <li key={row.athleteId}>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-12 w-full"
                      onClick={() => onStart({ athleteId: row.athleteId, bookingId: row.bookingId, serviceId: row.serviceId })}
                    >
                      Recover {athlete ? `${athlete.firstName} ${athlete.lastName}` : row.athleteId}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}
      <section>
        <h3 className="text-2xl">On the floor</h3>
        <ul className="mt-3 grid gap-2">
          {floor.length === 0 ? (
            <li className="rounded-xl bg-paper-2 px-4 py-3 text-sm text-muted shadow-border">
              No paid sessions in the next few days. Open a roster athlete.
            </li>
          ) : (
            floor.map((row) => {
              const athlete = data.athletes.find((item) => item.id === row.athleteId);
              return (
                <li key={row.id} className="pd-row rounded-2xl bg-paper-2 shadow-border">
                  <strong>
                    {athlete ? `${athlete.firstName} ${athlete.lastName}` : row.athleteId}
                  </strong>
                  <span className="mt-1 block text-sm text-muted">
                    {row.date} · {row.time} · {row.serviceId}
                  </span>
                  <Button
                    type="button"
                    className="mt-3 min-h-12 w-full"
                    data-start-lesson={row.athleteId}
                    onClick={() =>
                      onStart({
                        athleteId: row.athleteId,
                        bookingId: row.id,
                        serviceId: row.serviceId,
                      })
                    }
                  >
                    Start lesson
                  </Button>
                </li>
              );
            })
          )}
        </ul>
      </section>
      <section>
        <h3 className="text-2xl">Or pick an athlete</h3>
        <ul className="mt-3 grid gap-2">
          {athletes.slice(0, 8).map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="pd-row min-h-12 w-full rounded-xl bg-paper-2 text-left shadow-border"
                onClick={() => onStart({ athleteId: row.id })}
              >
                {row.firstName} {row.lastName}
                <span className="mt-1 block text-sm text-muted">
                  {row.position} · {row.sport}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const CELLS = [0, 1, 2, 3, 4];
const SWING_RESULTS = ["Whiff", "Foul", "Ground", "Line", "Fly", "Hard"];
const CATCH_KINDS = ["Receive", "Block", "Pop"];

export function GuidedLesson({
  start,
  onClose,
}: {
  start: LessonStart;
  onClose: () => void;
}) {
  const { slice, data, publishLesson } = useDevelopment();
  const athleteSlice = slice(start.athleteId);
  const booking = data.bookings.find((row) => row.id === start.bookingId);
  const [draft, setDraft] = useState<LessonDraft | null>(null);
  const [recover, setRecover] = useState<LessonDraft | null>(null);
  const [veloInput, setVeloInput] = useState("");
  const [intent, setIntent] = useState<{ row: number; col: number } | null>(null);

  useEffect(() => {
    const existing = readDrafts()[start.athleteId];
    if (existing) {
      setRecover(existing);
      return;
    }
    setDraft(buildFresh(athleteSlice, start, booking));
  }, [start.athleteId, start.bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!draft) return;
    writeDraft(draft);
  }, [draft]);

  if (!athleteSlice) {
    return (
      <Shell dataAthlete={start.athleteId}>
        <p className="p-4 text-sm">Athlete is missing. Close and pick again.</p>
        <Button type="button" className="mx-4 min-h-12" onClick={onClose}>
          Close
        </Button>
      </Shell>
    );
  }

  if (recover && !draft) {
    return (
      <Shell dataAthlete={start.athleteId}>
        <section className="m-4 rounded-2xl bg-ink p-5 text-fg-inverse" data-lesson-recover="true">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Draft on this phone
          </p>
          <h2 className="mt-2 text-3xl italic">A bullpen is sitting here.</h2>
          <p className="mt-2 text-sm text-fg-soft">
            {recover.pitches.length} pitches charted · last saved{" "}
            {new Date(recover.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
            Navigating away never dumps a pen.
          </p>
          <div className="mt-4 grid gap-2">
            <Button
              type="button"
              className="min-h-12 w-full"
              onClick={() => {
                setDraft(recover);
                setRecover(null);
              }}
            >
              Recover it
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full"
              onClick={() => {
                clearDraft(start.athleteId);
                setRecover(null);
                setDraft(buildFresh(athleteSlice, start, booking));
              }}
            >
              Discard
            </Button>
          </div>
        </section>
      </Shell>
    );
  }

  if (!draft) return null;
  const live = draft;
  const current = athleteSlice;

  const age = ageOnClubDay(current.athlete.birthDate);
  const name = `${current.athlete.firstName} ${current.athlete.lastName}`;
  const stage = LESSON_STAGES[live.stage] ?? LESSON_STAGES[0];
  const last = live.stage >= LESSON_STAGES.length - 1;
  const chart = scoreChart(live.pitches);
  const iqList = iqChoices(current, age);
  const iq = iqList.find((row) => row.id === live.iqModuleId) ?? null;
  const homework = live.homeworkIds.map((id) => drillById(id)).filter((row): row is Drill => Boolean(row));
  const recaps = generateRecaps({
    firstName: current.athlete.firstName,
    lastName: current.athlete.lastName,
    lessonType: live.lessonType,
    constraint: live.constraint,
    method: live.method,
    cue: live.cue,
    pre: live.preScore,
    post: live.postScore,
    outcome: live.outcome,
    drills: homework,
    iq,
    tci: live.discipline === "Pitching" ? chart.tci : null,
    swings: chart.pitches.length,
  });

  function patch(next: Partial<LessonDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));
  }

  function go(delta: number) {
    const next = Math.min(LESSON_STAGES.length - 1, Math.max(0, live.stage + delta));
    patch({ stage: next });
  }

  function logPitch(actual: { row: number; col: number; noncompetitive?: boolean }) {
    if (!intent) return;
    const score = scorePitch(intent, actual);
    const pitch: BullpenPitch = { intent, actual, score };
    patch({ pitches: [...live.pitches, pitch], pendingVelo: live.askVelo });
    setIntent(null);
    setVeloInput("");
  }

  function attachVelo(mph: number | null) {
    if (!live.pitches.length) {
      patch({ pendingVelo: false });
      return;
    }
    const pitches = live.pitches.slice();
    const lastPitch = pitches[pitches.length - 1];
    if (mph != null && Number.isFinite(mph) && mph >= 20 && mph <= 110) {
      pitches[pitches.length - 1] = { ...lastPitch, velo: Math.round(mph) };
    }
    patch({ pitches, pendingVelo: false });
    setVeloInput("");
  }

  function publish() {
    const velos = live.pitches.map((p) => p.velo).filter((n): n is number => typeof n === "number");
    publishLesson({
      athleteId: start.athleteId,
      bookingId: start.bookingId,
      serviceId: live.serviceId,
      lessonType: live.lessonType,
      focus: live.constraint || live.lessonType,
      minutes: lessonTypeFromBooking(booking).minutes,
      homeworkIds: live.homeworkIds,
      iqModuleId: live.iqModuleId,
      iqTitle: iq?.t,
      intervention: {
        method: live.method,
        constraint: live.constraint,
        cue: live.cue,
        preScore: Number(live.preScore) || undefined,
        postScore: Number(live.postScore) || undefined,
        outcome: live.outcome,
      },
      recaps,
      bullpen:
        live.discipline === "Pitching" && chart.pitches.length
          ? { pitches: chart.pitches.length, tci: chart.tci, chart: chart.pitches, notes: live.cue }
          : undefined,
      velocities: velos,
      coachId: booking?.coachId ?? current.coaches[0]?.id ?? "c-steve",
    });
    clearDraft(start.athleteId);
    onClose();
  }

  return (
    <Shell dataAthlete={start.athleteId}>
      <header className="sticky top-0 z-10 bg-ink text-fg-inverse" data-lesson-stage={stage.id}>
        <div className="flex items-center justify-between gap-3 px-4 pt-2">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            Step {live.stage + 1} of 8
          </p>
          <button
            type="button"
            onClick={onClose}
            data-lesson-close="true"
            className="min-h-12 px-2 text-xs font-semibold tracking-wide text-powder uppercase"
          >
            Close
          </button>
        </div>
        <p className="truncate px-4 text-xs text-fg-soft">{name}</p>
        <h2 className="px-4 pt-1 text-2xl italic">{stage.label}</h2>
        <div className="mx-4 mt-3 h-1 rounded-full bg-navy">
          <div
            className="h-1 rounded-full bg-powder"
            style={{ width: `${((draft.stage + 1) / 8) * 100}%` }}
          />
        </div>
        <ol className="flex justify-between gap-1 overflow-hidden px-3 py-2 text-[0.65rem] font-semibold tracking-wide text-fg-soft uppercase">
          {LESSON_STAGES.map((row, index) => (
            <li key={row.id} className={index === draft.stage ? "min-w-0 truncate text-powder" : "min-w-0 truncate"}>
              {row.short}
            </li>
          ))}
        </ol>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {draft.stage === 0 ? (
          <SetupStage
            slice={athleteSlice}
            draft={draft}
            onType={(serviceId, lessonType, discipline) =>
              patch({ serviceId, lessonType, discipline })
            }
            onToggleFlaw={(id) => {
              const flawIds = draft.flawIds.includes(id)
                ? draft.flawIds.filter((row) => row !== id)
                : [...draft.flawIds, id].slice(0, 2);
              const drills = drillsForFlaws(
                flawIds,
                athleteSlice.skillPlans.map((row) => row.drill),
              ).map((row) => row.id);
              patch({
                flawIds,
                drillIds: drills,
                homeworkIds: drills.slice(0, 2),
                cue: defaultCue(flawIds) || draft.cue,
                constraint: defaultConstraint(athleteSlice, flawIds) || draft.constraint,
              });
            }}
          />
        ) : null}
        {draft.stage === 1 ? <BriefStage slice={athleteSlice} draft={draft} /> : null}
        {draft.stage === 2 ? <WarmStage discipline={draft.discipline} age={age} /> : null}
        {draft.stage === 3 ? (
          <DrillStage
            slice={athleteSlice}
            draft={draft}
            onToggle={(id) => {
              const drillIds = draft.drillIds.includes(id)
                ? draft.drillIds.filter((row) => row !== id)
                : [...draft.drillIds, id];
              patch({ drillIds, homeworkIds: drillIds.slice(0, 2) });
            }}
            onDrop={(id) => {
              if (draft.drillIds.includes(id)) return;
              patch({ drillIds: [...draft.drillIds, id] });
            }}
          />
        ) : null}
        {draft.stage === 4 ? <SportStage discipline={draft.discipline} age={age} /> : null}
        {draft.stage === 5 ? (
          <TrackerStage
            draft={draft}
            intent={intent}
            veloInput={veloInput}
            tci={chart.tci}
            onIntent={setIntent}
            onActual={logPitch}
            onAsk={(askVelo) => patch({ askVelo })}
            onVeloInput={setVeloInput}
            onSaveVelo={() => attachVelo(Number(veloInput))}
            onSkipVelo={() => attachVelo(null)}
            onSwing={(result) => patch({ swings: [...draft.swings, { result }] })}
            onCatch={(rep) => patch({ catchReps: [...draft.catchReps, rep] })}
          />
        ) : null}
        {draft.stage === 6 ? (
          <IqStage
            modules={iqList}
            selected={draft.iqModuleId}
            onSelect={(iqModuleId) => patch({ iqModuleId })}
          />
        ) : null}
        {draft.stage === 7 ? (
          <RecapStage
            draft={draft}
            recaps={recaps}
            onPatch={patch}
            onToggleHomework={(id) => {
              const homeworkIds = draft.homeworkIds.includes(id)
                ? draft.homeworkIds.filter((row) => row !== id)
                : [...draft.homeworkIds, id];
              patch({ homeworkIds });
            }}
          />
        ) : null}
      </div>

      <div className="sticky bottom-0 z-10 border-t border-line bg-paper px-4 py-3">
        <div className="grid grid-cols-[3rem_1fr] gap-2">
          <Button
            type="button"
            variant="outlineDark"
            className="min-h-12 px-0"
            disabled={draft.stage === 0}
            onClick={() => go(-1)}
          >
            Back
          </Button>
          <Button
            type="button"
            className="min-h-12 w-full"
            data-lesson-primary="true"
            onClick={() => (last ? publish() : go(1))}
          >
            {last ? "Publish lesson" : `Continue to ${LESSON_STAGES[draft.stage + 1].label}`}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  children,
  dataAthlete,
}: {
  children: React.ReactNode;
  dataAthlete?: string;
}) {
  return (
    <div
      className="pd-os fixed inset-x-0 z-30 mx-auto flex max-w-3xl flex-col bg-paper"
      data-guided-lesson="true"
      data-lesson-athlete={dataAthlete}
      data-density="compact"
      style={{
        top: "4.25rem",
        bottom: "calc(3.5rem + env(safe-area-inset-bottom))",
      }}
    >
      {children}
    </div>
  );
}

function buildFresh(
  slice: AthleteSlice | null,
  start: LessonStart,
  booking?: Booking,
): LessonDraft {
  const type = lessonTypeFromBooking(
    booking ?? (start.serviceId ? ({ serviceId: start.serviceId } as Booking) : null),
  );
  const discipline = slice
    ? primaryDiscipline(slice.athlete.position, slice.athlete.sport)
    : "Pitching";
  const flaws = slice ? matchFlaws(slice) : [];
  const flawIds = flaws.map((row) => row.id);
  const drillIds = slice
    ? drillsForFlaws(
        flawIds,
        slice.skillPlans.map((row) => row.drill),
      ).map((row) => row.id)
    : [];
  return emptyDraft({
    athleteId: start.athleteId,
    bookingId: start.bookingId,
    serviceId: start.serviceId || type.serviceId,
    lessonType: start.jumpTo === "tracker" ? "Bullpen" : type.name,
    discipline,
    flawIds,
    drillIds,
    homeworkIds: drillIds.slice(0, 2),
    constraint: slice ? defaultConstraint(slice, flawIds) : "",
    cue: defaultCue(flawIds),
    stage: start.jumpTo === "tracker" ? 5 : 0,
  });
}

function SetupStage({
  slice,
  draft,
  onType,
  onToggleFlaw,
}: {
  slice: AthleteSlice;
  draft: LessonDraft;
  onType: (serviceId: string, lessonType: string, discipline: Discipline) => void;
  onToggleFlaw: (id: string) => void;
}) {
  const disc = draft.discipline;
  const pool = FLAWS.filter((row) => row.discipline === disc);
  return (
    <div className="pd-stack">
      <section className="rounded-2xl bg-paper-2 shadow-border">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            Lesson type
          </p>
          <p className="mt-2 font-display text-2xl uppercase">{draft.lessonType}</p>
          <p className="mt-1 text-sm text-muted">Auto-filled from the booking. Change only if the floor changed.</p>
          <select
            className="pd-control mt-3 min-h-12 w-full rounded-md border border-line bg-paper px-3"
            value={draft.serviceId}
            onChange={(event) => {
              const id = event.target.value;
              const name =
                (
                  {
                    s1: "New Pitcher Assessment",
                    s2: "Private Development 30",
                    s3: "Private Development 60",
                    s4: "Pitching Lab / Reassessment",
                    s7: "Private Hitting 30",
                    s8: "Private Hitting 60",
                    s10: "Private Catching 30",
                    s11: "Private Catching 60",
                    s12: "Private Fielding 60",
                  } as Record<string, string>
                )[id] ?? draft.lessonType;
              const nextDisc: Discipline = /Hit/.test(name)
                ? "Hitting"
                : /Catch/.test(name)
                  ? "Catching"
                  : /Field/.test(name)
                    ? "Fielding"
                    : "Pitching";
              onType(id, name, nextDisc);
            }}
          >
            <option value="s1">New Pitcher Assessment</option>
            <option value="s2">Private Development 30</option>
            <option value="s3">Private Development 60</option>
            <option value="s8">Private Hitting 60</option>
            <option value="s11">Private Catching 60</option>
            <option value="s12">Private Fielding 60</option>
          </select>
        </div>
      </section>
      <section className="rounded-2xl bg-paper-2 shadow-border">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            P1 / P2 from the record
          </p>
          <p className="mt-2 text-sm text-muted">
            Pre-selected from diagnose and the active constraint. Tap to toggle. Two max.
          </p>
          <ul className="mt-3 grid gap-2">
            {pool.slice(0, 8).map((flaw) => {
              const on = draft.flawIds.includes(flaw.id);
              const rank = draft.flawIds[0] === flaw.id ? "P1" : draft.flawIds[1] === flaw.id ? "P2" : "";
              return (
                <li key={flaw.id}>
                  <button
                    type="button"
                    onClick={() => onToggleFlaw(flaw.id)}
                    className={cn(
                      "pd-row min-h-12 w-full rounded-xl text-left shadow-border",
                      on ? "bg-maroon text-fg-inverse" : "bg-paper",
                    )}
                    data-flaw={flaw.id}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <strong>{flaw.name}</strong>
                      {rank ? <span className="text-xs font-semibold tracking-wide uppercase">{rank}</span> : null}
                    </span>
                    <span className={cn("mt-1 block text-sm", on ? "text-fg-soft" : "text-muted")}>
                      {flaw.looksLike}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!slice.diagnose.length ? (
            <p className="mt-3 text-sm text-muted">No diagnose on file. Pick the flaw you can see.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function BriefStage({ slice, draft }: { slice: AthleteSlice; draft: LessonDraft }) {
  const last = slice.lessons[0];
  const points = weeklyPoints(slice);
  const p1 = FLAWS.find((row) => row.id === draft.flawIds[0]);
  const p2 = FLAWS.find((row) => row.id === draft.flawIds[1]);
  const plan = slice.plans.find((row) => row.status === "active");
  return (
    <div className="pd-stack">
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">Last session</p>
          <p className="mt-2 text-sm text-fg-soft">
            {last ? `${last.date} · ${last.focus}. ${last.notes}` : "No recap on file. First look today."}
          </p>
        </div>
      </section>
      <section className="rounded-2xl bg-paper-2 shadow-border">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Priorities</p>
          <ul className="mt-3 grid gap-2">
            <li className="pd-row rounded-xl bg-paper">
              <strong>P1 · {p1?.name ?? plan?.constraint ?? "Not named"}</strong>
              <span className="mt-1 block text-sm text-muted">{plan?.focus ?? p1?.why}</span>
            </li>
            {p2 ? (
              <li className="pd-row rounded-xl bg-paper">
                <strong>P2 · {p2.name}</strong>
                <span className="mt-1 block text-sm text-muted">{p2.looksLike}</span>
              </li>
            ) : null}
          </ul>
        </div>
      </section>
      <section className="rounded-2xl bg-paper-2 shadow-border" data-weekly-points="true">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
            Weekly activity points
          </p>
          <p className="pd-num mt-2 font-display text-4xl">
            {points.earned}
            <span className="text-xl text-muted"> / {points.target}</span>
          </p>
          <p className="mt-2 text-sm text-muted">
            {points.met
              ? "Hit the weekly target. Don’t pile extra work on today."
              : "Has not hit the weekly target. The lesson still runs — note it in the recap."}
          </p>
        </div>
      </section>
    </div>
  );
}

function WarmStage({ discipline, age }: { discipline: Discipline; age: number }) {
  const blocks = rampFor(discipline, age);
  return (
    <div className="pd-stack">
      <p className="text-sm text-muted">RAMP. Exact reps. {discipline}, age {age}.</p>
      {blocks.map((block) => (
        <section key={block.letter} className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              {block.letter} · {block.name}
            </p>
            <p className="pd-num mt-2 font-display text-2xl uppercase">{block.reps}</p>
            <p className="mt-2 text-sm text-muted">{block.detail}</p>
          </div>
        </section>
      ))}
    </div>
  );
}

function DrillStage({
  slice,
  draft,
  onToggle,
  onDrop,
}: {
  slice: AthleteSlice;
  draft: LessonDraft;
  onToggle: (id: string) => void;
  onDrop: (id: string) => void;
}) {
  const ranked = diagnosePanel(slice);
  const drills = draft.drillIds.map((id) => drillById(id)).filter((row): row is Drill => Boolean(row));
  return (
    <div className="pd-stack">
      {drills.map((drill) => (
        <article key={drill.id} className="rounded-2xl bg-paper-2 shadow-border" data-lesson-drill={drill.id}>
          <div className="pd-card">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-2xl">{drill.name}</h3>
              <button
                type="button"
                className="min-h-12 text-xs font-semibold tracking-wide text-maroon uppercase"
                onClick={() => onToggle(drill.id)}
              >
                Remove
              </button>
            </div>
            <p className="mt-1 text-sm text-muted">{drill.problem} · {drill.dose}</p>
            <p className="mt-2 text-sm">{drill.setup}</p>
            <p className="mt-2 text-sm">
              <strong>Cue. </strong>
              “{drill.cues[0]}”
            </p>
            <p className="mt-2 text-sm text-muted">
              <strong>Watch. </strong>
              {drill.watch.join(" · ")}
            </p>
          </div>
        </article>
      ))}
      <details className="rounded-2xl bg-paper-2 shadow-border" data-diagnose-panel="true">
        <summary className="pd-row min-h-12 cursor-pointer list-none font-display text-xl uppercase">
          Not sure what you’re seeing? Diagnose it
        </summary>
        <div className="pd-card grid gap-3 pt-0">
          <p className="text-sm text-muted">
            Start from a symptom you can see. Drop a drill straight into today’s block.
          </p>
          {(ranked.rows.slice(0, 4)).map((sym) => (
            <div key={sym.symptom} className="rounded-xl bg-paper p-3">
              <p className="font-semibold">{sym.symptom}</p>
              {sym.causes.slice(0, 2).map((cause) => (
                <div key={cause.cause} className="mt-3 border-t border-line pt-3">
                  <p className="text-sm">{cause.cause}</p>
                  <p className="mt-1 text-sm text-muted">
                    Confirm it. {cause.confirm}
                  </p>
                  <p className="mt-1 text-sm">
                    Cue. “{cause.cue}”
                  </p>
                  <div className="mt-2 grid gap-2">
                    {cause.drills.map((id) => {
                      const drill = drillById(id);
                      if (!drill) return null;
                      return (
                        <Button
                          key={id}
                          type="button"
                          variant="outlineDark"
                          className="min-h-12"
                          onClick={() => onDrop(id)}
                        >
                          Drop {drill.name} into today
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function SportStage({ discipline, age }: { discipline: Discipline; age: number }) {
  const rows = sportWarmup(discipline, age);
  return (
    <div className="pd-stack">
      <p className="text-sm text-muted">Sport-specific. Still not the tracker.</p>
      {rows.map((row) => (
        <section key={row.name} className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <h3 className="text-2xl">{row.name}</h3>
            <p className="pd-num mt-2 font-display text-2xl">{row.reps}</p>
          </div>
        </section>
      ))}
    </div>
  );
}

function TrackerStage({
  draft,
  intent,
  veloInput,
  tci,
  onIntent,
  onActual,
  onAsk,
  onVeloInput,
  onSaveVelo,
  onSkipVelo,
  onSwing,
  onCatch,
}: {
  draft: LessonDraft;
  intent: { row: number; col: number } | null;
  veloInput: string;
  tci: number;
  onIntent: (cell: { row: number; col: number } | null) => void;
  onActual: (actual: { row: number; col: number; noncompetitive?: boolean }) => void;
  onAsk: (ask: boolean) => void;
  onVeloInput: (value: string) => void;
  onSaveVelo: () => void;
  onSkipVelo: () => void;
  onSwing: (result: string) => void;
  onCatch: (rep: { kind: string; result: string; pop?: string }) => void;
}) {
  if (draft.discipline === "Hitting") {
    return (
      <div className="pd-stack">
        <p className="text-sm text-muted">Swing by swing. Tap what you saw.</p>
        <div className="grid grid-cols-2 gap-2">
          {SWING_RESULTS.map((result) => (
            <button
              key={result}
              type="button"
              className="min-h-12 rounded-xl bg-paper-2 text-sm font-semibold shadow-border"
              onClick={() => onSwing(result)}
            >
              {result}
            </button>
          ))}
        </div>
        <p className="pd-num font-display text-3xl">{draft.swings.length} swings</p>
        <ul className="grid gap-1">
          {draft.swings.slice(-8).reverse().map((row, i) => (
            <li key={i} className="pd-row rounded-xl bg-paper-2 text-sm shadow-border">
              {row.result}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (draft.discipline === "Catching") {
    return (
      <CatchTracker reps={draft.catchReps} onCatch={onCatch} />
    );
  }
  const last = draft.pitches[draft.pitches.length - 1];
  return (
    <div className="pd-stack" data-tci-tracker="true">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted">
          Catcher’s view. Call the location, then log where it went.
        </p>
        <p className="pd-num font-display text-3xl">TCI {tci}</p>
      </div>
      <label className="flex min-h-12 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={draft.askVelo}
          onChange={(event) => onAsk(event.target.checked)}
        />
        Prompt for radar after each pitch. Skipping never blocks the pen.
      </label>
      <div className="grid grid-cols-5 gap-1">
        {CELLS.map((row) =>
          CELLS.map((col) => {
            const zone = row >= 1 && row <= 3 && col >= 1 && col <= 3;
            const isIntent = intent?.row === row && intent?.col === col;
            const isLast = last && last.actual.row === row && last.actual.col === col;
            return (
              <button
                key={`${row}-${col}`}
                type="button"
                className={cn(
                  "min-h-12 rounded-md text-xs font-semibold",
                  zone ? "bg-paper-2 shadow-border" : "bg-ink/10",
                  isIntent && "bg-maroon text-fg-inverse",
                  isLast && !isIntent && "bg-navy text-fg-inverse",
                )}
                onClick={() => {
                  if (draft.pendingVelo) return;
                  if (!intent) onIntent({ row, col });
                  else onActual({ row, col });
                }}
              >
                {row},{col}
              </button>
            );
          }),
        )}
      </div>
      {intent ? (
        <Button
          type="button"
          variant="maroon"
          className="min-h-12"
          onClick={() => onActual({ row: intent.row, col: intent.col, noncompetitive: true })}
        >
          Noncompetitive / dirt
        </Button>
      ) : (
        <p className="text-sm text-muted">{draft.pendingVelo ? "Radar optional." : "Tap the called location."}</p>
      )}
      {draft.pendingVelo ? (
        <div className="rounded-2xl bg-paper-2 p-4 shadow-border" data-velo-prompt="true">
          <p className="text-sm font-semibold">Radar reading</p>
          <input
            inputMode="decimal"
            value={veloInput}
            onChange={(event) => onVeloInput(event.target.value)}
            placeholder="mph"
            className="pd-control mt-2 min-h-12 w-full rounded-md border border-line bg-paper px-3 pd-num"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button type="button" className="min-h-12" onClick={onSaveVelo} disabled={!veloInput}>
              Save velo
            </Button>
            <Button type="button" variant="outlineDark" className="min-h-12" onClick={onSkipVelo}>
              Skip
            </Button>
          </div>
        </div>
      ) : null}
      <ul className="grid gap-1">
        {draft.pitches.slice(-8).reverse().map((p, i) => (
          <li key={i} className="pd-row flex items-baseline justify-between rounded-xl bg-paper-2 shadow-border">
            <span className="text-sm">
              Call {p.intent.row},{p.intent.col} → {p.actual.noncompetitive ? "NC" : `${p.actual.row},${p.actual.col}`}
              {p.velo ? ` · ${p.velo} mph` : ""}
            </span>
            <span className="pd-num font-display text-lg">
              {p.score} {SCORE_LABELS[p.score as 0 | 1 | 2 | 3 | 4]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CatchTracker({
  reps,
  onCatch,
}: {
  reps: LessonDraft["catchReps"];
  onCatch: (rep: { kind: string; result: string; pop?: string }) => void;
}) {
  const [kind, setKind] = useState("Receive");
  const [pop, setPop] = useState("");
  const results =
    kind === "Receive"
      ? ["Stick", "Push", "Late"]
      : kind === "Block"
        ? ["Kept", "Leak L", "Leak R", "Stand"]
        : ["Fired", "Hesitate"];
  return (
    <div className="pd-stack">
      <div className="grid grid-cols-3 gap-1">
        {CATCH_KINDS.map((row) => (
          <button
            key={row}
            type="button"
            className={cn(
              "min-h-12 rounded-xl text-sm font-semibold",
              kind === row ? "bg-maroon text-fg-inverse" : "bg-paper-2 shadow-border",
            )}
            onClick={() => setKind(row)}
          >
            {row}
          </button>
        ))}
      </div>
      {kind === "Pop" ? (
        <input
          inputMode="decimal"
          value={pop}
          onChange={(event) => setPop(event.target.value)}
          placeholder="Pop time"
          className="pd-control min-h-12 rounded-md border border-line bg-paper-2 px-3 pd-num"
        />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {results.map((result) => (
          <button
            key={result}
            type="button"
            className="min-h-12 rounded-xl bg-paper-2 text-sm font-semibold shadow-border"
            onClick={() => {
              onCatch({ kind, result, pop: kind === "Pop" ? pop : undefined });
              setPop("");
            }}
          >
            {result}
          </button>
        ))}
      </div>
      <p className="pd-num font-display text-3xl">{reps.length} reps</p>
    </div>
  );
}

function IqStage({
  modules,
  selected,
  onSelect,
}: {
  modules: ReturnType<typeof iqChoices>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const active = modules.find((row) => row.id === selected) ?? null;
  return (
    <div className="pd-stack">
      <p className="text-sm text-muted">Pick ONE module to teach. The rest wait.</p>
      <ul className="grid gap-2">
        {modules.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onSelect(row.id)}
              className={cn(
                "pd-row min-h-12 w-full rounded-xl text-left shadow-border",
                selected === row.id ? "bg-maroon text-fg-inverse" : "bg-paper-2",
              )}
              data-iq-module={row.id}
            >
              <strong>{row.t}</strong>
              <span className={cn("mt-1 block text-sm", selected === row.id ? "text-fg-soft" : "text-muted")}>
                {row.why}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {active ? (
        <section className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Teach script</p>
            <p className="mt-2 text-sm">{active.teach}</p>
            <p className="mt-3 text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
              He’s got it when
            </p>
            <p className="mt-2 text-sm">{active.check}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RecapStage({
  draft,
  recaps,
  onPatch,
  onToggleHomework,
}: {
  draft: LessonDraft;
  recaps: { parent: string; player: string; coach: string };
  onPatch: (next: Partial<LessonDraft>) => void;
  onToggleHomework: (id: string) => void;
}) {
  return (
    <div className="pd-stack">
      <section className="rounded-2xl bg-paper-2 shadow-border">
        <div className="pd-card grid gap-3">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Intervention</p>
          <label className="text-sm font-semibold">
            What you changed
            <select
              className="pd-control mt-1 min-h-12 w-full rounded-md border border-line bg-paper px-3"
              value={draft.method}
              onChange={(event) =>
                onPatch({ method: event.target.value as LessonDraft["method"] })
              }
            >
              {INTERVENTION_METHODS.map((row) => (
                <option key={row} value={row}>
                  {row}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Constraint
            <input
              value={draft.constraint}
              onChange={(event) => onPatch({ constraint: event.target.value })}
              className="pd-control mt-1 min-h-12 w-full rounded-md border border-line bg-paper px-3"
            />
          </label>
          <label className="text-sm font-semibold">
            Cue
            <input
              value={draft.cue}
              onChange={(event) => onPatch({ cue: event.target.value })}
              className="pd-control mt-1 min-h-12 w-full rounded-md border border-line bg-paper px-3"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm font-semibold">
              Pre
              <input
                inputMode="decimal"
                value={draft.preScore}
                onChange={(event) => onPatch({ preScore: event.target.value })}
                className="pd-control mt-1 min-h-12 w-full rounded-md border border-line bg-paper px-3 pd-num"
              />
            </label>
            <label className="text-sm font-semibold">
              Post
              <input
                inputMode="decimal"
                value={draft.postScore}
                onChange={(event) => onPatch({ postScore: event.target.value })}
                className="pd-control mt-1 min-h-12 w-full rounded-md border border-line bg-paper px-3 pd-num"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {INTERVENTION_OUTCOMES.map((row) => (
              <button
                key={row}
                type="button"
                className={cn(
                  "min-h-12 rounded-xl text-xs font-semibold tracking-wide uppercase",
                  draft.outcome === row ? "bg-maroon text-fg-inverse" : "bg-paper shadow-border",
                )}
                onClick={() => onPatch({ outcome: row })}
              >
                {row}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-2xl bg-paper-2 shadow-border">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Homework</p>
          <ul className="mt-3 grid gap-2">
            {draft.drillIds.map((id) => {
              const drill = drillById(id);
              if (!drill) return null;
              const on = draft.homeworkIds.includes(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={cn(
                      "pd-row min-h-12 w-full rounded-xl text-left",
                      on ? "bg-maroon text-fg-inverse" : "bg-paper shadow-border",
                    )}
                    onClick={() => onToggleHomework(id)}
                  >
                    {drill.name} · {drill.dose}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
      <section className="rounded-2xl bg-paper-2 shadow-border" data-recaps="true">
        <div className="pd-card grid gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Parent</p>
            <p className="mt-2 text-sm">{recaps.parent}</p>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Player</p>
            <p className="mt-2 text-sm">{recaps.player}</p>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Coach-private</p>
            <p className="mt-2 text-sm">{recaps.coach}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
