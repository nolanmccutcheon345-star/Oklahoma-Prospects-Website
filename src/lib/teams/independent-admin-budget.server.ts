import type { Sql } from "../db";
import type { FinancialContext } from "../finance/context.server";
import { collectionTotals } from "../finance/collections";
import { offlinePaymentEvidence } from "./offline-payments.server";
import { independentAcceptancePreview } from "./independent-prospects.server";
import { organizationDay } from "./fee-model";
import {
  emptyIndependentAdminBudget,
  independentProfitWorksheet,
} from "./independent-admin-budget";

export async function independentAdminWorksheet(
  sql: Sql,
  context: FinancialContext,
  teamId: string,
  seasonId: string,
) {
  if (!context.principal.owner) throw Error("Prospects financial owner access required.");
  const team = context.club.teams.find((t) => t.id === teamId);
  const plan = context.feePlans.find((p) => p.team_id === teamId)?.payload;
  if (!team || plan?.budget.independent?.seasonKey !== seasonId) return null;
  let verifiedOffline = 0,
    initialDeposits = 0,
    monthlyDues = 0,
    disclosedProcessing = 0,
    credits = 0,
    acceptedPlayers = 0,
    pendingPlayers = 0,
    recordedPayments = 0,
    appliedPayments = 0;
  for (const player of team.roster) {
    const record = plan.players[player.id]?.independent;
    const accepted = record?.seasonKey === seasonId && Boolean(record.agreements.length);
    const rows = accepted
      ? record!.installments
      : !player.withdrawn && !plan.independentCancellation && !record?.cancellation
        ? independentAcceptancePreview(plan, player, organizationDay(new Date().toISOString()))
            ?.rows || []
        : [];
    if (!rows.length) continue;
    if (accepted) acceptedPlayers++;
    else pendingPlayers++;
    for (const row of rows) {
      if (row.kind === "uniform") initialDeposits += row.base;
      else monthlyDues += row.base;
      disclosedProcessing += row.processing;
    }
    if (accepted) {
      verifiedOffline += (await offlinePaymentEvidence(sql, context, teamId, player)).cents;
      const total = rows.reduce((n, r) => n + r.amount, 0);
      const credit = Math.min(
        total,
        Math.max(0, Math.round(player.credits.reduce((n, p) => n + p.amount, 0) * 100)),
      );
      const paid = Math.max(0, Math.round(player.payments.reduce((n, p) => n + p.amount, 0) * 100));
      credits += credit;
      recordedPayments += paid;
      appliedPayments += Math.min(paid, Math.max(0, total - credit));
    }
  }
  // Read provider receipts once, scoped to this season. Roster mirrors and bank
  // settlements are reconciliation evidence, never additional revenue.
  const payments = await sql<{
    id: string;
    amount_cents: number;
    refunded_cents: number;
    external_refunds: number;
  }>`select p.id,p.amount_cents,p.refunded_cents,
    coalesce((select sum(r.amount_cents) from commerce_refunds r where r.square_payment_id=p.id and r.external_status='reconciled'),0)::int as external_refunds
    from square_payments p join commerce_orders o on o.id=p.order_id
    where p.environment='production' and o.payment_environment='production'
      and p.status='COMPLETED' and o.kind='team-fee' and o.payment_provider='square'
      and o.snapshot->'teamFee'->>'teamId'=${teamId}
      and o.snapshot->'teamFee'->'independent'->>'seasonKey'=${seasonId}`;
  const records = payments.length
    ? await sql<{
        kind: string;
        payload: {
          id?: string;
          processingFee?: number | null;
          refunded_cents?: number;
          entries?: { paymentId: string; type: string; fee: number }[];
        };
      }>`select kind,payload from finance_records where payload->>'environment'='production'
    and ((kind='collection' and payload->>'id'=any(${payments.map((p) => p.id)}::text[])) or kind='settlement')`
    : [];
  const totals = collectionTotals(
    payments.map((p) => {
      const synced = records.find((r) => r.kind === "collection" && r.payload.id === p.id)?.payload;
      const entries = records
        .filter((r) => r.kind === "settlement")
        .flatMap((r) => r.payload.entries || [])
        .filter((e) => e.paymentId === p.id && e.type === "CHARGE");
      return {
        ...p,
        environment: "production",
        status: "COMPLETED",
        refunded_cents: Math.min(
          p.amount_cents,
          Math.max(p.refunded_cents, synced?.refunded_cents || 0) + p.external_refunds,
        ),
        processingFee:
          synced?.processingFee ?? (entries.length ? entries.reduce((n, e) => n + e.fee, 0) : null),
      };
    }),
  );
  return independentProfitWorksheet({
    costs: plan.independentAdmin || emptyIndependentAdminBudget(),
    initialDeposits,
    monthlyDues,
    disclosedProcessing,
    credits,
    acceptedPlayers,
    pendingPlayers,
    recordedPayments,
    appliedPayments,
    squareGross: totals.gross,
    squareRefunds: totals.refunds,
    verifiedOffline,
    knownProcessingFees: totals.knownFees,
    missingProcessingFees: totals.missingFees,
  });
}
