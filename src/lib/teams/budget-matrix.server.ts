import { releasedMaster } from "./pricing-defaults";
import { facilityMonthly, teamSeasonOverhead, initialFacilityCosts } from "./facility-overhead";
import {
  masterSchema,
  normalizePOMaster,
  matchMatrix,
  budgetFromMatrix,
  rowKey,
  type MasterMatrix,
} from "./budget-matrix";
import type { Sql } from "../db";
import type { Team } from "./types";
import type { FeePlan } from "./fee-contracts";
import {
  withFinancialContext,
  commitFinancialBudgetMasterInTransaction,
  type FinancialContext,
} from "../finance/context.server";
export async function loadBudgetMaster(sql: Sql, context?: FinancialContext) {
  const [row] = context
    ? context.budgetMaster.filter((row) => row.id === "master")
    : await sql<{
        payload: MasterMatrix;
        revision: number;
      }>`select payload,revision from team_budget_master where id='master'`;
  if (!row) throw Error("Budget master is unavailable.");
  const [release] = await sql<{
    payload: unknown;
  }>`select payload from team_pricing_default_releases where version=1`;
  if (!release) throw Error("Team pricing defaults are unavailable.");
  return {
    value: releasedMaster(normalizePOMaster(masterSchema.parse(row.payload)), release.payload),
    revision: row.revision,
  };
}
async function budgetPeople(sql: Sql, context: FinancialContext) {
  // Apply the same database collation to frozen names as the legacy profile
  // query. Operational profile edits and new accounts cannot change this list.
  return context.mode === "basis"
    ? sql<{
        userId: string;
        name: string;
        role: string;
      }>`select id as "userId",coalesce("profileName",name) as name,role from jsonb_to_recordset(${JSON.stringify(context.basis!.inputs.billing.accounts)}::jsonb) as p(id text,name text,"profileName" text,role text) where role is not null order by 2,1`
    : sql<{
        userId: string;
        name: string;
        role: string;
      }>`select user_id as "userId",name,role from profiles order by name,user_id`;
}
export async function getBudgetMaster(sql: Sql, userId: string) {
  return withFinancialContext(sql, userId, "owner", async (tx, context) => {
    const master = await loadBudgetMaster(tx, context);
    const people = await budgetPeople(tx, context);
    return {
      ...master,
      people,
      ...(context.mode === "basis" ? { basisVersion: context.version! } : {}),
    };
  });
}
export async function saveBudgetMaster(
  sql: Sql,
  userId: string,
  revision: number,
  value: MasterMatrix,
  basisVersion?: number,
) {
  const data = masterSchema.parse(value);
  await withFinancialContext(sql, userId, "owner", async (tx, context) => {
    if (data.payroll?.length) {
      const people = await budgetPeople(tx, context);
      data.payroll = data.payroll.map((p) => {
        const person = people.find((x) => x.userId === p.userId);
        if (!person) throw Error("Select an existing account for each payroll entry.");
        return { ...p, name: person.name };
      });
    }
    const prior = await loadBudgetMaster(tx, context);
    data.pricingDefaultsVersion = 1;
    data.eventPaymentSchedule ??= prior.value.eventPaymentSchedule;
    data.pricingPrevious = prior.value.pricingPrevious;
    data.facilityCosts ||= initialFacilityCosts(data.monthlyOverhead);
    if (
      JSON.stringify([
        prior.value.facilityCosts || initialFacilityCosts(prior.value.monthlyOverhead),
        prior.value.payroll || [],
      ]) !== JSON.stringify([data.facilityCosts, data.payroll || []])
    )
      data.overheadReviewed = false;
    data.monthlyOverhead = facilityMonthly(data);
    if (!Number.isSafeInteger(data.monthlyOverhead) || data.monthlyOverhead > 1000000000)
      throw Error("Monthly overhead exceeds the supported total.");
    await commitFinancialBudgetMasterInTransaction(tx, context, {
      expectedRevision: revision,
      expectedBasisVersion: basisVersion,
      value: data,
    });
  });
  return { saved: true };
}
export async function initializeTeamBudget(sql: Sql, team: Team) {
  const [state] = await sql<{
    activation_state: string;
    active_version: number | null;
  }>`select activation_state,active_version from financial_basis_state where id='oklahoma-prospects'`;
  if (state && !(state.activation_state === "captured" && state.active_version === null))
    throw Error("Financial seasons require explicit owner enrollment.");
  const master = await loadBudgetMaster(sql),
    row = matchMatrix(team, master.value);
  if (!row) return null;
  const plan: FeePlan = {
    budget: teamSeasonOverhead(budgetFromMatrix(team, master.value, row), master.value),
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
