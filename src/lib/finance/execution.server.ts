import type { Sql } from "../db";

/** Acquire FIRST in an outer financial transaction, before account, order,
 * booking, finance-state or club locks. This is not an authorization grant.
 * Transaction-level entry points never open nested transactions. */
export async function lockFinancialExecution(tx: Sql): Promise<void> {
  if (typeof window !== "undefined") throw new Error("Financial execution is server-only.");
  const rows =
    await tx`select id from financial_execution_gate where id='oklahoma-prospects' for update`;
  if (rows.length !== 1) throw new Error("Financial execution gate is unavailable.");
}
