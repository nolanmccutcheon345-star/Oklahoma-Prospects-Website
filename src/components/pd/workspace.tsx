import { PRICES, formatMoney } from "@/lib/pricing";
import {DevelopmentBoard} from "@/components/commerce/development-board";
import {CoachProfile} from "@/components/commerce/coach-profile";
import { CoachSessions } from "@/components/commerce/coach-sessions";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AthleteRoster } from "@/components/pd/athlete-record";
import { RetentionDesk } from "@/components/pd/retention";
import { PdErrorBoundary } from "@/components/pd/error-boundary";
import { AdminAccountsDesk, AdminServicesDesk, AdminStaffDesk } from "@/components/pd/admin-ops";
import { LaunchChecklist } from "@/components/launch-checklist";
import {
  DiagnosticView,
  DrillLibrary,
  FlawLibrary,
  ProgramsCurriculum,
} from "@/components/pd/content-views";
import { CoachEducation } from "@/components/pd/education";
import { GuidedLesson, LessonLaunch, type LessonStart } from "@/components/pd/guided-lesson";
import { StrengthProgramView, ThrowingPlanView, WarmupLibraryView } from "@/components/pd/program-views";
import {
  AlertQueue,
  DigestCard,
  LeaderboardBoard,
  PointsBoard,
} from "@/components/pd/automation-views";
import {
  AdminCalibration,
  CalibrationDesk,
  InterventionEvidence,
  TrackingImport,
} from "@/components/pd/measure-views";
import {
  BreakProbe,
  PdSearch,
  PdSkeleton,
  UndoDock,
} from "@/components/pd/polish";
import {
  CoachFloor,
  CoachWaitlist,
  EarningsBoard,
  LockedFeatures,
  PolicyEditor,
  SessionPolicyRow,
} from "@/components/pd/schedule";
import {
  addLog,
  createProgram,
  listDrills,
  listLogs,
  listPrograms,
  listReservations,
  type ClubRole,
  type Profile,
} from "@/lib/club-data";
import { ASSESSMENT_PHASES, DESKS, PD_OS, ROLE_LABEL, densityForRole, moneyForRole } from "@/lib/pd";
import { clubDayIso } from "@/lib/pd/engines";
import { previewData, ReadOnlyPreview, useReadOnlyPreview } from "@/lib/pd/preview";
import { DevelopmentContext, useDevelopment } from "@/lib/pd/context";
import { useLiveCatalog } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

type Reservation = Awaited<ReturnType<typeof listReservations>>[number];
type Program = Awaited<ReturnType<typeof listPrograms>>[number];
type Drill = Awaited<ReturnType<typeof listDrills>>[number];
type Log = Awaited<ReturnType<typeof listLogs>>[number];

const PREVIEW_ROLES: ClubRole[] = ["admin", "coach", "parent", "player"];

export function ViewAsBar({
  value,
  onChange,
}: {
  value: ClubRole;
  onChange: (role: ClubRole) => void;
}) {
  return (
    <section className="pd-os bg-ink text-fg-inverse" data-density="compact">
      <div className="mx-auto max-w-3xl px-5 pb-5">
        <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
          Preview player development
        </p>
        <p className="mt-1 text-sm text-fg-soft">See the coach, parent, and player desks without signing out.</p>
        <div role="tablist" className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-navy p-1">
          {PREVIEW_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              role="tab"
              data-view-as={role}
              aria-selected={value === role}
              onClick={() => onChange(role)}
              className={cn(
                "pd-control rounded-lg text-xs font-semibold tracking-wide uppercase",
                value === role ? "bg-maroon text-fg-inverse" : "text-fg-soft",
              )}
            >
              {ROLE_LABEL[role]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function DeskFrame({ name, children }: { name: string; children: ReactNode }) {
  const readOnly=useReadOnlyPreview();
  return (
    <PdErrorBoundary section={name}>
      <fieldset disabled={readOnly} className="pd-stack min-w-0">{children}</fieldset>
    </PdErrorBoundary>
  );
}

function ScopedWorkspace({
  profile,
}: {
  profile: Profile;
}) {
  const readOnly=useReadOnlyPreview();
  const trueRole = profile.role;
  const previewRole = trueRole;
  const tabs = [...(DESKS[previewRole] ?? DESKS.parent),{id:"development-tracks",label:"30-day plan & tracks"}];
  const [tab, setTab] = useState<string>(tabs[0].id);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError,setLoadError]=useState("");
  const [lesson, setLesson] = useState<LessonStart | null>(null);
  const athlete = profile.player_name || profile.name;
  const previewProfile = { ...profile, role: previewRole };
  const { closeAthlete, openAthlete, pdReady } = useDevelopment();

  async function refresh() {
    if(readOnly){setReady(true);return;}
    const [nextRes, nextProg, nextDrills, nextLogs] = await Promise.all([
      listReservations(),
      listPrograms(),
      listDrills(),
      listLogs(),
    ]);
    setReservations(nextRes);
    setPrograms(nextProg);
    setDrills(nextDrills);
    setLogs(nextLogs);
    setReady(true);
  }

  useEffect(() => {
    void refresh().catch(e=>{setLoadError(e instanceof Error?e.message:"Could not load account records.");setReady(true);});
  }, []);

  useEffect(() => {
    const nextTabs = [...(DESKS[previewRole] ?? DESKS.parent),{id:"development-tracks",label:"30-day plan & tracks"}];
    if (!nextTabs.some((item) => item.id === tab)) {
      setTab(nextTabs[0].id);
    }
  }, [previewRole, tab]);

  useEffect(() => {
    if (tab !== "athletes" && tab !== "roster" && tab !== "progress") {
      closeAthlete();
    }
  }, [previewRole, tab, closeAthlete]);

  const hideMoney = previewRole === "player";
  const adminOps = trueRole === "admin" && previewRole === "admin";
  const density = densityForRole(previewRole);
  const activeLabel = tabs.find((item) => item.id === tab)?.label ?? "Player development";

  return (
    <div className="pd-os mt-6" data-density={density} data-viewer-role={previewRole}>
{loadError?<p role="alert">{loadError}</p>:null}
      <PdErrorBoundary section="Player development">
        <PdSearch
          onOpenAthlete={(id) => {
            setTab(previewRole === "admin" ? "athletes" : previewRole === "coach" ? "roster" : "progress");
            openAthlete(id);
          }}
          onOpenDesk={(id) => setTab(id)}
        />
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-ink p-1 text-fg-inverse">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              data-desk-tab={item.id}
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "pd-control shrink-0 rounded-lg px-3 text-xs font-semibold tracking-wide uppercase",
                tab === item.id ? "bg-maroon text-fg-inverse" : "text-fg-soft",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-6">
          <DeskFrame name={`Train · ${ROLE_LABEL[previewRole]} · ${activeLabel}`}>
            <BreakProbe />
            {ready&&pdReady&&tab==="development-tracks"?<DevelopmentBoard/>:null}
            {!ready || !pdReady ? <PdSkeleton variant="desk" /> : null}
            {ready && pdReady && (tab === "overview" || tab === "today" || tab === "home") ? (
              <HomeDesk
                profile={previewProfile}
                trueRole={trueRole}
                onOpenTab={setTab}
                onStartLesson={setLesson}
                reservations={reservations}
                programs={programs}
                drills={drills}
                logs={logs}
                hideMoney={hideMoney}
              />
            ) : null}
            {ready && pdReady && tab === "lesson" ? <><CoachSessions /><LessonLaunch onStart={setLesson} /></> : null}
            {ready && pdReady && (tab === "athletes" || tab === "roster") ? (
              <AthleteRoster
                role={previewRole}
                selfName={athlete}
                onStartLesson={(athleteId) => setLesson({ athleteId })}
              />
            ) : null}
            {ready && pdReady && tab === "coaches" && adminOps ? <AdminStaffDesk /> : null}
            {ready && pdReady && tab === "programs" ? <ProgramsDesk /> : null}
            {ready && pdReady && tab === "business" && adminOps ? <BusinessDesk /> : null}
            {ready && pdReady && tab === "retention" && adminOps ? <RetentionDesk /> : null}
            {ready && pdReady && tab === "evidence" && adminOps ? <EvidenceDesk /> : null}
            {ready && pdReady && tab === "toolkit" ? (
              <ToolkitDesk athlete={athlete} onSaved={refresh} email={previewProfile.email} name={previewProfile.name} />
            ) : null}
            {ready && pdReady && tab === "my-account" ? <><CoachProfile/><CoachAccountDesk profile={previewProfile} /></> : null}
            {ready && pdReady && tab === "plan" ? <PlanDesk profile={previewProfile} /> : null}
            {ready && pdReady && tab === "progress" ? <AthleteRoster role={previewRole} selfName={athlete} /> : null}
            {ready && pdReady && tab === "training" ? (
              previewRole === "player" ? (
                <DrillsDesk athlete={athlete} programs={programs} drills={drills} onChange={refresh} />
              ) : (
                <ParentTrainingDesk />
              )
            ) : null}
            {ready && pdReady && tab === "intake" ? <IntakeDesk profile={previewProfile} /> : null}
            {ready && pdReady && tab === "points" ? <PointsDesk /> : null}
            {ready && pdReady && tab === "leaderboard" ? <LeaderboardDesk /> : null}
            {ready && pdReady && tab === "goals" ? <GoalsDesk /> : null}
          </DeskFrame>
        </div>
        <UndoDock />
      </PdErrorBoundary>
      {lesson && (previewRole === "coach" || previewRole === "admin") ? (
        <GuidedLesson start={lesson} onClose={() => setLesson(null)} />
      ) : null}
    </div>
  );
}

function HomeDesk({
  profile,
  trueRole,
  onOpenTab,
  onStartLesson,
  reservations,
  programs,
  drills,
  hideMoney,
}: {
  profile: Profile;
  trueRole: ClubRole;
  onOpenTab: (id: string) => void;
  onStartLesson: (start: LessonStart) => void;
  reservations: Reservation[];
  programs: Program[];
  drills: Drill[];
  logs: Log[];
  hideMoney: boolean;
}) {
  const upcoming = reservations.slice(0, 4);
  const openDrills = drills.filter((d) => !d.done);
  const { listAthletes, openAthlete, data } = useDevelopment();
  const self = listAthletes(profile.role, undefined, profile.player_name || profile.name)[0];
  const family = data.families.find((row) => row.id === self?.familyId) ?? data.families[0];
  return (
    <>
      {profile.role === "admin" || profile.role === "coach" ? (
        <AlertQueue
          scope={{ role: profile.role, coachId: profile.role === "coach" ? "c-steve" : undefined }}
          onOpenAthlete={(id) => {
            openAthlete(id);
            onOpenTab(profile.role === "admin" ? "athletes" : "roster");
          }}
          onOpenDesk={onOpenTab}
        />
      ) : null}
      {profile.role === "parent" && family ? <DigestCard familyId={family.id} /> : null}
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            {profile.role === "admin"
              ? "Club today"
              : profile.role === "coach"
                ? "Today at a glance"
                : profile.role === "player"
                  ? "Today"
                  : "Your development"}
          </p>
          <h2 className="mt-2 text-3xl italic">
            {profile.assessment_complete ? "Assessment on file." : "Start with the assessment."}
          </h2>
          <p className="mt-2 text-sm text-fg-soft">
            {profile.assessment_complete
              ? "Private 30s and 60s are open."
              : hideMoney
                ? "Book with a parent. Assessment still needed before private lessons."
                : "Complete an assessment with your coach before buying ordinary lessons or packages."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Upcoming" value={String(reservations.length)} inverse />
            {hideMoney ? (
              <Stat label="Drills open" value={String(openDrills.length)} inverse />
            ) : (
              <Stat label="Credits" value={String(profile.lesson_credits)} inverse />
            )}
          </div>
        </div>
      </section>
      {profile.role === "admin" ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Active programs" value={String(programs.length)} />
          <Stat
            label="Held / booked"
            value={moneyForRole("admin", reservations.reduce((sum, row) => sum + row.price, 0)) ?? "$0"}
          />
        </div>
      ) : null}
      {trueRole === "admin" && profile.role === "admin" ? (
        <section className="rounded-2xl bg-navy p-5 text-fg-inverse">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">Staff ops</p>
          <h3 className="mt-2 text-2xl italic">Coaches, prices, logins.</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => onOpenTab("coaches")}>
              Coaches
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenTab("business")}>
              Business
            </Button>
          </div>
        </section>
      ) : null}
      {profile.role === "coach" ? (
        <>
          <section className="rounded-2xl bg-maroon text-fg-inverse">
            <div className="pd-card">
              <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">On the floor</p>
              <h3 className="mt-2 text-2xl italic">Run today’s lesson.</h3>
              <p className="mt-2 text-sm text-fg-soft">Eight stages, phone in the thumb zone. The pen drafts itself.</p>
              <Button type="button" className="mt-4 min-h-12 w-full" onClick={() => onOpenTab("lesson")}>
                Open guided lesson
              </Button>
            </div>
          </section>
          <CoachFloor onStartLesson={onStartLesson} />
          <CoachWaitlist />
          <EarningsBoard />
        </>
      ) : null}
      <section>
        <h3 className="text-2xl">Upcoming sessions</h3>
        {upcoming.length === 0 ? (
          <Empty text="Nothing booked yet." cta="Book a cage or lesson" to="/training" />
        ) : (
          <ul className="mt-3 grid gap-2">
            {upcoming.map((row) => (
              <SessionRow key={row.id} row={row} hideMoney={hideMoney} />
            ))}
          </ul>
        )}
      </section>
      {profile.role === "player" && self ? (
        <section className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">This week</p>
            <Button type="button" className="mt-3 min-h-12 w-full" onClick={() => onOpenTab("points")}>
              Log points / check in
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}

function PlanDesk({ profile }: { profile: Profile }) {
  const { data, listAthletes } = useDevelopment();
  const athlete = listAthletes(profile.role, undefined, profile.player_name || profile.name)[0];
  const family = athlete
    ? data.families.find((row) => row.id === athlete.familyId)
    : undefined;
  const tier = family?.plan?.tier ?? family?.plan?.type;
  const upcoming = data.bookings.filter(
    (row) =>
      family &&
      family.athleteIds.includes(row.athleteId) &&
      row.date >= clubDayIso() &&
      (row.status === "paid" || row.status === "cancelled"),
  );
  return (
    <>
      <section className="rounded-2xl bg-paper-2 p-5 shadow-border">
        <h3 className="text-2xl">Your plan</h3>
        <p className="pd-num mt-2 font-display text-3xl">
          {profile.plan_name || (family?.plan?.type && family.plan.type !== "none" ? family.plan.type : "No plan yet")}
        </p>
        {profile.plan_price ? <p className="pd-num text-muted">${profile.plan_price}/mo</p> : null}
        <p className="mt-3 text-sm text-muted">
          {profile.lesson_credits} lesson credits · {profile.remote_credits} remote reviews. Reschedule:{" "}
          {data.policy.rescheduleDaysNotice} days’ notice, {data.policy.reschedulesPerMonth} per month.
        </p>
        <Button asChild className="mt-4">
          <Link to="/training">See memberships</Link>
        </Button>
      </section>
      <section>
        <h3 className="text-2xl">What’s on this plan</h3>
        <p className="mt-1 text-sm text-muted">
          Locked features stay visible and name the tier that unlocks them. A more expensive plan never has fewer
          features than a cheaper one.
        </p>
        <LockedFeatures tier={tier === "none" || tier === "package" ? undefined : tier} />
      </section>
      <section>
        <h3 className="text-2xl">Move or cancel</h3>
        {upcoming.length === 0 || !family ? (
          <Empty text="No upcoming sessions on this family." cta="Book a lesson" to="/training" />
        ) : (
          <ul className="mt-3 grid gap-2">
            {upcoming.map((row) => (
              <SessionPolicyRow key={row.id} booking={row} family={family} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function EvidenceDesk() {
  const [pane, setPane] = useState("interventions");
  return (
    <>
      <SubPills
        items={[
          { id: "interventions", label: "Interventions" },
          { id: "calibration", label: "Calibration" },
        ]}
        value={pane}
        onChange={setPane}
      />
      {pane === "interventions" ? <InterventionEvidence /> : null}
      {pane === "calibration" ? <AdminCalibration /> : null}
    </>
  );
}

function BusinessDesk() {
  const [pane, setPane] = useState("launch");
  return (
    <>
      <SubPills
        items={[
          { id: "launch", label: "Launch" },
          { id: "services", label: "Services" },
          { id: "accounts", label: "Accounts" },
          { id: "payments", label: "Payments" },
          { id: "policy", label: "Policy" },
        ]}
        value={pane}
        onChange={setPane}
      />
      {pane === "launch" ? <LaunchChecklist /> : null}
      {pane === "services" ? <AdminServicesDesk /> : null}
      {pane === "accounts" ? <AdminAccountsDesk /> : null}
      {pane === "payments" ? (
        <section className="rounded-2xl bg-paper-2 shadow-border">
          <div className="pd-card">
            <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Payments</p>
            <h3 className="mt-2 text-2xl">Live bookings and payments</h3>
            <p className="mt-2 text-sm text-muted">
              View paid cage bookings, customer details, and owner alerts in the front office.
            </p>
            <Link to="/office" className="mt-3 inline-flex min-h-11 items-center font-semibold underline">Open bookings and payments</Link>
          </div>
        </section>
      ) : null}
      {pane === "policy" ? <PolicyEditor /> : null}
    </>
  );
}

function ToolkitDesk({
  athlete,
  onSaved,
  email,
  name,
}: {
  athlete: string;
  onSaved: () => void;
  email: string;
  name: string;
}) {
  const [pane, setPane] = useState("assess");
  const { selectedAthleteId, emptyAthleteId, slice } = useDevelopment();
  const current = slice(selectedAthleteId ?? emptyAthleteId);
  return (
    <>
      <SubPills
        items={[
          { id: "assess", label: "Assessment" },
          { id: "curriculum", label: "Curriculum" },
          { id: "drills", label: "Drills" },
          { id: "diagnose", label: "Diagnose" },
          { id: "flaws", label: "Flaws" },
          { id: "strength", label: "Strength" },
          { id: "warmups", label: "Warm-ups" },
          { id: "throwing", label: "Throwing" },
          { id: "education", label: "Education" },
          { id: "calibration", label: "Calibration" },
          { id: "tracking", label: "Tracking" },
        ]}
        value={pane}
        onChange={setPane}
      />
      {pane === "assess" ? <AssessDesk athlete={athlete} onSaved={onSaved} /> : null}
      {pane === "curriculum" ? <ProgramsCurriculum /> : null}
      {pane === "drills" ? <DrillLibrary role="coach" /> : null}
      {pane === "diagnose" && current ? <DiagnosticView slice={current} /> : null}
      {pane === "flaws" ? <FlawLibrary slice={current ?? undefined} /> : null}
      {pane === "strength" && current ? <StrengthProgramView slice={current} role="coach" /> : null}
      {pane === "warmups" && current ? <WarmupLibraryView slice={current} /> : null}
      {pane === "throwing" && current ? <ThrowingPlanView slice={current} role="coach" /> : null}
      {pane === "education" ? <CoachEducation email={email} name={name} /> : null}
      {pane === "calibration" ? <CalibrationDesk coachId="c-steve" /> : null}
      {pane === "tracking" && current ? <TrackingImport slice={current} /> : null}
    </>
  );
}

function CoachAccountDesk({ profile }: { profile: Profile }) {
  return (
    <div className="pd-stack">
      <section className="rounded-2xl bg-paper-2 shadow-border">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">Coach login</p>
          <h3 className="mt-2 text-2xl">{profile.name || "Coach"}</h3>
          <p className="pd-num mt-2 text-sm text-muted">{profile.email || PD_OS.phone}</p>
          <p className="mt-3 text-sm text-muted">
            {PD_OS.businessName} · {PD_OS.addressLine}. Desk {PD_OS.phone}.
          </p>
        </div>
      </section>
      <EarningsBoard />
      <CoachEducation email={profile.email} name={profile.name} />
    </div>
  );
}

function ParentTrainingDesk() {
  const catalog = useLiveCatalog();
  return (
    <>
      <section className="rounded-2xl bg-ink text-fg-inverse">
        <div className="pd-card">
          <p className="text-xs font-semibold tracking-[0.16em] text-powder uppercase">Book training</p>
          <h3 className="mt-2 text-2xl italic">Pay first. Then they train.</h3>
          <p className="mt-2 text-sm text-fg-soft">Same catalog as the public Train page. No hold, no request wall.</p>
          <Button asChild className="mt-4">
            <Link to="/training">Open the lesson board</Link>
          </Button>
        </div>
      </section>
      <ul className="grid gap-2">
        {catalog.lessons.slice(0, 6).map((item) => (
          <li key={item.id} className="pd-row flex items-baseline justify-between rounded-xl bg-paper-2 shadow-border">
            <span>
              <strong>{item.name}</strong>
              <span className="mt-1 block text-sm text-muted">{item.minutes} min</span>
            </span>
            <span className="pd-num font-display text-xl">${item.price}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function IntakeDesk({ profile }: { profile: Profile }) {
  return (
    <section className="rounded-2xl bg-paper-2 shadow-border">
      <div className="pd-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">New athlete intake</p>
        <h3 className="mt-2 text-2xl">{profile.assessment_complete ? "Intake on file." : "Intake not started."}</h3>
        <p className="mt-2 text-sm text-muted">
          {profile.assessment_complete
            ? "Assessment complete. Private 30s and 60s can be paid and booked."
            : "Health screen, waiver, and the new-player assessment live here next. Book the assessment from Train to open private lessons."}
        </p>
        <p className="pd-num mt-3 text-sm text-muted">Athlete: {profile.player_name || profile.name || "—"}</p>
        <Button asChild className="mt-4" variant="outlineDark">
          <Link to="/training">Book an assessment</Link>
        </Button>
      </div>
    </section>
  );
}

function PointsDesk() {
  const { listAthletes, slice } = useDevelopment();
  const athletes = listAthletes("player");
  const current = athletes[0] ? slice(athletes[0].id) : null;
  if (!current) return <p className="text-sm text-muted">No athlete on this desk.</p>;
  return <PointsBoard slice={current} role="player" />;
}

function LeaderboardDesk() {
  const { listAthletes } = useDevelopment();
  const self = listAthletes("player")[0];
  return <LeaderboardBoard selfId={self?.id} role="player" />;
}

function GoalsDesk() {
  const { listAthletes, slice } = useDevelopment();
  const self = listAthletes("player")[0];
  const current = self ? slice(self.id) : null;
  if (!current?.goals?.length) {
    return (
      <Empty
        text="No goals on file yet. Your coach will set velocity, command, and season targets here."
        cta="Open progress"
        to="/training"
      />
    );
  }
  return (
    <ul className="grid gap-2">
      {current.goals.map((row) => (
        <li key={row.id} className="rounded-xl bg-paper-2 px-4 py-3 shadow-border">
          <p className="font-semibold">{row.title}</p>
          {row.target ? <p className="mt-1 text-sm text-muted">{row.target}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function ProgramsDesk() {
  return <ProgramsCurriculum />;
}

function AssessDesk({ athlete, onSaved }: { athlete: string; onSaved: () => void }) {
  const [note, setNote] = useState("");
  return (
    <section>
      <h3 className="text-2xl">New pitcher assessment</h3>
      <p className="mt-1 text-sm text-muted">75 minutes. Health screen, then eight phases. {formatMoney(PRICES.s1)}. Not an ordinary lesson.</p>
      <ol className="mt-4 grid gap-2">
        {ASSESSMENT_PHASES.map((phase, index) => (
          <li key={phase} className="flex gap-3 rounded-xl bg-paper-2 px-4 py-3 shadow-border">
            <span className="font-display text-xl text-maroon">{String(index + 1).padStart(2, "0")}</span>
            <span>{phase}</span>
          </li>
        ))}
      </ol>
      <form
        className="mt-4 grid gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!note.trim()) return;
          await addLog({ data: { athlete, note: note.trim(), metric: "Assessment" } });
          setNote("");
          onSaved();
        }}
      >
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Session note"
          className="min-h-12 rounded-md border border-line bg-paper-2 px-3"
        />
        <Button type="submit">Save note</Button>
      </form>
    </section>
  );
}

function DrillsDesk({
  athlete,
  programs,
  drills,
  onChange,
}: {
  athlete: string;
  programs: Program[];
  drills: Drill[];
  onChange: () => void;
}) {
  const [focus, setFocus] = useState("Pitching");
  return (
    <>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await createProgram({ data: { athlete, focus } });
          onChange();
        }}
      >
        <select
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          className="min-h-11 rounded-md border border-line bg-paper-2 px-3"
        >
          <option>Pitching</option>
          <option>Hitting</option>
          <option>Catching</option>
          <option>Fielding</option>
        </select>
        <Button type="submit">Start {focus} program</Button>
      </form>
      {programs.length === 0 ? (
        <Empty text="No program yet." cta="Book an assessment" to="/training" />
      ) : (
        <ul className="mt-3 grid gap-2">
          {programs.map((row) => (
            <li key={row.id} className="pd-row rounded-xl bg-paper-2 shadow-border">
              <strong>{row.focus}</strong>
            </li>
          ))}
        </ul>
      )}
      {drills.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-maroon">No drills assigned. Open the library after assessment.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {drills.map((row) => (
            <li key={row.id} className="pd-row rounded-xl bg-paper-2 shadow-border">
              {row.name}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function SessionRow({ row, hideMoney }: { row: Reservation; hideMoney: boolean }) {
  return (
    <li className="pd-row rounded-xl bg-paper-2 shadow-border">
      <strong>{row.title}</strong>
      <span className="block text-sm text-muted">
        {row.date} · {row.start_time} · {row.duration_min} min
        {hideMoney ? "" : ` · $${row.price}`}
        {row.status ? ` · ${row.status}` : ""}
      </span>
    </li>
  );
}

function Stat({ label, value, inverse }: { label: string; value: string; inverse?: boolean }) {
  return (
    <div className={cn("pd-row rounded-xl", inverse ? "bg-navy" : "bg-paper-2 shadow-border")}>
      <p className={cn("text-[0.65rem] font-semibold tracking-widest uppercase", inverse ? "text-fg-soft" : "text-muted")}>
        {label}
      </p>
      <p className="pd-num font-display text-2xl">{value}</p>
    </div>
  );
}

function Empty({ text, cta, to }: { text: string; cta: string; to: "/training" }) {
  return (
    <div className="pd-card mt-3 rounded-xl bg-paper-2 shadow-border" data-empty-state="true">
      <p className="text-sm text-muted">{text}</p>
      <Button asChild variant="outlineDark" className="mt-3 min-h-12">
        <Link to={to}>{cta}</Link>
      </Button>
    </div>
  );
}

function SubPills({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-paper p-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "pd-control shrink-0 rounded-lg px-3 text-xs font-semibold tracking-wide uppercase",
            value === item.id ? "bg-maroon text-fg-inverse" : "text-muted",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function PdWorkspace({profile}:{profile:Profile}) {
  const context=useDevelopment();const [role,setRole]=useState<ClubRole>(profile.role);
  const [targetId,setTargetId]=useState("");
  if(profile.role!=="admin")return <ScopedWorkspace profile={profile}/>;
  const preview=role!=="admin";
  const target=context.data.athletes.find(a=>a.id===targetId);
  const family=context.data.families.find(f=>f.id===target?.familyId);
  const coach=context.data.coaches.find(c=>c.id===targetId);
  const viewer={role,email:role==="coach"?coach?.email||"":family?.email||"",name:role==="coach"?coach?.name||"":family?.parentName||"",playerName:target?`${target.firstName} ${target.lastName}`:""};
  const data=preview?previewData(context.data,viewer):context.data;
  const scoped={...context,data,viewer:preview?viewer:context.viewer,
    listAthletes:()=>data.athletes,athlete:(id:string)=>data.athletes.find(a=>a.id===id),emptyAthleteId:data.athletes[0]?.id||"",
    slice:(id:string)=>{const original=context.slice(id);if(!original||!data.athletes.some(a=>a.id===id))return null;const patch:Record<string,unknown>={...original,athlete:data.athletes.find(a=>a.id===id),family:data.families.find(f=>f.id===original.athlete.familyId)};for(const [key,rows] of Object.entries(data)){if(Array.isArray(rows)&&key in original)patch[key]=rows.filter(r=>('athleteId' in r && r.athleteId===id)||(key==="coaches"&&'id' in r &&original.athlete.coachIds.includes(r.id)));}return patch as typeof original;},
  };
  return <><ViewAsBar value={role} onChange={r=>{setRole(r);setTargetId("");context.closeAthlete();}}/>
    {preview?<div className="my-4 rounded-xl border p-4"><p className="mb-3">Read-only {role} preview. Select a real household or coach to view their scoped records. Preview changes do not save.</p><label>{role==="coach"?"Coach":"Athlete / household"}<select value={targetId} onChange={e=>{setTargetId(e.target.value);context.closeAthlete();}} className="ml-2 min-h-11 rounded-lg border px-3"><option value="">Choose a record</option>{role==="coach"?context.data.coaches.map(c=><option key={c.id} value={c.id}>{c.name}</option>):context.data.athletes.map(a=><option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>)}</select></label>{!context.data.athletes.length&&role!=="coach"?<p>No athlete records yet. Create a test household to test its preview.</p>:null}</div>:null}
    {(!preview||targetId)?<DevelopmentContext.Provider value={scoped}><ReadOnlyPreview active={preview}><ScopedWorkspace key={`${role}:${targetId}`} profile={preview?{...profile,role,email:viewer.email,name:viewer.name,player_name:viewer.playerName}:profile}/></ReadOnlyPreview></DevelopmentContext.Provider>:null}
  </>;
}
