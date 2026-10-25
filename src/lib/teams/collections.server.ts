import { randomUUID, createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { SquareClient, Square } from "square";
import type { Sql } from "../db";
import type { SquareSettings } from "../commerce/square-config";
import { assertSquareCheckoutScope } from "../commerce/square-config";
import { squareKey } from "../commerce/square.server";
import { fulfillSquarePayment, type SquareOrder } from "../commerce/square-payments.server";
import { lockFinancialExecution, withFinancialContext } from "../finance/context.server";
import {
  collectionAgreement,
  type CollectionAuthorization,
} from "./collection-authorization.server";
import {
  installmentRemaining,
  collectionDueAt,
  backupDueAt,
  confirmedCollectionDecline,
} from "./collection-policy";
import { prepareTeamCheckout, validateTeamPayment } from "./payment.server";
export type CollectionRun = {
  id: string;
  authorization_id: string;
  installment_index: number;
  amount_cents: number;
  status: string;
  order_id: string | null;
  primary_order_id: string | null;
  request_id: string;
  backup_request_id: string;
  primary_attempt_id: string;
  backup_attempt_id: string;
  primary_card_id: string;
  backup_card_id: string;
  next_attempt_at: Date;
  attempted_at: Date | null;
};
export function teamCollectionsEnabled(
  env: Record<string, string | undefined>,
  environment: string,
) {
  if (env.TEAM_AUTOPAY_ENABLED !== "true") return false;
  if (environment === "production")
    return (
      env.SQUARE_DEPLOY_CONTEXT === "production" && env.TEAM_AUTOPAY_SANDBOX_VERIFIED === "true"
    );
  return environment === "sandbox" && env.SQUARE_DEPLOY_CONTEXT !== "production";
}
async function received(sql: Sql, auth: CollectionAuthorization) {
  return withFinancialContext(sql, auth.user_id, "read", async (tx) => {
    const a = await collectionAgreement(tx, auth.user_id, {
      teamId: auth.team_id,
      playerId: auth.player_id,
    });
    if (a.key !== auth.agreement_key || !isDeepStrictEqual(a.terms, auth.terms))
      throw Error("Accepted collection terms changed.");
    const total = Math.round(
      (a.player.payments.reduce((n, p) => n + p.amount, 0) +
        a.player.credits.reduce((n, p) => n + p.amount, 0)) *
        100,
    );
    let receivedCents = total;
    if (auth.environment === "sandbox") {
      const [sandbox] = await tx<{
        cents: number;
      }>`select coalesce(sum(greatest(0,p.amount_cents-p.refunded_cents)),0)::int as cents from square_payments p join commerce_orders o on o.id=p.order_id and o.square_payment_id=p.id where p.environment='sandbox' and o.payment_environment='sandbox' and o.status='paid' and o.kind='team-fee' and o.snapshot->'teamFee'->>'lockedAt'=${auth.locked_at} and ((o.snapshot->'teamFee'->>'teamId'=${auth.team_id} and o.snapshot->'teamFee'->>'playerId'=${auth.player_id}) or (${auth.financial_agreement_id}::text is not null and o.snapshot->'teamFee'->>'financialAgreementId'=${auth.financial_agreement_id}))`;
      receivedCents =
        sandbox.cents + Math.round(a.player.credits.reduce((n, c) => n + c.amount, 0) * 100);
    }
    return installmentRemaining(auth.terms, receivedCents, a.record.lateFeeInstallments);
  });
}
async function markReview(sql: Sql, run: CollectionRun) {
  await sql`update team_collection_runs set status='review',updated_at=now() where id=${run.id} and status<>'paid'`;
  if (run.order_id) {
    await sql`insert into payment_notifications(id,order_id,kind) values(${"owner-review:" + run.order_id},${run.order_id},'owner-payment-review') on conflict do nothing`;
    await sql`insert into payment_notifications(id,order_id,kind) values(${"team-review:" + run.order_id},${run.order_id},'team-collection-review') on conflict do nothing`;
  }
}
/** One bounded collection per invocation. No browser or scheduler may supply a charge amount. */
export async function runTeamCollections(
  sql: Sql,
  client: SquareClient,
  c: SquareSettings,
  { enabled, now = new Date() }: { enabled: boolean; now?: Date },
) {
  if (!enabled) return { skipped: true, processed: 0 };
  assertSquareCheckoutScope(c, { kind: "team-fee", recurring: false });
  const { location } = await client.locations.get({ locationId: c.locationId });
  if (
    location?.merchantId !== c.merchantId ||
    location.status !== "ACTIVE" ||
    location.currency !== "USD" ||
    location.timezone !== "America/Chicago" ||
    !location.capabilities?.includes("CREDIT_CARD_PROCESSING")
  )
    throw Error("Collection location verification failed.");
  // Known provider success can recover an interrupted response. Uncertain attempts never fall through to a backup.
  await sql`update team_collection_runs r set status='paid',updated_at=now() from commerce_orders o where r.order_id=o.id and o.status='paid' and o.payment_environment=${c.environment} and r.status<>'paid'`;
  const interrupted =
    await sql<CollectionRun>`update team_collection_runs r set status='review',updated_at=now() from team_collection_authorizations a where r.authorization_id=a.id and a.environment=${c.environment} and r.status in ('primary_pending','backup_pending') and r.attempted_at<${new Date(+now - 120000).toISOString()}::timestamptz returning r.*`;
  for (const run of interrupted) await markReview(sql, run);
  const authorizations =
    await sql<CollectionAuthorization>`select * from team_collection_authorizations where environment=${c.environment} and status='active' and exists(select 1 from jsonb_array_elements(terms->'rows') with ordinality schedule(row,num) where schedule.row->>'date'<=${now.toISOString().slice(0, 10)} and not exists(select 1 from team_collection_runs r where r.authorization_id=team_collection_authorizations.id and r.installment_index=schedule.num-1)) order by updated_at,id limit 100`;
  for (const auth of authorizations) {
    if (!auth.primary_card_id || !auth.backup_card_id || !auth.authorized_at) continue;
    let rows;
    try {
      rows = await received(sql, auth);
    } catch {
      await sql`update team_collection_authorizations set status='paused',updated_at=now() where id=${auth.id} and status='active'`;
      continue;
    }
    const due = rows.find((r) => r.remainingCents > 0 && +collectionDueAt(r.date) <= +now);
    if (!due) continue;
    await sql`insert into team_collection_runs(id,authorization_id,installment_index,due_date,amount_cents,request_id,backup_request_id,primary_attempt_id,backup_attempt_id,primary_card_id,backup_card_id,next_attempt_at) values(${randomUUID()},${auth.id},${due.index},${due.date},${due.remainingCents},${randomUUID()},${randomUUID()},${randomUUID()},${randomUUID()},${auth.primary_card_id},${auth.backup_card_id},${now.toISOString()}) on conflict(authorization_id,installment_index) do nothing`;
  }
  const claimed = await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const [run] =
      await tx<CollectionRun>`select r.* from team_collection_runs r join team_collection_authorizations a on a.id=r.authorization_id where a.environment=${c.environment} and a.status='active' and r.status in ('ready','primary_declined') and r.next_attempt_at<=${now.toISOString()}::timestamptz order by r.next_attempt_at,r.id limit 1 for update of r skip locked`;
    if (!run) return null;
    const [auth] =
      await tx<CollectionAuthorization>`select * from team_collection_authorizations where id=${run.authorization_id} and status='active' for update`;
    if (!auth) return null;
    const backup = run.status === "primary_declined";
    await tx`update team_collection_runs set status=${backup ? "backup_pending" : "primary_pending"},attempted_at=${now.toISOString()},updated_at=now() where id=${run.id}`;
    return { run, auth, backup };
  });
  if (!claimed) return { skipped: false, processed: 0 };
  const { run, auth, backup } = claimed;
  let orderId = run.order_id;
  try {
    const remaining = (await received(sql, auth))[run.installment_index]?.remainingCents || 0;
    if (remaining <= 0) {
      await sql`update team_collection_runs set status='cancelled',updated_at=now() where id=${run.id}`;
      return { skipped: false, processed: 1 };
    }
    const active =
      await sql`select id from team_collection_authorizations where id=${auth.id} and status='active' and authorized_at=${auth.authorized_at}`;
    if (!active.length) throw Error("Collection authorization changed.");
    if (run.primary_card_id !== auth.primary_card_id || run.backup_card_id !== auth.backup_card_id)
      throw Error("Saved collection cards changed; review the outstanding installment.");
    const sourceId = backup ? run.backup_card_id : run.primary_card_id;
    const { card } = await client.cards.get({ cardId: sourceId });
    const { customer } = await client.customers.get({ customerId: auth.customer_id });
    if (
      card?.id !== sourceId ||
      !card.enabled ||
      card.customerId !== auth.customer_id ||
      customer?.referenceId !== auth.user_id
    )
      throw Error("Saved card verification requires review.");
    const prepared = await prepareTeamCheckout(
      sql,
      auth.user_id,
      {
        teamId: auth.team_id,
        playerId: auth.player_id,
        amount: remaining,
        requestId: backup ? run.backup_request_id : run.request_id,
        consent: true,
      },
      c.environment,
    );
    orderId = prepared.orderId;
    const attemptId = backup ? run.backup_attempt_id : run.primary_attempt_id;
    await sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      const [current] =
        await tx<CollectionAuthorization>`select * from team_collection_authorizations where id=${auth.id} and status='active' for update`;
      if (!current || +new Date(current.authorized_at!) !== +new Date(auth.authorized_at!))
        throw Error("Collection authorization changed.");
      const [order] =
        await tx<SquareOrder>`select * from commerce_orders where id=${orderId!} for update`;
      await validateTeamPayment(tx, order);
      const other =
        await tx`select id from square_payment_attempts where order_id=${order.id} and status in ('pending','unknown','completed')`;
      if (other.length) throw Error("Payment already submitted; reconcile before retrying.");
      await tx`update commerce_orders set square_customer_id=${auth.customer_id} where id=${order.id}`;
      await tx`insert into square_payment_attempts(id,order_id,token_hash) values(${attemptId},${order.id},${createHash("sha256").update(sourceId).digest("hex")})`;
      await tx`update team_collection_runs set order_id=${order.id},primary_order_id=case when ${backup} then primary_order_id else ${order.id} end,amount_cents=${remaining},updated_at=now() where id=${run.id}`;
    });
    let payment: Square.Payment | undefined;
    try {
      ({ payment } = await client.payments.create({
        idempotencyKey: squareKey("team-automatic", attemptId),
        sourceId,
        amountMoney: { amount: BigInt(remaining), currency: "USD" },
        autocomplete: true,
        locationId: c.locationId,
        customerId: auth.customer_id,
        referenceId: orderId,
        buyerEmailAddress: customer?.emailAddress ?? undefined,
        note: "Prospects agreed team installment",
      }));
    } catch (error) {
      const decline = confirmedCollectionDecline(error);
      await sql.transaction(async (tx) => {
        await lockFinancialExecution(tx);
        await tx`update square_payment_attempts set status=${decline ? "declined" : "unknown"} where id=${attemptId} and status='pending'`;
        if (decline) {
          if (backup)
            await tx`update team_collection_runs set status='failed',backup_failure=${decline},updated_at=now() where id=${run.id}`;
          else
            await tx`update team_collection_runs set status='primary_declined',primary_failure=${decline},next_attempt_at=${backupDueAt(now).toISOString()},updated_at=now() where id=${run.id}`;
          await tx`update commerce_orders set status='expired',updated_at=now() where id=${orderId!} and status='pending'`;
        } else
          await tx`update team_collection_runs set status='review',updated_at=now() where id=${run.id}`;
        await tx`insert into payment_notifications(id,order_id,kind) values(${"team-collection:" + orderId},${orderId!},${decline ? (backup ? "team-collection-failed" : "team-primary-failed") : "team-collection-review"}) on conflict do nothing`;
        await tx`insert into payment_notifications(id,order_id,kind) values(${"owner-review:" + orderId},${orderId!},'owner-payment-review') on conflict do nothing`;
      });
      return { skipped: false, processed: 1 };
    }
    if (!payment?.id) throw Error("Payment confirmation is uncertain.");
    const verified = await client.payments.get({ paymentId: payment.id });
    if (!verified.payment || verified.payment.status !== "COMPLETED")
      throw Error("Payment requires reconciliation.");
    await sql.transaction(async (tx) => {
      await fulfillSquarePayment(tx, verified.payment!, c);
      const [order] = await tx<{
        status: string;
      }>`select status from commerce_orders where id=${orderId!}`;
      await tx`update team_collection_runs set status=${order.status === "paid" ? "paid" : "review"},updated_at=now() where id=${run.id}`;
    });
  } catch {
    await markReview(sql, { ...run, order_id: orderId });
  }
  return { skipped: false, processed: 1 };
}
