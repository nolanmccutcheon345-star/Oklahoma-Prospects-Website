import type { Sql } from "../db";
import { createHash } from "node:crypto";
import type { ClubRecord } from "../teams/types";
import type { FeePlan } from "../teams/fee-contracts";
import { calculateFees, membershipRecognition, project } from "../teams/fee-model";
import { accrual, compensation, total, type Payable, type RecordRow } from "./contracts";
export const personId = (email: string) =>
  "person:" + createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
export async function sourceData(sql: Sql, date: string, records: RecordRow[]) {
  const [clubs, plans, earnings, invoices, payments, refunds, files, owners, services, masters] =
    await Promise.all([
      sql<{ payload: ClubRecord }>`select payload from club_state where id='oklahoma-prospects'`,
      sql<{ team_id: string; payload: FeePlan }>`select team_id,payload from team_fee_plans`,
      sql<any>`select e.*,b.id as booking_id,b.coach_id,coalesce(e.gross_cents,case when coalesce((o.snapshot->>'recurring')::boolean,false) or o.snapshot->>'kind'='package' then round(coalesce((o.snapshot->>'regularCents')::numeric,o.total_cents)/greatest(1,coalesce((o.snapshot->>'credits')::numeric,1))) else o.total_cents end) as gross_cents,b.product_id,b.starts_at,b.ends_at,b.status as booking_status,o.status as order_status,o.id as order_id,o.household_id,o.payment_provider,o.snapshot,
   coalesce((select sum(p.amount_cents) from square_payments p where p.order_id=o.id and p.status='COMPLETED'),0) as received,
   coalesce((select sum(p.refunded_cents) from square_payments p where p.order_id=o.id),0)+coalesce((select sum(r.amount_cents) from commerce_refunds r where r.order_id=o.id and r.external_status='reconciled'),0) as refunded
   from booking_records b left join contractor_earnings e on b.id=e.booking_id join commerce_orders o on o.id=b.order_id where ((b.status='completed' and coalesce(b.coach_id,'')<>'') or e.booking_id is not null) and (o.payment_provider<>'square' or o.payment_environment='production')`,
      sql<any>`select i.*,coalesce(u.name,u.email,'Customer') as customer from billing_invoices i left join "user" u on u.id=i.user_id`,
      sql<any>`select p.id,p.order_id,p.amount_cents,p.refunded_cents,p.status,p.created_at,p.environment,o.email as customer,o.kind as category,o.product_id,o.snapshot from square_payments p join commerce_orders o on o.id=p.order_id`,
      sql<any>`select id,order_id,booking_id,square_payment_id,square_refund_id,amount_cents,status,reason,created_at,external_status from commerce_refunds r where exists(select 1 from commerce_orders o where o.id=r.order_id and (o.payment_provider<>'square' or o.payment_environment='production'))`,
      sql<{ payload: any }>`select payload from pd_working_file where id='club'`,
      sql<any>`select g.email,coalesce(u.name,g.email) as name from owner_grants g left join "user" u on u.id=g.user_id where g.revoked_at is null`,
      sql<any>`select id,name from club_services where active=true`,
      sql<any>`select payload from team_budget_master where id='master'`,
    ]);
  const file =
    typeof files[0]?.payload === "string" ? JSON.parse(files[0].payload) : files[0]?.payload;
  const payees: any[] = [],
    candidates: Payable[] = [],
    receivables: any[] = [],
    teams: any[] = [],
    warnings: string[] = [];
  const master = masters[0]?.payload;
  if (!master?.overheadReviewed)
    warnings.push(
      "Review actual facility and staffing costs in Master Defaults before distributions.",
    );
  if (
    master?.overheadReviewed &&
    ((master.facilityCosts || []).some((c: any) => c.monthly > 0) ||
      (master.payroll || []).some((p: any) => p.active && p.monthly > 0)) &&
    !records.some(
      (r) =>
        r.kind === "payable" &&
        (r.payload.source === "facility:" + date.slice(0, 7) ||
          r.payload.source === "staff:" + date.slice(0, 7)),
    )
  )
    warnings.push(
      "Generate and review this month’s facility and staffing payables before distributions.",
    );
  const addPerson = (email: string, name: string, role: string) => {
    if (!email) return "";
    const id =
      records.find(
        (r) => r.kind === "payee" && r.payload.email?.toLowerCase() === email.trim().toLowerCase(),
      )?.id || personId(email);
    if (!payees.some((p) => p.id === id))
      payees.push({
        id,
        email: email.trim().toLowerCase(),
        name,
        role,
        method: "check",
        reference: "",
        active: true,
      });
    return id;
  };
  for (const o of owners)
    addPerson(
      o.email,
      o.name,
      o.email === "nolanmccutcheon@icloud.com"
        ? "Nolan"
        : o.email === "stevemccutcheon89@gmail.com"
          ? "Steve"
          : "Other",
    );
  const pendingRefundOrders = new Set(
    refunds
      .filter((r) => !["completed", "rejected", "failed"].includes(r.status))
      .map((r) => r.order_id),
  );
  for (const e of earnings) {
    const c = file?.coaches?.find((c: any) => c.id === e.coach_id);
    if (!c?.email) {
      warnings.push(
        `Lesson ${e.booking_id}: link its instructor account before approving compensation.`,
      );
      continue;
    }
    const payeeId = addPerson(c.email, c.name || c.email, "Instructor");
    const rule = records
      .filter(
        (r) =>
          r.kind === "rule" &&
          r.payload.payeeId === payeeId &&
          r.payload.serviceId === e.product_id &&
          r.payload.effectiveFrom <= new Date(e.ends_at).toISOString().slice(0, 10),
      )
      .sort((a, b) => b.payload.effectiveFrom.localeCompare(a.payload.effectiveFrom))[0]?.payload;
    if (!rule && e.amount_cents == null) {
      warnings.push(`Lesson ${e.booking_id}: set an instructor compensation rule.`);
      continue;
    }
    if (!Number.isSafeInteger(Number(e.gross_cents))) {
      warnings.push(`Lesson ${e.booking_id}: verify its paid revenue allocation.`);
      continue;
    }
    const saved = records.find((r) => r.id === "lesson:" + e.booking_id)?.payload;
    let gross = Number(e.gross_cents),
      received = Number(e.received),
      refunded = Number(e.refunded),
      fundingId = "";
    if (
      e.payment_provider === "square" &&
      (e.snapshot?.recurring || e.snapshot?.kind === "package")
    ) {
      try {
        const { lessonRefundValue } = await import("../commerce/lesson-refund-value.server");
        const funding = await lessonRefundValue(sql, e.booking_id, e.order_id, e.household_id);
        gross = funding.paidCents;
        fundingId = funding.paymentId;
        const [payment] = await sql<{
          amount_cents: number;
          refunded_cents: number;
        }>`select amount_cents,refunded_cents from square_payments where id=${fundingId}`;
        received = payment.amount_cents;
        refunded =
          payment.refunded_cents +
          total(
            refunds
              .filter(
                (r) => r.square_payment_id === fundingId && r.external_status === "reconciled",
              )
              .map((r) => r.amount_cents),
          );
      } catch {
        warnings.push(
          `Lesson ${e.booking_id}: verify its original funded lesson value before compensation approval.`,
        );
        continue;
      }
    }
    const related = refunds.filter(
      (r) => r.order_id === e.order_id && (!fundingId || r.square_payment_id === fundingId),
    );
    const attributed = total(
      related
        .filter((r) => r.booking_id === e.booking_id && r.status === "completed")
        .map((r) => r.amount_cents),
    );
    const unallocated =
      refunded > 0 &&
      refunded < received &&
      (related.some((r) => !r.booking_id && r.status === "completed") ||
        !related.some((r) => r.status === "completed"));
    if (unallocated)
      warnings.push(
        `Lesson ${e.booking_id}: allocate the partial refund before approving compensation.`,
      );
    const refundRatio =
      received > 0 && refunded >= received ? 1 : gross > 0 ? Math.min(1, attributed / gross) : 0;
    const base =
      saved?.amount ??
      (rule
        ? compensation(
            rule.mode,
            rule.value,
            gross,
            (+new Date(e.ends_at) - +new Date(e.starts_at)) / 60000,
          )
        : Number(e.amount_cents));
    const amount = Math.max(0, base - Math.round(base * refundRatio));
    candidates.push({
      id: "lesson:" + e.booking_id,
      payeeId,
      category: "instructor",
      teamId: "",
      reason: `Completed lesson · ${e.product_id}`,
      amount: base,
      earned: amount,
      due: new Date(e.ends_at).toISOString().slice(0, 10),
      source: "lesson:" + e.booking_id,
      approved: 0,
      paid: saved?.paid ?? (e.status === "paid" ? Number(e.amount_cents) : 0),
      state: pendingRefundOrders.has(e.order_id) || unallocated ? "held" : "pending approval",
      gross,
      adjustment: amount - base,
      legacyPaid: saved?.legacyPaid ?? e.status === "paid",
    });
  }
  for (const t of clubs[0]?.payload?.teams || []) {
    const plan = plans.find((p) => p.team_id === t.id)?.payload;
    let billed = 0,
      collected = 0;
    for (const p of t.roster) {
      if (!p.feeLock) continue;
      const amount = Math.round(p.feeLock.amount * 100),
        paid = Math.round(total(p.payments.map((x) => x.amount)) * 100),
        credits = Math.round(total(p.credits.map((x) => x.amount)) * 100);
      billed += amount;
      collected += paid;
      let prior = 0;
      const rows = p.planLock?.rows?.length
        ? p.planLock.rows
        : [{ amount: p.feeLock.amount, date: p.planLock?.deadline || "", label: "Team fee" }];
      rows.forEach((row, i) => {
        const original = Math.round(row.amount * 100),
          allocated = Math.min(original, Math.max(0, paid + credits - prior));
        prior += original;
        receivables.push({
          id: `team:${t.id}:${p.id}:${i}`,
          customer: p.name,
          category: "team fees",
          teamId: t.id,
          amount: original,
          paid: allocated,
          remaining: original - allocated,
          due: row.date || p.agreement.signedAt?.slice(0, 10) || date,
          status: p.withdrawn
            ? "ROSTER HOLD"
            : original === allocated
              ? "PAID"
              : row.date && row.date < date
                ? "PAST DUE"
                : allocated
                  ? "PARTIALLY PAID"
                  : row.date === date
                    ? "DUE"
                    : "NOT YET DUE",
          source: "team",
        });
      });
    }
    if (!plan?.publishedBudget) {
      if (collected)
        warnings.push(`${t.name}: collections need a published budget for cash protection.`);
      teams.push({
        id: t.id,
        name: t.name,
        billed,
        collected,
        protectedDirect: collected,
        contingency: 0,
        deferred: 0,
        projected: 0,
        closed: false,
      });
      continue;
    }
    const b = plan.publishedBudget,
      f = calculateFees(b),
      expenses = plan.expenses || [];
    const financePaid = total(
      records
        .filter(
          (r) =>
            r.kind === "payable" &&
            r.payload.teamId === t.id &&
            !["owner", "refund"].includes(r.payload.category) &&
            !expenses.some((e) => e.paid && r.id === `expense:${t.id}:${e.id}`),
        )
        .map((r) => r.payload.paid || 0),
    );
    const directPaid =
      financePaid + total(expenses.filter((e) => e.paid && !e.contingency).map((e) => e.cents));
    const contingencyPaid = total(
      expenses.filter((e) => e.paid && e.contingency).map((e) => e.cents),
    );
    const deferred = total(
      Object.values(plan.players).map(
        (p) =>
          membershipRecognition(
            p.membershipAllocation || 0,
            p.serviceStart || b.start,
            p.serviceEnd || b.end,
            date,
          ).deferred,
      ),
    );
    teams.push({
      id: t.id,
      name: t.name,
      billed,
      collected,
      protectedDirect: plan.status === "closed" ? 0 : Math.max(0, f.direct - directPaid),
      contingency: plan.status === "closed" ? 0 : Math.max(0, f.contingency - contingencyPaid),
      deferred,
      projected: project(
        b,
        Math.max(b.baseline, t.roster.filter((p) => p.roleType === "full" && !p.withdrawn).length),
        t.roster.filter((p) => p.roleType === "po" && !p.withdrawn).length,
        expenses,
      ).beforeOverhead,
      closed: plan.status === "closed",
    });
    const roles = [
      {
        title: "Head Coach",
        people: t.coachEmail ? [{ email: t.coachEmail, name: t.headCoach }] : [],
        cost: b.costs.find((c) => c.id === "cost-0" || c.name === "Head coach")?.cents || 0,
        premium: b.headPremiumBps,
      },
      {
        title: "Assistant Coach",
        people: t.staff.filter((s) => /assistant/i.test(s.role)),
        cost: b.costs.find((c) => c.id === "cost-1" || c.name === "Assistant coach")?.cents || 0,
        premium: b.assistantPremiumBps,
      },
    ];
    for (const role of roles) {
      if (role.cost && !role.people.length) {
        warnings.push(
          `${t.name}: assign ${role.title.toLowerCase()} before compensation is accrued.`,
        );
        continue;
      }
      const budget = Math.round(role.cost * (1 + (role.premium || 0) / 10000));
      role.people.forEach((c, i) => {
        const payeeId = addPerson(c.email, c.name || c.email, role.title);
        const amount =
          Math.floor(budget / role.people.length) + (i < budget % role.people.length ? 1 : 0);
        candidates.push({
          id: `season:${t.id}:${role.title}:${payeeId}`,
          payeeId,
          category: "coach",
          teamId: t.id,
          reason: `${t.name} · ${role.title} · ${b.start}–${b.end}`,
          amount,
          earned: accrual(amount, b.start, b.end, date),
          due: b.end,
          source: `season:${t.id}`,
          approved: 0,
          paid: 0,
          state: "accrued",
        });
      });
    }
    if (t.coachEmail) {
      const payeeId = addPerson(t.coachEmail, t.headCoach || t.coachEmail, "Head Coach");
      for (const [category, amount] of [
        ["gas", b.costs.find((c) => c.id === "cost-3" || c.name === "Coach travel")?.cents || 0],
        ["hotel", b.hotelNightly * b.hotelNights],
      ] as const) {
        if (!amount) continue;
        candidates.push({
          id: `stipend:${t.id}:${category}`,
          payeeId,
          category,
          teamId: t.id,
          reason: `${t.name} · ${category} stipend budget; verify completed travel before accruing`,
          amount,
          earned: 0,
          due: b.end,
          source: `stipend:${t.id}`,
          approved: 0,
          paid: 0,
          state: "accrued",
        });
      }
    }
    for (const e of expenses) {
      if (e.paid) continue;
      const payeeId = "vendor:unassigned";
      if (!payees.some((p) => p.id === payeeId))
        payees.push({
          id: payeeId,
          email: "",
          name: "Unassigned vendor — review before approval",
          role: "Vendor",
          method: "check",
          reference: "",
          active: true,
        });
      candidates.push({
        id: `expense:${t.id}:${e.id}`,
        payeeId,
        category: "vendor",
        teamId: t.id,
        reason: e.name,
        amount: e.cents,
        earned: e.cents,
        due: e.date || date,
        source: `expense:${t.id}:${e.id}`,
        approved: 0,
        paid: 0,
        state: "pending approval",
      });
    }
  }
  for (const i of invoices) {
    if (["paid", "canceled", "cancelled", "void", "refunded"].includes(i.status.toLowerCase()))
      continue;
    receivables.push({
      id: "invoice:" + i.id,
      customer: i.customer,
      category: "membership",
      teamId: "",
      amount: i.amount_cents,
      paid: 0,
      remaining: i.amount_cents,
      due: i.period_start ? new Date(i.period_start).toISOString().slice(0, 10) : "",
      status: /fail|uncollect/.test(i.status) ? "PAYMENT FAILED" : "DUE",
      source: "subscription",
    });
  }
  return {
    payees,
    candidates,
    receivables,
    teams,
    warnings,
    payments: (() => {
      const merged = payments.map((p) => {
        const synced = records.find(
          (r) =>
            r.kind === "collection" &&
            r.payload.id === p.id &&
            r.payload.environment === p.environment,
        )?.payload;
        const entry = records
          .filter((r) => r.kind === "settlement" && r.payload.environment === p.environment)
          .flatMap((r) => r.payload.entries || [])
          .filter((e) => e.paymentId === p.id && e.type === "CHARGE");
        return {
          ...synced,
          ...p,
          snapshot: undefined,
          processingFee:
            synced?.processingFee ?? (entry.length ? total(entry.map((e) => e.fee)) : null),
          refunded_cents: Math.max(p.refunded_cents, synced?.refunded_cents || 0),
          created_at: new Date(p.created_at).toISOString(),
        };
      });
      for (const r of records.filter((r) => r.kind === "collection"))
        if (!merged.some((p) => p.id === r.payload.id && p.environment === r.payload.environment))
          merged.push(r.payload as any);
      return merged;
    })(),
    refunds: refunds.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })),
    services,
  };
}
