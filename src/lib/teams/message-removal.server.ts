import { lockFinancialExecution } from "../finance/execution.server";
import { createHash } from "node:crypto";
import type { Sql } from "../db";
import { enrollmentScope } from "../enrollment/access.server";
import { messageRemovalInput, type MessageRemoval } from "./message-removal-contracts";

export async function removeTeamMessage(sql: Sql, actor: string, raw: MessageRemoval) {
  const v = messageRemovalInput.parse(raw);
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const access = await enrollmentScope(tx, actor);
    if (!access.owner || !access.teams.some((t) => t.id === v.teamId))
      throw Error("Verified front-office owner access is required.");
    const table = v.channel === "team" ? "team_chat_messages" : "team_hub_family_messages";
    const [m] = await tx.query<{ team_id: string; author: string; body: string }>(
      `select team_id,author,body from ${table} where id=$1 for update`,
      [v.id],
    );
    if (!m || m.team_id !== v.teamId || m.author !== v.author || m.body !== v.body)
      throw Error("Message changed. Refresh and confirm the current author and text.");
    const digest = createHash("sha256")
      .update(JSON.stringify([m.team_id, m.author, m.body]))
      .digest("hex");
    const [prior] =
      await tx`select message_id from team_message_removals where channel=${v.channel} and message_id=${v.id}`;
    if (prior) return { ok: true, alreadyRemoved: true };
    await tx`insert into team_message_removals(channel,message_id,team_id,actor_id,reason,author,excerpt,source_digest) values(${v.channel},${v.id},${m.team_id},${actor},${v.reason},${m.author},${m.body.slice(0, 120)},${digest})`;
    await tx`insert into audit_events(actor_id,action,target_table,target_id,after_state) values(${actor},'message.remove',${table},${v.id},${JSON.stringify({ teamId: m.team_id, channel: v.channel, reason: v.reason, removed: true })}::jsonb)`;
    return { ok: true, alreadyRemoved: false };
  });
}
