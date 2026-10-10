import { chicagoInstant } from "../scheduling";
import type { Sql } from "../db";
import { squareClient, squareConfig } from "../commerce/square.server";
import { financeAdmin, write } from "./store.server";
import { day, today } from "./contracts";
/** Read-only at Square: a settlement is a transfer, never a second sale. */
export async function syncSettlements(
  sql: Sql,
  userId: string,
  from: string,
  to: string,
  dependencies?: {
    client: ReturnType<typeof squareClient>;
    config: ReturnType<typeof squareConfig>;
  },
) {
  await financeAdmin(sql, userId);
  day.parse(from);
  day.parse(to);
  if (to > today()) throw Error("Do not sync future settlement dates.");
  if (to < from || Date.parse(to) - Date.parse(from) > 31 * 86400000)
    throw Error("Sync a date range of at most 31 days. Repeat for older history.");
  const c = dependencies?.config || squareConfig(),
    client = dependencies?.client || squareClient(),
    rows: { id: string; kind: string; value: any }[] = [];
  const money = (m: any) => {
    if (m?.currency !== "USD" || !Number.isSafeInteger(Number(m.amount)))
      throw Error("Unsupported settlement currency or amount.");
    return Number(m.amount);
  };
  const next = new Date(to + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const beginTime = chicagoInstant(from, "00:00").toISOString(),
    endTime = chicagoInstant(next.toISOString().slice(0, 10), "00:00").toISOString();
  for await (const p of await client.payments.list({
    locationId: c.locationId,
    beginTime,
    endTime,
    limit: 100,
  })) {
    if (rows.length > 2000) throw Error("Narrow the collection sync range; nothing was imported.");
    if (!p.id || !p.createdAt) throw Error("Square returned an incomplete payment identity.");
    rows.push({
      id: "collection:" + c.environment + ":" + p.id,
      kind: "collection",
      value: {
        id: p.id,
        environment: c.environment,
        amount_cents: money(p.totalMoney || p.amountMoney),
        refunded_cents: p.refundedMoney ? money(p.refundedMoney) : 0,
        status: p.status,
        customer: p.buyerEmailAddress || p.customerId || "Square customer",
        category: "Other Square sale",
        product_id: p.orderId || "",
        created_at: p.createdAt,
        updatedAt: p.updatedAt,
        processingFee: p.processingFee
          ? p.processingFee.reduce((sum, f) => sum + money(f.amountMoney), 0)
          : null,
      },
    });
  }
  for await (const p of await client.payouts.list({
    locationId: c.locationId,
    beginTime,
    endTime,
    limit: 100,
  })) {
    if (rows.length > 2000) throw Error("Narrow this date range; nothing was imported.");
    const entries: any[] = [];
    for await (const e of await client.payouts.listEntries({ payoutId: p.id, limit: 100 })) {
      if (entries.length > 5000)
        throw Error("This settlement needs a larger import window. Contact administration.");
      entries.push({
        id: e.id,
        type: e.type,
        date: e.effectiveAt,
        gross: e.grossAmountMoney ? money(e.grossAmountMoney) : 0,
        fee: e.feeAmountMoney ? money(e.feeAmountMoney) : 0,
        net: money(e.netAmountMoney),
        paymentId: e.typeChargeDetails?.paymentId || e.typeRefundDetails?.paymentId || "",
        refundId: e.typeRefundDetails?.refundId || "",
      });
    }
    const amount = money(p.amountMoney);
    if (entries.reduce((s, e) => s + e.net, 0) !== amount)
      throw Error("Square settlement entries do not reconcile. No import was committed.");
    rows.push({
      id: "settlement:" + c.environment + ":" + p.id,
      kind: "settlement",
      value: {
        id: "settlement:" + c.environment + ":" + p.id,
        squareId: p.id,
        environment: c.environment,
        status: p.status,
        amount,
        date: p.arrivalDate || p.createdAt?.slice(0, 10) || from,
        reference: p.endToEndId || p.id,
        destinationId: p.destination?.id || "",
        entries,
      },
    });
  }
  await sql.transaction(async (tx) => {
    await tx`select revision from finance_state where id='organization' for update`;
    for (const r of rows) {
      const [old] = await tx<any>`select payload from finance_records where id=${r.id}`;
      if (old?.payload.bankId && old.payload.amount !== r.value.amount)
        throw Error("A reconciled settlement changed. Review it before importing.");
      await write(
        tx,
        userId,
        r.kind,
        r.id,
        { ...r.value, bankId: old?.payload.bankId, accountId: old?.payload.accountId },
        "Read-only Square settlement synchronization",
      );
    }
    await write(
      tx,
      userId,
      "sync",
      "square-sync:" + c.environment,
      {
        from,
        through: to,
        environment: c.environment,
        at: new Date().toISOString(),
        settlements: rows.filter((r) => r.kind === "settlement").length,
        collections: rows.filter((r) => r.kind === "collection").length,
      },
      "Square sync completed for selected period",
    );
    await tx`update finance_state set revision=revision+1 where id='organization'`;
  });
  return { count: rows.length };
}
