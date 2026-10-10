import {
  masterSchema,
  matchMatrix,
  budgetFromMatrix,
  rowKey,
  type MasterMatrix,
} from "./budget-matrix";
import type { Sql } from "../db";
import type { Team } from "./types";
import type { FeePlan } from "./fee-contracts";
import { resolveIdentity } from "../identity.server";
export async function loadBudgetMaster(sql: Sql) {
  const [row] = await sql<{
    payload: MasterMatrix;
    revision: number;
  }>`select payload,revision from team_budget_master where id='master'`;
  if (!row) throw Error("Budget master is unavailable.");
  return { value: masterSchema.parse(row.payload), revision: row.revision };
}
export async function getBudgetMaster(sql: Sql, userId: string) {
  if ((await resolveIdentity(sql, userId)).role !== "admin") throw Error("Admin access required.");
  return loadBudgetMaster(sql);
}
export async function saveBudgetMaster(
  sql: Sql,
  userId: string,
  revision: number,
  value: MasterMatrix,
) {
  if ((await resolveIdentity(sql, userId)).role !== "admin") throw Error("Admin access required.");
  const data = masterSchema.parse(value);
  await sql.transaction(async (tx) => {
    const rows =
      await tx`update team_budget_master set payload=${JSON.stringify(data)}::jsonb,revision=revision+1,updated_at=now() where id='master' and revision=${revision} returning revision`;
    if (!rows.length) throw Error("The master changed. Reload before saving.");
    await tx`insert into club_audit(user_id,action,detail) values(${userId},'budget-master','Updated new-team budget defaults')`;
  });
  return { saved: true };
}
export async function initializeTeamBudget(sql: Sql, team: Team) {
  const master = await loadBudgetMaster(sql),
    row = matchMatrix(team, master.value);
  if (!row) return null;
  const plan: FeePlan = {
    budget: budgetFromMatrix(team, master.value, row),
    defaults: { key: rowKey(row), revision: master.revision, appliedAt: new Date().toISOString() },
    uniforms: [],
    status: "draft",
    revision: 0,
    expenses: [],
    players: {},
    history: [],
  };
  await sql`insert into team_fee_plans(team_id,payload,revision) values(${team.id},${JSON.stringify(plan)}::jsonb,0) on conflict do nothing`;
  return plan;
}
