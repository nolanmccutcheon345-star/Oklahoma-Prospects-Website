import { resolveIdentity } from "../identity.server";
import type { Sql } from "../db";

/** Restricted owner audit projection. Never project raw audit payloads. */
export async function readAdministrativeAuditEvents(sql: Sql, actor: string) {
  if ((await resolveIdentity(sql, actor)).role !== "admin") throw Error("Owner access required.");
  return sql<{
    id: number;
    actor_id: string;
    actor_name: string | null;
    action: string;
    target_table: string;
    target_id: string;
    created_at: Date;
    reason: string | null;
    message_author: string | null;
    message_excerpt: string | null;
  }>`select a.id,a.actor_id,u.name as actor_name,a.action,a.target_table,a.target_id,a.created_at,r.author as message_author,r.excerpt as message_excerpt,
      case when a.action in ('message.remove','roster.remove','roster.merge','staff.role.remove','account.deactivate')
        then left(a.after_state->>'reason',1000) else null end as reason
    from audit_events a left join "user" u on u.id=a.actor_id
    left join team_message_removals r on a.action='message.remove' and r.message_id::text=a.target_id
      and ((a.target_table='team_chat_messages' and r.channel='team')
        or (a.target_table='team_hub_family_messages' and r.channel='family'))
    order by a.id desc limit 100`;
}
