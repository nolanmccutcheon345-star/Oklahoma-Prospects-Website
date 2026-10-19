import type { Sql } from "./db";
import { audit, requireOrganizationOperations, secured } from "./coordinator/access.server";
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
  return secured(sql, userId, "organization.tryout-events.read", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    return tx.query<TryoutEvent>(
      `select ${fields} from tryout_events order by event_date desc,start_time,id limit 500`,
    );
  });
}

/** Dedicated operational DTO: never return request or notification payloads.
 * A malformed nested value must not be stringified into an identity field. */
export async function operationalTryoutEnrollmentsFor(sql: Sql, userId: string) {
  return secured(sql, userId, "organization.tryout-enrollments.read", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    return tx<{
      id: string;
      eventId: string;
      player: string;
      email: string;
      status: string;
      notification: string;
    }>`select n.id,n.event_id as "eventId",
      case when jsonb_typeof(r.payload->'player')='string' then r.payload->>'player' else '' end as player,
      case when jsonb_typeof(r.payload->'email')='string' then r.payload->>'email' else '' end as email,
      n.status,coalesce((select o.status from tryout_notification_outbox o where o.enrollment_id=n.id order by o.created_at desc limit 1),'none') as notification
      from tryout_enrollments n join club_requests r on r.id=n.request_id order by n.created_at desc limit 500`;
  });
}

export async function saveTryoutEventFor(sql: Sql, userId: string, raw: TryoutEventInput) {
  return secured(sql, userId, "organization.tryout-events.save", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const input = tryoutEventInput.parse(raw);
    // Matchers and editors acquire event locks in the same order.
    await tx`select id from tryout_events order by event_date,start_time,id for update`;
    const [reserved] =
      await tx`select event_id from tryout_event_reservations where event_id=${input.id}`;
    if (reserved)
      throw new Error(
        "This event has confirmed coach/facility appointments. Cancel those appointments in Tryouts & Evaluations before changing the event, then reschedule and notify families.",
      );
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
    await audit(tx, userId, "organization.tryout-events.save", input.id, "allowed");
    return { ok: true };
  });
}
