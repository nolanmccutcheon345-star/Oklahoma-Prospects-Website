import type { Sql } from "../db";
import {
  financialSourceModeInTransaction,
  withFinancialContext,
  type FinancialContext,
} from "../finance/context.server";
import { assertRosterAssignment } from "./po-roster.server";
import { assertPORosterSpace } from "./po-roster";
import { mergeSave, scopeClub } from "./privacy";
import { mergeOperationalSave, operationalClubView } from "./operational-view";
import { teamFinancialView } from "./financial-view.server";
import type { ClubRecord } from "./types";

type Identity = Parameters<typeof scopeClub>[2] & { role: Parameters<typeof scopeClub>[1] };
export async function readStoredClub(sql: Sql, lock = false): Promise<ClubRecord | null> {
  const [row] = lock
    ? await sql<{
        payload: ClubRecord;
        rev: number;
        demo: boolean;
      }>`select payload,rev,demo from club_state where id='oklahoma-prospects' for update`
    : await sql<{
        payload: ClubRecord;
        rev: number;
        demo: boolean;
      }>`select payload,rev,demo from club_state where id='oklahoma-prospects'`;
  if (!row) return null;
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return { ...payload, _rev: row.rev, _demo: row.demo };
}
/** Caller has acquired the execution gate before any row lock. Never nests a transaction. */
export async function writeStoredClub(tx: Sql, club: ClubRecord, expectedRev?: number) {
  const mode = await financialSourceModeInTransaction(tx);
  if (expectedRev !== undefined) {
    const previous = await readStoredClub(tx, true);
    if (!previous || previous._rev !== expectedRev)
      throw new Error("The club changed. Reload before saving.");
    for (const team of club.teams) {
      const old = previous.teams.find((t) => t.id === team.id);
      for (const player of team.roster) {
        const before = old?.roster.find((p) => p.id === player.id);
        if (mode === "legacy" && before?.feeLock && before.roleType !== player.roleType)
          throw new Error(
            "This player has an agreed fee. A role change requires separate agreement review.",
          );
        if (
          !player.withdrawn &&
          player.roleType === "po" &&
          (!before || before.withdrawn || before.roleType !== "po" || old?.age !== team.age)
        ) {
          if (mode === "basis") assertPORosterSpace(team, 0, player.id);
          else await assertRosterAssignment(tx, team, "po", player.id);
        }
      }
    }
  }
  const rows =
    expectedRev === undefined
      ? await tx`insert into club_state(id,rev,demo,payload,updated_at) values('oklahoma-prospects',${club._rev},${club._demo},${JSON.stringify(club)}::jsonb,now()) on conflict do nothing returning rev`
      : await tx`update club_state set rev=${club._rev},demo=${club._demo},payload=${JSON.stringify(club)}::jsonb,updated_at=now() where id='oklahoma-prospects' and rev=${expectedRev} returning rev`;
  if (!rows.length) throw new Error("Another editor saved changes. Reload before saving again.");
}
export function scopedClubResult(
  club: ClubRecord,
  me: Identity,
  financial: FinancialContext,
  audience: Parameters<typeof teamFinancialView>[1] = me.role === "admin"
    ? "office"
    : me.role === "coach"
      ? "coach"
      : "family",
) {
  if (me.role === "admin" && !financial.principal.owner)
    throw new Error("Financial owner access required.");
  return {
    ok: true as const,
    club:
      financial.mode === "basis"
        ? operationalClubView(club, me.role, me)
        : scopeClub(club, me.role, me),
    financial: teamFinancialView(financial, audience),
  };
}
export async function persistClubSave(
  sql: Sql,
  userId: string,
  me: Identity,
  data: { club: ClubRecord; baseRev: number },
) {
  return withFinancialContext(
    sql,
    userId,
    me.role === "admin" ? "owner" : "read",
    async (tx, financial) => {
      const stored = await readStoredClub(tx, true);
      if (!stored || stored._rev !== data.baseRev)
        throw new Error("The club changed. Reload before saving.");
      const merged =
        financial.mode === "basis"
          ? mergeOperationalSave(stored, data.club, me.role, me)
          : mergeSave(stored, data.club, me.role, me);
      const {reconcileRosterEducation}=await import("../athlete-registration.server");
      await reconcileRosterEducation(tx,userId,stored,merged);
      await writeStoredClub(tx, merged, data.baseRev);
      await tx`insert into club_audit(user_id,action,detail) values(${userId},'save',${me.role})`;
      return scopedClubResult(merged, me, financial);
    },
  );
}
export async function mutateStoredClub(
  sql: Sql,
  userId: string,
  intent: "read" | "owner",
  expectedRev: number | undefined,
  work: (tx: Sql, club: ClubRecord, context: FinancialContext) => Promise<void>,
) {
  return withFinancialContext(sql, userId, intent, async (tx, financial) => {
    const club = await readStoredClub(tx, true);
    if (!club || (expectedRev !== undefined && club._rev !== expectedRev))
      throw new Error("The club changed. Reload before saving.");
    const rev = club._rev;
    await work(tx, club, financial);
    club._rev = rev + 1;
    club._savedAt = new Date().toISOString();
    await writeStoredClub(tx, club, rev);
  });
}
