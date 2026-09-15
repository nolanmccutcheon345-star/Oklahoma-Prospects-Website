import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { getProfile } from "@/lib/club-data";
import { isOwnerEmail } from "@/lib/owners";
import { mergeSave, scopeClub, familyHoldsPlayer, fetchTeamRecord, fetchPlayerRecord } from "./privacy";
import { emptyClub, sampleClub } from "./seed";
import type { ClubRecord } from "./types";
import type { ClubRole } from "@/lib/club-data";

type Identity = { email: string; familyId: string; role: ClubRole; name: string };

async function identity(userId: string): Promise<Identity> {
  const sql = await getSql();
  let email = "";
  let name = "";
  try {
    const users = await sql<{ name: string; email: string }>`
      select name, email from "user" where id = ${userId}
    `;
    email = (users[0]?.email ?? "").toLowerCase();
    name = users[0]?.name ?? "";
  } catch {
    /* auth user row may be missing in preview */
  }
  if (isOwnerEmail(email)) {
    try {
      await sql`
        insert into profiles (user_id, name, email, role, player_name, family_id)
        values (
          ${userId},
          ${name || "Owner"},
          ${email},
          'admin',
          '',
          ${`fam-${userId.slice(0, 8)}`}
        )
        on conflict (user_id) do update set
          role = 'admin',
          email = excluded.email,
          name = excluded.name
      `;
    } catch {
      /* profile table may not have family_id yet */
    }
  }
  let row: { name: string; email: string; role: ClubRole; family_id: string } | undefined;
  try {
    const rows = await sql<{
      name: string;
      email: string;
      role: ClubRole;
      family_id: string;
    }>`
      select name, email, role, family_id from profiles where user_id = ${userId}
    `;
    row = rows[0];
  } catch {
    const rows = await sql<{ name: string; email: string; role: ClubRole }>`
      select name, email, role from profiles where user_id = ${userId}
    `;
    const fallback = rows[0];
    row = fallback
      ? { ...fallback, family_id: `fam-${userId.slice(0, 8)}` }
      : undefined;
  }
  return {
    name: row?.name || name,
    email: row?.email || email,
    role: isOwnerEmail(email) ? "admin" : (row?.role ?? "parent"),
    familyId: row?.family_id || `fam-${userId.slice(0, 8)}`,
  };
}

async function loadRaw(): Promise<ClubRecord | null> {
  try {
    const sql = await getSql();
    const rows = await sql<{ payload: ClubRecord; rev: number; demo: boolean }>`
      select payload, rev, demo from club_state where id = 'oklahoma-prospects'
    `;
    if (!rows[0]) return null;
    const club = rows[0].payload;
    const parsed = typeof club === "string" ? (JSON.parse(club) as ClubRecord) : club;
    parsed._rev = rows[0].rev;
    parsed._demo = rows[0].demo;
    return parsed;
  } catch {
    return null;
  }
}

async function writeRaw(club: ClubRecord) {
  const sql = await getSql();
    await sql.query(
      `insert into club_state (id, rev, demo, payload, updated_at)
       values ($1, $2, $3, $4::jsonb, now())
       on conflict (id) do update set
         rev = excluded.rev,
         demo = excluded.demo,
         payload = excluded.payload,
         updated_at = now()`,
      ["oklahoma-prospects", club._rev, club._demo, JSON.stringify(club)],
    );
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
    await writeRaw(merged);
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
    if (me.role !== "admin" && me.role !== "parent") {
      throw new Error("Not allowed.");
    }
    const stored = await loadRaw();
    if (!stored) throw new Error("Club is not open.");
    const team = stored.teams.find((t) => t.id === data.teamId);
    const player = team?.roster.find((p) => p.id === data.playerId);
    if (!player) throw new Error("Player not found.");
    if (me.role === "parent" && !familyHoldsPlayer(stored, me.familyId, data.playerId)) {
      throw new Error("Not your player.");
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
    await writeRaw(stored);
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
