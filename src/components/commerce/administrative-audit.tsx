export type AdministrativeAuditEvent = {
  id: number;
  actor_id: string;
  actor_name?: string | null;
  action: string;
  target_table: string;
  target_id: string;
  created_at: Date | string;
  reason?: string | null;
  message_author?: string | null;
  message_excerpt?: string | null;
};

export function AdministrativeAuditEvents({ events }: { events: AdministrativeAuditEvent[] }) {
  return (
    <details>
      <summary className="min-h-11 cursor-pointer text-xl">
        Recent administrative audit events
      </summary>
      {!events.length && <p>No recent administrative events.</p>}
      <ul>
        {events.map((event) => (
          <li className="mt-2 break-words" key={event.id}>
            {new Date(event.created_at).toLocaleString()} · {event.action} · {event.target_table} ·{" "}
            {event.target_id} · actor {event.actor_name || event.actor_id}
            {event.actor_name && ` (${event.actor_id})`}
            {event.message_author && (
              <p>
                Message by {event.message_author}: {event.message_excerpt}
              </p>
            )}
            {event.reason && <p>Reason: {event.reason}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}
