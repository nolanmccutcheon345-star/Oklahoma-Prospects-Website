import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import { assertTryoutPreference, publicTryoutTeamsFor } from "./tryout-preferences.server";
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export type TryoutApplicant = {
  player: string;
  email: string;
  sport: string;
  age: string;
  season?: string;
  autoEnroll?: boolean;
  preferredTeamId?: string;
  preferredCoachId?: string;
  requestType?: "scheduled" | "individual";
};
export function applicantKey(input: TryoutApplicant) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [input.email, input.player, input.sport, input.age, input.season || ""].map(normalize),
      ),
    )
    .digest("hex");
}
export async function queueTryoutNotice(
  tx: Sql,
  enrollmentId: string,
  eventId: string,
  kind: "enrolled" | "updated" | "cancelled",
) {
  const [row] = await tx<{
    revision: number;
    payload: Record<string, unknown>;
  }>`select e.revision,jsonb_build_object('email',r.payload->>'email','player',r.payload->>'player','sport',e.sport,'season',e.season,'date',e.event_date::text,'startTime',e.start_time,'endTime',e.end_time,'location',e.location) as payload from tryout_events e join tryout_enrollments n on n.event_id=e.id join club_requests r on r.id=n.request_id where n.id=${enrollmentId} and e.id=${eventId}`;
  if (!row) throw new Error("Enrollment notice could not be recorded.");
  await tx`update tryout_notification_outbox set status='superseded' where enrollment_id=${enrollmentId} and status in ('pending','processing')`;
  await tx`insert into tryout_notification_outbox(id,enrollment_id,event_revision,kind,payload) values(${randomUUID()},${enrollmentId},${row.revision},${kind},${JSON.stringify(row.payload)}::jsonb) on conflict(enrollment_id,event_revision,kind) do nothing`;
}
// Caller owns the transaction. Locks serialize enrollment against event edits/capacity.
export async function matchTryoutApplicants(tx: Sql) {
  const events = await tx<{
    id: string;
    capacity: number;
    age_groups: string[];
    sport: string;
    season: string;
  }>`select id,capacity,age_groups,sport,season from tryout_events where status='published' and (event_date+start_time::time) at time zone 'America/Chicago'>now() order by event_date,start_time,id for update`;
  for (const event of events) {
    const requests = await tx<{
      id: string;
      payload: TryoutApplicant;
    }>`select id,payload from club_requests where kind='tryout' and status='open' and payload->>'autoEnroll'='true' order by created_at,id`;
    for (const request of requests) {
      const p = request.payload;
      // Published group events do not identify a preferred team or coach.
      // Staff must review the request instead of silently enrolling elsewhere.
      if (p.preferredTeamId || p.preferredCoachId || p.requestType) continue;
      if (
        !p.season?.trim() ||
        !p.player?.trim() ||
        !p.email?.trim() ||
        p.sport !== event.sport ||
        normalize(p.season) !== normalize(event.season) ||
        !event.age_groups.some((age) => normalize(age) === normalize(p.age))
      )
        continue;
      const key = applicantKey(p);
      const [existing] =
        await tx`select id from tryout_enrollments where applicant_key=${key} and status='enrolled'`;
      if (existing) continue;
      const [count] = await tx<{
        count: number;
      }>`select count(*)::int as count from tryout_enrollments where event_id=${event.id} and status='enrolled'`;
      if (count.count >= event.capacity) break;
      const id = randomUUID();
      const rows =
        await tx`insert into tryout_enrollments(id,event_id,request_id,applicant_key,status) values(${id},${event.id},${request.id},${key},'enrolled') on conflict do nothing returning id`;
      if (rows.length) await queueTryoutNotice(tx, id, event.id, "enrolled");
    }
  }
}
export async function recordInquiryFor(
  sql: Sql,
  input: { requestId: string; kind: string; [key: string]: unknown },
) {
  return sql.transaction(async (tx) => {
    if (input.kind === "tryout") {
      if (input.requestType) {
        if (input.requestConsent !== true || input.autoEnroll === true) throw new Error("Confirm request consent. Staff must confirm your appointment.");
        if (input.requestType === "scheduled") {
          const { publicTryoutEventsFor } = await import("./tryout-events.server");
          const event = (await publicTryoutEventsFor(tx)).find(e => e.id === input.requestedEventId);
          if (!event || event.sport !== input.sport || event.season !== input.season || !event.ageGroups.includes(String(input.age))) throw new Error("This tryout changed or is no longer available. Refresh and choose a published event.");
          input = {...input, requestedEvent: {id:event.id, sport:event.sport, season:event.season, date:event.date, startTime:event.startTime, endTime:event.endTime, location:event.location}};
        } else if (input.requestedEventId) throw new Error("Individual evaluations cannot select a scheduled event.");
      }
      const preferredTeamId = typeof input.preferredTeamId === "string" ? input.preferredTeamId : "";
      const preferredCoachId = typeof input.preferredCoachId === "string" ? input.preferredCoachId : "";
      if (preferredTeamId || preferredCoachId) {
        assertTryoutPreference(await publicTryoutTeamsFor(tx), {
          sport: String(input.sport),
          age: String(input.age),
          preferredTeamId,
          preferredCoachId,
          autoEnroll: input.autoEnroll === true,
        });
      }
    }
    await tx`insert into club_requests(id,user_id,kind,payload) values(${input.requestId},null,${input.kind},${JSON.stringify(input)}::jsonb) on conflict(id) do nothing`;
    if (input.kind === "tryout") await matchTryoutApplicants(tx);
    return { ok: true, reference: input.requestId };
  });
}
export async function adminTryoutEnrollmentsFor(sql: Sql, userId: string) {
  if ((await resolveIdentity(sql, userId)).role !== "admin")
    throw new Error("Owner access required.");
  return sql<{
    id: string;
    eventId: string;
    player: string;
    email: string;
    status: string;
    notification: string;
  }>`select n.id,n.event_id as "eventId",r.payload->>'player' as player,r.payload->>'email' as email,n.status,coalesce((select o.status from tryout_notification_outbox o where o.enrollment_id=n.id order by o.created_at desc limit 1),'none') as notification from tryout_enrollments n join club_requests r on r.id=n.request_id order by n.created_at desc limit 500`;
}
