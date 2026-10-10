import type { Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import { records, write } from "./store.server";
import { sourceData, personId } from "./sources.server";
import { today, total } from "./contracts";
export async function myFinance(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId),
    id = personId(me.email),
    rs = await records(sql),
    source = await sourceData(sql, today(), rs);
  const profiles = rs.filter(
    (r) => r.kind === "payee" && r.payload.email?.toLowerCase() === me.email,
  );
  const ids = new Set([id, ...profiles.map((p) => p.id)]);
  const stored = rs
    .filter((r) => r.kind === "payable" && ids.has(r.payload.payeeId))
    .map((r) => r.payload);
  const combined = [
    ...stored,
    ...source.candidates.filter((c) => ids.has(c.payeeId) && !stored.some((p) => p.id === c.id)),
  ];
  const rows = combined.map((p) => {
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
    profile: profiles[0]?.payload || source.payees.find((p) => p.id === id) || null,
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
export async function myPreference(
  sql: Sql,
  userId: string,
  value: { method: string; reference: string },
) {
  const me = await resolveIdentity(sql, userId);
  return sql.transaction(async (tx) => {
    await tx`select revision from finance_state where id='organization' for update`;
    const rs = await records(tx),
      profile = rs.find((r) => r.kind === "payee" && r.payload.email?.toLowerCase() === me.email);
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
