import type { Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import { sourceData } from "./sources.server";
import { financeSummary } from "./model";
import {
  financeAction,
  today,
  total,
  type FinanceAction,
  type RecordRow,
  type Settings,
  type Payable,
  type Payment,
  type BankTxn,
} from "./contracts";
export async function financeAdmin(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId);
  if (me.role !== "admin") throw Error("Financial administrator access required.");
  return me;
}
export async function records(sql: Sql) {
  return sql<RecordRow>`select id,kind,payload from finance_records order by created_at,id`;
}
export async function write(
  sql: Sql,
  actor: string,
  kind: string,
  id: string,
  value: any,
  reason: string,
) {
  const [before] = await sql<RecordRow>`select id,kind,payload from finance_records where id=${id}`;
  if (before && before.kind !== kind) throw Error("Financial record type cannot change.");
  await sql`insert into finance_records(id,kind,payload) values(${id},${kind},${JSON.stringify(value)}::jsonb) on conflict(id) do update set payload=excluded.payload,updated_at=now()`;
  await sql`insert into finance_audit(actor_id,record_id,action,reason,before_state,after_state) values(${actor},${id},${before ? "update" : "create"},${reason},${before ? JSON.stringify(before.payload) : null}::jsonb,${JSON.stringify(value)}::jsonb)`;
}
export async function financeWorkspace(sql: Sql, userId: string) {
  await financeAdmin(sql, userId);
  const rs = await records(sql),
    [state] = await sql<{
      revision: number;
      payload: Settings;
    }>`select revision,payload from finance_state where id='organization'`;
  const sources = await sourceData(sql, today(), rs);
  const audit =
    await sql<any>`select actor_id,record_id,action,reason,before_state,after_state,created_at from finance_audit order by id desc limit 200`;
  return {
    revision: state.revision,
    settings: state.payload,
    records: rs,
    sources,
    summary: financeSummary(rs, state.payload, sources, today()),
    audit: audit.map((a) => ({ ...a, created_at: new Date(a.created_at).toISOString() })),
  };
}
export async function mutateFinance(
  sql: Sql,
  userId: string,
  input: FinanceAction,
  provider?: { refund: (id: string) => Promise<any>; payment: (id: string) => Promise<any> },
) {
  const me = await financeAdmin(sql, userId),
    a = financeAction.parse(input),
    date = today();
  return sql.transaction(async (tx) => {
    const [state] = await tx<{
      revision: number;
      payload: Settings;
    }>`select revision,payload from finance_state where id='organization' for update`;
    if (state.revision !== a.revision) throw Error("Finance changed. Refresh before saving.");
    await tx`select set_config('app.actor_id',${userId},true)`;
    let rs = await records(tx);
    const get = (id: string, kind: string) => {
      const r = rs.find((r) => r.id === id && r.kind === kind);
      if (!r) throw Error("Financial record not found. Refresh and choose a saved record.");
      return r.payload;
    };
    const save = async (kind: string, id: string, value: any) => {
      await write(tx, userId, kind, id, value, a.reason);
      rs = rs.filter((r) => r.id !== id).concat({ id, kind, payload: value });
    };
    const source = await sourceData(tx, date, rs);
    if (a.action === "facility") {
      const { facilityPayables } = await import("./facility.server");
      const generated = await facilityPayables(tx, date, rs);
      for (const p of generated.payees)
        if (!rs.some((r) => r.id === p.id)) await save("payee", p.id, p);
      for (const p of generated.payables) {
        const old = rs.find((r) => r.id === p.id)?.payload;
        if (old?.manualOverride) continue;
        await save("payable", p.id, {
          ...p,
          paid: old?.paid || 0,
          approved: old?.approved || 0,
          state: old?.state || p.state,
        });
      }
    } else if (a.action === "invoiceAdjustment") {
      const invoice = get(a.invoiceId, "invoice");
      const view = financeSummary(rs, state.payload, source, date);
      const row = view.receivables.find((r) => r.id === invoice.id);
      if (!row || a.amount > row.remaining)
        throw Error("Credit/write-off exceeds the invoice balance.");
      const id = "adjustment:" + state.revision;
      await save("invoiceAdjustment", id, {
        id,
        invoiceId: a.invoiceId,
        amount: a.amount,
        kind: a.kind,
        reason: a.reason,
        date,
      });
    } else if (a.action === "legacyMatch") {
      const p = get(a.payableId, "payable"),
        bank = get(a.bankId, "bank");
      if (!p.legacyPaid || bank.verified || bank.amount !== -p.paid)
        throw Error("Match the exact legacy paid amount to one unmatched bank debit.");
      await save("payable", a.payableId, { ...p, legacyPaid: false });
      await save("bank", a.bankId, { ...bank, verified: true, match: "legacy:" + a.payableId });
    } else if (a.action === "refresh") {
      for (const p of source.payees)
        if (!rs.some((r) => r.id === p.id)) await save("payee", p.id, p);
      for (const candidate of source.candidates) {
        const prior = rs.find((r) => r.id === candidate.id)?.payload;
        if (prior?.manualOverride) continue;
        await save("payable", candidate.id, {
          ...candidate,
          approved: Math.min(prior?.approved || 0, candidate.earned),
          paid: Math.max(prior?.paid || 0, candidate.paid),
          state:
            prior?.state === "canceled"
              ? "canceled"
              : candidate.state === "held"
                ? "held"
                : prior?.state || candidate.state,
          legacyPaid: prior?.legacyPaid ?? candidate.legacyPaid,
        });
      }
    } else if (a.action === "settings") {
      await tx`insert into finance_audit(actor_id,record_id,action,reason,before_state,after_state) values(${userId},'organization','settings',${a.reason},${JSON.stringify(state.payload)}::jsonb,${JSON.stringify(a.value)}::jsonb)`;
      await tx`update finance_state set payload=${JSON.stringify(a.value)}::jsonb where id='organization'`;
    } else if (
      ["account", "card", "payee", "payable", "bank", "invoice", "rule"].includes(a.action) &&
      "value" in a
    ) {
      const v: any = a.value;
      if (
        (a.action === "bank" && v.date > date) ||
        (a.action === "account" && v.openingDate > date)
      )
        throw Error("Actual bank records cannot be dated in the future.");
      const prior = rs.find((r) => r.id === v.id)?.payload;
      if (
        a.action === "account" &&
        prior &&
        (prior.opening !== v.opening || prior.openingDate !== v.openingDate)
      )
        throw Error(
          "Opening balance is immutable. Record a documented adjustment transaction instead.",
        );
      if (a.action === "bank") {
        get(v.accountId, "account");
        if (prior)
          throw Error(
            "Bank transactions are immutable. Record a reversing transaction with its own reference.",
          );
        if (
          rs.some(
            (r) =>
              r.kind === "bank" &&
              r.payload.accountId === v.accountId &&
              r.payload.reference === v.reference,
          )
        )
          throw Error("Duplicate bank reference.");
      }
      if (a.action === "card") {
        get(v.accountId, "account");
        if (v.isDefault)
          for (const c of rs.filter((r) => r.kind === "card" && r.payload.isDefault))
            await save("card", c.id, { ...c.payload, isDefault: false });
      }
      if (a.action === "payee") {
        if (
          v.email &&
          rs.some(
            (r) =>
              r.kind === "payee" &&
              r.id !== v.id &&
              r.payload.email?.toLowerCase() === v.email.toLowerCase(),
          )
        )
          throw Error("A payee already exists for this account. Edit that financial profile.");
        if (["Nolan", "Steve"].includes(v.role)) {
          const grants = await tx<{
            email: string;
          }>`select email from owner_grants where email=${v.email.toLowerCase()} and revoked_at is null`;
          if (!grants.length)
            throw Error("Owner financial profiles must link to an authorized owner account.");
          if (rs.some((r) => r.kind === "payee" && r.id !== v.id && r.payload.role === v.role))
            throw Error("This owner already has a financial profile.");
        }
      }
      if (a.action === "rule") {
        get(v.payeeId, "payee");
        if (prior)
          throw Error("Create a new dated compensation rule; historical rules are immutable.");
      }
      if (a.action === "payable") {
        get(v.payeeId, "payee");
        if (v.category === "owner" || v.category === "refund")
          throw Error("Use the protected owner-distribution or refund workflow.");
        if (
          prior &&
          (prior.paid > v.earned ||
            rs.some(
              (r) =>
                r.kind === "payment" &&
                r.payload.payableId === v.id &&
                r.payload.state === "in progress",
            ))
        )
          throw Error("Reconcile existing payments before changing this payable.");
        await save("payable", v.id, {
          ...v,
          source: prior?.source || "manual",
          approved: 0,
          paid: prior?.paid || 0,
          state: "pending approval",
          manualOverride: true,
        });
      } else {
        if (a.action === "invoice" && prior)
          throw Error(
            "Issued invoices cannot be overwritten. Record an audited adjustment instead.",
          );
        await save(a.action, v.id, v);
      }
    } else if (a.action === "approve") {
      const selected = a.ids.map((id) => get(id, "payable") as Payable);
      if (
        new Set(a.ids).size !== a.ids.length ||
        total(selected.map((p) => Math.max(0, p.earned - p.approved))) !== a.total
      )
        throw Error("Review the current bulk approval total.");
      for (const p of selected) {
        if (!get(p.payeeId, "payee").active)
          throw Error("Activate the payee before approving compensation.");
        if (
          ["canceled", "held"].includes(p.state) ||
          p.category === "owner" ||
          p.payeeId === "vendor:unassigned"
        )
          throw Error(
            "Resolve held/unassigned payables before approval. Owner distributions use cash protection checks.",
          );
        const current = source.candidates.find((c) => c.id === p.id);
        if (
          current?.state === "held" ||
          (!current && p.source?.startsWith("lesson:") && !p.manualOverride)
        )
          throw Error("Lesson funding or refunds require review before approval.");
        if (current && !p.manualOverride && current.earned !== p.earned)
          throw Error("Refresh accruals before approving.");
        await save("payable", p.id, { ...p, approved: p.earned, state: "approved" });
      }
    } else if (a.action === "hold") {
      const p = get(a.id, "payable");
      if (
        p.paid ||
        rs.some(
          (r) =>
            r.kind === "payment" &&
            r.payload.payableId === a.id &&
            r.payload.state === "in progress",
        )
      )
        throw Error("Paid or in-progress obligations cannot be canceled or held.");
      await save("payable", a.id, { ...p, state: a.state, approved: 0 });
    } else if (a.action === "payment") {
      const p = get(a.payableId, "payable") as Payable,
        account = get(a.accountId, "account");
      if (!get(p.payeeId, "payee").active)
        throw Error("Activate the payee before recording compensation.");
      if (a.date > date) throw Error("Record a payment only after it has actually been sent.");
      const current = source.candidates.find((c) => c.id === p.id);
      if (
        current?.state === "held" ||
        (!current && p.source?.startsWith("lesson:") && !p.manualOverride)
      )
        throw Error("Lesson funding or refunds require review before payment.");
      if (current && !p.manualOverride && current.earned < p.approved)
        throw Error(
          "Compensation changed or its payment was refunded. Refresh and review before paying.",
        );
      if (!account.active || ["held", "canceled", "failed"].includes(p.state))
        throw Error("Choose an active account and approved payable.");
      if (a.cardId) {
        const card = get(a.cardId, "card");
        if (!card.active || card.accountId !== a.accountId)
          throw Error("Choose an active card for this business account.");
      }
      if (p.category === "owner") {
        const view = financeSummary(rs, state.payload, source, date);
        if (view.cash < view.protectedCash || view.warnings.length)
          throw Error(
            "Recheck cash protections and reconciliation before recording an owner payment.",
          );
      }
      const progress = total(
        rs
          .filter(
            (r) =>
              r.kind === "payment" &&
              r.payload.payableId === p.id &&
              r.payload.state === "in progress",
          )
          .map((r) => r.payload.amount),
      );
      if (a.amount > p.approved - p.paid - progress)
        throw Error("Payment exceeds approved unpaid compensation.");
      if (
        rs.some(
          (r) =>
            r.id === a.id ||
            (r.kind === "payment" &&
              r.payload.accountId === a.accountId &&
              r.payload.reference === a.reference),
        )
      )
        throw Error("Payment reference already recorded.");
      await save("payment", a.id, {
        ...a,
        action: undefined,
        revision: undefined,
        reason: undefined,
        state: "in progress",
      });
    } else if (a.action === "paymentFailed") {
      const p = get(a.id, "payment");
      if (p.state !== "in progress") throw Error("Only an unreconciled payment can fail.");
      await save("payment", a.id, { ...p, state: "failed" });
    } else if (a.action === "match") {
      const bank = get(a.bankId, "bank") as BankTxn;
      if (bank.verified) throw Error("Bank transaction already reconciled.");
      if (a.targetKind === "payment") {
        const payment = get(a.targetId, "payment") as Payment,
          p = get(payment.payableId, "payable") as Payable;
        if (
          payment.state !== "in progress" ||
          payment.accountId !== bank.accountId ||
          bank.amount !== -payment.amount
        )
          throw Error("Match the exact outgoing amount and business account.");
        await save("payment", payment.id, { ...payment, state: "reconciled", bankId: bank.id });
        await save("payable", p.id, { ...p, paid: p.paid + payment.amount, legacyPaid: false });
        if (p.id.startsWith("lesson:"))
          await tx`update contractor_earnings set status=${p.paid + payment.amount >= p.earned ? "paid" : "payable"},transfer_id=${p.paid + payment.amount >= p.earned ? "bank:" + bank.id : null},updated_at=now() where booking_id=${p.id.slice(7)}`;
        if (p.source?.startsWith("refund:") && p.paid + payment.amount >= p.earned) {
          await tx`update commerce_refunds set status='completed',external_status='reconciled',external_reference=${bank.reference} where id=${p.source.slice(7)} and external_status='approved'`;
          const [refund] = await tx<{
            order_id: string;
          }>`select order_id from commerce_refunds where id=${p.source!.slice(7)}`;
          if (refund) {
            const { syncTeamPayment } = await import("../teams/payment.server");
            await syncTeamPayment(tx, refund.order_id);
          }
        }
      } else if (a.targetKind === "settlement") {
        const s = get(a.targetId, "settlement");
        if (
          s.bankId ||
          s.status !== "PAID" ||
          s.amount !== bank.amount ||
          s.environment !== "production"
        )
          throw Error(
            "Match an unlinked completed production Square settlement for this exact amount.",
          );
        await save("settlement", a.targetId, { ...s, bankId: bank.id, accountId: bank.accountId });
      } else if (a.targetKind === "invoice") {
        const invoice = get(a.targetId, "invoice");
        const balance =
          financeSummary(rs, state.payload, source, date).receivables.find(
            (r) => r.id === invoice.id,
          )?.remaining || 0;
        if (bank.amount <= 0 || bank.amount > balance)
          throw Error("Incoming amount exceeds this invoice’s remaining balance.");
      } else {
        if (!bank.category.trim() || !bank.reason.trim())
          throw Error("Categorize and explain this bank movement.");
      }
      await save("bank", bank.id, {
        ...bank,
        verified: true,
        match: a.targetKind + ":" + a.targetId,
      });
    } else if (a.action === "distribution") {
      const view = financeSummary(rs, state.payload, source, date);
      if (view.warnings.length || a.amount > view.distributable)
        throw Error(
          "Distribution blocked: " +
            (view.warnings.join(" ") || "Amount exceeds protected available cash."),
        );
      const owners = ["Nolan", "Steve"].map((role) =>
        rs.find((r) => r.kind === "payee" && r.payload.role === role && r.payload.active),
      );
      if (owners.some((o) => !o))
        throw Error("Configure Nolan and Steve’s owner financial profiles.");
      const parts = [
        Math.floor((a.amount * state.payload.nolanBps) / 10000),
        a.amount - Math.floor((a.amount * state.payload.nolanBps) / 10000),
      ];
      for (let i = 0; i < 2; i++)
        if (parts[i]) {
          const id = `distribution:${state.revision}:${i}`;
          await save("payable", id, {
            id,
            payeeId: owners[i]!.id,
            category: "owner",
            teamId: "",
            reason: a.reason,
            amount: parts[i],
            earned: parts[i],
            approved: parts[i],
            paid: 0,
            due: a.due,
            state: "approved",
            source: "distribution",
            protectionSnapshot: {
              cash: view.cash,
              protected: view.protectedCash,
              available: view.distributable,
              at: date,
            },
          });
        }
    } else if (a.action === "externalRefund") {
      get(a.payeeId, "payee");
      const [r] = await tx<any>`select * from commerce_refunds where id=${a.refundId} for update`;
      if (!r || !["failed", "rejected"].includes(r.status) || r.external_status)
        throw Error(
          "Only a definitively failed or rejected Square refund can use an external fallback.",
        );
      if (!r.square_refund_id)
        throw Error("Verify the failed Square refund ID before external reimbursement.");
      const { squareClient } = await import("../commerce/square.server");
      const result = provider
        ? await provider.refund(r.square_refund_id)
        : await squareClient().refunds.get({ refundId: r.square_refund_id });
      const refund = result.refund;
      if (
        !refund ||
        refund.id !== r.square_refund_id ||
        refund.paymentId !== r.square_payment_id ||
        refund.amountMoney?.currency !== "USD" ||
        Number(refund.amountMoney.amount) !== r.amount_cents ||
        !["FAILED", "REJECTED"].includes(refund.status || "")
      )
        throw Error(
          "Square has not confirmed this exact refund finally failed. Do not reimburse externally.",
        );
      const [payment] =
        await tx<any>`select * from square_payments where id=${r.square_payment_id} for update`;
      if (!payment || payment.environment !== "production")
        throw Error("Only actual production payments can be reimbursed externally.");
      const response = provider
        ? await provider.payment(payment.id)
        : await squareClient().payments.get({ paymentId: payment.id });
      const current = response.payment;
      if (
        !current ||
        current.id !== payment.id ||
        current.amountMoney?.currency !== "USD" ||
        Number(current.amountMoney.amount) !== payment.amount_cents ||
        (current.refundedMoney && current.refundedMoney.currency !== "USD")
      )
        throw Error("Could not verify the remaining Square payment balance.");
      const [other] = await tx<any>`select
        coalesce(sum(amount_cents) filter(where external_status is not null),0) as external,
        coalesce(sum(amount_cents) filter(where external_status is null and status='completed'),0) as completed,
        coalesce(sum(amount_cents) filter(where external_status is null and status not in ('completed','failed','rejected')),0) as pending
        from commerce_refunds where square_payment_id=${r.square_payment_id} and id<>${r.id}`;
      const consumed =
        Math.max(
          payment.refunded_cents,
          Number(current.refundedMoney?.amount || 0),
          Number(other.completed),
        ) +
        Number(other.external) +
        Number(other.pending);
      if (!Number.isSafeInteger(consumed) || r.amount_cents > payment.amount_cents - consumed)
        throw Error("Refund balance is already reserved or returned.");
      await tx`update commerce_refunds set status='external_approved',external_status='approved' where id=${r.id}`;
      const id = "refund:" + r.id;
      await save("payable", id, {
        id,
        payeeId: a.payeeId,
        category: "refund",
        teamId: "",
        reason: a.reason,
        amount: r.amount_cents,
        earned: r.amount_cents,
        approved: r.amount_cents,
        paid: 0,
        due: a.due,
        state: "approved",
        source: id,
      });
    }
    await tx`update finance_state set revision=revision+1, payload=case when ${["settings", "distribution", "payment", "match", "paymentFailed"].includes(a.action)} then payload else jsonb_set(payload,'{reviewedThrough}','\"\"'::jsonb) end where id='organization'`;
    return { ok: true };
  });
}
