import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ClubRole } from "@/lib/club-data";
import { TEAMS_OS } from "@/lib/teams/os";
import {
  PLAYER_RECORD_TABS,
  TEAM_RECORD_TABS,
  type ClubOs,
  type OsAlert,
  type OsClearance,
  type OsDepositCharge,
  type OsGame,
  type OsIdentity,
  type OsPerms,
  type OsPlan,
  type OsPlayer,
  type OsPrice,
  type OsTeam,
  type OsView,
  type OsViewer,
} from "@/lib/teams/model";
import { seedState } from "@/lib/teams/engine/04-seed.js";
import {
  buildPlan,
  creditTotal,
  depositFor,
  eventById,
  feeDrift,
  lockFee,
  lockPlan,
  payoffDeadline,
  pendingAmendment,
  playerBalance,
  playerFee,
  priceTeam,
  staffCash,
  staffSeasonPay,
} from "@/lib/teams/engine/02-pricing.js";
import {
  DOC_LABELS,
  PITCH_LIMIT,
  gcUrl,
  missingDocs,
  perms,
  pitcherStatus,
  visibleNotes,
} from "@/lib/teams/engine/03-domain.js";
import { fmtDate, iso, uid } from "@/lib/teams/engine/00-helpers.js";
import { inspectCoachScope, requestPlayer, requestTeam, scopeClub } from "@/lib/teams/scope";
import {
  applyRemind,
  applySign,
  applyWithdraw,
  clearanceOf,
  depositChargeFor,
  feeBreakdown,
  type RosterFilter,
  type SignInput,
} from "@/lib/teams/roster";
import {
  applyAddEvent,
  applyAskBudget,
  applyCancelEvent,
  applyNudgeRsvp,
  applyRsvp,
  applySlate,
  buildSlate,
  eventEligible,
  wouldOverflow,
  type OsRsvp,
  type Slate,
} from "@/lib/teams/schedule";
import {
  applyAdvancePo,
  applyApprovePackage,
  applyCreatePo,
  applyPickPackage,
  applySetDeadline,
  applySubmitSizes,
  applyUploadPhoto,
  exportPoCsv,
  seedPackagePhotos,
} from "@/lib/teams/uniforms";
import {
  applyAddPractice,
  applyAdvanceHalf,
  applyAnnouncement,
  applyBookCage,
  applyChat,
  applyFieldCall,
  applyLogPitch,
  applyMarkAttendance,
  applyMarkNoShow,
  applyPostFinal,
  applyStartGame,
  applyTapRun,
  type OsAttend,
  type OsFieldStatus,
} from "@/lib/teams/field";
import {
  applyAcceptAmendment,
  applyCloseSeason,
  applyEnrollDraft,
  applyIssueAmendments,
  applyQuestionAmendment,
  applyRecordOfficePay,
  applyReenroll,
  applySetPrefs,
  applySetProfile,
  applyUploadDoc,
  applyWaiveUniform,
  cashFlowForTeam,
  collectionsOf,
  moneyCopyLeak,
  type OsPayMethod,
} from "@/lib/teams/money";
import {
  alertsForRole,
  applyRunAutomation,
  applyToggleAutomation,
  type AutomationId,
} from "@/lib/teams/ops";
import {
  applyAddReimbursement,
  applyElectPay,
  applyRecordPayout,
  type PayCategory,
} from "@/lib/teams/staff";
import {
  applyAcceptLead,
  applyChaseAgreements,
  applyMakeOffer,
  applyPublishPolicy,
  applySetLeadScores,
  applySetLeadStage,
  applyWaitlist,
  type GradeKey,
  type LeadStage,
} from "@/lib/teams/program";

const PREVIEW_KEY = "okp.teams.previewRole";

function readPreviewRole(fallback: ClubRole): ClubRole {
  try {
    const raw = window.localStorage.getItem(PREVIEW_KEY);
    if (raw === "admin" || raw === "coach" || raw === "parent" || raw === "player") {
      return raw;
    }
  } catch {
    /* private mode */
  }
  return fallback;
}

function writePreviewRole(role: ClubRole) {
  try {
    window.localStorage.setItem(PREVIEW_KEY, role);
  } catch {
    /* private mode */
  }
}

function cloneOs(state: ClubOs): ClubOs {
  return structuredClone(state);
}

function shapeDemo(state: ClubOs): ClubOs {
  const next = cloneOs(state);
  const t12 = next.teams.find((t) => t.id === "t12s");
  const last = t12?.roster.at(-1);
  if (last && !last.withdrawn) last.withdrawn = "2026-09-10";
  const t13 = next.teams.find((t) => t.id === "t13s");
  const quiet = t13?.roster.find((p) => !p.agreement) ?? t13?.roster.at(-1);
  if (quiet?.stats) {
    quiet.stats = {
      gp: 0,
      ab: 0,
      h: 0,
      hr: 0,
      rbi: 0,
      bb: 0,
      k: 0,
      sb: 0,
      avg: 0,
      obp: 0,
      ops: 0,
      ev: 0,
      pop: null,
      velo: null,
      ip: 0,
      er: 0,
      so: 0,
      era: 0,
      whip: 0,
    };
  }
  const withdrawn = (t13?.roster || []).filter((p) => p.agreement && p !== quiet).slice(-2);
  withdrawn.forEach((p, i) => {
    p.withdrawn = i === 0 ? "2026-09-08" : "2026-09-12";
  });
  const t14 = next.teams.find((t) => t.id === "t14f");
  if (t14) {
    t14.eventBudget = 1800;
    t14.uniformDeadline = "2026-10-01";
    t14.tournamentIds = (t14.tournamentIds || []).filter((_, i) => i !== 1);
  }
  next.catalog = next.catalog.map((ev) => {
    if (/Sooner State Fall|PG Southwest|Five Tool Oklahoma/.test(ev.name)) {
      return { ...ev, stayToPlay: true };
    }
    return ev;
  });
  next.uniforms = next.uniforms.map((u) => ({ ...u, approved: true }));
  next.teams.forEach((tm) => {
    tm.roster.forEach((pl) => {
      if (pl.order?.submitted && Object.keys(pl.order.sizes || {}).length === 0) {
        const cap = tm.sport === "softball" ? "Visor" : "Cap";
        const capSize = tm.sport === "softball" ? "Adult" : "7 1/8";
        pl.order.sizes = { Jersey: "M", Pants: "M", [cap]: capSize, Belt: "Adult S/M" };
      }
    });
  });
  const head = t14?.staff.find((m) => m.role === "Head coach");
  const kid = t14?.roster.find((p) => p.coachChild === "head");
  if (t14 && head && kid) {
    head.childId = kid.id;
    head.email = t14.coachEmail;
    head.applyAmount = 0;
  }
  const assistant = t14?.staff.find((m) => m.role !== "Head coach");
  if (assistant) {
    assistant.w9 = false;
    assistant.expires = "2026-09-20";
    assistant.email = "marcus@prospectsbaseball.club";
  }
  next.teams.forEach((tm) => {
    tm.roster.forEach((pl) => {
      if (pl.agreement) {
        try {
          pl.feeLock = lockFee(next, tm, pl, next.settings.policy.version);
          pl.planLock = lockPlan(next, tm, pl);
        } catch {
          /* empty schedule still leaves a signed fee */
        }
      }
    });
  });
  if (t14?.otherCosts) {
    t14.otherCosts.fields = (Number(t14.otherCosts.fields) || 0) + 200;
    t14.otherCosts.travel = 400;
  }
  const drifted = t14?.roster.filter((p) => p.feeLock && !p.withdrawn && p.agreement);
  if (t14 && drifted?.length) {
    drifted.forEach((player) => {
      const drift = Number(feeDrift(next, t14, player)) || 0;
      if (drift !== 0) {
        player.amendments = [
          {
            status: "pending",
            delta: drift,
            note: "Club costs moved after you signed. Accept to update your fee.",
          },
        ];
      }
    });
  }
  if (t14) {
    next.reimbursements = [
      {
        id: uid(),
        teamId: t14.id,
        staffEmail: t14.coachEmail,
        amount: 180,
        date: "2026-09-08",
        note: "Hotel — Route 66 Fall Open",
        status: "paid",
        category: "hotel",
        purpose: "Overnight stay for Route 66 Fall Open",
        receipt: true,
        reportable: false,
      },
      {
        id: uid(),
        teamId: t14.id,
        staffEmail: t14.coachEmail,
        amount: 64,
        date: "2026-09-07",
        note: "Fuel to BA Sports Park",
        status: "paid",
        category: "mileage",
        purpose: "Team van to practice",
        receipt: true,
        reportable: false,
      },
      {
        id: uid(),
        teamId: t14.id,
        staffEmail: assistant?.email || "marcus@prospectsbaseball.club",
        amount: 95,
        date: "2026-09-12",
        note: "Bats for the 14U cage",
        status: "open",
        category: "equipment",
        purpose: "",
        receipt: false,
        reportable: true,
      },
    ];
    next.bookings = [{ scope: "team", ownerId: t14.id, week: "2026-09-13", hours: 2 }];
    const sess = t14.practices?.[0]?.id;
    if (sess) {
      t14.attendance = t14.attendance || {};
      t14.attendance[sess] = {};
      t14.roster.forEach((p, i) => {
        if (p.withdrawn) return;
        t14.attendance[sess][p.id] = i % 5 === 0 ? "absent" : "present";
      });
    }
  }
  next.settings.acquisitionSpend = 2400;
  next.uniformPhotos = seedPackagePhotos();
  next.purchaseOrders = [
    {
      id: "po-1042",
      number: "PO-1042",
      teamId: "t14f",
      packageId: "u-core-bb",
      supplier: "EvoShield Team Store",
      expectedDelivery: "2026-10-20",
      status: "draft",
      createdAt: "2026-09-15",
      sizeDeadline: "2026-10-01",
      kind: "season",
      reorderReason: null,
      billTo: "club",
      lines: (t14?.roster || [])
        .filter((p) => !p.withdrawn && p.order?.submitted)
        .map((p) => ({
          playerId: p.id,
          name: p.name,
          number: p.order?.number ?? p.number,
          sizes: { ...(p.order?.sizes || {}) },
        })),
    },
  ];
  next._demo = true;
  return next;
}

function demoIdentity(state: ClubOs, role: ClubRole): OsIdentity {
  const fall = state.teams.find((t) => t.id === "t14f") ?? state.teams[0];
  if (!fall) {
    return { role, email: "", familyId: null, playerId: null, teamId: null };
  }
  if (role === "admin") {
    return {
      role,
      email: "nolanmccutcheon@icloud.com",
      familyId: null,
      playerId: null,
      teamId: null,
    };
  }
  if (role === "coach") {
    return {
      role,
      email: fall.coachEmail,
      familyId: null,
      playerId: null,
      teamId: fall.id,
    };
  }
  const sibling = fall.roster[3] ?? fall.roster[0];
  if (role === "parent") {
    return {
      role,
      email: sibling?.parents?.[0]?.email ?? "",
      familyId: sibling?.familyId ?? null,
      playerId: sibling?.id ?? null,
      teamId: fall.id,
    };
  }
  const player =
    fall.roster.find((p) => p.roleType === "full" && p.coachChild !== "head") ??
    fall.roster[1] ??
    fall.roster[0];
  return {
    role,
    email: player?.email ?? "",
    familyId: player?.familyId ?? null,
    playerId: player?.id ?? null,
    teamId: fall.id,
  };
}

function identityFromUser(state: ClubOs, role: ClubRole, email: string): OsIdentity {
  const e = email.trim().toLowerCase();
  if (role === "admin") {
    return {
      role,
      email: e || "nolanmccutcheon@icloud.com",
      familyId: null,
      playerId: null,
      teamId: null,
    };
  }
  if (!e) {
    return { role, email: "", familyId: null, playerId: null, teamId: null };
  }
  if (role === "coach") {
    const team = state.teams.find(
      (t) => t.coachEmail?.toLowerCase() === e || t.staff.some((m) => m.email?.toLowerCase() === e),
    );
    return {
      role,
      email: e,
      familyId: null,
      playerId: null,
      teamId: team?.id ?? null,
    };
  }
  for (const team of state.teams) {
    for (const player of team.roster) {
      if (role === "parent" && player.parents?.some((p) => p.email?.toLowerCase() === e)) {
        return {
          role,
          email: e,
          familyId: player.familyId ?? null,
          playerId: player.id,
          teamId: team.id,
        };
      }
      if (role === "player" && player.email?.toLowerCase() === e) {
        return {
          role,
          email: e,
          familyId: player.familyId ?? null,
          playerId: player.id,
          teamId: team.id,
        };
      }
    }
  }
  return { role, email: e, familyId: null, playerId: null, teamId: null };
}

function safePrice(state: ClubOs, team: OsTeam | null): OsPrice | null {
  if (!team) return null;
  try {
    return priceTeam(state, team) as OsPrice;
  } catch {
    return null;
  }
}

function safePlan(state: ClubOs, team: OsTeam | null, player: OsPlayer | null): OsPlan | null {
  if (!team || !player) return null;
  try {
    const live = buildPlan(state, team, player) as OsPlan;
    const locked = player.planLock;
    if (!locked) return live;
    return {
      ...live,
      dep: locked.dep,
      deadline: locked.deadline ?? live.deadline,
      rows: (locked.rows || []).map((row) => ({
        label: row.label,
        due: row.due,
        amount: row.amount,
        status: live.rows.find((r) => r.label === row.label)?.status ?? "scheduled",
      })),
      locked: true,
    };
  } catch {
    return null;
  }
}

function safeGc(team: OsTeam | null): string | null {
  if (!team) return null;
  try {
    return gcUrl(team);
  } catch {
    return null;
  }
}

type TeamsContextValue = {
  state: ClubOs;
  role: ClubRole;
  identity: OsIdentity;
  perms: OsPerms;
  viewer: OsViewer;
  view: OsView;
  setRole: (role: ClubRole) => void;
  openTeam: (teamId: string, tab?: string) => void;
  openPlayer: (teamId: string, playerId: string, tab?: string) => void;
  closeRecord: () => void;
  setRecordTab: (tab: string) => void;
  teamById: (id: string | null | undefined) => OsTeam | null;
  playerById: (
    teamId: string | null | undefined,
    playerId: string | null | undefined,
  ) => OsPlayer | null;
  visibleTeams: OsTeam[];
  myPlayers: OsPlayer[];
  homeTeam: OsTeam | null;
  homePlayer: OsPlayer | null;
  priceFor: (team: OsTeam | null) => OsPrice | null;
  publishedFor: (team: OsTeam | null) => number;
  feeFor: (team: OsTeam | null, player: OsPlayer | null) => number;
  balanceFor: (team: OsTeam | null, player: OsPlayer | null) => number;
  creditsFor: (player: OsPlayer | null) => number;
  planFor: (team: OsTeam | null, player: OsPlayer | null) => OsPlan | null;
  depositAmount: (team: OsTeam | null) => number;
  chargeFor: (team: OsTeam | null) => OsDepositCharge;
  deadlineFor: (team: OsTeam | null) => string | null;
  driftFor: (team: OsTeam | null, player: OsPlayer | null) => number;
  amendmentFor: (
    player: OsPlayer | null,
  ) => { status: string; delta?: number; note?: string } | null;
  breakdownFor: (
    team: OsTeam | null,
    player: OsPlayer | null,
  ) => { total: number; lines: { label: string; amount: number }[] } | null;
  eventFor: (id: string | null | undefined) => ClubOs["catalog"][number] | null;
  gamesFor: (teamId: string) => OsGame[];
  alerts: OsAlert[];
  docsMissing: (player: OsPlayer | null) => string[];
  clearanceFor: (player: OsPlayer | null) => { ok: boolean; status: OsClearance; reason: string };
  pitchFor: (
    team: OsTeam | null,
    playerId: string | null | undefined,
  ) => {
    available: boolean;
    last: { date: string; pitches: number; event?: string } | null;
    need: number;
    readyOn: string | null;
  };
  gcFor: (team: OsTeam | null) => string | null;
  staffPay: (team: OsTeam, member: OsTeam["staff"][number]) => { season: number; cash: number };
  canSeeTeamMoney: boolean;
  canSeePublished: boolean;
  canSeeEntryFees: boolean;
  canSeeAccount: (player: OsPlayer | null) => boolean;
  canSign: (player: OsPlayer | null) => boolean;
  signSpot: (input: Omit<SignInput, "actor">) => string;
  withdrawSpot: (teamId: string, playerId: string, reason: string, forgive: boolean) => void;
  remindGroup: (teamId: string, filter: RosterFilter, names: string[]) => void;
  shareFor: (teamId: string, eventId: string) => number;
  addEvent: (teamId: string, eventId: string) => { ok: boolean; reason?: string };
  askBudget: (teamId: string, eventId: string) => void;
  cancelEvent: (teamId: string, eventId: string, reason?: string) => void;
  applyBuiltSlate: (teamId: string, ids: string[]) => void;
  previewSlate: (teamId: string, count: number) => Slate | null;
  eventFits: (teamId: string, eventId: string) => { overflow: boolean; eligible: boolean };
  setRsvp: (teamId: string, eventId: string, playerId: string, value: OsRsvp) => void;
  nudgeRsvp: (teamId: string, eventId: string) => void;
  pickPackage: (teamId: string, packageId: string) => void;
  setUniformDeadline: (teamId: string, deadline: string) => void;
  submitSizes: (
    teamId: string,
    playerId: string,
    number: number | string,
    sizes: Record<string, string>,
  ) => { ok: boolean; reason?: string };
  uploadPhoto: (packageId: string, slot: string, src: string) => void;
  approvePackage: (packageId: string, approved: boolean) => void;
  createPo: (input: {
    teamId: string;
    supplier: string;
    expectedDelivery: string;
    kind: "season" | "reorder";
    reorderReason?: "lost" | "growth" | "late-add" | null;
    billTo: "family" | "club";
    playerIds?: string[];
    force?: boolean;
  }) => { ok: boolean; warn?: boolean; missing?: string[] };
  advancePo: (poId: string) => { ok: boolean; status?: string };
  poCsv: (poId: string) => string | null;
  logPitch: (
    teamId: string,
    playerId: string,
    pitches: number,
    date: string,
    event: string,
  ) => { ok: boolean; warn: boolean; max: number };
  markAttendance: (teamId: string, sessionId: string, playerId: string, mark: OsAttend) => void;
  postAnnouncement: (
    teamId: string,
    input: {
      title: string;
      body: string;
      arrive?: string;
      uniform?: string;
      hotel?: string;
      pin?: boolean;
    },
  ) => void;
  sendFieldCall: (input: {
    teamId: string;
    practiceId?: string | null;
    status: OsFieldStatus;
    note?: string;
    newDate?: string;
    newTime?: string;
    newPlace?: string;
  }) => void;
  sendChat: (
    teamId: string,
    text: string,
    toPlayerId?: string | null,
  ) => { ok: boolean; reason?: "dm" | "empty" | "missing" };
  addPractice: (
    teamId: string,
    input: { date: string; time: string; place: string; note?: string; cageHours?: number },
  ) => void;
  bookCage: (input: {
    scope: "team" | "player";
    ownerId: string;
    hours: number;
    noShow?: boolean;
  }) => { ok: boolean; overage: boolean; used: number; allowance: number };
  markNoShow: (input: { scope: "team" | "player"; ownerId: string }) => { ok: boolean };
  startGame: (
    teamId: string,
    input: { opponent: string; event?: string; field?: string; time?: string },
  ) => void;
  tapRun: (gameId: string, who: "us" | "them") => void;
  advanceHalf: (gameId: string) => void;
  postFinal: (gameId: string) => void;
  canSeeCageRate: boolean;
  payBalance: (input: {
    teamId: string;
    playerId: string;
    amount: number;
    method: OsPayMethod;
    label?: string;
  }) => { ok: boolean; reason?: string; receipt?: string };
  enrollDraft: (teamId: string, playerId: string) => { ok: boolean; reason?: "backup" | "missing" };
  acceptAmendment: (teamId: string, playerId: string) => { ok: boolean };
  questionAmendment: (teamId: string, playerId: string) => { ok: boolean };
  issueAmendments: (teamId: string, playerIds: string[] | "all") => { ok: boolean; count: number };
  uploadDoc: (teamId: string, playerId: string, key: string) => void;
  setPrefs: (teamId: string, playerId: string, prefs: { email: boolean; sms: boolean }) => void;
  reenroll: (teamId: string, playerId: string, status: "accepted" | "declined") => void;
  setProfile: (teamId: string, playerId: string, input: { enabled: boolean; bio: string }) => void;
  waiveUniform: (teamId: string, playerId: string) => void;
  recordOfficePay: (input: {
    teamId: string;
    playerId: string;
    amount: number;
    method: OsPayMethod;
  }) => { ok: boolean; reason?: string };
  closeSeason: (
    teamId: string,
    actuals: Record<string, number>,
  ) => { ok: boolean; realized: number };
  cashFlowFor: (team: OsTeam | null) => ReturnType<typeof cashFlowForTeam> | null;
  collectionsFor: (team?: OsTeam | null) => ReturnType<typeof collectionsOf>;
  electPay: (
    teamId: string,
    staffId: string,
    applyAmount: number,
  ) => { ok: boolean; applied: number; cash: number; gross: number };
  recordPayout: (
    teamId: string,
    staffId: string,
    amount: number,
  ) => { ok: boolean; reason?: "missing" | "w9" };
  addReimbursement: (input: {
    teamId: string;
    staffEmail: string;
    amount: number;
    date: string;
    note: string;
    category: PayCategory;
    purpose: string;
    receipt: boolean;
  }) => { ok: boolean; reportable: boolean };
  setLeadStage: (leadId: string, status: LeadStage) => void;
  setLeadScores: (leadId: string, scores: Partial<Record<GradeKey, number>>) => void;
  makeOffer: (leadId: string, teamId: string) => { ok: boolean; inviteId?: string };
  waitlistLead: (leadId: string) => void;
  acceptLead: (leadId: string) => void;
  chaseAgreements: () => { ok: boolean; count: number };
  publishPolicy: (text: string) => { ok: boolean; version: number };
  toggleAutomation: (id: AutomationId, on: boolean) => void;
  runAutomation: (id: AutomationId) => { ok: boolean; reached: number };
  undoLabel: string | null;
  undoLast: () => void;
  notes: ClubOs["notifications"];
  teamTabs: (typeof TEAM_RECORD_TABS)[number][];
  playerTabs: (typeof PLAYER_RECORD_TABS)[number][];
  docLabels: Record<string, string>;
  pitchLimit: Record<string, number>;
  coachScopeReport: ReturnType<typeof inspectCoachScope> | null;
};

const TeamsContext = createContext<TeamsContextValue | null>(null);

export function TeamsProvider({
  profileRole,
  profileEmail = "",
  children,
}: {
  profileRole: ClubRole | null;
  profileEmail?: string | null;
  children: ReactNode;
}) {
  const signedRole = profileRole ?? "parent";
  const [preview, setPreview] = useState<ClubRole>(() =>
    typeof window === "undefined" ? signedRole : readPreviewRole(signedRole),
  );
  const role = TEAMS_OS.showRoleSwitcher ? preview : signedRole;
  const [view, setView] = useState<OsView>({ kind: "desk" });
  const [club, setClub] = useState<ClubOs>(() => shapeDemo(seedState() as ClubOs));
  const [undo, setUndo] = useState<{ snapshot: ClubOs; label: string } | null>(null);

  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => setUndo(null), 8000);
    return () => window.clearTimeout(id);
  }, [undo]);

  const identity = useMemo(
    () =>
      TEAMS_OS.showRoleSwitcher
        ? demoIdentity(club, role)
        : identityFromUser(club, role, profileEmail || ""),
    [club, role, profileEmail],
  );
  const access = useMemo(() => perms(role) as OsPerms, [role]);
  const rawAlerts = useMemo(() => {
    try {
      return alertsForRole(club, role, identity);
    } catch {
      return [];
    }
  }, [club, role, identity]);
  const scoped = useMemo(() => scopeClub(club, identity, rawAlerts), [club, identity, rawAlerts]);
  const state = scoped.state;
  const viewer = scoped.viewer;
  const alerts = scoped.alerts;

  useEffect(() => {
    if (identity.role !== "coach" || !TEAMS_OS.showRoleSwitcher) return;
    const report = inspectCoachScope(state);
    console.info("[teams-os] coach data layer", report);
  }, [identity.role, state]);

  const setRole = useCallback((next: ClubRole) => {
    setPreview(next);
    writePreviewRole(next);
    setView({ kind: "desk" });
  }, []);

  const openTeam = useCallback(
    (teamId: string, tab = "overview") => {
      if (!requestTeam(club, identity, teamId)) return;
      setView({ kind: "team", teamId, tab });
    },
    [club, identity],
  );

  const openPlayer = useCallback(
    (teamId: string, playerId: string, tab = "profile") => {
      if (!requestPlayer(club, identity, teamId, playerId)) return;
      setView({ kind: "player", teamId, playerId, tab });
    },
    [club, identity],
  );

  const closeRecord = useCallback(() => setView({ kind: "desk" }), []);

  const setRecordTab = useCallback((tab: string) => {
    setView((cur) => {
      if (cur.kind === "team") return { ...cur, tab };
      if (cur.kind === "player") return { ...cur, tab };
      return cur;
    });
  }, []);

  const teamById = useCallback(
    (id: string | null | undefined) => state.teams.find((t) => t.id === id) ?? null,
    [state.teams],
  );

  const playerById = useCallback(
    (teamId: string | null | undefined, playerId: string | null | undefined) => {
      const team = state.teams.find((t) => t.id === teamId);
      return team?.roster.find((p) => p.id === playerId) ?? null;
    },
    [state.teams],
  );

  const rawTeam = useCallback(
    (id: string | null | undefined) => club.teams.find((t) => t.id === id) ?? null,
    [club.teams],
  );
  const rawPlayer = useCallback(
    (teamId: string | null | undefined, playerId: string | null | undefined) => {
      const team = club.teams.find((t) => t.id === teamId);
      return team?.roster.find((p) => p.id === playerId) ?? null;
    },
    [club.teams],
  );

  const visibleTeams = state.teams;
  const homeTeam = teamById(identity.teamId) ?? visibleTeams[0] ?? null;
  const homePlayer =
    playerById(identity.teamId, identity.playerId) ??
    (identity.familyId
      ? (visibleTeams.flatMap((t) => t.roster).find((p) => p.familyId === identity.familyId) ??
        null)
      : null);

  const myPlayers = useMemo(() => {
    if (!identity.familyId) return homePlayer ? [homePlayer] : [];
    return visibleTeams.flatMap((t) =>
      t.roster.filter((p) => p.familyId === identity.familyId && !p.withdrawn),
    );
  }, [visibleTeams, identity.familyId, homePlayer]);

  const canSeeTeamMoney = access.seeTeamMoney;
  const canSeePublished = access.admin || access.coach;
  const canSeeEntryFees = access.admin;

  const canSeeAccount = useCallback(
    (player: OsPlayer | null) => {
      if (!player) return false;
      if (access.player) return false;
      if (access.admin) return true;
      if (access.parent && identity.familyId && player.familyId === identity.familyId) {
        return true;
      }
      return false;
    },
    [access.admin, access.parent, access.player, identity.familyId],
  );

  const canSign = useCallback(
    (player: OsPlayer | null) => {
      if (!player || player.agreement) return false;
      if (access.admin) return true;
      if (access.parent && identity.familyId && player.familyId === identity.familyId) {
        return true;
      }
      return false;
    },
    [access.admin, access.parent, identity.familyId],
  );

  const priceFor = useCallback(
    (team: OsTeam | null) => {
      if (!team) return null;
      if (access.player) return null;
      if (access.parent) return null;
      const source = rawTeam(team.id);
      if (!source) return null;
      if (access.coach) {
        const published = viewer.publishedByTeam[team.id] || 0;
        const entry = viewer.entryByTeam[team.id];
        return {
          published,
          entryFees: entry?.spent || 0,
          evs: [],
          other: 0,
          direct: 0,
          contingency: 0,
          protectedBudget: 0,
          months: 0,
          perPlayerTeam: 0,
          coachTotal: 0,
          coachPerPlayer: 0,
          membershipPerPlayer: 0,
          uniformCost: 0,
          orgFee: 0,
          raw: 0,
          publishedNoUniform: 0,
          roster: source.roster.filter((p) => !p.withdrawn).length,
          fundedPlayers: 0,
          revenue: 0,
          creditsGiven: 0,
          sponsorIncome: 0,
          uniformActual: 0,
          facility: 0,
          margin: 0,
          forecastMargin: 0,
          realizedMargin: null,
          actualSpend: null,
          closed: null,
          pkg: undefined,
        } as OsPrice;
      }
      return safePrice(club, source);
    },
    [access.player, access.parent, access.coach, rawTeam, viewer, club],
  );

  const publishedFor = useCallback(
    (team: OsTeam | null) => {
      if (!team || !canSeePublished) return 0;
      return viewer.publishedByTeam[team.id] || 0;
    },
    [canSeePublished, viewer],
  );

  const feeFor = useCallback(
    (team: OsTeam | null, player: OsPlayer | null) => {
      if (!team || !player || access.player) return 0;
      if (access.coach) {
        return viewer.ownChild?.playerId === player.id ? viewer.ownChild.fee : 0;
      }
      if (access.parent && player.familyId !== identity.familyId) return 0;
      const sourceTeam = rawTeam(team.id);
      const sourcePlayer = rawPlayer(team.id, player.id);
      if (!sourceTeam || !sourcePlayer) return 0;
      try {
        return Number(playerFee(club, sourceTeam, sourcePlayer)) || 0;
      } catch {
        return 0;
      }
    },
    [
      access.player,
      access.coach,
      access.parent,
      identity.familyId,
      viewer,
      rawTeam,
      rawPlayer,
      club,
    ],
  );

  const balanceFor = useCallback(
    (team: OsTeam | null, player: OsPlayer | null) => {
      if (!team || !player || access.player || access.coach) return 0;
      if (access.parent && player.familyId !== identity.familyId) return 0;
      const sourceTeam = rawTeam(team.id);
      const sourcePlayer = rawPlayer(team.id, player.id);
      if (!sourceTeam || !sourcePlayer) return 0;
      try {
        return Number(playerBalance(club, sourceTeam, sourcePlayer)) || 0;
      } catch {
        return 0;
      }
    },
    [access.player, access.coach, access.parent, identity.familyId, rawTeam, rawPlayer, club],
  );

  const planFor = useCallback(
    (team: OsTeam | null, player: OsPlayer | null) => {
      if (!canSeeAccount(player)) return null;
      const sourceTeam = rawTeam(team?.id);
      const sourcePlayer = rawPlayer(team?.id, player?.id);
      return safePlan(club, sourceTeam, sourcePlayer);
    },
    [canSeeAccount, rawTeam, rawPlayer, club],
  );

  const creditsFor = useCallback(
    (player: OsPlayer | null) => {
      if (!player || access.player || access.coach) return 0;
      if (access.parent && player.familyId !== identity.familyId) return 0;
      const source = rawPlayer(player.teamId, player.id);
      if (!source) return 0;
      try {
        return Number(creditTotal(source)) || 0;
      } catch {
        return 0;
      }
    },
    [access.player, access.coach, access.parent, identity.familyId, rawPlayer],
  );

  const depositAmount = useCallback(
    (team: OsTeam | null) => {
      if (!team || access.player) return 0;
      if (access.coach) return 0;
      const source = rawTeam(team.id);
      if (!source) return 0;
      try {
        return Number(depositFor(club, source, null)) || 0;
      } catch {
        return 0;
      }
    },
    [access.player, access.coach, rawTeam, club],
  );

  const chargeFor = useCallback(
    (team: OsTeam | null): OsDepositCharge => {
      const empty = { amount: 0, fee: 0, totalCharged: 0 };
      if (!team || access.player) return empty;
      const source = rawTeam(team.id);
      if (!source) return empty;
      try {
        return depositChargeFor(club, source);
      } catch {
        return empty;
      }
    },
    [access.player, rawTeam, club],
  );

  const deadlineFor = useCallback(
    (team: OsTeam | null) => {
      if (!team || access.player) return null;
      const source = rawTeam(team.id);
      if (!source) return null;
      try {
        const due = payoffDeadline(club, source);
        return due ? fmtDate(iso(due)) : null;
      } catch {
        return null;
      }
    },
    [access.player, rawTeam, club],
  );

  const driftFor = useCallback(
    (team: OsTeam | null, player: OsPlayer | null) => {
      if (!canSeeAccount(player) || !team || !player) return 0;
      const sourceTeam = rawTeam(team.id);
      const sourcePlayer = rawPlayer(team.id, player.id);
      if (!sourceTeam || !sourcePlayer) return 0;
      try {
        return Number(feeDrift(club, sourceTeam, sourcePlayer)) || 0;
      } catch {
        return 0;
      }
    },
    [canSeeAccount, rawTeam, rawPlayer, club],
  );

  const amendmentFor = useCallback(
    (player: OsPlayer | null) => {
      if (!canSeeAccount(player) || !player) return null;
      const source = rawPlayer(player.teamId, player.id);
      if (!source) return null;
      try {
        return pendingAmendment(source) ?? null;
      } catch {
        return null;
      }
    },
    [canSeeAccount, rawPlayer],
  );

  const breakdownFor = useCallback(
    (team: OsTeam | null, player: OsPlayer | null) => {
      if (!canSeeAccount(player) || !team || !player) return null;
      const sourceTeam = rawTeam(team.id);
      const sourcePlayer = rawPlayer(team.id, player.id);
      if (!sourceTeam || !sourcePlayer) return null;
      try {
        return feeBreakdown(club, sourceTeam, sourcePlayer);
      } catch {
        return null;
      }
    },
    [canSeeAccount, rawTeam, rawPlayer, club],
  );

  const eventFor = useCallback(
    (id: string | null | undefined) => {
      if (!id) return null;
      try {
        return (eventById(state, id) as ClubOs["catalog"][number]) ?? null;
      } catch {
        return null;
      }
    },
    [state],
  );

  const gamesFor = useCallback(
    (teamId: string) => state.games.filter((g) => g.teamId === teamId),
    [state.games],
  );

  const docsMissing = useCallback((player: OsPlayer | null) => {
    if (!player) return [];
    try {
      return (missingDocs(player) as string[]) ?? [];
    } catch {
      return [];
    }
  }, []);

  const clearanceFor = useCallback((player: OsPlayer | null) => {
    if (!player) return { ok: false, status: "unsigned" as OsClearance, reason: "—" };
    return clearanceOf(player);
  }, []);

  const pitchFor = useCallback((team: OsTeam | null, playerId: string | null | undefined) => {
    if (!team || !playerId) {
      return { available: true, last: null, need: 0, readyOn: null };
    }
    try {
      return pitcherStatus(team, playerId);
    } catch {
      return { available: true, last: null, need: 0, readyOn: null };
    }
  }, []);

  const teamTabs = useMemo(
    () => TEAM_RECORD_TABS.filter((tab) => !("money" in tab && tab.money) || canSeeTeamMoney),
    [canSeeTeamMoney],
  );

  const playerTabs = useMemo(
    () =>
      PLAYER_RECORD_TABS.filter((tab) => {
        if (tab.id === "account") return access.seeOwnMoney && access.seeAnyPrice;
        return true;
      }),
    [access.seeOwnMoney, access.seeAnyPrice],
  );

  const signSpot = useCallback(
    (input: Omit<SignInput, "actor">) => {
      if (!requestTeam(club, identity, input.teamId)) return input.playerId || "";
      if (input.playerId && !requestPlayer(club, identity, input.teamId, input.playerId)) {
        return input.playerId;
      }
      let playerId = input.playerId || "";
      setClub((prev) => {
        const next = cloneOs(prev);
        const result = applySign(next, { ...input, actor: identity.email || role });
        playerId = result.playerId;
        return result.club;
      });
      return playerId;
    },
    [identity.email, identity, role, club],
  );

  const withdrawSpot = useCallback(
    (teamId: string, playerId: string, reason: string, forgive: boolean) => {
      if (!requestPlayer(club, identity, teamId, playerId)) return;
      setUndo({ snapshot: cloneOs(club), label: "Withdraw player" });
      setClub((prev) => {
        const next = cloneOs(prev);
        return applyWithdraw(next, teamId, playerId, identity.email || role, reason, forgive);
      });
    },
    [identity.email, identity, role, club],
  );

  const remindGroup = useCallback(
    (teamId: string, filter: RosterFilter, names: string[]) => {
      if (!requestTeam(club, identity, teamId)) return;
      setClub((prev) => {
        const next = cloneOs(prev);
        return applyRemind(next, teamId, filter, names, identity.email || role);
      });
    },
    [identity.email, identity, role, club],
  );

  const actor = identity.email || role;

  const shareFor = useCallback(
    (teamId: string, eventId: string) => viewer.eventShareByTeam[teamId]?.[eventId] || 0,
    [viewer.eventShareByTeam],
  );

  const addEvent = useCallback(
    (teamId: string, eventId: string) => {
      if (!requestTeam(club, identity, teamId)) return { ok: false as const, reason: "forbidden" };
      const next = cloneOs(club);
      const result = applyAddEvent(next, teamId, eventId, actor);
      if (result.ok) {
        applyIssueAmendments(next, teamId, "all", actor);
        setClub(next);
      }
      return result;
    },
    [actor, club, identity],
  );

  const askBudget = useCallback(
    (teamId: string, eventId: string) => {
      if (!requestTeam(club, identity, teamId)) return;
      setClub((prev) => applyAskBudget(cloneOs(prev), teamId, eventId, actor));
    },
    [actor, club, identity],
  );

  const cancelEvent = useCallback(
    (teamId: string, eventId: string, reason = "Cancelled") => {
      if (!requestTeam(club, identity, teamId)) return;
      setUndo({ snapshot: cloneOs(club), label: "Cancel event" });
      setClub((prev) => applyCancelEvent(cloneOs(prev), teamId, eventId, actor, reason).club);
    },
    [actor, club, identity],
  );

  const applyBuiltSlate = useCallback(
    (teamId: string, ids: string[]) => {
      if (!requestTeam(club, identity, teamId)) return;
      setClub((prev) => applySlate(cloneOs(prev), teamId, ids, actor));
    },
    [actor, club, identity],
  );

  const previewSlate = useCallback(
    (teamId: string, count: number): Slate | null => {
      const team = requestTeam(club, identity, teamId);
      if (!team) return null;
      return buildSlate(club.catalog, team, count);
    },
    [club, identity],
  );

  const eventFits = useCallback(
    (teamId: string, eventId: string) => {
      const team = requestTeam(club, identity, teamId);
      const event = club.catalog.find((e) => e.id === eventId);
      if (!team || !event) return { overflow: false, eligible: false };
      return {
        eligible: eventEligible(event, team),
        overflow: wouldOverflow(team, club.catalog, event),
      };
    },
    [club, identity],
  );

  const setRsvp = useCallback(
    (teamId: string, eventId: string, playerId: string, value: OsRsvp) => {
      if (!requestPlayer(club, identity, teamId, playerId)) return;
      setClub((prev) => applyRsvp(cloneOs(prev), teamId, eventId, playerId, value));
    },
    [club, identity],
  );

  const nudgeRsvp = useCallback(
    (teamId: string, eventId: string) => {
      if (!requestTeam(club, identity, teamId)) return;
      setClub((prev) => applyNudgeRsvp(cloneOs(prev), teamId, eventId, actor));
    },
    [actor, club, identity],
  );

  const pickPackage = useCallback(
    (teamId: string, packageId: string) => {
      if (!requestTeam(club, identity, teamId)) return;
      setClub((prev) => applyPickPackage(cloneOs(prev), teamId, packageId, actor));
    },
    [actor, club, identity],
  );

  const setUniformDeadline = useCallback(
    (teamId: string, deadline: string) => {
      if (!requestTeam(club, identity, teamId)) return;
      setClub((prev) => applySetDeadline(cloneOs(prev), teamId, deadline, actor));
    },
    [actor, club, identity],
  );

  const submitSizes = useCallback(
    (teamId: string, playerId: string, number: number | string, sizes: Record<string, string>) => {
      if (!requestPlayer(club, identity, teamId, playerId)) return { ok: false as const };
      const next = cloneOs(club);
      const result = applySubmitSizes(next, teamId, playerId, number, sizes);
      if (result.ok) setClub(next);
      return result;
    },
    [club, identity],
  );

  const uploadPhoto = useCallback(
    (packageId: string, slot: string, src: string) => {
      setClub((prev) => applyUploadPhoto(cloneOs(prev), packageId, slot, src, actor));
    },
    [actor],
  );

  const approvePackage = useCallback(
    (packageId: string, approved: boolean) => {
      setClub((prev) => applyApprovePackage(cloneOs(prev), packageId, approved, actor));
    },
    [actor],
  );

  const createPo = useCallback(
    (input: {
      teamId: string;
      supplier: string;
      expectedDelivery: string;
      kind: "season" | "reorder";
      reorderReason?: "lost" | "growth" | "late-add" | null;
      billTo: "family" | "club";
      playerIds?: string[];
      force?: boolean;
    }) => {
      if (!requestTeam(club, identity, input.teamId))
        return { ok: false, warn: false, missing: [] as string[] };
      const next = cloneOs(club);
      const made = applyCreatePo(next, { ...input, actor });
      if (made.ok) setClub(next);
      return { ok: made.ok, warn: made.warn, missing: made.missing };
    },
    [actor, club, identity],
  );

  const advancePo = useCallback(
    (poId: string) => {
      const next = cloneOs(club);
      const result = applyAdvancePo(next, poId, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club],
  );

  const poCsv = useCallback(
    (poId: string) => {
      const po = (club.purchaseOrders || []).find((p) => p.id === poId);
      if (!po) return null;
      return exportPoCsv(club, po);
    },
    [club],
  );

  const logPitch = useCallback(
    (teamId: string, playerId: string, pitches: number, date: string, event: string) => {
      if (!requestPlayer(club, identity, teamId, playerId))
        return { ok: false as const, warn: false, max: 0 };
      const next = cloneOs(club);
      const result = applyLogPitch(next, teamId, playerId, pitches, date, event, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club, identity],
  );

  const markAttendance = useCallback(
    (teamId: string, sessionId: string, playerId: string, mark: OsAttend) => {
      if (!requestPlayer(club, identity, teamId, playerId)) return;
      setClub((prev) => applyMarkAttendance(cloneOs(prev), teamId, sessionId, playerId, mark));
    },
    [club, identity],
  );

  const postAnnouncement = useCallback(
    (
      teamId: string,
      input: {
        title: string;
        body: string;
        arrive?: string;
        uniform?: string;
        hotel?: string;
        pin?: boolean;
      },
    ) => {
      if (!requestTeam(club, identity, teamId)) return;
      setClub((prev) => applyAnnouncement(cloneOs(prev), teamId, { ...input, actor }));
    },
    [actor, club, identity],
  );

  const sendFieldCall = useCallback(
    (input: {
      teamId: string;
      practiceId?: string | null;
      status: OsFieldStatus;
      note?: string;
      newDate?: string;
      newTime?: string;
      newPlace?: string;
    }) => {
      if (!requestTeam(club, identity, input.teamId)) return;
      setClub((prev) => applyFieldCall(cloneOs(prev), { ...input, actor }));
    },
    [actor, club, identity],
  );

  const sendChat = useCallback(
    (teamId: string, text: string, toPlayerId?: string | null) => {
      if (!requestTeam(club, identity, teamId))
        return { ok: false as const, reason: "missing" as const };
      if (toPlayerId) return { ok: false as const, reason: "dm" as const };
      const next = cloneOs(club);
      const result = applyChat(next, teamId, {
        author: identity.email || role,
        role,
        text,
        toPlayerId,
      });
      if (result.ok) setClub(next);
      return result;
    },
    [club, identity, role],
  );

  const addPractice = useCallback(
    (
      teamId: string,
      input: { date: string; time: string; place: string; note?: string; cageHours?: number },
    ) => {
      if (!requestTeam(club, identity, teamId)) return;
      setClub((prev) => applyAddPractice(cloneOs(prev), teamId, { ...input, actor }));
    },
    [actor, club, identity],
  );

  const bookCage = useCallback(
    (input: { scope: "team" | "player"; ownerId: string; hours: number; noShow?: boolean }) => {
      const next = cloneOs(club);
      const result = applyBookCage(next, { ...input, actor });
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club],
  );

  const markNoShow = useCallback(
    (input: { scope: "team" | "player"; ownerId: string }) => {
      const next = cloneOs(club);
      const result = applyMarkNoShow(next, { ...input, actor });
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club],
  );

  const startGame = useCallback(
    (
      teamId: string,
      input: { opponent: string; event?: string; field?: string; time?: string },
    ) => {
      if (!requestTeam(club, identity, teamId)) return;
      setClub((prev) => applyStartGame(cloneOs(prev), teamId, { ...input, actor }));
    },
    [actor, club, identity],
  );

  const tapRun = useCallback(
    (gameId: string, who: "us" | "them") => {
      const game = club.games.find((g) => g.id === gameId);
      if (game && !requestTeam(club, identity, game.teamId)) return;
      setClub((prev) => applyTapRun(cloneOs(prev), gameId, who));
    },
    [club, identity],
  );

  const advanceHalf = useCallback(
    (gameId: string) => {
      const game = club.games.find((g) => g.id === gameId);
      if (game && !requestTeam(club, identity, game.teamId)) return;
      setClub((prev) => applyAdvanceHalf(cloneOs(prev), gameId));
    },
    [club, identity],
  );

  const postFinal = useCallback(
    (gameId: string) => {
      const game = club.games.find((g) => g.id === gameId);
      if (game && !requestTeam(club, identity, game.teamId)) return;
      setClub((prev) => applyPostFinal(cloneOs(prev), gameId, actor));
    },
    [actor, club, identity],
  );

  const canSeeCageRate = access.admin || access.parent;

  const payBalance = useCallback(
    (input: {
      teamId: string;
      playerId: string;
      amount: number;
      method: OsPayMethod;
      label?: string;
    }) => {
      if (!requestPlayer(club, identity, input.teamId, input.playerId)) {
        return { ok: false, reason: "forbidden" };
      }
      return {
        ok: false,
        reason: "Payment must be confirmed by Square. Contact the office for a verified invoice.",
      };
    },
    [club, identity],
  );

  const enrollDraft = useCallback(
    (teamId: string, playerId: string) => {
      if (!requestPlayer(club, identity, teamId, playerId)) return { ok: false as const };
      const next = cloneOs(club);
      const result = applyEnrollDraft(next, teamId, playerId, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club, identity],
  );

  const acceptAmendment = useCallback(
    (teamId: string, playerId: string) => {
      if (!requestPlayer(club, identity, teamId, playerId)) return { ok: false as const };
      const next = cloneOs(club);
      const result = applyAcceptAmendment(next, teamId, playerId, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club, identity],
  );

  const questionAmendment = useCallback(
    (teamId: string, playerId: string) => {
      if (!requestPlayer(club, identity, teamId, playerId)) return { ok: false as const };
      const next = cloneOs(club);
      const result = applyQuestionAmendment(next, teamId, playerId, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club, identity],
  );

  const issueAmendments = useCallback(
    (teamId: string, playerIds: string[] | "all") => {
      if (!requestTeam(club, identity, teamId)) return { ok: false as const, count: 0 };
      const next = cloneOs(club);
      const result = applyIssueAmendments(next, teamId, playerIds, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club, identity],
  );

  const uploadDoc = useCallback(
    (teamId: string, playerId: string, key: string) => {
      if (!requestPlayer(club, identity, teamId, playerId)) return;
      setClub((prev) => applyUploadDoc(cloneOs(prev), teamId, playerId, key, actor));
    },
    [actor, club, identity],
  );

  const setPrefs = useCallback(
    (teamId: string, playerId: string, prefs: { email: boolean; sms: boolean }) => {
      if (!requestPlayer(club, identity, teamId, playerId)) return;
      setClub((prev) => applySetPrefs(cloneOs(prev), teamId, playerId, prefs));
    },
    [club, identity],
  );

  const reenroll = useCallback(
    (teamId: string, playerId: string, status: "accepted" | "declined") => {
      if (!requestPlayer(club, identity, teamId, playerId)) return;
      setClub((prev) => applyReenroll(cloneOs(prev), teamId, playerId, status, actor));
    },
    [actor, club, identity],
  );

  const setProfile = useCallback(
    (teamId: string, playerId: string, input: { enabled: boolean; bio: string }) => {
      if (!requestPlayer(club, identity, teamId, playerId)) return;
      setClub((prev) => applySetProfile(cloneOs(prev), teamId, playerId, input));
    },
    [club, identity],
  );

  const waiveUniform = useCallback(
    (teamId: string, playerId: string) => {
      if (!requestPlayer(club, identity, teamId, playerId)) return;
      setUndo({ snapshot: cloneOs(club), label: "Waive uniform" });
      setClub((prev) => applyWaiveUniform(cloneOs(prev), teamId, playerId, actor));
    },
    [actor, club, identity],
  );

  const recordOfficePay = useCallback(
    (input: { teamId: string; playerId: string; amount: number; method: OsPayMethod }) => {
      if (identity.role !== "admin") return { ok: false, reason: "forbidden" };
      const next = cloneOs(club);
      const result = applyRecordOfficePay(next, { ...input, actor });
      if (result.ok) setClub(next);
      return { ok: result.ok, reason: result.reason };
    },
    [actor, club, identity.role],
  );

  const closeSeason = useCallback(
    (teamId: string, actuals: Record<string, number>) => {
      if (identity.role !== "admin") return { ok: false as const, realized: 0 };
      const next = cloneOs(club);
      const result = applyCloseSeason(next, teamId, actuals, actor);
      if (result.ok) {
        setUndo({ snapshot: cloneOs(club), label: "Close season" });
        setClub(next);
      }
      return result;
    },
    [actor, club, identity.role],
  );

  const cashFlowFor = useCallback(
    (team: OsTeam | null) => {
      if (!team || identity.role !== "admin") return null;
      const source = rawTeam(team.id);
      if (!source) return null;
      return cashFlowForTeam(club, source);
    },
    [club, rawTeam, identity.role],
  );

  const collectionsFor = useCallback(
    (team?: OsTeam | null) => {
      if (identity.role !== "admin") return [];
      const source = team ? rawTeam(team.id) : null;
      return collectionsOf(club, source);
    },
    [club, rawTeam, identity.role],
  );

  const electPay = useCallback(
    (teamId: string, staffId: string, applyAmount: number) => {
      if (!requestTeam(club, identity, teamId))
        return { ok: false as const, applied: 0, cash: 0, gross: 0 };
      const next = cloneOs(club);
      const result = applyElectPay(next, teamId, staffId, applyAmount, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club, identity],
  );

  const recordPayout = useCallback(
    (teamId: string, staffId: string, amount: number) => {
      if (identity.role !== "admin") return { ok: false as const, reason: "missing" as const };
      const next = cloneOs(club);
      const result = applyRecordPayout(next, teamId, staffId, amount, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club, identity.role],
  );

  const addReimbursement = useCallback(
    (input: {
      teamId: string;
      staffEmail: string;
      amount: number;
      date: string;
      note: string;
      category: PayCategory;
      purpose: string;
      receipt: boolean;
    }) => {
      if (!requestTeam(club, identity, input.teamId))
        return { ok: false as const, reportable: false };
      const next = cloneOs(club);
      const result = applyAddReimbursement(next, input, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club, identity],
  );

  const setLeadStage = useCallback(
    (leadId: string, status: LeadStage) => {
      if (identity.role !== "admin") return;
      setClub((prev) => {
        const next = cloneOs(prev);
        applySetLeadStage(next, leadId, status, actor);
        return next;
      });
    },
    [actor, identity.role],
  );

  const setLeadScores = useCallback(
    (leadId: string, scores: Partial<Record<GradeKey, number>>) => {
      if (identity.role !== "admin") return;
      setClub((prev) => {
        const next = cloneOs(prev);
        applySetLeadScores(next, leadId, scores, actor);
        return next;
      });
    },
    [actor, identity.role],
  );

  const makeOffer = useCallback(
    (leadId: string, teamId: string) => {
      if (identity.role !== "admin") return { ok: false as const };
      const next = cloneOs(club);
      const result = applyMakeOffer(next, leadId, teamId, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club, identity.role],
  );

  const waitlistLead = useCallback(
    (leadId: string) => {
      if (identity.role !== "admin") return;
      setUndo({ snapshot: cloneOs(club), label: "Waitlist player" });
      setClub((prev) => {
        const next = cloneOs(prev);
        applyWaitlist(next, leadId, actor);
        return next;
      });
    },
    [actor, club, identity.role],
  );

  const acceptLead = useCallback(
    (leadId: string) => {
      if (identity.role !== "admin") return;
      setClub((prev) => {
        const next = cloneOs(prev);
        applyAcceptLead(next, leadId, actor);
        return next;
      });
    },
    [actor, identity.role],
  );

  const chaseAgreements = useCallback(() => {
    if (identity.role !== "admin") return { ok: false as const, count: 0 };
    const next = cloneOs(club);
    const result = applyChaseAgreements(next, actor);
    setClub(next);
    return result;
  }, [actor, club, identity.role]);

  const publishPolicy = useCallback(
    (text: string) => {
      if (identity.role !== "admin") return { ok: false as const, version: 0 };
      const next = cloneOs(club);
      const result = applyPublishPolicy(next, text, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club, identity.role],
  );

  const toggleAutomation = useCallback(
    (id: AutomationId, on: boolean) => {
      if (identity.role !== "admin") return;
      setClub((prev) => applyToggleAutomation(cloneOs(prev), id, on, actor));
    },
    [actor, identity.role],
  );

  const runAutomation = useCallback(
    (id: AutomationId) => {
      if (identity.role !== "admin") return { ok: false, reached: 0 };
      const next = cloneOs(club);
      const result = applyRunAutomation(next, id, actor);
      if (result.ok) setClub(next);
      return result;
    },
    [actor, club, identity.role],
  );

  const undoLast = useCallback(() => {
    if (!undo) return;
    setClub(undo.snapshot);
    setUndo(null);
  }, [undo]);

  const notes = useMemo(() => {
    const audience =
      role === "admin"
        ? "admin"
        : role === "coach"
          ? "coach"
          : role === "parent"
            ? "family"
            : "all";
    const rows = (visibleNotes(state, audience) as ClubOs["notifications"]) || [];
    return rows
      .filter((n) => {
        if (role === "admin") return true;
        if (n.kind === "money" || n.kind === "Money") return false;
        if (role === "player" && moneyCopyLeak(`${n.title} ${n.body}`)) return false;
        if (role === "coach" && /\$|usd|entry fee/i.test(`${n.title} ${n.body}`)) {
          return false;
        }
        if (!n.teamId) return true;
        return visibleTeams.some((t) => t.id === n.teamId);
      })
      .slice(0, 12);
  }, [state, role, visibleTeams]);

  const coachScopeReport = identity.role === "coach" ? inspectCoachScope(state) : null;

  const value: TeamsContextValue = {
    state,
    role,
    identity,
    perms: access,
    viewer,
    view,
    setRole,
    openTeam,
    openPlayer,
    closeRecord,
    setRecordTab,
    teamById,
    playerById,
    visibleTeams,
    myPlayers,
    homeTeam,
    homePlayer,
    priceFor,
    publishedFor,
    feeFor,
    balanceFor,
    creditsFor,
    planFor,
    depositAmount,
    chargeFor,
    deadlineFor,
    driftFor,
    amendmentFor,
    breakdownFor,
    eventFor,
    gamesFor,
    alerts,
    docsMissing,
    clearanceFor,
    pitchFor,
    gcFor: safeGc,
    staffPay: (team, member) => {
      const source = rawTeam(team.id);
      const staff = source?.staff.find((m) => m.id === member.id) ?? member;
      const t = source ?? team;
      return {
        season: Number(staffSeasonPay(t, staff)) || 0,
        cash: Number(staffCash(t, staff)) || 0,
      };
    },
    canSeeTeamMoney,
    canSeePublished,
    canSeeEntryFees,
    canSeeAccount,
    canSign,
    signSpot,
    withdrawSpot,
    remindGroup,
    shareFor,
    addEvent,
    askBudget,
    cancelEvent,
    applyBuiltSlate,
    previewSlate,
    eventFits,
    setRsvp,
    nudgeRsvp,
    pickPackage,
    setUniformDeadline,
    submitSizes,
    uploadPhoto,
    approvePackage,
    createPo,
    advancePo,
    poCsv,
    logPitch,
    markAttendance,
    postAnnouncement,
    sendFieldCall,
    sendChat,
    addPractice,
    bookCage,
    markNoShow,
    startGame,
    tapRun,
    advanceHalf,
    postFinal,
    canSeeCageRate,
    payBalance,
    enrollDraft,
    acceptAmendment,
    questionAmendment,
    issueAmendments,
    uploadDoc,
    setPrefs,
    reenroll,
    setProfile,
    waiveUniform,
    recordOfficePay,
    closeSeason,
    cashFlowFor,
    collectionsFor,
    electPay,
    recordPayout,
    addReimbursement,
    setLeadStage,
    setLeadScores,
    makeOffer,
    waitlistLead,
    acceptLead,
    chaseAgreements,
    publishPolicy,
    toggleAutomation,
    runAutomation,
    undoLabel: undo?.label ?? null,
    undoLast,
    notes,
    teamTabs,
    playerTabs,
    docLabels: DOC_LABELS as Record<string, string>,
    pitchLimit: PITCH_LIMIT as Record<string, number>,
    coachScopeReport,
  };

  return <TeamsContext.Provider value={value}>{children}</TeamsContext.Provider>;
}

export function useTeams() {
  const ctx = useContext(TeamsContext);
  if (!ctx) throw new Error("useTeams must run inside TeamsProvider");
  return ctx;
}

export function positionsOf(player: OsPlayer | null): string {
  if (!player?.positions) return "—";
  return Array.isArray(player.positions) ? player.positions.join(" / ") : String(player.positions);
}

export function fmtAvg(value: number | string | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "—";
  return n < 1 ? n.toFixed(3).replace(/^0/, "") : String(n);
}

export { iso };
