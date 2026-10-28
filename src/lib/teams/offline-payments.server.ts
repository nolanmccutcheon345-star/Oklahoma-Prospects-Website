import type { Sql } from "../db";
import type { FinancialContext } from "../finance/context.server";
import { resolveFinancialAgreement } from "../finance/basis.server";
import type { Player } from "./types";

export const offlineMethods = ["cash", "check", "square invoice", "bank transfer"];
export const isOfflineMethod = (method: string) =>
  offlineMethods.includes(method.trim().toLowerCase());
export type OfflineEvidence = {
  version: 1;
  teamId: string;
  playerId: string;
  financialAgreementId: string | null;
  lockedAt: string;
  receipt: string;
  amount: number;
  method: string;
  label: string;
  verified: boolean;
  requestId?: string;
};

/** Only server-written, append-only owner evidence for the exact accepted agreement qualifies. */
export async function offlinePaymentEvidence(
  tx: Sql,
  context: FinancialContext,
  teamId: string,
  player: Player,
) {
  const receipts = player.payments.filter((p) => isOfflineMethod(p.method)).map((p) => p.receipt);
  if (!receipts.length || !player.feeLock) return { cents: 0, receipts: new Set<string>() };
  const agreementId = context.basis
    ? resolveFinancialAgreement(context.basis, { teamId, playerId: player.id }).identity.id
    : null;
  const aliases = context.basis
    ? context.basis.playerAliases.filter((a) => a.agreementId === agreementId)
    : [{ teamId, playerId: player.id }];
  const rows = await tx<{
    after_state: OfflineEvidence;
  }>`select distinct on(record_id) after_state from finance_audit
    where action='Offline team payment verification' and record_id=any(${receipts}::text[]) order by record_id,id desc`;
  const verified = new Set<string>();
  let cents = 0;
  for (const { after_state: e } of rows) {
    const matches = player.payments.filter((p) => p.receipt === e.receipt);
    const payment = matches[0];
    if (
      e.version !== 1 ||
      !e.verified ||
      e.lockedAt !== player.feeLock.lockedAt ||
      matches.length !== 1 ||
      !payment ||
      !isOfflineMethod(payment.method) ||
      e.method !== payment.method ||
      e.label !== payment.label ||
      e.amount !== payment.amount ||
      !Number.isSafeInteger(Math.round(e.amount * 100)) ||
      e.amount <= 0 ||
      !(agreementId && e.financialAgreementId
        ? agreementId === e.financialAgreementId
        : aliases.some((a) => a.teamId === e.teamId && a.playerId === e.playerId))
    )
      continue;
    verified.add(payment.receipt);
    cents += Math.round(e.amount * 100);
  }
  return { cents, receipts: verified };
}

export async function writeOfflineVerification(
  tx: Sql,
  actor: string,
  evidence: OfflineEvidence,
  reason: string,
) {
  await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state) values(${actor},${evidence.receipt},'Offline team payment verification',${reason},${JSON.stringify(evidence)}::jsonb)`;
  await tx`update enrollment_cases set cleared_at=null,cleared_by=null,clearance_reason='Owner review required after offline payment verification changed.'
    where (team_id=${evidence.teamId} and player_id=${evidence.playerId}) or (${evidence.financialAgreementId}::text is not null and financial_agreement_id=${evidence.financialAgreementId})`;
}
