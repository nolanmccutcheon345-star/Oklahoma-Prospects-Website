import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { getProfile } from "@/lib/club-data";
import { clubIdentity } from "@/lib/identity.server";
import { mergeSave, scopeClub, familyHoldsPlayer, fetchTeamRecord, fetchPlayerRecord } from "./privacy";
import { emptyClub, sampleClub } from "./seed";
import type { ClubRecord, Player, Team } from "./types";
import type { ClubRole } from "@/lib/club-data";

type Identity = { email: string; familyId: string; role: ClubRole; name: string };

async function identity(userId: string): Promise<Identity> {
  const me = await clubIdentity(userId);
  let familyId = me.familyId;
  const club = await loadRaw();
  const matched = club?.teams.flatMap(team => team.roster).find(player =>
    player.parents.some(parent => parent.email.trim().toLowerCase() === me.email)
    || (me.role === "player" && player.email.trim().toLowerCase() === me.email));
  if (matched?.familyId) familyId = matched.familyId;
  return { ...me, familyId };
}

async function loadRaw(): Promise<ClubRecord | null> {
  const sql = await getSql();
  const [row] = await sql<{ payload: ClubRecord; rev: number; demo: boolean }>`
    select payload, rev, demo from club_state where id = 'oklahoma-prospects'`;
  if (!row) return null;
  const parsed = typeof row.payload === "string" ? JSON.parse(row.payload) as ClubRecord : row.payload;
  return { ...parsed, _rev: row.rev, _demo: row.demo };
}

async function writeRaw(club: ClubRecord, expectedRev?: number) {
  const sql = await getSql();
  const rows = expectedRev === undefined
    ? await sql`insert into club_state (id, rev, demo, payload, updated_at)
        values ('oklahoma-prospects', ${club._rev}, ${club._demo}, ${JSON.stringify(club)}::jsonb, now())
        on conflict do nothing returning rev`
    : await sql`update club_state set rev = ${club._rev}, demo = ${club._demo},
        payload = ${JSON.stringify(club)}::jsonb, updated_at = now()
        where id = 'oklahoma-prospects' and rev = ${expectedRev} returning rev`;
  if (!rows.length) throw new Error("Another editor saved changes. Reload before saving again.");
}

export const getTeamsClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const me = await identity(context.userId);
    const club = await loadRaw();
    if (!club) {
      return { ok: false as const, missing: true as const, role: me.role, me };
    }
    return {
      ok: true as const,
      missing: false as const,
      role: me.role,
      me,
      club: scopeClub(club, me.role, me),
    };
  });

export const onboardTeamsClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { mode: "empty" | "sample" }) => input)
  .handler(async ({ context, data }) => {
    const me = await identity(context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    const existing = await loadRaw();
    if (existing) throw new Error("Club already exists. Reload.");
    if (data.mode === "sample" && process.env.NODE_ENV === "production") throw new Error("Sample data is only available locally.");
    const club = data.mode === "sample" ? sampleClub() : emptyClub();
    await writeRaw(club);
    return { ok: true, club: scopeClub(club, "admin", me) };
  });

export const saveTeamsClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { club: ClubRecord; baseRev: number }) => input)
  .handler(async ({ context, data }) => {
    const me = await identity(context.userId);
    const stored = await loadRaw();
    if (!stored) throw new Error("Club is not open.");
    if (stored._rev !== data.baseRev) {
      throw new Error("The club changed. Reload before saving.");
    }
    const merged = mergeSave(stored, data.club, me.role, me);
    await writeRaw(merged, data.baseRev);
    const sql = await getSql();
    await sql`
      insert into club_audit (user_id, action, detail)
      values (${context.userId}, 'save', ${me.role})
    `;
    return { ok: true, club: scopeClub(merged, me.role, me) };
  });

export const recordTeamPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      teamId: string;
      playerId: string;
      amount: number;
      method: string;
      label: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const me = await identity(context.userId);
    if (me.role !== "admin") {
      throw new Error("Not allowed.");
    }
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error("Enter an amount greater than zero.");
    }
    const stored = await loadRaw();
    if (!stored) throw new Error("Club is not open.");
    const team = stored.teams.find((t) => t.id === data.teamId);
    const player = team?.roster.find((p) => p.id === data.playerId);
    if (!player) throw new Error("Player not found.");
    const due = Math.max(0, (player.feeLock?.amount ?? 0) - player.payments.reduce((sum, row) => sum + row.amount, 0));
    if (due > 0 && data.amount > due + 1) {
      throw new Error(`That is more than the balance (${due}).`);
    }
    const fee = data.method === "card" ? Math.round(data.amount * stored.settings.cardFeePct * 100) / 100 : 0;
    player.payments.push({
      date: new Date().toISOString().slice(0, 10),
      amount: data.amount,
      fee,
      charged: data.amount + fee,
      method: data.method,
      label: data.label,
      receipt: `R-${Date.now().toString().slice(-6)}`,
    });
    if (!player.depositPaid && data.label.toLowerCase().includes("deposit")) {
      player.depositPaid = true;
    }
    stored._rev += 1;
    stored._savedAt = new Date().toISOString();
    stored.audit.unshift({
      at: stored._savedAt,
      action: "payment",
      detail: `${player.name} ${data.label} ${data.amount}`,
    });
    await writeRaw(stored, stored._rev - 1);
    return { ok: true, club: scopeClub(stored, me.role, me) };
  });

export const getTeamRoster = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { teamId: string }) => input)
  .handler(async ({ context, data }) => {
    const me = await identity(context.userId);
    const club = await loadRaw();
    if (!club) throw new Error("Club is not open.");
    const team = fetchTeamRecord(club, me.role, me, data.teamId);
    if (!team) throw new Error("Not your team.");
    return { ok: true as const, team };
  });

export const getPlayerRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { teamId: string; playerId: string }) => input)
  .handler(async ({ context, data }) => {
    const me = await identity(context.userId);
    const club = await loadRaw();
    if (!club) throw new Error("Club is not open.");
    if (me.role === "coach") {
      const team = fetchTeamRecord(club, me.role, me, data.teamId);
      if (!team) throw new Error("Not your team.");
    }
    const player = fetchPlayerRecord(club, me.role, me, data.playerId);
    if (!player) throw new Error("Not your player.");
    return { ok: true as const, player };
  });

export { getProfile };

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "new";
}

function blankPlayer(input: {
  teamId: string;
  familyId: string;
  name: string;
  parentName: string;
  parentEmail: string;
}): Player {
  return {
    id: `p-${slug(input.name)}-${Date.now().toString(36).slice(-4)}`,
    teamId: input.teamId,
    familyId: input.familyId,
    name: input.name,
    number: "",
    positions: [],
    bats: "R",
    throws: "R",
    gradYear: "",
    school: "",
    height: "",
    weight: "",
    email: "",
    parents: [{ name: input.parentName, rel: "guardian", phone: "", email: input.parentEmail }],
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
    docs: { waiver: false, birthCert: false, insurance: false, physical: false },
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

export const officeAddTeam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; age: string; sport: "baseball" | "softball" }) => input)
  .handler(async ({ context, data }) => {
    const me = await identity(context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    const stored = await loadRaw();
    if (!stored) throw new Error("Club is not open.");
    const name = data.name.trim();
    if (!name) throw new Error("Team name is required.");
    const team: Team = {
      id: `t-${slug(name)}-${Date.now().toString(36).slice(-4)}`,
      name,
      sport: data.sport,
      age: data.age.trim() || "Open",
      level: "Open",
      seasonLabel: "Spring 2027",
      seasonStart: "2027-02-01",
      seasonEnd: "2027-07-15",
      months: 6,
      headCoach: "",
      coachEmail: "",
      staff: [],
      uniformPackageId: stored.uniforms[0]?.id ?? "",
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
    stored.teams.push(team);
    stored._rev += 1;
    stored._savedAt = new Date().toISOString();
    stored.audit.unshift({ at: stored._savedAt, action: "team", detail: `Added ${team.name}` });
    await writeRaw(stored, stored._rev - 1);
    return { ok: true as const, club: scopeClub(stored, "admin", me) };
  });

export const officeAddPlayer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { teamId: string; name: string; parentName: string; parentEmail: string }) => input,
  )
  .handler(async ({ context, data }) => {
    const me = await identity(context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    const stored = await loadRaw();
    if (!stored) throw new Error("Club is not open.");
    const team = stored.teams.find((row) => row.id === data.teamId);
    if (!team) throw new Error("Team not found.");
    const playerName = data.name.trim();
    const parentEmail = data.parentEmail.trim().toLowerCase();
    if (!playerName || !parentEmail) throw new Error("Player name and parent email are required.");
    const familyId = `fam-${slug(parentEmail)}`;
    const player = blankPlayer({
      teamId: team.id,
      familyId,
      name: playerName,
      parentName: data.parentName.trim() || "Parent",
      parentEmail,
    });
    team.roster.push(player);
    stored._rev += 1;
    stored._savedAt = new Date().toISOString();
    stored.audit.unshift({
      at: stored._savedAt,
      action: "player",
      detail: `Added ${player.name} to ${team.name}`,
    });
    await writeRaw(stored, stored._rev - 1);
    try {
      const sql = await getSql();
      await sql`
        update profiles
        set family_id = ${familyId}
        where lower(email) = ${parentEmail}
      `;
    } catch {
      /* profile may not exist yet */
    }
    return { ok: true as const, club: scopeClub(stored, "admin", me) };
  });

