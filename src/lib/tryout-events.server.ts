import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import {
  tryoutEventInput,
  type TryoutEvent,
  type TryoutEventInput,
} from "./tryout-events-contracts";
import { matchTryoutApplicants, queueTryoutNotice } from "./tryout-enrollment.server";
const fields = `id,sport,season,age_groups as "ageGroups",event_date::text as date,start_time as "startTime",end_time as "endTime",location,capacity,status,revision`;
export async function publicTryoutEventsFor(sql: Sql) {
  try {
    return await sql.query<TryoutEvent>(
      `select ${fields} from tryout_events where status='published' and (event_date+start_time::time) at time zone 'America/Chicago'>now() order by event_date,start_time,id limit 200`,
    );
  } catch (error) {
    // Unapplied event schema means no public schedule, never invented records.
    if ((error as { code?: string }).code === "42P01") return [];
    throw error;
  }
}
export async function adminTryoutEventsFor(sql: Sql, userId: string) {
  if ((await resolveIdentity(sql, userId)).role !== "admin")
    throw new Error("Owner access required.");
  return sql.query<TryoutEvent>(
    `select ${fields} from tryout_events order by event_date desc,start_time,id limit 500`,
  );
}
export async function saveTryoutEventFor(sql: Sql, userId: string, raw: TryoutEventInput) {
  if ((await resolveIdentity(sql, userId)).role !== "admin")
    throw new Error("Owner access required.");
  const input = tryoutEventInput.parse(raw);
  return sql.transaction(async (tx) => {
    // Matchers and editors acquire event locks in the same order.
    await tx`select id from tryout_events order by event_date,start_time,id for update`;
    const active = await tx<{
      id: string;
    }>`select id from tryout_enrollments where event_id=${input.id} and status='enrolled'`;
    if (input.capacity < active.length)
      throw new Error("Capacity cannot be lower than existing enrollments.");
    if (active.length) {
      const [prior] = await tx<{
        sport: string;
        season: string;
        age_groups: string[];
      }>`select sport,season,age_groups from tryout_events where id=${input.id}`;
      if (
        prior.sport !== input.sport ||
        prior.season !== input.season ||
        JSON.stringify(prior.age_groups) !== JSON.stringify(input.ageGroups)
      )
        throw new Error(
          "Cancel the event before changing sport, season or age groups with enrolled players.",
        );
      if (input.status === "draft")
        throw new Error("Cancel an enrolled event instead of hiding it as a draft.");
    }
    if (input.revision === 0) {
      const rows =
        await tx`insert into tryout_events(id,sport,season,age_groups,event_date,start_time,end_time,location,capacity,status,updated_by)
        values(${input.id},${input.sport},${input.season},${input.ageGroups},${input.date},${input.startTime},${input.endTime},${input.location},${input.capacity},${input.status},${userId}) on conflict(id) do nothing returning id`;
      if (!rows.length) throw new Error("This event already exists. Refresh before editing.");
    } else {
      const rows =
        await tx`update tryout_events set sport=${input.sport},season=${input.season},age_groups=${input.ageGroups},event_date=${input.date},start_time=${input.startTime},end_time=${input.endTime},location=${input.location},capacity=${input.capacity},status=${input.status},updated_by=${userId},updated_at=now(),revision=revision+1 where id=${input.id} and revision=${input.revision} returning id`;
      if (!rows.length)
        throw new Error("Another editor changed this event. Refresh before editing.");
    }
    for (const enrollment of active) {
      if (input.status === "cancelled")
        await tx`update tryout_enrollments set status='cancelled' where id=${enrollment.id}`;
      await queueTryoutNotice(
        tx,
        enrollment.id,
        input.id,
        input.status === "cancelled" ? "cancelled" : "updated",
      );
    }
    await matchTryoutApplicants(tx);
    return { ok: true };
  });
}
