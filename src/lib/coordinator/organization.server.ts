/** Organization operations is a separate, allowlisted surface. It never returns a ClubRecord. */
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { Sql } from "../db";
import { lockFinancialExecution } from "../finance/execution.server";
import { financialSourceModeInTransaction } from "../finance/context.server";
import { audit, CoordinatorDenied, requireOrganizationOperations, secured } from "./access.server";
import {
  organizationTeamInput,
  organizationPlayerInput,
  organizationStaffInput,
  organizationMoveInput,
  organizationRegistrationInput,
  organizationEvaluationInput,
  organizationEvaluationReviewInput,
  organizationActivityInput,
  organizationMessageInput,
  organizationTryoutEventInput,
} from "./organization-contracts";
import {
  blankEvaluationPayload,
  EVALUATION_SKILLS,
  normalizedEvaluationAge,
} from "../tryout-evaluation-contracts";
import { holdWindow } from "../commerce/store.server";
import { validateWindow, timeMinutes } from "../scheduling";
import { centerStaff } from "../tryout-center.server";
import { assertRosterAssignment } from "../teams/po-roster.server";
import type { Team, Settings } from "../teams/types";
import { priceComponents } from "../teams/pricing";

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const objects = (value: unknown): Json[] =>
  Array.isArray(value)
    ? (value.filter((v) => v !== null && typeof v === "object" && !Array.isArray(v)) as Json[])
    : [];
const string = (value: unknown) =>
  typeof value === "string"
    ? value
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const check = (value: unknown) => value === true;
const recorded = (value: unknown) =>
  check(value) || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
const withdrawn = (value: unknown) =>
  value === true || (typeof value === "string" && Boolean(value) && value !== "false");
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : string(value));
const changed = () => new Error("This record changed. Reload before saving.");
const newId = (id: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new Error("Use a new record identifier.");
};
const email = (value: unknown) => string(value).trim().toLowerCase();
function docs(value: unknown) {
  const d = object(value);
  return {
    waiver: check(d.waiver),
    birthCert: check(d.birthCert),
    insurance: check(d.insurance),
    physical: check(d.physical),
  };
}
function staffProjection(s: Json) {
  return {
    id: string(s.id),
    name: string(s.name),
    role: string(s.role),
    email: string(s.email),
    backgroundCheck: recorded(s.backgroundCheck),
    safeSport: recorded(s.safeSport),
    expires: string(s.expires),
  };
}
function playerProjection(p: Json) {
  return {
    id: string(p.id),
    teamId: string(p.teamId),
    name: string(p.name),
    number: string(p.number),
    positions: Array.isArray(p.positions)
      ? strings(p.positions)
      : string(p.positions)
          .split(/\s*,\s*/)
          .filter(Boolean),
    bats: ["R", "L", "S"].includes(string(p.bats)) ? string(p.bats) : "",
    throws: ["R", "L"].includes(string(p.throws)) ? string(p.throws) : "",
    gradYear: string(p.gradYear),
    school: string(p.school),
    email: string(p.email),
    withdrawn: withdrawn(p.withdrawn),
    parents: objects(p.parents).map((g) => ({
      name: string(g.name),
      rel: string(g.rel),
      email: string(g.email),
      phone: string(g.phone),
    })),
    docs: docs(p.docs),
  };
}
/** Every nested value is reconstructed. Unknown future fields default to withheld. */
export function projectOrganizationTeam(t: Json) {
  return {
    id: string(t.id),
    name: string(t.name),
    sport: string(t.sport),
    age: string(t.age),
    level: string(t.level),
    seasonLabel: string(t.seasonLabel),
    seasonStart: string(t.seasonStart),
    seasonEnd: string(t.seasonEnd),
    headCoach: string(t.headCoach),
    coachEmail: string(t.coachEmail),
    closed: withdrawn(t.closed),
    roster: objects(t.roster).map(playerProjection),
    staff: objects(t.staff).map(staffProjection),
  };
}
export const organizationLimitations = [
  "Unclassified existing messages, announcements, notes, evaluation narratives, files, and document downloads are withheld because they may contain financial information. New team messages can be sent; shared history is withheld.",
  "Document access is limited to four operational checklist flags. Agreement signatures, payment-related clearance, and raw uploads are withheld.",
  "Unreviewed organization settings, account permissions, and financial settings are unavailable. Team identity and operational settings use protected field-level edits.",
  "Changes that would alter existing financial terms, payees, billing identities, or collection status require the protected workflow. This can limit roster additions/transfers, season changes, team closure, staff assignments, roster withdrawal, and event changes. Other operational fields remain editable.",
  "Existing guardian email identities cannot be relinked here because they also grant billing access. Guardian names, phone numbers, and relationships remain editable. Creating a new player with guardian email links that guardian to the new household, including its own billing portal.",
  "Schedules support scheduled/cancelled team activities and practice cage reservations. Existing game scores and statistics use the Game Results workspace. Paid booking changes and financially coupled enrollment workflows remain protected.",
  "Safe lesson lists, service resource assignments, tryout event tools, staff directory, and operational reports are available through their restricted workspaces. Lesson instructor changes remain protected while compensation is linked. Payment outcomes, automated campaigns, mixed-content document management, and unrestricted website administration are not included.",
] as const;
const protectedWorkflow = () =>
  new Error("This change requires the protected workflow. No records were changed.");
function playerHasCommitment(player: Json) {
  return Boolean(
    player.feeLock ||
    player.planLock ||
    check(player.depositPaid) ||
    check(player.uniformWaived) ||
    string(object(player.agreement).signedAt) ||
    player.coachChild ||
    Number(player.cageOverage || 0) ||
    ["payments", "credits", "cards", "amendments"].some(
      (key) => Array.isArray(player[key]) && (player[key] as unknown[]).length,
    ),
  );
}
async function hasTeamFinancialLink(tx: Sql, team: Json, club: Json) {
  if ((await financialSourceModeInTransaction(tx)) === "basis") return false;
  // Unlocked quotes still inherit club-wide dues, fee floors and uniform prices.
  // Absence of a saved agreement is not evidence that roster edits are finance-neutral.
  const uniform = objects(club.uniforms).find((u) => u.id === team.uniformPackageId);
  try {
    for (const role of ["full", "po"] as const) {
      const quote = priceComponents(
        team as unknown as Team,
        object(club.settings) as unknown as Settings,
        Number(uniform?.price || 0),
        role,
      );
      if (!Number.isFinite(quote.published) || quote.published !== 0) return true;
    }
  } catch {
    return true;
  }
  const [plan] =
    await tx`select team_id from team_fee_plans where team_id=${string(team.id)} for share`;
  const [order] =
    await tx`select id from commerce_orders where snapshot->'teamFee'->>'teamId'=${string(team.id)} limit 1`;
  return Boolean(
    plan ||
    order ||
    ["orgFee", "coachMonthly", "eventBudget"].some((key) => Number(team[key] || 0)) ||
    Object.values(object(team.otherCosts)).some((v) => Number(v || 0)) ||
    objects(team.staff).some((p) => Number(p.monthly || 0) || Number(p.applyAmount || 0)) ||
    objects(team.roster).some(playerHasCommitment),
  );
}
async function operate<T>(
  sql: Sql,
  userId: string,
  action: string,
  work: (tx: Sql, account: { id: string; email: string; name: string }) => Promise<T>,
) {
  return secured(
    sql,
    userId,
    action,
    async (tx) => work(tx, await requireOrganizationOperations(tx, userId)),
    [
      "organization.activity.save",
      "organization.team.save",
      "organization.player.save",
      "organization.staff.save",
      "organization.player.move",
    ].includes(action)
      ? lockFinancialExecution
      : undefined,
  );
}
async function loadClub(tx: Sql, revision?: number | "lock") {
  const [row] = await tx.query<{ payload: Json; rev: number }>(
    `select payload,rev from club_state where id='oklahoma-prospects' and not demo${revision === undefined ? " for share" : " for update"}`,
  );
  if (!row) throw new CoordinatorDenied();
  if (typeof revision === "number" && row.rev !== revision) throw changed();
  return { ...row, payload: object(row.payload) };
}
function teamIn(club: Json, id: string, includeClosed = false) {
  const team = objects(club.teams).find(
    (t) => t.id === id && (includeClosed || !withdrawn(t.closed)),
  );
  if (!team || !["baseball", "softball"].includes(string(team.sport)))
    throw new CoordinatorDenied();
  return team;
}
async function writeClub(tx: Sql, club: Json, revision: number) {
  club._rev = revision + 1;
  club._savedAt = new Date().toISOString();
  const rows =
    await tx`update club_state set payload=${JSON.stringify(club)}::jsonb,rev=rev+1,updated_at=now() where id='oklahoma-prospects' and not demo and rev=${revision} returning rev`;
  if (!rows.length) throw changed();
}
function preventSelfAssignment(account: { email: string }, previous: unknown, next: unknown) {
  if (
    next !== undefined &&
    email(previous) !== email(next) &&
    [email(previous), email(next)].includes(account.email)
  )
    throw new CoordinatorDenied();
}
const ratingProjection = (payload: Json) => {
  const r = object(payload.ratings);
  const score = (key: string): number | null =>
    typeof r[key] === "number" &&
    Number.isInteger(r[key]) &&
    Number(r[key]) >= 1 &&
    Number(r[key]) <= 5
      ? (r[key] as number)
      : null;
  return {
    contact: score("contact"),
    approach: score("approach"),
    fielding: score("fielding"),
    throwing: score("throwing"),
    movement: score("movement"),
    knowledge: score("knowledge"),
    coachability: score("coachability"),
  };
};
async function assignableStaff(tx: Sql, options: { includeInactive?: boolean } = {}) {
  const staff = (await centerStaff(tx, options)).map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
  }));
  const operations = await tx<{
    id: string;
    name: string;
    email: string;
  }>`select u.id,u.name,lower(trim(u.email)) as email from organization_operational_access a join "user" u on u.id=a.user_id where a.status='active' and a.financial_restricted and u."emailVerified" and u."disabledAt" is null and (${options.includeInactive === true} or not exists(select 1 from operational_person_settings o where o.user_id=u.id and not o.directory_active))`;
  return [...staff, ...operations.filter((s) => !staff.some((p) => p.id === s.id))].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
export async function organizationWorkspace(sql: Sql, userId: string) {
  return operate(sql, userId, "organization.read", async (tx) => {
    const { payload: club, rev } = await loadClub(tx);
    const requests = await tx<{
      id: string;
      kind: string;
      status: string;
      payload: Json;
      revision: number;
      created_at: Date;
      work_revision: number;
      team_id: string;
      assignee_id: string | null;
      follow_up: string;
      follow_up_date: string | null;
    }>`select r.id,r.kind,r.status,r.payload,r.coordinator_revision as revision,r.created_at,coalesce(w.revision,0) as work_revision,coalesce(w.team_id,'') as team_id,w.assignee_id,coalesce(w.follow_up,'new') as follow_up,w.follow_up_date::text from club_requests r left join office_request_work w on w.request_id=r.id where r.kind in ('tryout','team-inquiry') order by r.created_at desc,r.id`;
    const evaluations = await tx<{
      id: string;
      registration_id: string | null;
      team_id: string;
      evaluator_id: string;
      evaluator_name: string;
      player_name: string;
      age_group: string;
      sport: string;
      evaluation_date: string;
      status: string;
      recommendation: string;
      payload: Json;
      revision: number;
      reviewed: boolean;
    }>`select e.id,e.registration_id,e.team_id,e.evaluator_id,e.evaluator_name,e.player_name,e.age_group,e.sport,e.evaluation_date::text,e.status,e.recommendation,e.payload,e.revision,exists(select 1 from tryout_evaluation_reviews v where v.evaluation_id=e.id and v.revision=e.revision) as reviewed from tryout_evaluations e order by e.evaluation_date desc,e.id`;
    const activities = await tx<{
      id: string;
      team_id: string;
      payload: Json;
      revision: number;
      lane_ids: string[];
    }>`select a.id,a.team_id,a.payload,a.revision,coalesce((select array_agg(replace(resource,'lane:','')) from coordinator_practice_bookings cp join booking_records b on b.id=cp.booking_id cross join lateral jsonb_array_elements_text(b.resources) resource where cp.activity_id=a.id and b.status='confirmed' and resource like 'lane:%'),'{}') as lane_ids from team_activities a order by a.payload->>'date' desc,a.id`;
    const tryoutEvents = await tx<{
      id: string;
      sport: "Baseball" | "Softball";
      season: string;
      ageGroups: string[];
      date: string;
      startTime: string;
      endTime: string;
      location: string;
      capacity: number;
      status: "draft" | "published" | "cancelled";
      revision: number;
    }>`select id,sport,season,age_groups as "ageGroups",event_date::text as date,start_time as "startTime",end_time as "endTime",location,capacity,status,revision from tryout_events order by event_date desc,id`;
    const staff = await assignableStaff(tx);
    await audit(tx, userId, "organization.read", "", "allowed");
    return {
      revision: rev,
      teams: objects(club.teams)
        .filter((t) => ["baseball", "softball"].includes(string(t.sport)))
        .map(projectOrganizationTeam),
      staff,
      registrations: requests.map((r) => {
        const p = object(r.payload);
        return {
          id: r.id,
          kind: r.kind,
          status: ["open", "accepted", "declined", "closed"].includes(r.status) ? r.status : "open",
          revision: r.revision,
          createdAt: iso(r.created_at),
          player: string(p.player),
          parent: string(p.parent),
          email: string(p.email),
          phone: string(p.phone),
          age: string(p.age),
          sport: string(p.sport).toLowerCase(),
          season: string(p.season),
          positions: string(p.positions),
          preferredTeamId: string(p.preferredTeamId),
          workRevision: r.work_revision,
          workflow: {
            teamId: r.team_id,
            assigneeId: r.assignee_id || "",
            status: r.follow_up,
            followUpDate: r.follow_up_date || "",
          },
        };
      }),
      evaluations: evaluations.map((e) => ({
        id: e.id,
        registrationId: e.registration_id,
        teamId: e.team_id,
        evaluatorId: e.evaluator_id,
        evaluatorName: e.evaluator_name,
        playerName: e.player_name,
        ageGroup: e.age_group,
        sport: e.sport,
        evaluationDate: e.evaluation_date,
        status: e.status,
        recommendation: e.recommendation,
        ratings: ratingProjection(object(e.payload)),
        revision: e.revision,
        reviewed: e.reviewed,
      })),
      activities: activities.map((a) => {
        const p = object(a.payload);
        return {
          id: a.id,
          teamId: a.team_id,
          revision: a.revision,
          kind: string(p.kind),
          title: string(p.title),
          date: string(p.date),
          startTime: string(p.startTime),
          endTime: string(p.endTime),
          location: string(p.location),
          status: string(p.status),
          laneIds: a.lane_ids.filter((x) => ["1", "2", "3-4", "5", "6", "7"].includes(x)),
        };
      }),
      tryoutEvents,
      limitations: [...organizationLimitations],
    };
  });
}

function blankTeam(id: string): Json {
  return {
    id,
    name: "",
    sport: "baseball",
    age: "Open",
    level: "Open",
    seasonLabel: "",
    seasons: [],
    seasonStart: "",
    seasonEnd: "",
    months: 6,
    headCoach: "",
    coachEmail: "",
    staff: [],
    uniformPackageId: "",
    uniformDeadline: "",
    orgFee: 0,
    coachMonthly: 0,
    eventBudget: 0,
    tournamentIds: [],
    otherCosts: { insurance: 0, balls: 0, fields: 0, admin: 0, travel: 0 },
    teamCageHoursPerWeek: 0,
    playerCageHoursPerWeek: 0,
    record: { w: 0, l: 0, t: 0 },
    roster: [],
    practices: [],
    messages: [],
    announcements: [],
    attendance: {},
    pitchLog: [],
    closed: false,
    notes: "",
  };
}
function blankPlayer(id: string, teamId: string): Json {
  return {
    id,
    teamId,
    familyId: `family-${randomUUID()}`,
    name: "",
    number: "",
    positions: [],
    bats: "",
    throws: "",
    gradYear: "",
    school: "",
    height: "",
    weight: "",
    email: "",
    parents: [],
    roleType: "full",
    coachChild: false,
    joinedOn: new Date().toISOString().slice(0, 10),
    withdrawn: false,
    agreement: { version: "", signedBy: "", signedAt: "" },
    feeLock: null,
    planLock: null,
    credits: [],
    payments: [],
    cards: [],
    planType: "four",
    depositPaid: false,
    uniformWaived: false,
    order: { number: "", sizes: {}, submitted: false },
    docs: docs({}),
    emergency: {
      allergies: "",
      conditions: "",
      insurer: "",
      policyNo: "",
      physician: "",
      pickup: [],
      notes: "",
    },
    publicProfile: { enabled: false, bio: "", slug: "" },
    prefs: { email: true, sms: true },
    reenroll: false,
    cageOverage: 0,
    stats: {},
    rsvp: {},
  };
}
export async function saveOrganizationTeam(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof organizationTeamInput>,
) {
  return operate(sql, userId, "organization.team.save", async (tx, account) => {
    const input = organizationTeamInput.parse(raw),
      { payload: club, rev } = await loadClub(tx, input.revision);
    const teams = objects(club.teams),
      old = teams.find((t) => t.id === input.teamId);
    if (!old) {
      newId(input.teamId);
      if (!input.changes.name || !input.changes.sport)
        throw new Error("A new team needs a name and sport.");
    }
    if (
      old &&
      input.changes.sport &&
      input.changes.sport !== old.sport &&
      (objects(old.roster).length || objects(old.practices).length) &&
      (await financialSourceModeInTransaction(tx)) !== "basis"
    )
      throw new Error("A populated team cannot change sports.");
    if (
      old &&
      input.changes.age !== undefined &&
      input.changes.age !== old.age &&
      objects(old.roster).length &&
      (await financialSourceModeInTransaction(tx)) !== "basis"
    )
      throw new Error("A populated team's age group must be reviewed through the roster workflow.");
    if (
      old &&
      ["headCoach", "coachEmail", "seasonLabel", "seasonStart", "seasonEnd", "closed"].some(
        (key) =>
          Object.hasOwn(input.changes, key) &&
          (key === "closed"
            ? input.changes.closed !== withdrawn(old.closed)
            : string(input.changes[key as keyof typeof input.changes]) !== string(old[key])),
      ) &&
      (await hasTeamFinancialLink(tx, old, club))
    )
      throw protectedWorkflow();
    preventSelfAssignment(account, old?.coachEmail, input.changes.coachEmail);
    const next: Json = { ...(old || blankTeam(input.teamId)), ...input.changes };
    if (next.seasonStart && next.seasonEnd && string(next.seasonEnd) < string(next.seasonStart))
      throw new Error("Season end must follow its start.");
    if (old && input.changes.closed === withdrawn(old.closed)) next.closed = old.closed;
    if (
      input.changes.seasonLabel !== undefined &&
      input.changes.seasonLabel !== string(old?.seasonLabel)
    )
      next.seasons = input.changes.seasonLabel.split(/\s*&\s*/).filter(Boolean);
    club.teams = old ? teams.map((t) => (t.id === input.teamId ? next : t)) : [...teams, next];
    await writeClub(tx, club, rev);
    await audit(tx, userId, "organization.team.save", input.teamId, "allowed", {
      fields: Object.keys(input.changes),
      revision: rev + 1,
    });
    return { ok: true, revision: rev + 1 };
  });
}
export async function saveOrganizationPlayer(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof organizationPlayerInput>,
) {
  return operate(sql, userId, "organization.player.save", async (tx) => {
    const input = organizationPlayerInput.parse(raw),
      { payload: club, rev } = await loadClub(tx, input.revision),
      team = teamIn(club, input.teamId);
    const roster = objects(team.roster),
      old = roster.find((p) => p.id === input.playerId);
    if (!old) {
      newId(input.playerId);
      if (!input.changes.name) throw new Error("A new player needs a name.");
      if (objects(club.teams).some((t) => objects(t.roster).some((p) => p.id === input.playerId)))
        throw changed();
      // A new active roster member changes legacy funding denominators and can
      // change existing fees/pay projections even without writing a money field.
      if (await hasTeamFinancialLink(tx, team, club)) throw protectedWorkflow();
    }
    if (
      input.changes.number &&
      roster.some(
        (p) =>
          p.id !== input.playerId &&
          !withdrawn(p.withdrawn) &&
          string(p.number) === input.changes.number,
      )
    )
      throw new Error("That jersey number is already assigned.");
    if (
      old &&
      input.changes.parents &&
      input.changes.parents.some(
        (g, i) => email(g.email) !== email(objects(old.parents)[i]?.email),
      ) &&
      (await financialSourceModeInTransaction(tx)) !== "basis"
    )
      throw protectedWorkflow();
    if (
      old &&
      input.changes.email !== undefined &&
      email(input.changes.email) !== email(old.email) &&
      (await financialSourceModeInTransaction(tx)) !== "basis"
    )
      throw protectedWorkflow();
    if (
      old &&
      input.changes.withdrawn !== undefined &&
      input.changes.withdrawn !== withdrawn(old.withdrawn) &&
      (await hasTeamFinancialLink(tx, team, club))
    )
      throw protectedWorkflow();
    if (old && input.changes.withdrawn === false && withdrawn(old.withdrawn))
      await assertRosterAssignment(
        tx,
        team as unknown as Team,
        old.roleType === "po" ? "po" : "full",
        input.playerId,
      );
    const next: Json = { ...(old || blankPlayer(input.playerId, input.teamId)), ...input.changes };
    if (old && input.changes.withdrawn === withdrawn(old.withdrawn)) next.withdrawn = old.withdrawn;
    if (input.changes.docs) next.docs = { ...object(old?.docs), ...input.changes.docs };
    if (input.changes.parents) {
      const prior = objects(old?.parents);
      if (
        input.changes.parents.length < prior.length &&
        (await financialSourceModeInTransaction(tx)) !== "basis"
      )
        throw new Error(
          "Guardian rows cannot be removed here. Edit their name, relationship, or phone number instead.",
        );
      next.parents = input.changes.parents.map((p, i) => ({ ...prior[i], ...p }));
    }
    team.roster = old ? roster.map((p) => (p.id === input.playerId ? next : p)) : [...roster, next];
    await writeClub(tx, club, rev);
    await audit(
      tx,
      userId,
      "organization.player.save",
      input.playerId,
      "allowed",
      { fields: Object.keys(input.changes), revision: rev + 1 },
      undefined,
      input.teamId,
    );
    return { ok: true, revision: rev + 1 };
  });
}
export async function saveOrganizationStaff(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof organizationStaffInput>,
) {
  return operate(sql, userId, "organization.staff.save", async (tx, account) => {
    const input = organizationStaffInput.parse(raw),
      { payload: club, rev } = await loadClub(tx, input.revision),
      team = teamIn(club, input.teamId);
    const staff = objects(team.staff),
      old = staff.find((p) => p.id === input.staffId);
    if (!old) {
      newId(input.staffId);
      if (!input.changes.name) throw new Error("A new staff member needs a name.");
    }
    if (email(old?.email) === account.email || email(input.changes.email) === account.email)
      throw new CoordinatorDenied();
    if (
      (!old ||
        ["email", "role", "name"].some(
          (key) =>
            Object.hasOwn(input.changes, key) &&
            string(input.changes[key as keyof typeof input.changes]) !== string(old[key]),
        )) &&
      (await hasTeamFinancialLink(tx, team, club))
    )
      throw protectedWorkflow();
    const next: Json = {
      ...(old || {
        id: input.staffId,
        name: "",
        role: "Assistant coach",
        email: "",
        monthly: 0,
        childId: "",
        applyAmount: 0,
        w9: false,
        backgroundCheck: false,
        safeSport: false,
        expires: "",
      }),
      ...input.changes,
    };
    for (const key of ["backgroundCheck", "safeSport"] as const) {
      if (old && input.changes[key] !== undefined && input.changes[key] === recorded(old[key]))
        next[key] = old[key];
    }
    staff.splice(old ? staff.indexOf(old) : staff.length, old ? 1 : 0, next);
    team.staff = staff;
    await writeClub(tx, club, rev);
    await audit(
      tx,
      userId,
      "organization.staff.save",
      input.staffId,
      "allowed",
      { fields: Object.keys(input.changes), revision: rev + 1 },
      undefined,
      input.teamId,
    );
    return { ok: true, revision: rev + 1 };
  });
}
export async function moveOrganizationPlayer(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof organizationMoveInput>,
) {
  return operate(sql, userId, "organization.player.move", async (tx) => {
    const input = organizationMoveInput.parse(raw),
      { payload: club, rev } = await loadClub(tx, input.revision);
    const source = teamIn(club, input.teamId),
      destination = teamIn(club, input.destinationTeamId);
    if (
      source.id === destination.id ||
      ((await financialSourceModeInTransaction(tx)) !== "basis" &&
        (source.sport !== destination.sport ||
          string(source.age).trim().toLowerCase() !== string(destination.age).trim().toLowerCase()))
    )
      throw new Error("Choose a different active team in the same sport and age group.");
    const player = objects(source.roster).find((p) => p.id === input.playerId);
    if (!player || withdrawn(player.withdrawn)) throw new CoordinatorDenied();
    // Team association is also a pricing key in the legacy application. Byte-preserving
    // a player alone is insufficient: restrict moves to uncommitted, equivalent terms.
    const [plan] =
      await tx`select team_id from team_fee_plans where team_id in (${input.teamId},${input.destinationTeamId}) for share`;
    const [checkout] =
      await tx`select id from commerce_orders where snapshot->'teamFee'->>'playerId'=${input.playerId} limit 1`;
    const financialArrays = ["payments", "credits", "cards", "amendments"];
    const teamTerms = [
      "months",
      "orgFee",
      "coachMonthly",
      "eventBudget",
      "otherCosts",
      "uniformPackageId",
      "seasonStart",
      "seasonEnd",
      "teamCageHoursPerWeek",
      "playerCageHoursPerWeek",
    ];
    if (
      (await financialSourceModeInTransaction(tx)) !== "basis" &&
      (plan ||
        checkout ||
        player.feeLock ||
        player.planLock ||
        check(player.depositPaid) ||
        check(player.uniformWaived) ||
        string(object(player.agreement).signedAt) ||
        player.coachChild ||
        Number(player.cageOverage || 0) ||
        financialArrays.some(
          (key) => Array.isArray(player[key]) && (player[key] as unknown[]).length,
        ) ||
        teamTerms.some((key) => JSON.stringify(source[key]) !== JSON.stringify(destination[key])) ||
        (await hasTeamFinancialLink(tx, source, club)) ||
        (await hasTeamFinancialLink(tx, destination, club)))
    )
      throw new Error(
        "This transfer requires the protected roster workflow. No records were changed.",
      );
    if (objects(destination.roster).some((p) => p.id === player.id)) throw changed();
    if (
      string(player.number) &&
      objects(destination.roster).some(
        (p) => !withdrawn(p.withdrawn) && string(p.number) === string(player.number),
      )
    )
      throw new Error("Change the duplicate jersey number before moving this player.");
    await assertRosterAssignment(
      tx,
      destination as unknown as Team,
      player.roleType === "po" ? "po" : "full",
    );
    // Move the complete stored object, changing only operational association. Never copy a client projection over it.
    source.roster = objects(source.roster).filter((p) => p.id !== player.id);
    destination.roster = [...objects(destination.roster), { ...player, teamId: destination.id }];
    await writeClub(tx, club, rev);
    await audit(
      tx,
      userId,
      "organization.player.move",
      input.playerId,
      "allowed",
      { destinationTeamId: input.destinationTeamId, revision: rev + 1 },
      undefined,
      input.teamId,
    );
    return { ok: true, revision: rev + 1 };
  });
}
export async function saveOrganizationRegistration(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof organizationRegistrationInput>,
) {
  return operate(sql, userId, "organization.registration.save", async (tx) => {
    const input = organizationRegistrationInput.parse(raw);
    const [old] = await tx<{
      id: string;
      kind: string;
      status: string;
      payload: Json;
      revision: number;
    }>`select id,kind,status,payload,coordinator_revision as revision from club_requests where id=${input.id} for update`;
    if (old && !["tryout", "team-inquiry"].includes(old.kind)) throw new CoordinatorDenied();
    if ((old?.revision || 0) !== input.revision) throw changed();
    const [work] = await tx<{
      revision: number;
      assignee_id: string | null;
    }>`select revision,assignee_id from office_request_work where request_id=${input.id} for update`;
    if ((work?.revision || 0) !== input.workRevision) throw changed();
    if (
      !old &&
      (!input.changes.kind || !input.changes.player || !input.changes.sport || !input.changes.email)
    )
      throw new Error("A new registration needs its type, player, sport, and guardian email.");
    if (old && input.changes.kind && input.changes.kind !== old.kind)
      throw new Error("Keep the registration type.");
    const { kind, status, ...patch } = input.changes;
    const payload: Json = { ...object(old?.payload), ...patch };
    // Public tryout enrollment uses the existing title-case sport convention.
    if (patch.sport) payload.sport = patch.sport === "baseball" ? "Baseball" : "Softball";
    const { payload: club } = await loadClub(tx);
    for (const teamId of [string(payload.preferredTeamId), input.workflow?.teamId || ""]) {
      if (!teamId) continue;
      const team = teamIn(club, teamId);
      if (string(team.sport) !== string(payload.sport).toLowerCase())
        throw new Error("Choose a team in this registration's sport.");
      if (
        normalizedEvaluationAge(string(team.age)) !== normalizedEvaluationAge(string(payload.age))
      )
        throw new Error("Choose a team in this registration's age group.");
    }
    if (old) {
      const [enrollment] =
        await tx`select id from tryout_enrollments where request_id=${input.id} and status='enrolled' for share`;
      const identityChanged = ["player", "email", "age", "sport", "season"].some(
        (key) =>
          Object.hasOwn(patch, key) &&
          string(patch[key as keyof typeof patch])
            .trim()
            .toLowerCase() !== string(old.payload[key]).trim().toLowerCase(),
      );
      if ((enrollment || old.status === "accepted") && identityChanged)
        throw new Error(
          "This registration has an existing placement. Update it through the placement workflow.",
        );
      if (enrollment && status && status !== old.status)
        throw new Error(
          "Manage the existing tryout enrollment before changing this registration's status.",
        );
      if (
        old.status === "accepted" &&
        input.workflow &&
        !["accepted", "closed"].includes(input.workflow.status)
      )
        throw new Error("This player is already rostered. Manage their roster separately.");
    }
    if (status === "accepted" && !string(payload.rosterPlayerId))
      throw new Error(
        "Place the player on a roster before marking the registration accepted. You can record an offered or accepted follow-up status meanwhile.",
      );
    if (old?.status === "accepted" && status && status !== "accepted" && status !== "closed")
      throw new Error("This player is already rostered. Manage their roster separately.");
    if (
      input.workflow?.assigneeId &&
      !(
        await assignableStaff(tx, {
          includeInactive: input.workflow.assigneeId === work?.assignee_id,
        })
      ).some((s) => s.id === input.workflow?.assigneeId)
    )
      throw new Error("Choose an active approved staff account.");
    if (old)
      await tx`update club_requests set payload=${JSON.stringify(payload)}::jsonb,status=${status || old.status},coordinator_revision=coordinator_revision+1 where id=${input.id}`;
    else
      await tx`insert into club_requests(id,kind,status,payload,user_id,coordinator_revision) values(${input.id},${kind || "team-inquiry"},${status || "open"},${JSON.stringify(payload)}::jsonb,${userId},1)`;
    if (input.workflow) {
      const w = input.workflow;
      await tx`insert into office_request_work(request_id,assignee_id,follow_up,team_id,follow_up_date) values(${input.id},${w.assigneeId || null},${w.status},${w.teamId},${w.followUpDate || null}::date) on conflict(request_id) do update set assignee_id=excluded.assignee_id,follow_up=excluded.follow_up,team_id=excluded.team_id,follow_up_date=excluded.follow_up_date,revision=office_request_work.revision+1,updated_at=now()`;
    }
    await audit(tx, userId, "organization.registration.save", input.id, "allowed", {
      fields: Object.keys(input.changes),
      workflow: Boolean(input.workflow),
      revision: input.revision + 1,
    });
    return { ok: true, revision: input.revision + 1 };
  });
}
export async function saveOrganizationEvaluation(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof organizationEvaluationInput>,
) {
  return operate(sql, userId, "organization.evaluation.save", async (tx, account) => {
    const input = organizationEvaluationInput.parse(raw),
      { payload: club } = await loadClub(tx);
    if (input.teamId) {
      const team = teamIn(club, input.teamId);
      if (team.sport !== input.sport) throw new Error("Choose a team in the evaluation's sport.");
    }
    let playerName = input.playerName;
    if (input.registrationId) {
      const [request] = await tx<{
        player: string;
        sport: string;
        age: string;
      }>`select payload->>'player' as player,lower(payload->>'sport') as sport,payload->>'age' as age from club_requests where id=${input.registrationId} and kind in ('tryout','team-inquiry') for share`;
      if (!request || request.sport !== input.sport) throw new CoordinatorDenied();
      if (
        input.teamId &&
        normalizedEvaluationAge(string(teamIn(club, input.teamId).age)) !==
          normalizedEvaluationAge(request.age)
      )
        throw new Error("Choose a team in this registration's age group.");
      if (normalizedEvaluationAge(input.ageGroup) !== normalizedEvaluationAge(request.age))
        throw new Error("Keep the registration's age group for this evaluation.");
      playerName = request.player;
    }
    const [old] = await tx<{
      revision: number;
      registration_id: string | null;
      team_id: string;
      payload: Json;
    }>`select revision,registration_id,team_id,payload from tryout_evaluations where id=${input.id} for update`;
    if ((old?.revision || 0) !== input.revision) throw changed();
    if (old && (old.registration_id !== input.registrationId || old.team_id !== input.teamId))
      throw new Error("Start a new evaluation to change the player or team.");
    const oldPayload = old ? object(old.payload) : blankEvaluationPayload();
    // Preserve unclassified narrative and future financial fields internally, without reading them back.
    const payload = { ...oldPayload, ratings: { ...object(oldPayload.ratings), ...input.ratings } };
    if (
      input.status === "submitted" &&
      EVALUATION_SKILLS.some(({ key }) => input.ratings[key] === null)
    )
      throw new Error("Complete all seven ratings before submitting.");
    if (old)
      await tx`update tryout_evaluations set player_name=${playerName},age_group=${input.ageGroup},sport=${input.sport},evaluation_date=${input.evaluationDate}::date,status=${input.status},recommendation=${input.recommendation},payload=${JSON.stringify(payload)}::jsonb,revision=revision+1,updated_at=now() where id=${input.id}`;
    else
      await tx`insert into tryout_evaluations(id,registration_id,team_id,evaluator_id,evaluator_name,player_name,age_group,sport,evaluation_date,status,recommendation,payload) values(${input.id},${input.registrationId},${input.teamId},${userId},${account.name},${playerName},${input.ageGroup},${input.sport},${input.evaluationDate}::date,${input.status},${input.recommendation},${JSON.stringify(payload)}::jsonb)`;
    await audit(tx, userId, "organization.evaluation.save", input.id, "allowed", {
      revision: input.revision + 1,
    });
    return { ok: true, revision: input.revision + 1 };
  });
}
export async function reviewOrganizationEvaluation(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof organizationEvaluationReviewInput>,
) {
  return operate(sql, userId, "organization.evaluation.review", async (tx) => {
    const input = organizationEvaluationReviewInput.parse(raw);
    const [row] = await tx<{
      revision: number;
      status: string;
    }>`select revision,status from tryout_evaluations where id=${input.id} for update`;
    if (!row || row.revision !== input.revision || row.status !== "submitted") throw changed();
    await tx`insert into tryout_evaluation_reviews(evaluation_id,revision,reviewer_id) values(${input.id},${input.revision},${userId}) on conflict(evaluation_id) do update set revision=excluded.revision,reviewer_id=excluded.reviewer_id,reviewed_at=now()`;
    await audit(tx, userId, "organization.evaluation.review", input.id, "allowed", {
      revision: input.revision,
    });
    return { ok: true };
  });
}
export async function saveOrganizationActivity(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof organizationActivityInput>,
) {
  return operate(sql, userId, "organization.activity.save", async (tx) => {
    const input = organizationActivityInput.parse(raw),
      { payload: club, rev } = await loadClub(tx, "lock"),
      team = teamIn(club, input.teamId);
    const [old] = await tx<{
      team_id: string;
      payload: Json;
      revision: number;
    }>`select team_id,payload,revision from team_activities where id=${input.id} for update`;
    if ((old?.revision || 0) !== input.revision) throw changed();
    const prior = object(old?.payload);
    // Only the future fully active financial basis can detach schedule edits from commitments.
    // Captured/inactive production state retains the existing coupling guard.
    if (input.kind !== "practice" && (await financialSourceModeInTransaction(tx)) !== "basis") {
      const [plan] =
        await tx`select team_id from team_fee_plans where team_id=${input.teamId} for share`;
      if (
        plan ||
        Number(prior.entryFee || 0) ||
        prior.travel === "travel" ||
        Number(prior.overnightNights || 0)
      )
        throw protectedWorkflow();
    }
    if (old && (old.team_id !== input.teamId || prior.kind !== input.kind))
      throw new CoordinatorDenied();
    if (old && !["scheduled", "cancelled"].includes(string(prior.status)))
      throw new Error("Live or completed scored activities cannot be changed here.");
    if (input.kind !== "practice" && input.laneIds.length)
      throw new Error("Cage reservations belong to practices.");
    const [reservation] = await tx<{
      booking_id: string;
      order_id: string | null;
    }>`select cp.booking_id,b.order_id from coordinator_practice_bookings cp join booking_records b on b.id=cp.booking_id where cp.activity_id=${input.id} for update of cp,b`;
    if (reservation?.order_id) throw new CoordinatorDenied();
    if (reservation) {
      await tx`delete from booking_occupancy where booking_id=${reservation.booking_id}`;
      await tx`update booking_records set status='cancelled' where id=${reservation.booking_id} and order_id is null`;
      await tx`delete from coordinator_practice_bookings where activity_id=${input.id}`;
    }
    const { laneIds, ...operational } = input;
    const payload = {
      ...(old ? prior : { ourRuns: 0, oppRuns: 0, stats: [] }),
      ...operational,
      revision: input.revision + 1,
    };
    if (old)
      await tx`update team_activities set payload=${JSON.stringify(payload)}::jsonb,revision=revision+1,updated_by=${userId},updated_at=now() where id=${input.id}`;
    else
      await tx`insert into team_activities(id,team_id,payload,updated_by) values(${input.id},${input.teamId},${JSON.stringify(payload)}::jsonb,${userId})`;
    if (input.kind === "practice" && input.status !== "cancelled" && laneIds.length) {
      const window = validateWindow(
        input.date,
        input.startTime,
        timeMinutes(input.endTime) - timeMinutes(input.startTime),
      );
      const bookingId = await holdWindow(tx, {
        orderId: null,
        userId,
        athleteId: null,
        productId: "coordinator-practice:" + input.id,
        start: window.start,
        end: window.end,
        resources: [...new Set(laneIds)].map((id) => "lane:" + id),
      });
      await tx`update booking_records set status='confirmed' where id=${bookingId}`;
      await tx`insert into coordinator_practice_bookings(activity_id,booking_id) values(${input.id},${bookingId})`;
    }
    if (input.kind === "practice") {
      const practices = objects(team.practices),
        previous = practices.find((p) => p.id === input.id);
      const practice = {
        ...previous,
        id: input.id,
        date: input.date,
        time: input.startTime,
        where: input.location,
        cageHours:
          laneIds.length && input.status !== "cancelled"
            ? (timeMinutes(input.endTime) - timeMinutes(input.startTime)) / 60
            : 0,
        status: input.status === "cancelled" ? "cancelled" : "on",
      };
      team.practices = [...practices.filter((p) => p.id !== input.id), practice];
      await writeClub(tx, club, rev);
    }
    // Do not call saveTeamActivity: it rewrites fee budgets and may change financial obligations.
    await audit(
      tx,
      userId,
      "organization.activity.save",
      input.id,
      "allowed",
      { revision: input.revision + 1 },
      undefined,
      input.teamId,
    );
    return { ok: true, revision: input.revision + 1 };
  });
}
export async function organizationOccupancy(sql: Sql, userId: string, date: string) {
  return operate(sql, userId, "organization.facility.read", async (tx) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a date.");
    // Only unlabelled occupied resource cells: no customer, product, cost, funding, or booking identifiers.
    const rows = await tx<{
      resourceId: string;
      at: Date;
    }>`select resource_id as "resourceId",slot_at as at from booking_occupancy where resource_id like 'lane:%' and (slot_at at time zone 'America/Chicago')::date=${date}::date order by slot_at,resource_id`;
    return rows.map((r) => ({ resourceId: r.resourceId, at: iso(r.at) }));
  });
}
export async function sendOrganizationMessage(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof organizationMessageInput>,
) {
  return operate(sql, userId, "organization.message.send", async (tx, account) => {
    const input = organizationMessageInput.parse(raw),
      { payload: club } = await loadClub(tx);
    teamIn(club, input.teamId);
    if (input.confirmedTeamId !== input.teamId)
      throw new Error("Confirm this message's team before sending.");
    const [old] = await tx<{
      same: boolean;
    }>`select team_id=${input.teamId} and user_id=${userId} and body=${input.body} as same from team_chat_messages where id=${input.id} for update`;
    if (old && !old.same) throw changed();
    if (!old) {
      await tx`insert into team_chat_messages(id,team_id,user_id,author,body) values(${input.id},${input.teamId},${userId},${account.name},${input.body})`;
      await audit(
        tx,
        userId,
        "organization.message.send",
        input.id,
        "allowed",
        {},
        undefined,
        input.teamId,
      );
    }
    return { ok: true };
  });
}
export async function saveOrganizationTryoutEvent(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof organizationTryoutEventInput>,
) {
  const { saveTryoutEventFor } = await import("../tryout-events.server");
  return saveTryoutEventFor(sql, userId, raw);
}
