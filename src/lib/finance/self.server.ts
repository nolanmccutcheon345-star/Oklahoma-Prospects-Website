import {
  isScopedFinancialAccount,
  financialSelfAllowedPayableIdsInTransaction,
} from "./identity-scope.server";
import type { Sql } from "../db";
import { withFinancialContext, type FinancialContext } from "./context.server";
import { records, write } from "./store.server";
import { sourceData, personId } from "./sources.server";
import { today, type RecordRow } from "./contracts";
async function financialSelfInTransaction(tx: Sql, context: FinancialContext) {
  const me = context.principal,
    scoped = isScopedFinancialAccount(context),
    id = me.email ? personId(me.email) : "",
    rs = await records(tx),
    source = await sourceData(tx, today(), rs, context);
  const attributionRecords = context.compensation
    ? (context.compensation.payeesAndRules as unknown as RecordRow[])
    : rs;
  const profiles = attributionRecords.filter(
    (r) => Boolean(me.email) && r.kind === "payee" && r.payload.email?.toLowerCase() === me.email,
  );
  const explicitPayees = [
    ...(context.basis?.inputs.billing.instructorAccess || []),
    ...(context.basis?.inputs.billing.payrollAccess || []),
  ]
    .filter((a) => a.userId === me.userId)
    .map((a) => a.payeeId);
  const ids = new Set([id, ...profiles.map((p) => p.id), ...explicitPayees]);
  const stored = rs
    .filter((r) => r.kind === "payable" && ids.has(r.payload.payeeId))
    .map((r) => r.payload);
  const combined = [
    ...stored,
    ...source.candidates.filter((c) => ids.has(c.payeeId) && !stored.some((p) => p.id === c.id)),
  ];
  const allowed = await financialSelfAllowedPayableIdsInTransaction(
    tx,
    context,
    combined.map((p) => ({
      id: String(p.id || ""),
      payeeId: String(p.payeeId || ""),
      teamId: String(p.teamId || ""),
    })),
  );
  const rows = combined
    .filter((p) => allowed.has(p.id))
    .map((p) => {
      const c = source.candidates.find((c) => c.id === p.id);
      return c && !p.manualOverride ? { ...p, earned: c.earned, adjustment: c.adjustment } : p;
    });
  const payments = rs
    .filter((r) => r.kind === "payment" && rows.some((p) => p.id === r.payload.payableId))
    .map((r) => ({
      id: r.id,
      amount: r.payload.amount,
      date: r.payload.date,
      state: r.payload.state,
      payableId: r.payload.payableId,
    }));
  return {
    profile: scoped
      ? null
      : rs.find((r) => r.kind === "payee" && r.id === profiles[0]?.id)?.payload ||
        source.payees.find((p) => p.id === id) ||
        null,
    rows: rows.map((p) => ({
      id: p.id,
      reason: p.reason,
      category: p.category,
      amount: p.amount,
      earned: p.earned,
      approved: p.approved,
      paid: p.paid,
      due: p.due,
      gross: p.gross || 0,
      adjustment: p.adjustment || 0,
      state: p.state,
    })),
    payments,
  };
}
export async function myFinance(sql: Sql, userId: string) {
  return withFinancialContext(sql, userId, "read", financialSelfInTransaction);
}
export async function financialEarningsInTransaction(tx: Sql, context: FinancialContext) {
  const own = context.principal.owner ? null : await financialSelfInTransaction(tx, context);
  const ids = own?.rows.filter((r) => r.id.startsWith("lesson:")).map((r) => r.id.slice(7)) || [];
  const rows = await tx<{
    booking_id: string;
    coach_id: string;
    amount_cents: number;
    gross_cents: number;
    split_pct: string;
    status: string;
    transfer_id: string | null;
    updated_at: Date;
  }>`select * from contractor_earnings where ${context.principal.owner} or booking_id=any(${ids}::text[]) order by updated_at desc limit 500`;
  return { canSettle: context.principal.owner, rows };
}
export async function myPreference(
  sql: Sql,
  userId: string,
  value: { method: string; reference: string },
) {
  return withFinancialContext(sql, userId, "read", async (tx, context) => {
    const me = context.principal;
    if (isScopedFinancialAccount(context))
      throw Error("Ask Front Office to manage payment preferences for your admitted assignment.");
    await tx`select revision from finance_state where id='organization' for update`;
    const rs = await records(tx);
    const attributionRecords = context.compensation
      ? (context.compensation.payeesAndRules as unknown as RecordRow[])
      : rs;
    const binding = attributionRecords.find(
      (r) => Boolean(me.email) && r.kind === "payee" && r.payload.email?.toLowerCase() === me.email,
    );
    const profile = rs.find((r) => r.kind === "payee" && r.id === binding?.id);
    if (!profile) throw Error("Ask Front Office to link your financial profile first.");
    await write(
      tx,
      userId,
      "payee",
      profile.id,
      { ...profile.payload, ...value },
      "Payee updated masked payment preference",
    );
    await tx`update finance_state set revision=revision+1 where id='organization'`;
    return { ok: true };
  });
}
