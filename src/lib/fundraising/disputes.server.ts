import type { Sql } from "../db";
import {
  lockFinancialExecution,
  applyFundraisingCreditInTransaction,
} from "../finance/context.server";
/** Only call after fetching the authoritative dispute through the configured Square account. */
export async function reconcileFundraisingDispute(
  sql: Sql,
  dispute: {
    id: string;
    disputed_payment?: { payment_id?: string };
    location_id?: string;
    version?: number;
    state?: string;
    amount_money?: { amount?: number; currency?: string };
  },
  locationId: string,
  environment: string,
) {
  if (environment !== "production") return;
  if (
    !dispute.id ||
    !dispute.disputed_payment?.payment_id ||
    dispute.location_id !== locationId ||
    !Number.isSafeInteger(dispute.version) ||
    dispute.version! < 1 ||
    !Number.isSafeInteger(dispute.amount_money?.amount) ||
    dispute.amount_money!.amount! < 0 ||
    dispute.amount_money?.currency !== "USD"
  )
    throw Error("Fundraising dispute identity or amount could not be verified.");
  await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const [c] = await tx<{
      id: string;
    }>`select id from fundraising_contributions where payment_id=${dispute.disputed_payment!.payment_id!}`;
    if (!c) return;
    const id = "fundraising-dispute:" + dispute.id;
    const [old] = await tx<{
      payload: { version: number; paymentId: string };
    }>`select payload from finance_records where id=${id} and kind='fundraisingDispute' for update`;
    if (old && old.payload.paymentId !== dispute.disputed_payment!.payment_id!)
      throw Error("Fundraising dispute payment changed.");
    if (old && old.payload.version >= dispute.version!) return;
    const payload = {
      contributionId: c.id,
      paymentId: dispute.disputed_payment!.payment_id!,
      version: dispute.version!,
      state: dispute.state || "UNKNOWN",
      amount: dispute.amount_money!.amount!,
      environment,
    };
    await tx`insert into finance_records(id,kind,payload) values(${id},'fundraisingDispute',${JSON.stringify(payload)}::jsonb) on conflict(id) do update set payload=excluded.payload,updated_at=now()`;
    await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state) values('provider:square',${id},'Fundraising dispute','Verified provider dispute; owner review required',${JSON.stringify(payload)}::jsonb)`;
    await applyFundraisingCreditInTransaction(tx, c.id);
  });
}
