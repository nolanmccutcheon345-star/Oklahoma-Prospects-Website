import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PdErrorBoundary } from "@/components/pd/error-boundary";
import {
  BullpenEngineView,
  PlanEngineView,
  RestWarning,
  ScorecardEngineView,
  VelocityEngineView,
  WorkloadEngineView,
} from "@/components/pd/engine-views";
import {
  AgeCurriculumView,
  DiagnosticView,
  GameIqLibrary,
  PeerBenchmarkView,
  SkillPlanLibrary,
} from "@/components/pd/content-views";
import { StrengthProgramView, WarmupAndThrowView } from "@/components/pd/program-views";
import { FamilyThread, LeaderboardBoard, PointsBoard } from "@/components/pd/automation-views";
import { CohortEngineCopy, TrackingImport } from "@/components/pd/measure-views";
import { activityPoints } from "@/lib/pd/automation";
import { useDevelopment, type AthleteSlice } from "@/lib/pd/context";
import { OP_LEVELS, PD_OS } from "@/lib/pd";
import type { RecordGroupId, RecordViewId, ViewerRole } from "@/lib/pd/types";
import { RECORD_GROUPS, groupForView, viewsForRole } from "@/lib/pd/views";
import { cn } from "@/lib/utils";

function ageOnClubDay(iso: string) {
  const day = new Date("2026-09-14T12:00:00Z");
  const born = new Date(`${iso}T12:00:00Z`);
  let age = day.getUTCFullYear() - born.getUTCFullYear();
  const month = day.getUTCMonth() - born.getUTCMonth();
  if (month < 0 || (month === 0 && day.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

function displayName(slice: AthleteSlice) {
  return `${slice.athlete.firstName} ${slice.athlete.lastName}`;
}

function EmptyBlock({
  title,
  copy,
  action,
  to,
}: {
  title: string;
  copy: string;
  action: string;
  to?: "/training" | "/waiver";
}) {
  return (
    <div className="rounded-2xl bg-paper-2 shadow-border" data-empty-state="true">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Nothing on file</p>
        <h3 className="mt-2 text-2xl">{title}</h3>
        <p className="mt-2 text-sm text-muted">{copy}</p>
        <p className="mt-3 text-sm font-semibold text-maroon">{action}</p>
        {to ? (
          <Button asChild className="mt-4" variant="outlineDark">
            <Link to={to}>{action}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

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
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">{eyebrow}</p>
        <h3 className="mt-2 text-2xl">{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

function Rows({ items }: { items: { key: string; k: string; v: string }[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((row) => (
        <li key={row.key} className="pd-row flex items-baseline justify-between rounded-xl bg-paper">
          <span className="text-sm">{row.k}</span>
          <span className="pd-num font-display text-xl">{row.v}</span>
        </li>
      ))}
    </ul>
  );
}

function Notes({ rows }: { rows: { key: string; title: string; detail: string }[] }) {
  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li key={row.key} className="pd-row rounded-xl bg-paper">
          <strong>{row.title}</strong>
          <span className="mt-1 block text-sm text-muted">{row.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function RecordView({
  view,
  slice,
  role,
}: {
  view: RecordViewId;
  slice: AthleteSlice;
  role: ViewerRole;
}) {
  const { data } = useDevelopment();
  const name = displayName(slice);
  const age = ageOnClubDay(slice.athlete.birthDate);
  const coach = role === "admin" || role === "coach";
  const op =
    slice.athlete.opLevel === 0
      ? null
      : OP_LEVELS.find((level) => level.level === slice.athlete.opLevel);

  switch (view) {
    case "overview":
      return (
        <Panel eyebrow="Overview" title={name}>
          <p className="text-sm text-muted">
            {slice.athlete.sport} · {slice.athlete.position} · {age}
            {op ? ` · ${op.code}` : ""}
            {slice.athlete.assessmentComplete ? "" : " · no assessment"}
          </p>
          <p className="mt-3 text-sm">{slice.athlete.notes || "No staff note yet."}</p>
          {slice.bookings[0] ? <RestWarning slice={slice} booking={slice.bookings[0]} /> : null}
        </Panel>
      );
    case "plan":
      return (
        <Panel eyebrow="Development plan" title={slice.plans[0]?.focus || "No plan yet"}>
          {slice.plans.length === 0 ? (
            <>
              <p className="text-sm text-muted">Plan writes after the assessment.</p>
              <p className="mt-3 text-sm font-semibold text-maroon">Book an assessment</p>
              <Button asChild className="mt-3 min-h-12" variant="outlineDark">
                <Link to="/training">Book an assessment</Link>
              </Button>
            </>
          ) : (
            <Notes
              rows={slice.plans.map((row) => ({
                key: row.id,
                title: row.focus,
                detail: row.constraint,
              }))}
            />
          )}
          <PlanEngineView slice={slice} />
        </Panel>
      );
    case "diagnose":
      return <DiagnosticView slice={slice} />;
    case "cohort":
      return <CohortEngineCopy slice={slice} />;
    case "scorecard":
      if (slice.scorecards.length === 0) {
        return (
          <EmptyBlock
            title="No scorecard."
            copy="Ten categories, 0–3. After the assessment, not before."
            action="Book an assessment"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Scorecard" title={slice.scorecards[0].date}>
          <Rows
            items={slice.scorecards[0].categories.map((cat) => ({
              key: cat.name,
              k: cat.name,
              v: `${cat.score} / 3`,
            }))}
          />
          <p className="mt-3 text-sm text-muted">{slice.scorecards[0].notes}</p>
          <ScorecardEngineView slice={slice} />
        </Panel>
      );
    case "game-iq":
      if (!coach) {
        return (
          <EmptyBlock
            title="Coach only."
            copy="Game IQ notes stay on the staff desk. Families never see this tab."
            action="Hidden from parent and athlete"
          />
        );
      }
      return <GameIqLibrary slice={slice} />;
    case "evaluations":
      if (slice.evaluations.length === 0) {
        return (
          <EmptyBlock
            title="No evaluations."
            copy="The family meeting after assessment writes the first one."
            action="Book an assessment"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Evaluations" title={slice.evaluations[0].grade}>
          <Notes
            rows={slice.evaluations.map((row) => ({
              key: row.id,
              title: row.date,
              detail: row.summary,
            }))}
          />
        </Panel>
      );
    case "report-card":
      if (slice.reportCards.length === 0) {
        return (
          <EmptyBlock
            title="No report card."
            copy="Monthly marks after there is a baseline to mark against."
            action="Book an assessment"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Report card" title={slice.reportCards[0].period}>
          <Rows
            items={slice.reportCards[0].lines.map((row) => ({
              key: row.label,
              k: row.label,
              v: row.mark,
            }))}
          />
        </Panel>
      );
    case "peer-benchmarks":
      return <PeerBenchmarkView slice={slice} />;
    case "velocity":
      return (
        <div className="pd-stack">
          <VelocityEngineView slice={slice} />
          {coach ? <TrackingImport slice={slice} /> : null}
        </div>
      );
    case "goals":
      if (slice.goals.length === 0) {
        return (
          <EmptyBlock
            title="No goals yet."
            copy="Coach sets one. Athlete sees it. Nothing fake."
            action="Set after assessment"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Goals" title="This block">
          <Notes
            rows={slice.goals.map((row) => ({
              key: row.id,
              title: row.title,
              detail: `${row.target} · ${row.status}`,
            }))}
          />
        </Panel>
      );
    case "arsenal":
      if (slice.arsenal.length === 0) {
        return (
          <EmptyBlock
            title="No arsenal yet."
            copy="OP-1 and OP-2 only need a fastball and a changeup — after we see the throw."
            action="Book an assessment"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Arsenal" title="Pitch roles">
          <Rows
            items={slice.arsenal.map((row) => ({
              key: row.id,
              k: `${row.pitch} · ${row.role}`,
              v: row.velo ? `${row.velo} mph` : "—",
            }))}
          />
        </Panel>
      );
    case "pitch-design":
      if (slice.pitchDesign.length === 0) {
        return (
          <EmptyBlock
            title="No pitch design."
            copy="A role and a cue. Not a fourth pitch for a 12U."
            action="Write after the lab"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Pitch design" title="Cues">
          <Notes
            rows={slice.pitchDesign.map((row) => ({
              key: row.id,
              title: row.pitch,
              detail: row.cue,
            }))}
          />
        </Panel>
      );
    case "skill-plan":
      return <SkillPlanLibrary slice={slice} role={role} />;
    case "strength":
      return <StrengthProgramView slice={slice} role={role} />;
    case "warmups":
      return <WarmupAndThrowView slice={slice} role={role} />;
    case "bullpens":
      return <BullpenEngineView slice={slice} role={role} />;
    case "workload":
      return <WorkloadEngineView slice={slice} />;
    case "points":
      return <PointsBoard slice={slice} role={role} />;
    case "leaderboard":
      return (
        <LeaderboardBoard selfId={slice.athlete.id} role={role} familyId={slice.athlete.familyId} />
      );
    case "arm-care":
      if (slice.armCare.length === 0) {
        return (
          <EmptyBlock
            title="No arm check-ins."
            copy="0 great – 10 stop. We don’t guess how it feels."
            action="Log the first check-in"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Arm care" title={`Feel ${slice.armCare[0].feel}/10`}>
          <Notes
            rows={slice.armCare.map((row) => ({
              key: row.id,
              title: `${row.date} · ${row.feel}/10`,
              detail: row.notes,
            }))}
          />
        </Panel>
      );
    case "physical":
      if (slice.physicalTests.length === 0) {
        return (
          <EmptyBlock
            title="No physical tests."
            copy="Broad jump, sprints, med-ball — when we tested, not estimates."
            action="Test on lab day"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Physical testing" title={slice.physicalTests[0].test}>
          <Rows
            items={slice.physicalTests.map((row) => ({
              key: row.id,
              k: `${row.date} · ${row.test}`,
              v: row.value,
            }))}
          />
        </Panel>
      );
    case "metrics":
      if (slice.metrics.length === 0) {
        return (
          <EmptyBlock
            title="No pitch metrics."
            copy="Spin and shape wait on a lab day. We won’t fake a TrackMan row."
            action="Book a lab"
            to="/training"
          />
        );
      }
      return (
        <div className="pd-stack">
          <Panel eyebrow="Metrics" title="Lab">
            <Rows
              items={slice.metrics.map((row) => ({
                key: row.id,
                k: `${row.date} · ${row.name}`,
                v: row.value,
              }))}
            />
          </Panel>
          {coach ? <TrackingImport slice={slice} /> : null}
        </div>
      );
    case "lessons":
      if (slice.lessons.length === 0) {
        return (
          <EmptyBlock
            title="No lessons on file."
            copy="Recaps land here after a session is published."
            action="Run a guided lesson"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Lessons" title={`${slice.lessons.length} on file`}>
          <Notes
            rows={slice.lessons.map((row) => ({
              key: row.id,
              title: `${row.date} · ${row.focus}`,
              detail: row.notes,
            }))}
          />
        </Panel>
      );
    case "game-film":
      if (slice.filmReviews.length === 0) {
        return (
          <EmptyBlock
            title="No game film."
            copy="Ask the family for an inning. We will not invent a scouting report."
            action="Request an inning"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Game film" title={slice.filmReviews[0].title}>
          <Notes
            rows={slice.filmReviews.map((row) => ({
              key: row.id,
              title: `${row.date} · ${row.title}`,
              detail: row.notes,
            }))}
          />
        </Panel>
      );
    case "video-standards":
      return (
        <Panel eyebrow="Video standards" title="How to shoot">
          <Notes
            rows={data.videoStandards.map((row) => ({
              key: row.id,
              title: row.title,
              detail: row.detail,
            }))}
          />
        </Panel>
      );
    case "reports":
      return <AgeCurriculumView age={age} />;
    case "recruiting":
      if (!slice.recruiting) {
        return (
          <EmptyBlock
            title="No recruiting profile."
            copy="GPA, commit, and a video link — when they exist."
            action="Add after they ask"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Recruiting" title={slice.recruiting.committed}>
          <Rows
            items={[
              { key: "gpa", k: "GPA", v: slice.recruiting.gpa },
              { key: "video", k: "Video", v: slice.recruiting.video },
            ]}
          />
        </Panel>
      );
    case "intake":
      if (!slice.intake) {
        return (
          <EmptyBlock
            title="No intake."
            copy="Health screen and the family’s goal. Empty until they fill it."
            action="Send the form"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Intake" title={slice.intake.complete ? "Complete" : "Open"}>
          <p className="text-sm">{slice.intake.health}</p>
          <p className="mt-2 text-sm text-muted">{slice.intake.goals}</p>
        </Panel>
      );
    case "videos":
      if (slice.videos.length === 0) {
        return (
          <EmptyBlock
            title="No videos."
            copy="Open side and rear. We won’t post a highlight that isn’t theirs."
            action="Capture next session"
            to="/training"
          />
        );
      }
      return (
        <Panel eyebrow="Videos" title={`${slice.videos.length} clips`}>
          <Notes
            rows={slice.videos.map((row) => ({
              key: row.id,
              title: `${row.date} · ${row.title}`,
              detail: row.angle,
            }))}
          />
        </Panel>
      );
    case "documents":
      if (slice.documents.length === 0) {
        return (
          <EmptyBlock
            title="No documents."
            copy="Waiver first."
            action="Open the waiver"
            to="/waiver"
          />
        );
      }
      return (
        <Panel eyebrow="Documents" title="Files">
          <Notes
            rows={slice.documents.map((row) => ({
              key: row.id,
              title: row.name,
              detail: `${row.kind} · ${row.date}`,
            }))}
          />
        </Panel>
      );
    case "messages":
      return (
        <FamilyThread
          slice={slice}
          role={role}
          fromName={coach ? "Coach Steve" : slice.family?.parentName || "Parent"}
        />
      );
    default: {
      const missing: never = view;
      return (
        <EmptyBlock
          title="Unknown view."
          copy={`This desk id isn’t wired: ${String(missing)}.`}
          action="Back to overview"
        />
      );
    }
  }
}

export function AthleteRecord({
  athleteId,
  role,
  onBack,
  onStartLesson,
}: {
  athleteId: string;
  role: ViewerRole;
  onBack?: () => void;
  onStartLesson?: (athleteId: string) => void;
}) {
  const { slice } = useDevelopment();
  const current = slice(athleteId);
  const groups = viewsForRole(role);
  const [group, setGroup] = useState<RecordGroupId>("development");
  const [view, setView] = useState<RecordViewId>("overview");
  if (!current) {
    return <p className="text-sm text-muted">Athlete not on this desk.</p>;
  }
  const activeGroup = groups.find((row) => row.id === group) ?? groups[0];
  const activeView = activeGroup.views.some((row) => row.id === view) ? view : activeGroup.views[0].id;
  return (
    <div className="pd-stack" data-athlete-record={athleteId}>
      <div className="flex items-center justify-between gap-2">
        {onBack ? (
          <Button type="button" variant="outlineDark" size="sm" className="min-h-12" onClick={onBack}>
            All athletes
          </Button>
        ) : (
          <span />
        )}
        {onStartLesson && (role === "admin" || role === "coach") ? (
          <Button type="button" size="sm" className="min-h-12" onClick={() => onStartLesson(athleteId)}>
            Start lesson
          </Button>
        ) : null}
      </div>
      <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
        {PD_OS.businessName}
      </p>
      <h2 className="font-display text-3xl uppercase">{displayName(current)}</h2>
      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-paper p-1">
        {groups.map((row) => (
          <button
            key={row.id}
            type="button"
            role="tab"
            data-record-group={row.id}
            aria-selected={row.id === activeGroup.id}
            onClick={() => {
              setGroup(row.id);
              setView(row.views[0].id);
            }}
            className={cn(
              "pd-control shrink-0 rounded-lg px-3 text-xs font-semibold tracking-wide uppercase",
              row.id === activeGroup.id ? "bg-maroon text-fg-inverse" : "text-muted",
            )}
          >
            {row.label}
          </button>
        ))}
      </div>
      <label className="text-sm font-semibold">
        View
        <select
          className="pd-control mt-1 min-h-12 w-full rounded-md border border-line bg-paper-2 px-3"
          data-record-picker="true"
          value={activeView}
          onChange={(event) => {
            const next = event.target.value as RecordViewId;
            setView(next);
            const found = groupForView(next);
            if (found) setGroup(found.id);
          }}
        >
          {activeGroup.views.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <PdErrorBoundary section={`Record · ${activeView}`}>
        <div data-record-view={activeView} className={activeView === "report-card" || activeView === "recruiting" ? "pd-print-sheet" : undefined}>
          <RecordView view={activeView} slice={current} role={role} />
        </div>
      </PdErrorBoundary>
    </div>
  );
}

export function AthleteRoster({
  role,
  familyId,
  selfName,
  onStartLesson,
}: {
  role: ViewerRole;
  familyId?: string;
  selfName?: string;
  onStartLesson?: (athleteId: string) => void;
}) {
  const dev = useDevelopment();
  const athletes = useMemo(
    () => dev.listAthletes(role, familyId, selfName),
    [dev, familyId, role, selfName],
  );

  if (dev.selectedAthleteId) {
    return (
      <AthleteRecord
        athleteId={dev.selectedAthleteId}
        role={role}
        onBack={() => dev.closeAthlete()}
        onStartLesson={onStartLesson}
      />
    );
  }

  if (athletes.length === 1 && (role === "parent" || role === "player")) {
    return (
      <div data-athlete-count={athletes.length}>
        <AthleteRecord athleteId={athletes[0].id} role={role} onStartLesson={onStartLesson} />
      </div>
    );
  }

  return (
    <section data-athlete-count={athletes.length}>
      <h3 className="text-2xl">{role === "admin" ? "Athletes" : "Roster"}</h3>
      <p className="mt-1 text-sm text-muted">
        {athletes.length} on this desk. Open a record — {RECORD_GROUPS.flatMap((g) => g.views).length} views, phone first.
      </p>
      <ul className="mt-3 grid gap-2">
        {athletes.map((row) => {
          const pts = activityPoints({
            athlete: row,
            pointsLog: dev.data.pointsLog.filter((item) => item.athleteId === row.id),
          });
          return (
            <li key={row.id}>
              <button
                type="button"
                data-athlete-row={row.id}
                onClick={() => dev.openAthlete(row.id)}
                className="pd-row min-h-11 w-full rounded-xl bg-paper-2 text-left shadow-border"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-xl uppercase">
                    {row.firstName} {row.lastName}
                  </span>
                  <span className="pd-num text-sm font-semibold text-maroon">{ageOnClubDay(row.birthDate)}</span>
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {row.sport} · {row.position}
                  {row.assessmentComplete ? "" : " · no assessment"}
                  {row.tags.includes("workload-spike") ? " · workload spike" : ""}
                  {row.tags.includes("trending-down") ? " · trending down" : ""}
                </span>
                <span className="pd-num mt-1 block text-xs font-semibold" data-roster-points={row.id}>
                  {pts.earned}/{pts.target} pts{pts.met ? " · week in" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
