import { createHash, randomUUID } from "node:crypto";
import type { SquareClient } from "square";
import type { Sql } from "../db";
import type { SquareSettings } from "../commerce/square-config";
import { squareKey } from "../commerce/square.server";
import {
  withFinancialContext,
  loadFinancialContextInTransaction,
  isFinancialGuardian,
  lockFinancialExecution,
} from "../finance/context.server";
import { resolveFinancialAgreement } from "../finance/basis.server";
import { collectionConsent, type CollectionTerms } from "./collection-policy";
export type CollectionIds = { teamId: string; playerId: string };
export type CollectionAuthorization = {
  id: string;
  environment: string;
  agreement_key: string;
  team_id: string;
  player_id: string;
  financial_agreement_id: string | null;
  locked_at: string;
  user_id: string;
  customer_id: string;
  primary_card_id: string | null;
  backup_card_id: string | null;
  primary_display: { brand: string; last4: string } | null;
  backup_display: { brand: string; last4: string } | null;
  primary_fingerprint: string | null;
  backup_fingerprint: string | null;
  status: string;
  terms: CollectionTerms;
  authorized_at: Date | null;
};
export async function collectionAgreement(tx: Sql, actor: string, ids: CollectionIds) {
  const context = await loadFinancialContextInTransaction(tx, actor);
  if (!isFinancialGuardian(context, ids.teamId, ids.playerId))
    throw Error("Only this athlete's authorized guardian can authorize saved-card collection.");
  const resolved = context.basis ? resolveFinancialAgreement(context.basis, ids) : null;
  const team = resolved?.team || context.club.teams.find((t) => t.id === ids.teamId);
  const player = resolved?.player || team?.roster.find((p) => p.id === ids.playerId);
  const record = context.feePlans.find((p) => p.team_id === team?.id)?.payload.players[
    player?.id || ""
  ];
  if (
    !team ||
    team.closed ||
    !player?.feeLock ||
    !player.planLock ||
    !player.agreement.signedAt ||
    player.withdrawn ||
    !record?.automaticPayments ||
    record.latePolicy?.bps !== 2000 ||
    !record.acceptedSchedule ||
    !record.acceptedFeeCents
  )
    throw Error("An accepted agreement with automatic installments is required.");
  const terms: CollectionTerms = {
    version: 1,
    acceptedFeeCents: record.acceptedFeeCents,
    rows: record.acceptedSchedule,
    graceDays: record.latePolicy.grace,
    lateFeeBps: 2000,
  };
  if (terms.rows.reduce((n, r) => n + r.amountCents, 0) !== terms.acceptedFeeCents)
    throw Error("Accepted installment schedule does not reconcile.");
  const agreementId = resolved?.identity.id || null;
  const key = createHash("sha256")
    .update(
      JSON.stringify([agreementId || team.id, agreementId || player.id, player.feeLock.lockedAt]),
    )
    .digest("hex");
  return { context, team, player, record, terms, agreementId, key };
}
export async function collectionStatus(
  sql: Sql,
  actor: string,
  ids: CollectionIds,
  environment: string,
) {
  return withFinancialContext(sql, actor, "read", async (tx) => {
    const a = await collectionAgreement(tx, actor, ids);
    const [row] =
      await tx<CollectionAuthorization>`select * from team_collection_authorizations where agreement_key=${a.key} and environment=${environment}`;
    if (row && row.user_id !== actor)
      return {
        status: `managed by another guardian (${row.status})`,
        terms: a.terms,
        primary: null,
        backup: null,
        canManage: false,
      };
    return {
      status: row?.status || "not set up",
      terms: a.terms,
      primary: row?.primary_display || null,
      backup: row?.backup_display || null,
      canManage: true,
    };
  });
}
export async function saveCollectionCard(
  sql: Sql,
  client: SquareClient,
  c: SquareSettings,
  actor: string,
  input: CollectionIds & {
    purpose: "primary" | "backup";
    sourceId: string;
    requestId: string;
    consent: true;
  },
) {
  const initial = await withFinancialContext(sql, actor, "read", async (tx) => {
    const a = await collectionAgreement(tx, actor, input);
    const [existing] =
      await tx<CollectionAuthorization>`select * from team_collection_authorizations where agreement_key=${a.key} and environment=${c.environment} for update`;
    if (existing && existing.user_id !== actor)
      throw Error(
        "The guardian who saved these cards must manage them. Contact financial administration if that guardian is unavailable.",
      );
    return {
      key: a.key,
      terms: a.terms,
      lockedAt: a.player.feeLock!.lockedAt,
      teamId: a.team.id,
      playerId: a.player.id,
      agreementId: a.agreementId,
      email: a.context.principal.currentEmail,
      existing,
    };
  });
  const { customer } = initial.existing
    ? await client.customers.get({ customerId: initial.existing.customer_id })
    : await client.customers.create({
        idempotencyKey: squareKey("team-customer", c.environment + ":" + actor),
        emailAddress: initial.email,
        referenceId: actor,
      });
  if (!customer?.id || customer.referenceId !== actor)
    throw Error("Square customer verification failed.");
  const { card } = await client.cards.create({
    idempotencyKey: squareKey("team-card", c.environment + ":" + actor + ":" + input.requestId),
    sourceId: input.sourceId,
    card: { customerId: customer.id },
  });
  if (!card?.id || card.customerId !== customer.id || !card.enabled || !card.fingerprint)
    throw Error("Square could not verify the saved card.");
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const current = await collectionAgreement(tx, actor, input);
    if (
      current.key !== initial.key ||
      JSON.stringify(current.terms) !== JSON.stringify(initial.terms)
    )
      throw Error("The accepted agreement changed. Review before authorizing collection.");
    const [old] =
      await tx<CollectionAuthorization>`select * from team_collection_authorizations where agreement_key=${current.key} and environment=${c.environment} for update`;
    if (old && old.user_id !== actor) throw Error("Another guardian manages this authorization.");
    if (old?.customer_id && old.customer_id !== customer.id)
      throw Error("Payment customer changed.");
    if (
      (input.purpose === "primary" ? old?.backup_fingerprint : old?.primary_fingerprint) ===
      card.fingerprint
    )
      throw Error("Use a different card for the backup payment method.");
    const id = old?.id || randomUUID(),
      display = { brand: card.cardBrand || "Card", last4: card.last4 || "" };
    if (!old)
      await tx`insert into team_collection_authorizations(id,environment,agreement_key,team_id,player_id,financial_agreement_id,locked_at,user_id,customer_id,terms) values(${id},${c.environment},${current.key},${current.team.id},${current.player.id},${current.agreementId},${current.player.feeLock!.lockedAt},${actor},${customer.id!},${JSON.stringify(current.terms)}::jsonb)`;
    if (input.purpose === "primary")
      await tx`update team_collection_authorizations set primary_card_id=${card.id!},primary_display=${JSON.stringify(display)}::jsonb,primary_fingerprint=${card.fingerprint!},status='draft',authorized_at=null,updated_at=now() where id=${id}`;
    else
      await tx`update team_collection_authorizations set backup_card_id=${card.id!},backup_display=${JSON.stringify(display)}::jsonb,backup_fingerprint=${card.fingerprint!},status='draft',authorized_at=null,updated_at=now() where id=${id}`;
    await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state) values(${actor},${id},'Team collection card saved','Guardian consented to secure Square card storage',${JSON.stringify({ purpose: input.purpose, ...display, agreementKey: current.key })}::jsonb)`;
    return { ok: true };
  });
}
export async function authorizeTeamCollection(
  sql: Sql,
  actor: string,
  ids: CollectionIds,
  environment: string,
  action: "activate" | "revoke",
) {
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    // Revocation must remain available even after a team closes or its guardian link changes.
    if (action === "revoke") {
      const rows = await tx<{
        id: string;
      }>`update team_collection_authorizations set status='revoked',updated_at=now() where user_id=${actor} and team_id=${ids.teamId} and player_id=${ids.playerId} and environment=${environment} returning id`;
      for (const row of rows)
        await tx`insert into finance_audit(actor_id,record_id,action,reason) values(${actor},${row.id},'Team collection revoked','Guardian revoked future automatic collection')`;
      return { ok: true };
    }
    const a = await collectionAgreement(tx, actor, ids);
    const [row] =
      await tx<CollectionAuthorization>`select * from team_collection_authorizations where agreement_key=${a.key} and environment=${environment} for update`;
    if (
      !row ||
      row.user_id !== actor ||
      !row.primary_card_id ||
      !row.backup_card_id ||
      row.primary_fingerprint === row.backup_fingerprint
    )
      throw Error("Save two different verified cards before authorizing collection.");
    await tx`update team_collection_authorizations set status='active',terms=${JSON.stringify(a.terms)}::jsonb,consent_text=${collectionConsent},authorized_at=now(),updated_at=now() where id=${row.id}`;
    await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state) values(${actor},${row.id},'Team collection authorized','Guardian authorized the accepted installment schedule',${JSON.stringify({ terms: a.terms, consent: collectionConsent, primary: row.primary_display, backup: row.backup_display })}::jsonb)`;
    return { ok: true };
  });
}
