import type { Sql } from "../db";
import { loadBudgetMaster } from "../teams/budget-matrix.server";
import { personId } from "./sources.server";
import { accrual, type RecordRow } from "./contracts";
import type { FinancialContext } from "./context.server";
export async function facilityPayables(
  sql: Sql,
  date: string,
  rs: RecordRow[],
  context: FinancialContext,
) {
  const { value: m } = await loadBudgetMaster(sql, context);
  const attributionRecords = context.compensation
    ? (context.compensation.payeesAndRules as unknown as RecordRow[])
    : rs;
  if (!m.overheadReviewed)
    throw Error("Review actual facility and staffing costs in Master Defaults first.");
  const month = date.slice(0, 7),
    start = month + "-01",
    end = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0))
      .toISOString()
      .slice(0, 10);
  const payees: any[] = [],
    payables: any[] = [];
  for (const c of m.facilityCosts || []) {
    if (!c.monthly) continue;
    const payeeId = "vendor:unassigned";
    payees.push({
      id: payeeId,
      email: "",
      name: "Unassigned vendor — review before approval",
      role: "Vendor",
      method: "check",
      reference: "",
      active: true,
    });
    payables.push({
      id: `facility:${month}:${c.id}`,
      payeeId,
      category: "facility",
      teamId: "",
      reason: `${c.name} · ${month}`,
      amount: c.monthly,
      earned: c.monthly,
      due: end,
      source: "facility:" + month,
      approved: 0,
      paid: 0,
      state: "pending approval",
    });
  }
  for (const p of m.payroll || []) {
    if (!p.active || !p.monthly) continue;
    const user = context.basis
      ? context.basis.inputs.billing.accounts.find((account) => account.id === p.userId)
      : (
          await sql<{
            email: string;
            name: string;
          }>`select email,name from "user" where id=${p.userId}`
        )[0];
    if (!user) throw Error("A configured payroll person no longer has a linked account.");
    const payeeId =
      attributionRecords.find(
        (r) => r.kind === "payee" && r.payload.email?.toLowerCase() === user.email.toLowerCase(),
      )?.id || personId(user.email);
    payees.push({
      id: payeeId,
      email: user.email.toLowerCase(),
      name: user.name,
      role: "Contractor",
      method: "check",
      reference: "",
      active: true,
    });
    payables.push({
      id: `staff:${month}:${p.userId}`,
      payeeId,
      category: "staff",
      teamId: "",
      reason: `Monthly staffing · ${month}`,
      amount: p.monthly,
      earned: accrual(p.monthly, start, end, date),
      due: end,
      source: "staff:" + month,
      approved: 0,
      paid: 0,
      state: "accrued",
    });
  }
  return { payees, payables };
}
