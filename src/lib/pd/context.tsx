import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { emptyDevelopment } from "./empty";
import { loadPdAthlete, loadPdDesk, savePdDesk } from "./desk";
import { authorizeMessage, canCoachAthlete, scopeForViewer, type PdViewer } from "./access";
import { mergeDraft } from "./draft";
import { tciOf, scorePitch } from "./core-algorithms.js";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type {
  Athlete,
  Booking,
  CalibrationScore,
  DevelopmentData,
  Policy,
  StrengthSet,
  StrengthAssignment,
  Bullpen,
  BullpenPitch,
  ThrowingAssignment,
  ViewerRole,
  WaitlistEntry,
} from "./types";
import { viewsForRole } from "./views";
import { progressOf } from "./content/education";
import { canReschedule } from "./core-algorithms.js";
import { nextMatchingSlot, type ProposedSession } from "./commerce-engine";
import { drillById } from "./content";
import type { PublishLessonInput } from "./lesson";
import { clubDayIso, athleteAge } from "./engines";
import { creditDecision } from "./automation";
import { bandForAge, parseTrackingFile, trackingApplyRows } from "./measure";

export type AthleteSlice = {
  athlete: Athlete;
  family: DevelopmentData["families"][number] | undefined;
  coaches: DevelopmentData["coaches"];
  bookings: DevelopmentData["bookings"];
  waitlist: DevelopmentData["waitlist"];
  outings: DevelopmentData["outings"];
  workoutLog: DevelopmentData["workoutLog"];
  strengthLog: DevelopmentData["strengthLog"];
  pointsLog: DevelopmentData["pointsLog"];
  scorecards: DevelopmentData["scorecards"];
  evaluations: DevelopmentData["evaluations"];
  lessons: DevelopmentData["lessons"];
  filmReviews: DevelopmentData["filmReviews"];
  interventions: DevelopmentData["interventions"];
  calibration: DevelopmentData["calibration"];
  certifications: DevelopmentData["certifications"];
  messages: DevelopmentData["messages"];
  plans: DevelopmentData["plans"];
  diagnose: DevelopmentData["diagnose"];
  cohorts: DevelopmentData["cohorts"];
  gameIq: DevelopmentData["gameIq"];
  reportCards: DevelopmentData["reportCards"];
  velocity: DevelopmentData["velocity"];
  goals: DevelopmentData["goals"];
  arsenal: DevelopmentData["arsenal"];
  pitchDesign: DevelopmentData["pitchDesign"];
  skillPlans: DevelopmentData["skillPlans"];
  warmups: DevelopmentData["warmups"];
  strengthSets: DevelopmentData["strengthSets"];
  strengthAssignments: DevelopmentData["strengthAssignments"];
  throwingDays: DevelopmentData["throwingDays"];
  throwingAssignments: DevelopmentData["throwingAssignments"];
  bullpens: DevelopmentData["bullpens"];
  workload: DevelopmentData["workload"];
  armCare: DevelopmentData["armCare"];
  physicalTests: DevelopmentData["physicalTests"];
  metrics: DevelopmentData["metrics"];
  recruiting: DevelopmentData["recruiting"][number] | undefined;
  intake: DevelopmentData["intake"][number] | undefined;
  videos: DevelopmentData["videos"];
  documents: DevelopmentData["documents"];
};

type DevelopmentContextValue = {
  data: DevelopmentData;
  selectedAthleteId: string | null;
  openAthlete: (id: string) => void;
  closeAthlete: () => void;
  athlete: (id: string) => Athlete | undefined;
  slice: (id: string) => AthleteSlice | null;
  listAthletes: (role: ViewerRole, familyId?: string, selfName?: string) => Athlete[];
  views: typeof viewsForRole;
  emptyAthleteId: string;
  education: Record<string, string[]>;
  toggleEducation: (email: string, moduleId: string) => void;
  educationFor: (email: string) => string[];
  educationStats: (email: string, courseId?: string) => { done: number; total: number; pct: number };
  confirmSessions: (input: {
    athleteId: string;
    serviceId: string;
    price: number;
    sessions: ProposedSession[];
    planName?: string;
    planType?: NonNullable<DevelopmentData["families"][number]["plan"]>["type"];
    lessons?: number;
    remote?: number;
  }) => void;
  rescheduleBooking: (bookingId: string, next: ProposedSession, familyId: string) => { ok: boolean; reason?: string; detail?: string };
  cancelBooking: (bookingId: string) => void;
  restoreBooking: (bookingId: string) => void;
  joinWaitlist: (entry: Omit<WaitlistEntry, "id" | "createdAt" | "status">) => void;
  offerWaitlist: (waitlistId: string, coachId: string) => ProposedSession | null;
  completeBooking: (bookingId: string) => void;
  payEarning: (bookingId: string) => void;
  updatePolicy: (patch: Partial<Policy>) => void;
  publishLesson: (input: PublishLessonInput) => void;
  logStrengthSet: (row: Omit<StrengthSet, "id">) => void;
  saveStrengthAssignment: (row: Omit<StrengthAssignment, "id" | "createdAt" | "createdBy">) => void;
  selectThrowingDay: (athleteId: string, assignmentId: string, dayType: string) => void;
  addBullpenPitch: (pen: Bullpen, pitch: BullpenPitch) => void;
  startBullpen: (athleteId: string) => void;
  canCoach: (athleteId: string) => boolean;
  updateAthleteProfile: (id: string, patch: Pick<Athlete, "birthDate" | "sport" | "position">) => void;
  assignThrowing: (row: Omit<ThrowingAssignment, "id">) => void;
  creditPoints: (input: { athleteId: string; key: string; date?: string }) => { ok: boolean; reason?: string };
  verifyPoints: (id: string) => void;
  sendMessage: (input: {
    athleteId: string;
    fromName: string;
    fromRole: ViewerRole;
    body: string;
    channel?: "family" | "coach";
  }) => void;
  setLeaderboardOptOut: (familyId: string, value: boolean) => void;
  saveCalibration: (input: {
    caseId: string;
    coachId: string;
    scores: CalibrationScore["scores"];
  }) => void;
  applyTracking: (athleteId: string, csv: string) => { ok: boolean; reason?: string };
  viewer: PdViewer | null;
  pdReady: boolean;
  refreshDesk: () => Promise<void>;
};

export const DevelopmentContext = createContext<DevelopmentContextValue | null>(null);

function ofAthlete<T extends { athleteId: string }>(rows: T[], id: string) {
  return rows.filter((row) => row.athleteId === id);
}

function nid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function DevelopmentProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const [data, setData] = useState<DevelopmentData>(() => emptyDevelopment());
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const education = data.educationProgress;
  const [viewer, setViewer] = useState<PdViewer | null>(null);
  const [pdReady, setPdReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const savedRevision = useRef(0);
  const failedSave = useRef(false);
  const skipPersist = useRef(true);
  const latestFile = useRef(data);
  const persistChain = useRef(Promise.resolve());
  latestFile.current = data;

  const savedFile = useRef(data);
  const sessionUser = useRef(user?.id);
  const priorUser = useRef(user?.id);
  sessionUser.current = user?.id;
  const draftKey = (id: string) => `op.pd.draft.v2:${id}`;
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (priorUser.current && priorUser.current !== user?.id) {
      try { window.sessionStorage.removeItem(draftKey(priorUser.current)); } catch { /* unavailable storage */ }
    }
    priorUser.current = user?.id;
    skipPersist.current = true;
    failedSave.current = false;
    setSelectedAthleteId(null);
    setData(emptyDevelopment());
    setViewer(null);
    setSaveError("");
    setDraftAvailable(false);
    setConflict(false);
    try { window.localStorage.removeItem("op.pd.education.v1"); } catch { /* legacy demo progress */ }
    if (!user) { setPdReady(true); return; }
    setPdReady(false);
    loadPdDesk().then(payload => {
      if (cancelled) return;
      skipPersist.current = true;
      savedRevision.current = payload.data.revision ?? 0;
      savedFile.current = payload.data;
      setData(payload.data);
      setViewer(payload.viewer);
      try { setDraftAvailable(Boolean(window.sessionStorage.getItem(draftKey(user.id)))); } catch { /* unavailable storage */ }
      setPdReady(true);
    }).catch(error => {
      if (cancelled) return;
      setSaveError(error instanceof Error ? error.message : "Could not load your saved records.");
      setPdReady(true);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const persist = useCallback((snapshot: DevelopmentData, userId: string) => {
    setSaving(true);
    persistChain.current = persistChain.current.then(async () => {
      if (sessionUser.current !== userId) return;
      if (failedSave.current) { setSaving(false); return; }
      try {
        const result = await savePdDesk({ data: { file: { ...snapshot, revision: savedRevision.current } } });
        if (sessionUser.current !== userId) return;
        savedRevision.current = result.revision;
        savedFile.current = { ...snapshot, revision: result.revision };
        setSaveError("");
        setConflict(false);
        if (latestFile.current === snapshot) {
          try { window.sessionStorage.removeItem(draftKey(userId)); } catch { /* unavailable storage */ }
          setDraftAvailable(false);
        }
      } catch (error) {
        if (sessionUser.current !== userId) return;
        failedSave.current = true;
        setSaveError(error instanceof Error ? error.message : "Changes have not saved. Please retry.");
      } finally { if (sessionUser.current === userId) setSaving(false); }
    });
  }, []);

  useEffect(() => {
    if (!pdReady) return;
    if (skipPersist.current) { skipPersist.current = false; return; }
    if (!viewer || !user) return;
    const snapshot = latestFile.current;
    try { window.sessionStorage.setItem(draftKey(user.id), JSON.stringify({ base: savedFile.current, file: snapshot })); } catch { /* edits remain in memory */ }
    persist(snapshot, user.id);
  }, [data, pdReady, viewer, user?.id, persist]);

  const retrySave = useCallback(async () => {
    if (!user) return;
    const userId = user.id;
    try {
      await persistChain.current;
      const payload = await loadPdDesk();
      if (sessionUser.current !== userId) return;
      let base = savedFile.current, local = latestFile.current;
      if (draftAvailable) {
        const raw = window.sessionStorage.getItem(draftKey(userId));
        if (raw) { const draft = JSON.parse(raw); base = draft.base; local = draft.file; }
      }
      const merged = mergeDraft(base, local, payload.data);
      savedFile.current = payload.data;
      savedRevision.current = payload.data.revision ?? 0;
      failedSave.current = false;
      setConflict(false);
      setData(merged);
      setSaveError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not retry. Your edits are still here.";
      setConflict(message.startsWith("Conflicting edits"));
      setSaveError(message);
    }
  }, [user?.id, draftAvailable]);

  const refreshDesk = useCallback(async () => {
    const userId = user?.id;
    if (!userId) return;
    // Never discard a failed or pending draft as a side effect of navigation.
    if (failedSave.current || draftAvailable) { await retrySave(); return; }
    await persistChain.current;
    try {
      const payload = await loadPdDesk();
      if (sessionUser.current !== userId) return;
      skipPersist.current = true;
      savedRevision.current = payload.data.revision ?? 0;
      savedFile.current = payload.data;
      setData(payload.data);
      setViewer(payload.viewer);
      setSaveError("");
    } catch (error) {
      if (sessionUser.current !== userId) return;
      setSaveError(error instanceof Error ? error.message : "Could not reload saved records. Your current edits remain visible.");
    } finally { if (sessionUser.current === userId) setPdReady(true); }
  }, [user?.id, draftAvailable, retrySave]);

  const openAthlete = useCallback((id: string) => {
    if (data.athletes.some(row => row.id === id)) { setSelectedAthleteId(id); return; }
    const userId = user?.id;
    void (async () => {
      try {
        if (failedSave.current || draftAvailable) throw new Error("Save or recover your current changes before opening another record.");
        await persistChain.current;
        await loadPdAthlete({ data: { athleteId: id } });
        const payload = await loadPdDesk();
        if (sessionUser.current !== userId) return;
        if (!payload.data.athletes.some(row => row.id === id)) throw new Error("Athlete record is no longer available.");
        skipPersist.current = true;
        savedRevision.current = payload.data.revision ?? 0;
        savedFile.current = payload.data;
        setData(payload.data);
        setViewer(payload.viewer);
        setSelectedAthleteId(id);
      } catch (error) {
        if (sessionUser.current !== userId) return;
        setSelectedAthleteId(null);
        setSaveError(error instanceof Error ? error.message : "Could not open this athlete.");
      }
    })();
  }, [data.athletes, user?.id, draftAvailable]);

  const canCoach = useCallback((id: string) => Boolean(viewer && canCoachAthlete(scopeForViewer(viewer, data), id)), [viewer, data]);

  const closeAthlete = useCallback(() => {
    setSelectedAthleteId(null);
  }, []);

  const athlete = useCallback(
    (id: string) => data.athletes.find((row) => row.id === id),
    [data],
  );

  const slice = useCallback(
    (id: string): AthleteSlice | null => {
      const row = data.athletes.find((item) => item.id === id);
      if (!row) return null;
      return {
        athlete: row,
        family: data.families.find((item) => item.id === row.familyId),
        coaches: data.coaches.filter((item) => row.coachIds.includes(item.id)),
        bookings: ofAthlete(data.bookings, id),
        waitlist: ofAthlete(data.waitlist, id),
        outings: ofAthlete(data.outings, id),
        workoutLog: ofAthlete(data.workoutLog, id),
        strengthLog: ofAthlete(data.strengthLog, id),
        pointsLog: ofAthlete(data.pointsLog, id),
        scorecards: ofAthlete(data.scorecards, id),
        evaluations: ofAthlete(data.evaluations, id),
        lessons: ofAthlete(data.lessons, id),
        filmReviews: ofAthlete(data.filmReviews, id),
        interventions: ofAthlete(data.interventions, id),
        calibration: ofAthlete(data.calibration, id),
        certifications: ofAthlete(data.certifications, id),
        messages: ofAthlete(data.messages, id).filter((row) =>
          viewer?.role === "admin" || viewer?.role === "coach" ? true : row.channel !== "coach",
        ),
        plans: ofAthlete(data.plans, id),
        diagnose: ofAthlete(data.diagnose, id),
        cohorts: data.cohorts.filter((item) => item.athleteIds.includes(id)),
        gameIq: ofAthlete(data.gameIq, id),
        reportCards: ofAthlete(data.reportCards, id),
        velocity: ofAthlete(data.velocity, id),
        goals: ofAthlete(data.goals, id),
        arsenal: ofAthlete(data.arsenal, id),
        pitchDesign: ofAthlete(data.pitchDesign, id),
        skillPlans: ofAthlete(data.skillPlans, id),
        warmups: ofAthlete(data.warmups, id),
        strengthSets: ofAthlete(data.strengthSets, id),
        strengthAssignments: ofAthlete(data.strengthAssignments, id),
        throwingDays: ofAthlete(data.throwingDays, id),
        throwingAssignments: ofAthlete(data.throwingAssignments, id),
        bullpens: ofAthlete(data.bullpens, id),
        workload: ofAthlete(data.workload, id),
        armCare: ofAthlete(data.armCare, id),
        physicalTests: ofAthlete(data.physicalTests, id),
        metrics: ofAthlete(data.metrics, id),
        recruiting: data.recruiting.find((item) => item.athleteId === id),
        intake: data.intake.find((item) => item.athleteId === id),
        videos: ofAthlete(data.videos, id),
        documents: ofAthlete(data.documents, id),
      };
    },
    [data, viewer],
  );

  const listAthletes = useCallback(
    (_role?: ViewerRole, _familyId?: string, selfName?: string) => {
      if (!selfName) return data.athletes;
      const needle = selfName.trim().toLowerCase();
      const named = data.athletes.filter(
        (row) => `${row.firstName} ${row.lastName}`.toLowerCase() === needle,
      );
      return named.length ? named : data.athletes;
    },
    [data],
  );

  const educationFor = useCallback(
    (email: string) => education[email.trim().toLowerCase()] ?? [],
    [education],
  );

  const educationStats = useCallback(
    (email: string, courseId?: string) => progressOf(educationFor(email), courseId),
    [educationFor],
  );

  const toggleEducation = useCallback((email: string, id: string) => {
    const key = viewer?.email.trim().toLowerCase();
    if (!key || key !== email.trim().toLowerCase()) return;
    setData(prev => {
      const current = new Set(prev.educationProgress[key] ?? []);
      if (current.has(id)) current.delete(id); else current.add(id);
      return { ...prev, educationProgress: { ...prev.educationProgress, [key]: [...current] } };
    });
  }, [viewer]);

  const confirmSessions = useCallback(
    (input: {
      athleteId: string;
      serviceId: string;
      price: number;
      sessions: ProposedSession[];
      planName?: string;
      planType?: NonNullable<DevelopmentData["families"][number]["plan"]>["type"];
      lessons?: number;
      remote?: number;
    }) => {
      void input;
      throw new Error("Use secure checkout. Booking confirmation comes from verified payment.");
    },
    [],
  );

  const rescheduleBooking = useCallback(
    (bookingId: string, next: ProposedSession, familyId: string) => {
      const family = data.families.find((row) => row.id === familyId);
      const booking = data.bookings.find((row) => row.id === bookingId);
      if (!family || !booking) return { ok: false, reason: "Missing", detail: "No session." };
      const gate = canReschedule(booking, family, data) as {
        ok: boolean;
        reason?: string;
        detail?: string;
      };
      if (!gate.ok) return gate;
      const month = clubDayIso().slice(0, 7);
      setData((prev) => ({
        ...prev,
        bookings: prev.bookings.map((row) =>
          row.id === bookingId
            ? {
                ...row,
                date: next.date,
                dateLabel: next.dateLabel,
                time: next.time,
                coachId: next.coachId || row.coachId,
                rescheduledMonth: month,
              }
            : row,
        ),
      }));
      return { ok: true };
    },
    [data],
  );

  const cancelBooking = useCallback((bookingId: string) => {
    setData((prev) => ({
      ...prev,
      bookings: prev.bookings.map((row) =>
        row.id === bookingId ? { ...row, status: "cancelled" as const } : row,
      ),
    }));
  }, []);

  const restoreBooking = useCallback((bookingId: string) => {
    setData((prev) => ({
      ...prev,
      bookings: prev.bookings.map((row) =>
        row.id === bookingId && row.status === "cancelled" ? { ...row, status: "paid" as const } : row,
      ),
    }));
  }, []);

  const joinWaitlist = useCallback((entry: Omit<WaitlistEntry, "id" | "createdAt" | "status">) => {
    setData((prev) => ({
      ...prev,
      waitlist: [
        ...prev.waitlist,
        {
          ...entry,
          id: nid("wl"),
          createdAt: clubDayIso(),
          status: "open",
        },
      ],
    }));
  }, []);

  const offerWaitlist = useCallback(
    (waitlistId: string, coachId: string) => {
      const row = data.waitlist.find((item) => item.id === waitlistId);
      if (!row) return null;
      const slot = nextMatchingSlot(
        data,
        coachId,
        row.preferredDay || "Tue",
        row.preferredTime || "17:00",
      );
      if (!slot) return null;
      setData((prev) => ({
        ...prev,
        waitlist: prev.waitlist.map((item) =>
          item.id === waitlistId ? { ...item, status: "offered" } : item,
        ),
        bookings: [
          ...prev.bookings,
          {
            id: nid("bk"),
            athleteId: row.athleteId,
            serviceId: row.serviceId,
            date: slot.date,
            dateLabel: slot.dateLabel,
            time: slot.time,
            status: "paid" as const,
            price: 0,
            coachId: slot.coachId,
            payout: "unpaid" as const,
          },
        ],
      }));
      return slot;
    },
    [data],
  );

  const completeBooking = useCallback((bookingId: string) => {
    setData((prev) => ({
      ...prev,
      bookings: prev.bookings.map((row) =>
        row.id === bookingId
          ? { ...row, status: "completed" as const, payout: row.payout ?? "unpaid" }
          : row,
      ),
    }));
  }, []);

  const payEarning = useCallback((bookingId: string) => {
    setData((prev) => ({
      ...prev,
      bookings: prev.bookings.map((row) =>
        row.id === bookingId ? { ...row, payout: "paid" as const } : row,
      ),
    }));
  }, []);

  const updatePolicy = useCallback((patch: Partial<Policy>) => {
    setData((prev) => ({ ...prev, policy: { ...prev.policy, ...patch } }));
  }, []);

  const publishLesson = useCallback((input: PublishLessonInput) => {
    const day = clubDayIso();
    setData((prev) => {
      const homework = input.homeworkIds
        .map((id) => drillById(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map((drill) => ({
          id: nid("sk"),
          athleteId: input.athleteId,
          skill: drill.problem,
          drill: drill.name,
          dose: drill.dose,
        }));
      const maxVelo = input.velocities.length ? Math.max(...input.velocities) : null;
      return {
        ...prev,
        lessons: [
          {
            id: nid("ls"),
            athleteId: input.athleteId,
            date: day,
            coachId: input.coachId,
            focus: input.focus,
            minutes: input.minutes,
            notes: input.recaps.parent,
          },
          ...prev.lessons,
        ],
        interventions: [
          {
            id: nid("in"),
            athleteId: input.athleteId,
            date: day,
            constraint: input.intervention.constraint,
            result: `${input.intervention.outcome}. ${input.recaps.coach}`,
            coachId: input.coachId,
            method: input.intervention.method,
            outcome: input.intervention.outcome,
            band: bandForAge(athleteAge(prev.athletes.find((row) => row.id === input.athleteId) ?? {birthDate:""})),
            preScore: input.intervention.preScore,
            postScore: input.intervention.postScore,
          },
          ...prev.interventions,
        ],
        skillPlans: [...homework, ...prev.skillPlans],
        gameIq: input.iqTitle
          ? [
              {
                id: nid("iq"),
                athleteId: input.athleteId,
                date: day,
                situation: input.iqTitle,
                note: "Covered in session.",
              },
              ...prev.gameIq,
            ]
          : prev.gameIq,
        messages: [
          {
            id: nid("msg"),
            athleteId: input.athleteId,
            fromName: "Coach",
            fromRole: "coach" as const,
            body: input.recaps.parent,
            createdAt: day,
          },
          {
            id: nid("msg"),
            athleteId: input.athleteId,
            fromName: "Coach",
            fromRole: "coach" as const,
            body: `Player recap: ${input.recaps.player}`,
            createdAt: day,
          },
          ...prev.messages,
        ],
        bullpens: input.bullpen
          ? [
              {
                id: nid("bp"),
                athleteId: input.athleteId,
                date: day,
                pitches: input.bullpen.pitches,
                tci: input.bullpen.tci,
                notes: input.bullpen.notes,
                chart: input.bullpen.chart,
              },
              ...prev.bullpens,
            ]
          : prev.bullpens,
        velocity:
          maxVelo != null
            ? [
                { id: nid("v"), athleteId: input.athleteId, date: day, mph: maxVelo },
                ...prev.velocity,
              ]
            : prev.velocity,
        bookings: input.bookingId
          ? prev.bookings.map((row) =>
              row.id === input.bookingId
                ? { ...row, status: "completed" as const, payout: row.payout ?? "unpaid" }
                : row,
            )
          : prev.bookings,
      };
    });
  }, []);

  const logStrengthSet = useCallback((row: Omit<StrengthSet, "id">) => {
    setData((prev) => {
      const credit = creditDecision(prev, { athleteId: row.athleteId, key: "workout", date: row.date });
      const pointsLog =
        credit.ok
          ? [
              {
                id: nid("pt"),
                athleteId: row.athleteId,
                date: row.date,
                points: credit.points,
                reason: credit.reason,
                activity: "workout",
                status: credit.status,
              },
              ...prev.pointsLog,
            ]
          : prev.pointsLog;
      return {
        ...prev,
        strengthSets: [{ ...row, id: nid("ss") }, ...prev.strengthSets],
        strengthLog: [
          {
            id: nid("st"),
            athleteId: row.athleteId,
            date: row.date,
            lift: row.exerciseId,
            value: row.weight,
            unit: "lb",
          },
          ...prev.strengthLog,
        ],
        pointsLog,
      };
    });
  }, []);

  const assignThrowing = useCallback((row: Omit<ThrowingAssignment, "id">) => {
    setData((prev) => {
      const rest = prev.throwingAssignments;
      return {
        ...prev,
        throwingAssignments: [{ ...row, id: nid("ta") }, ...rest],
      };
    });
  }, []);

  const updateAthleteProfile = useCallback((id: string, patch: Pick<Athlete, "birthDate" | "sport" | "position">) => {
    setData(prev => ({ ...prev, athletes: prev.athletes.map(a => a.id === id ? { ...a, ...patch } : a) }));
  }, []);

  const selectThrowingDay = useCallback((athleteId: string, assignmentId: string, dayType: string) => {
    const date = clubDayIso();
    setData(prev => ({ ...prev, throwingDays: [{ id: nid("td"), athleteId, assignmentId, dayType, date }, ...prev.throwingDays] }));
  }, []);

  const saveStrengthAssignment = useCallback((row: Omit<StrengthAssignment, "id" | "createdAt" | "createdBy">) => {
    setData(prev => ({ ...prev, strengthAssignments: [{ ...row, id: nid("sa"), createdAt: new Date().toISOString(), createdBy: viewer?.email ?? "" }, ...prev.strengthAssignments] }));
  }, [viewer]);

  const startBullpen = useCallback((athleteId: string) => {
    setData(prev => ({ ...prev, bullpens: [{ id: nid("bp"), athleteId, date: clubDayIso(), pitches: 0, tci: 0, notes: "", chart: [] }, ...prev.bullpens] }));
  }, []);

  const addBullpenPitch = useCallback((pen: Bullpen, pitch: BullpenPitch) => {
    setData(prev => ({ ...prev, bullpens: prev.bullpens.map(row => {
      if (row.id !== pen.id || row.athleteId !== pen.athleteId) return row;
      const chart = [...(row.chart ?? []), { ...pitch, score: scorePitch(pitch.intent, pitch.actual) }];
      return { ...row, chart, pitches: Math.max(row.pitches + 1, chart.length), tci: tciOf(chart) };
    }) }));
  }, []);

  const creditPoints = useCallback((input: { athleteId: string; key: string; date?: string }) => {
    let result: { ok: boolean; reason?: string } = { ok: false, reason: "Could not log." };
    setData((prev) => {
      const decision = creditDecision(prev, input);
      if (!decision.ok) {
        result = { ok: false, reason: decision.reason };
        return prev;
      }
      result = { ok: true };
      return {
        ...prev,
        pointsLog: [
          {
            id: nid("pt"),
            athleteId: input.athleteId,
            date: input.date ?? clubDayIso(),
            points: decision.points,
            reason: decision.reason,
            activity: input.key,
            status: decision.status,
          },
          ...prev.pointsLog,
        ],
      };
    });
    return result;
  }, []);

  const verifyPoints = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      pointsLog: prev.pointsLog.map((row) => (row.id === id ? { ...row, status: "verified" as const } : row)),
    }));
  }, []);

  const sendMessage = useCallback(
    (input: {
      athleteId: string;
      fromName: string;
      fromRole: ViewerRole;
      body: string;
      channel?: "family" | "coach";
    }) => {
      if (!viewer) return;
      try {
        const allowed = authorizeMessage(scopeForViewer(viewer, data), input);
        setData(prev => ({ ...prev, messages: [{ id: nid("msg"), ...allowed,
          fromName: viewer.name, fromRole: viewer.role, createdAt: new Date().toISOString() }, ...prev.messages] }));
      } catch (error) { setSaveError(error instanceof Error ? error.message : "Message was not saved."); }
    },
    [viewer, data],
  );

  const setLeaderboardOptOut = useCallback((familyId: string, value: boolean) => {
    setData((prev) => ({
      ...prev,
      families: prev.families.map((row) => (row.id === familyId ? { ...row, leaderboardOptOut: value } : row)),
    }));
  }, []);

  const saveCalibration = useCallback(
    (input: { caseId: string; coachId: string; scores: CalibrationScore["scores"] }) => {
      setData((prev) => {
        const rest = prev.calibrationScores.filter(
          (row) => !(row.caseId === input.caseId && row.coachId === input.coachId),
        );
        return {
          ...prev,
          calibrationScores: [
            { id: nid("cs"), caseId: input.caseId, coachId: input.coachId, scores: input.scores, at: clubDayIso() },
            ...rest,
          ],
        };
      });
    },
    [],
  );

  const applyTracking = useCallback((athleteId: string, csv: string) => {
    const parsed = parseTrackingFile(csv);
    if ("error" in parsed) return { ok: false, reason: parsed.error };
    let result = { ok: true as boolean, reason: undefined as string | undefined };
    setData((prev) => {
      const athlete = prev.athletes.find((row) => row.id === athleteId);
      if (!athlete) {
        result = { ok: false, reason: "Athlete not found." };
        return prev;
      }
      if(!athlete.throws){result={ok:false,reason:"Set the athlete’s throwing hand before importing tracking data."};return prev;}
      const rows = trackingApplyRows(parsed, athleteId, athlete.throws);
      return {
        ...prev,
        velocity: [rows.velocity, ...prev.velocity],
        metrics: [...rows.metrics, ...prev.metrics],
        arsenal: [
          ...rows.arsenal,
          ...prev.arsenal.filter((row) => row.athleteId !== athleteId),
        ],
        pitchDesign: rows.identity
          ? [
              {
                id: nid("pd"),
                athleteId,
                pitch: "FB",
                cue: `${rows.identity} fastball from the import.`,
              },
              ...prev.pitchDesign.filter((row) => !(row.athleteId === athleteId && row.pitch === "FB")),
            ]
          : prev.pitchDesign,
      };
    });
    return result;
  }, []);

  const value = useMemo<DevelopmentContextValue>(
    () => ({
      data,
      selectedAthleteId,
      openAthlete,
      closeAthlete,
      athlete,
      slice,
      listAthletes,
      views: viewsForRole,
      emptyAthleteId: data.athletes[0]?.id ?? "",
      viewer,
      pdReady,
      refreshDesk,
      education,
      toggleEducation,
      educationFor,
      educationStats,
      confirmSessions,
      rescheduleBooking,
      cancelBooking,
      restoreBooking,
      joinWaitlist,
      offerWaitlist,
      completeBooking,
      payEarning,
      updatePolicy,
      publishLesson,
      logStrengthSet,
      assignThrowing,
      selectThrowingDay,
      saveStrengthAssignment,
      startBullpen,
      addBullpenPitch,
      canCoach,
      updateAthleteProfile,
      creditPoints,
      verifyPoints,
      sendMessage,
      setLeaderboardOptOut,
      saveCalibration,
      applyTracking,
    }),
    [
      athlete,
      applyTracking,
      assignThrowing,
      selectThrowingDay,
      saveStrengthAssignment,
      startBullpen,
      addBullpenPitch,
      canCoach,
      updateAthleteProfile,
      cancelBooking,
      closeAthlete,
      completeBooking,
      confirmSessions,
      creditPoints,
      data,
      education,
      educationFor,
      educationStats,
      joinWaitlist,
      listAthletes,
      logStrengthSet,
      offerWaitlist,
      openAthlete,
      payEarning,
      publishLesson,
      rescheduleBooking,
      restoreBooking,
      saveCalibration,
      selectedAthleteId,
      sendMessage,
      setLeaderboardOptOut,
      slice,
      toggleEducation,
      updatePolicy,
      verifyPoints,
      viewer,
      pdReady,
      refreshDesk,
    ],
  );

  return (
    <DevelopmentContext.Provider value={value}>
      {draftAvailable && !saveError ? <div role="status" className="p-4">Unsaved work from this session is available. <button className="min-h-11 underline" onClick={() => void retrySave()}>Recover and save draft</button></div> : null}
      {saveError ? <div role="alert" className="border-b border-maroon bg-paper p-4 text-ink">{saveError} {conflict ? "Your draft is retained; a coach must resolve the conflicting record before it can replace saved data." : null} <button className="min-h-11 underline" onClick={() => { void retrySave(); }}>Retry saved changes</button> <button className="min-h-11 underline" onClick={() => {
        const blob = new Blob([JSON.stringify(latestFile.current, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob); const link = document.createElement("a");
        link.href = url; link.download = "prospects-unsaved-draft.json"; link.click(); URL.revokeObjectURL(url);
      }}>Download my unsaved draft</button></div> : saving ? <p role="status" className="px-5 py-2 text-sm">Saving changes…</p> : null}
      {children}
    </DevelopmentContext.Provider>
  );
}

export function useDevelopment() {
  const ctx = useContext(DevelopmentContext);
  if (!ctx) {
    throw new Error("useDevelopment must be used inside DevelopmentProvider");
  }
  return ctx;
}
