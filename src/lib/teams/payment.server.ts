import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import { assertCommerceRole } from "../commerce/access.server";
import type { SquareOrder } from "../commerce/square-payments.server";
import type { ClubRecord, Player } from "./types";
import { remainingTeamPaymentCents } from "./recorded-payment-policy";
import { teamCheckoutSchema, type TeamCheckout } from "./payment-contracts";
import { queueExpiredCheckoutRefunds } from "../commerce/store.server";
import {
  loadFinancialContextInTransaction,
  loadFinancialProviderContextInTransaction,
  lockFinancialExecution,
  reconcileFinancialTeamPaymentInTransaction,
} from "../finance/context.server";
import { resolveFinancialAgreement } from "../finance/basis.server";
import {
  financialTeamFulfillmentDecision,
  planFinancialTeamCheckout,
  validateFinancialTeamPayment,
  type FinancialTeamOrder,
  type FinancialTeamPaymentAttempt,
} from "./financial-payment-adapter.server";
async function lockedPlayer(sql: Sql, teamId: string, playerId: string) {
  const [row] = await sql<{
    payload: ClubRecord;
    rev: number;
    demo: boolean;
  }>`select payload,rev,demo from club_state where id='oklahoma-prospects' for update`;
  const team = row?.payload.teams.find((t) => t.id === teamId),
    player = team?.roster.find((p) => p.id === playerId);
  if (!row || row.demo || !team || !player) throw Error("Team player record is unavailable.");
  return { row, team, player };
}
function guardian(p: Player, me: Awaited<ReturnType<typeof resolveIdentity>>) {
  assertCommerceRole(me);
  if (!(
    (me.role !== "player" && p.parents.some((g) => g.email.trim().toLowerCase() === me.email)) ||
    (me.role === "player" ? me.guardianHouseholdIds : me.familyIds).includes(p.familyId)
  ))
    throw Error("Only this player’s parent or guardian can pay their team fee.");
}
export async function prepareTeamCheckout(
  sql: Sql,
  userId: string,
  raw: TeamCheckout,
  environment: string,
) {
  const a = teamCheckoutSchema.parse(raw),
    me = await resolveIdentity(sql, userId);
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const context = await loadFinancialContextInTransaction(tx, userId);
    if (context.mode === "basis") {
      const basis = context.basis!;
      const { identity } = resolveFinancialAgreement(basis, a);
      const aliases = basis.playerAliases.filter((alias) => alias.agreementId === identity.id);
      // Include the request key globally, and every historical pair for this
      // agreement. Current operational placement never limits payment recovery.
      const orders = await tx<FinancialTeamOrder>`select * from commerce_orders o
        where request_key=${a.requestId} or (kind='team-fee' and payment_environment=${environment}
          and (snapshot->'teamFee'->>'financialAgreementId'=${identity.id}
            or exists(select 1 from jsonb_to_recordset(${JSON.stringify(aliases)}::jsonb) as a("teamId" text,"playerId" text)
              where a."teamId"=o.snapshot->'teamFee'->>'teamId' and a."playerId"=o.snapshot->'teamFee'->>'playerId')))
        for update`;
      const attempts =
        await tx<FinancialTeamPaymentAttempt>`select order_id,status from square_payment_attempts where order_id=any(${orders.map((o) => o.id)}::text[]) and status in ('pending','unknown')`;
      // The context checked these flags from current locked account rows. No
      // client-supplied eligibility, role, email, or household claim is used.
      const plan = planFinancialTeamCheckout(basis, {
        request: a,
        payer: {
          userId: context.principal.userId,
          emailVerified: true,
          disabledAt: null,
          financialRestricted: false,
        },
        environment,
        orders,
        attempts,
        now: new Date(),
      });
      if (plan.action === "reuse")
        return {
          orderId: plan.order.id,
          totalCents: plan.order.total_cents,
          holdUntil: new Date(plan.order.hold_until).toISOString(),
          name: context.principal.currentName,
          email: context.principal.currentEmail,
        };
      const id = randomUUID();
      await tx`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment) values(${id},${a.requestId},${userId},${context.principal.currentEmail},null,${plan.quote.productId},'team-fee',${JSON.stringify(plan.quote)}::jsonb,${a.amount},${plan.holdUntil},'square',${environment})`;
      return {
        orderId: id,
        totalCents: a.amount,
        holdUntil: plan.holdUntil,
        name: context.principal.currentName,
        email: context.principal.currentEmail,
      };
    }
    const [prior] =
      await tx<SquareOrder>`select * from commerce_orders where request_key=${a.requestId} for update`;
    const { team, player } = await lockedPlayer(tx, a.teamId, a.playerId);
    guardian(player, me);
    if (prior) {
      if (
        prior.user_id !== userId ||
        prior.snapshot.teamFee?.playerId !== a.playerId ||
        prior.snapshot.teamFee?.teamId !== a.teamId ||
        prior.total_cents !== a.amount ||
        prior.payment_environment !== environment
      )
        throw Error("Checkout request changed.");
      if (prior.status !== "pending" || +new Date(prior.hold_until) <= Date.now())
        throw Error("Checkout ended. Review your payment history before trying again.");
      return {
        orderId: prior.id,
        totalCents: prior.total_cents,
        holdUntil: new Date(prior.hold_until).toISOString(),
        name: me.name,
        email: me.email,
      };
    }
    if (!player.agreement.signedAt || !player.planLock || team.closed || player.withdrawn)
      throw Error(
        "Accept the published team fee before paying. Contact the office for a closed roster.",
      );
    if (a.amount > remainingTeamPaymentCents(player))
      throw Error("Payment exceeds the remaining accepted fee. Refresh your balance.");
    const pending =
      await tx`select id from commerce_orders o where kind='team-fee' and payment_environment=${environment} and snapshot->'teamFee'->>'playerId'=${a.playerId} and (status='payment_review' or (status='pending' and (hold_until>now() or exists(select 1 from square_payment_attempts where order_id=o.id and status in ('pending','unknown'))))) limit 1`;
    if (pending.length)
      throw Error(
        "A team payment is already awaiting completion or review. Finish that checkout or wait for it to expire before starting another.",
      );
    const id = randomUUID(),
      end = new Date(Date.now() + 600000).toISOString();
    const quote = {
      productId: team.id,
      kind: "team-fee",
      title: team.name + " · " + player.name + " · team fee",
      totalCents: a.amount,
      regularCents: a.amount,
      setupCents: 0,
      recurring: false,
      assessment: false,
      duration: 0,
      sessionMinutes: 0,
      credits: 0,
      remote: 0,
      expiresDays: 365,
      discipline: team.sport,
      resources: [],
      lines: [{ label: "Payment toward accepted season fee", cents: a.amount }],
      teamRate: false,
      needsSlot: false,
      consentAt: new Date().toISOString(),
      teamFee: {
        teamId: team.id,
        playerId: player.id,
        lockedAt: player.feeLock!.lockedAt,
        role: player.roleType,
      },
    };
    await tx`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment) values(${id},${a.requestId},${userId},${me.email},null,${team.id},'team-fee',${JSON.stringify(quote)}::jsonb,${a.amount},${end},'square',${environment})`;
    return { orderId: id, totalCents: a.amount, holdUntil: end, name: me.name, email: me.email };
  });
}
export async function validateTeamPayment(sql: Sql, order: SquareOrder) {
  await lockFinancialExecution(sql);
  const context = await loadFinancialContextInTransaction(sql, order.user_id);
  if (context.mode === "basis") {
    validateFinancialTeamPayment(context.basis!, order, {
      userId: context.principal.userId,
      emailVerified: true,
      disabledAt: null,
      financialRestricted: false,
    });
    return;
  }
  const m = order.snapshot.teamFee;
  if (!m) throw Error("Team fee details are missing.");
  const { player, team } = await lockedPlayer(sql, m.teamId, m.playerId);
  // Resolve against the original, verified account again; roster links can change.
  const [u] = await sql<{
    email: string;
    role: string;
  }>`select u.email,p.role from "user" u join profiles p on p.user_id=u.id where u.id=${order.user_id} and u."emailVerified"=true and u."disabledAt" is null`;
  const homes = await sql<{
    household_id: string;
  }>`select household_id from person_guardian_links where user_id=${order.user_id} union select household_id from household_members where user_id=${order.user_id} and ${u?.role || "player"}<>'player'`;
  if (
    !u ||
    !(
      (u.role !== "player" &&
        player.parents.some(
          (g) => g.email.trim().toLowerCase() === u.email.trim().toLowerCase(),
        )) ||
      homes.some((h) => h.household_id === player.familyId)
    )
  )
    throw Error("Guardian access changed.");
  if (
    team.closed ||
    player.withdrawn ||
    !player.agreement.signedAt ||
    player.feeLock?.lockedAt !== m.lockedAt ||
    player.roleType !== m.role ||
    order.total_cents > remainingTeamPaymentCents(player)
  )
    throw Error("The accepted fee or remaining balance changed. Refresh before paying.");
}
/** Transaction only. Keep gross/refunds in Square history; the roster ledger reflects net funds received. */
export async function syncTeamPayment(sql: Sql, orderId: string) {
  await lockFinancialExecution(sql);
  const [order] =
    await sql<SquareOrder>`select * from commerce_orders where id=${orderId} for update`;
  const m = order?.snapshot.teamFee;
  if (!m || !order.square_payment_id || order.payment_environment !== "production") return;
  const reconciliation = await reconcileFinancialTeamPaymentInTransaction(sql, orderId);
  if (reconciliation.mode === "basis") return;
  const { row, player } = await lockedPlayer(sql, m.teamId, m.playerId);
  const [payment] = await sql<{
    amount_cents: number;
    refunded_cents: number;
    receipt_url: string;
  }>`select amount_cents,refunded_cents,receipt_url from square_payments where id=${order.square_payment_id}`;
  if (!payment) return;
  const [external] = await sql<{
    amount: number;
  }>`select coalesce(sum(amount_cents),0)::int as amount from commerce_refunds where square_payment_id=${order.square_payment_id} and external_status='reconciled'`;
  const net = Math.max(0, payment.amount_cents - payment.refunded_cents - external.amount),
    label = "Square: " + order.square_payment_id;
  const existing = player.payments.find((p) => p.label === label && p.method === "Square website");
  if (!existing && order.status !== "paid") return;
  if (existing && Math.round(existing.amount * 100) === net) return;
  if (existing) existing.amount = net / 100;
  else
    player.payments.push({
      date: new Date(order.paid_at || new Date()).toISOString().slice(0, 10),
      amount: net / 100,
      fee: 0,
      charged: payment.amount_cents / 100,
      method: "Square website",
      label,
      receipt: payment.receipt_url || order.square_payment_id,
    });
  player.depositPaid =
    Math.round(player.payments.reduce((s, p) => s + p.amount, 0) * 100) >=
    Math.round((player.planLock?.dep || 0) * 100);
  row.payload._rev = row.rev + 1;
  row.payload._savedAt = new Date().toISOString();
  await sql`select set_config('app.actor_id',${order.user_id},true)`;
  await sql`update club_state set payload=${JSON.stringify(row.payload)}::jsonb,rev=${row.rev + 1},updated_at=now() where id='oklahoma-prospects'`;
  await sql`insert into finance_audit(actor_id,record_id,action,reason,after_state) values(${order.user_id},${order.square_payment_id},'Square team payment reconciliation','Verified Square payment/refund and externally reconciled refund balance',${JSON.stringify({ teamId: m.teamId, playerId: m.playerId, gross: payment.amount_cents, refunded: payment.refunded_cents, external: external.amount, net })}::jsonb)`;
}
export async function fulfillTeamPayment(sql: Sql, order: SquareOrder, environment: string) {
  await lockFinancialExecution(sql);
  const m = order.snapshot.teamFee;
  if (!m) throw Error("Team fee details are missing.");
  const context = await loadFinancialProviderContextInTransaction(sql, order.id);
  if (!context) throw Error("Verified Square team payment is unavailable.");
  if (context.mode === "basis") {
    // fulfillSquarePayment's original object predates its stored payment-ID and
    // paid-at updates. Decide from the verified row just bound by the loader.
    const [stored] =
      await sql<SquareOrder>`select * from commerce_orders where id=${order.id} for update`;
    if (stored.payment_environment !== environment) throw Error("Payment environment mismatch.");
    const decision = financialTeamFulfillmentDecision(context.basis!, stored);
    await sql`update commerce_orders set status=${decision.status},updated_at=now() where id=${order.id}`;
    if (decision.queueRefund) {
      await queueExpiredCheckoutRefunds(sql, environment, order.id);
      return;
    }
    await syncTeamPayment(sql, order.id);
    await sql`insert into payment_notifications(id,order_id,kind) values(${"receipt:" + order.id},${order.id},'receipt') on conflict do nothing`;
    return;
  }
  const { player } = await lockedPlayer(sql, m.teamId, m.playerId);
  if (
    player.feeLock?.lockedAt !== m.lockedAt ||
    player.roleType !== m.role ||
    !player.feeLock ||
    order.total_cents > remainingTeamPaymentCents(player)
  ) {
    await sql`update commerce_orders set status='payment_review',updated_at=now() where id=${order.id}`;
    await queueExpiredCheckoutRefunds(sql, environment, order.id);
    return;
  }
  await sql`update commerce_orders set status='paid',updated_at=now() where id=${order.id}`;
  await syncTeamPayment(sql, order.id);
  await sql`insert into payment_notifications(id,order_id,kind) values(${"receipt:" + order.id},${order.id},'receipt') on conflict do nothing`;
}
