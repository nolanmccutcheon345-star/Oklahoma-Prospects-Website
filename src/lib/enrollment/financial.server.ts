import type { Sql } from "../db";
import {
  withFinancialContext,
  isFinancialGuardian,
  type FinancialContext,
} from "../finance/context.server";
import { resolveFinancialAgreement } from "../finance/basis.server";
import { caseInput } from "./enrollment-contracts";
import { caseFor, packetFor } from "./enrollment.server";
import { recordEnrollment } from "./handbooks.server";
import { z } from "zod";

async function financialState(
  tx: Sql,
  context: FinancialContext,
  teamId: string,
  playerId: string,
) {
  const p = context.club.teams.find((t) => t.id === teamId)?.roster.find((p) => p.id === playerId);
  if (!p) throw Error("Financial player identity unavailable.");
  const agreementId = context.basis
    ? resolveFinancialAgreement(context.basis, { teamId, playerId }).identity.id
    : null;
  const aliases = context.basis
    ? context.basis.playerAliases.filter((a) => a.agreementId === agreementId)
    : [{ teamId, playerId }];
  const provider = await tx<{
    id: string;
    net: number;
  }>`select p.id,greatest(0,p.amount_cents-p.refunded_cents-coalesce((select sum(r.amount_cents) from commerce_refunds r where r.square_payment_id=p.id and r.external_status='reconciled'),0))::int as net
    from square_payments p join commerce_orders o on o.id=p.order_id and o.square_payment_id=p.id
    where p.environment='production' and o.payment_environment='production' and p.status='COMPLETED' and o.kind='team-fee' and o.status='paid' and p.amount_cents=o.total_cents and o.snapshot->'teamFee'->>'lockedAt'=${p.feeLock?.lockedAt || null}
    and ((${agreementId}::text is not null and o.snapshot->'teamFee'->>'financialAgreementId'=${agreementId}) or (o.snapshot->'teamFee'->>'financialAgreementId' is null and exists(select 1 from jsonb_to_recordset(${JSON.stringify(aliases)}::jsonb) a("teamId" text,"playerId" text) where a."teamId"=o.snapshot->'teamFee'->>'teamId' and a."playerId"=o.snapshot->'teamFee'->>'playerId')))`;
  // Require both provider verification and existing reconciliation. Neither a client redirect nor an unreconciled payment qualifies.
  const verifiedCents = provider.reduce(
    (n, v) =>
      n +
      Math.min(
        v.net,
        Math.max(
          0,
          Math.round(
            (p.payments.find((r) => r.method === "Square website" && r.label === "Square: " + v.id)
              ?.amount || 0) * 100,
          ),
        ),
      ),
    0,
  );
  const creditCents = Math.max(0, Math.round(p.credits.reduce((n, c) => n + c.amount, 0) * 100));
  const depositCents = p.planLock ? Math.round(p.planLock.dep * 100) : null;
  return {
    agreementId,
    agreementSigned: Boolean(p.feeLock && p.planLock && p.agreement.signedAt),
    agreementVersion: p.agreement.version,
    depositCents,
    verifiedCents,
    creditCents,
    depositSatisfied: depositCents !== null && verifiedCents + creditCents >= depositCents,
  };
}
export async function enrollmentFinance(sql: Sql, actor: string, raw: unknown) {
  const i = caseInput.parse(raw);
  return withFinancialContext(sql, actor, "read", async (tx, c) => {
    if (!c.principal.owner && !isFinancialGuardian(c, i.teamId, i.playerId))
      throw Error("Financial guardian or owner access required.");
    return financialState(tx, c, i.teamId, i.playerId);
  });
}
export const clearInput = caseInput
  .extend({ reason: z.string().trim().min(10).max(1000), medicalReviewed: z.literal(true) })
  .strict();
export async function clearEnrollment(sql: Sql, actor: string, raw: unknown) {
  const i = clearInput.parse(raw);
  return withFinancialContext(sql, actor, "read", async (tx, financial) => {
    if (!financial.principal.owner) throw Error("Only Steve or Nolan may clear an enrollment.");
    const c = await caseFor(tx, actor, i),
      packet = await packetFor(tx, c.team.id, c.team.sport);
    const status = await financialState(tx, financial, i.teamId, i.playerId);
    const [signed] =
      await tx`select id from enrollment_signatures where case_id=${c.row.id} and packet_digest=${packet.digest} limit 1`;
    const [medical] = await tx`select case_id from enrollment_medical where case_id=${c.row.id}`;
    const links = await tx<{
      athlete_id: string;
    }>`select athlete_id from team_dev_roster_links where team_id=${i.teamId} and roster_player_id=${i.playerId} and ended_at is null`;
    const [waiver] =
      links.length === 1
        ? await tx`select id from club_waivers where athlete_id=${links[0].athlete_id} and signed_at<=now() and signed_at+interval '1 year'>now() limit 1`
        : [];
    if (
      !c.pilot.signaturesOpen ||
      !packet.ready ||
      !signed ||
      !medical ||
      !waiver ||
      !status.agreementSigned ||
      !status.depositSatisfied
    )
      throw Error(
        "Complete the required packet, medical information, current waiver, accepted fee and verified deposit/fundraising credit before clearance.",
      );
    await tx`update enrollment_cases set financial_agreement_id=${status.agreementId},cleared_at=now(),cleared_by=${actor},clearance_reason=${i.reason} where id=${c.row.id}`;
    await recordEnrollment(tx, actor, "enrollment.cleared", c.row.id);
    return { ok: true };
  });
}
