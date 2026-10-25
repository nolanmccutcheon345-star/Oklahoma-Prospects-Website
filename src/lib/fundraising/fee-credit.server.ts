import type { Sql } from "../db";
import type { RecordRow } from "../finance/contracts";
export type FundraisingCredit = {
  contributionId: string;
  teamId: string;
  playerId: string;
  agreementId: string | null;
  lockedAt: string;
  cents: number;
  label: string;
};
export async function fundraisingCreditEvidence(tx: Sql, contributionId: string) {
  const [c] = await tx<{
    id: string;
    team_id: string;
    roster_player_id: string;
    amount: number;
    refunded: number;
    status: string;
    checked: string | null;
    payment_id: string | null;
    order_id: string | null;
  }>`select c.*,p.team_id,p.roster_player_id from fundraising_contributions c join fundraising_players p on p.id=c.player_id where c.id=${contributionId}`;
  if (!c) throw Error("Fundraising contribution not found.");
  const records =
    await tx<RecordRow>`select id,kind,payload from finance_records where kind in ('settlement','bank','fundraisingDispute')`;
  const charges = records
    .filter(
      (r) =>
        r.kind === "settlement" &&
        r.payload.environment === "production" &&
        r.payload.status === "PAID" &&
        records.some(
          (b) =>
            b.kind === "bank" &&
            b.id === r.payload.bankId &&
            b.payload.verified &&
            b.payload.match === "settlement:" + r.id,
        ),
    )
    .flatMap((r) => r.payload.entries || [])
    .filter((e) => e.type === "CHARGE" && e.paymentId === c.payment_id);
  const unique = new Map(charges.map((e) => [e.id, e]));
  const settledNet = [...unique.values()].reduce((n, e) => n + e.net, 0);
  const disputed = records.some(
    (r) =>
      r.kind === "fundraisingDispute" &&
      r.payload.contributionId === c.id &&
      r.payload.environment === "production" &&
      r.payload.state !== "WON",
  );
  const eligibleCents =
    !disputed && c.status === "completed" && c.checked && c.payment_id && c.order_id
      ? Math.max(0, Math.min(c.amount - c.refunded, settledNet - c.refunded))
      : 0;
  return { contribution: c, eligibleCents };
}
export async function fundraisingCreditQueue(tx: Sql) {
  return tx<{
    id: string;
    player: string;
    teamId: string;
    playerId: string;
    amount: number;
    refunded: number;
    applied: number;
    status: string;
  }>`select c.id,p.name as player,p.team_id as "teamId",p.roster_player_id as "playerId",c.amount,c.refunded,c.status,
      coalesce((r.payload->>'cents')::int,0) as applied from fundraising_contributions c join fundraising_players p on p.id=c.player_id
      left join finance_records r on r.id='fundraising-credit:'||c.id and r.kind='fundraisingCredit'
      where p.team_id is not null and (c.status='completed' or r.id is not null) order by c.created desc,c.id limit 500`;
}
