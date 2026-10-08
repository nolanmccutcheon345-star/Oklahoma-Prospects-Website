import type { z } from "zod";
import type { Sql } from "./db";
import { metricInput } from "./coaching-contracts";

/** An ID is an idempotency key for one actor and one unchanged session submission. */
export async function recordSessionMetric(sql: Sql, userId: string, input: z.infer<typeof metricInput>, verified: boolean) {
  const data = metricInput.parse(input);
  const inserted = await sql<{ id: string }>`insert into athlete_session_metrics
    (id,athlete_id,user_id,track,day,successes,attempts,notes,verified)
    values (${data.id},${data.athleteId},${userId},${data.track},${data.day},${data.successes},${data.attempts},${data.notes},${verified})
    on conflict(id) do nothing returning id`;
  if (inserted.length) return { ok: true };
  const [saved] = await sql<{ track: string; day: string; successes: number; attempts: number; notes: string }>`
    select track,day::text,successes,attempts,notes from athlete_session_metrics
    where id=${data.id} and user_id=${userId} and athlete_id=${data.athleteId}`;
  if (saved && saved.track === data.track && saved.day === data.day && saved.successes === data.successes && saved.attempts === data.attempts && saved.notes === data.notes)
    return { ok: true };
  throw new Error("This session log ID has already been used. Reload before submitting a different log.");
}
