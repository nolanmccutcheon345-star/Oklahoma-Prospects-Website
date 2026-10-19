import { getSql, type Sql } from "../db";
import { z } from "zod";
import {
  audit,
  CoordinatorDenied,
  financiallyRestricted,
  requireOrganizationOperations,
  secured,
} from "../coordinator/access.server";
import type { Availability, Coach } from "../pd/types";
import { bookableCoaches } from "./coach-services.server";
import { coachAvailable } from "./availability";

type Lesson = {
  id: string;
  product_id: string;
  coach_id: string | null;
  starts_at: Date;
  ends_at: Date;
  resources: string[];
  status: string;
  checked_in_at: Date | null;
};
const id = z.string().min(1).max(150);
const assignmentInput = z
  .object({
    id,
    coachId: id,
    expectedCoachId: id.nullable(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .strict();

/** Read only instructor identity and recurring windows. Never hydrate the mixed
 * coaching file, catalog prices, household credits, payouts or order snapshots. */
async function assignmentRoster(sql: Sql) {
  const coaches = await sql<Coach>`select c->>'id' as id,c->>'name' as name,c->>'email' as email,
    coalesce(c->'active','true'::jsonb)<>'false'::jsonb as active
    from pd_working_file f cross join lateral jsonb_array_elements(case when jsonb_typeof(f.payload::jsonb->'coaches')='array' then f.payload::jsonb->'coaches' else '[]'::jsonb end) c
    where f.id='club' and jsonb_typeof(c->'id')='string' and jsonb_typeof(c->'name')='string' and jsonb_typeof(c->'email')='string'`;
  const availability =
    await sql<Availability>`select a->>'id' as id,a->>'coachId' as "coachId",a->>'weekday' as weekday,a->>'window' as window
    from pd_working_file f cross join lateral jsonb_array_elements(case when jsonb_typeof(f.payload::jsonb->'availability')='array' then f.payload::jsonb->'availability' else '[]'::jsonb end) a
    where f.id='club' and jsonb_typeof(a->'id')='string' and jsonb_typeof(a->'coachId')='string' and jsonb_typeof(a->'weekday')='string' and jsonb_typeof(a->'window')='string'`;
  return { coaches: coaches.map((c) => ({ ...c, specialties: [] })), availability };
}
function windowFor(b: Lesson) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(b.starts_at));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
    minutes: (+new Date(b.ends_at) - +new Date(b.starts_at)) / 60000,
  };
}
async function candidates(sql: Sql, b: Lesson) {
  const file = await assignmentRoster(sql),
    window = windowFor(b);
  const coaches = (await bookableCoaches(sql, file.coaches)).filter(
    (c) =>
      c.serviceIds.includes(b.product_id) &&
      coachAvailable(file.availability, c.id, window.date, window.time, window.minutes),
  );
  const occupied = await sql<{
    resource_id: string;
  }>`select distinct resource_id from booking_occupancy where resource_id=any(${coaches.map((c) => "coach:" + c.id)}::text[]) and booking_id<>${b.id} and slot_at>=${new Date(b.starts_at).toISOString()} and slot_at<${new Date(b.ends_at).toISOString()}`;
  return coaches
    .filter((c) => !occupied.some((o) => o.resource_id === "coach:" + c.id))
    .map((c) => ({ id: c.id, name: c.name }));
}
export async function lessonAssignmentList(userId: string) {
  const sql = await getSql();
  return secured(sql, userId, "organization.lessons.read", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const rows = await tx<
      Pick<Lesson, "id" | "coach_id" | "starts_at" | "ends_at"> & {
        service_name: string;
        player_name: string | null;
        customer_email: string | null;
      }
    >`select b.id,b.coach_id,b.starts_at,b.ends_at,s.name as service_name,a.name as player_name,o.email as customer_email from booking_records b join club_services s on s.id=b.product_id and s.kind='lesson' left join club_athletes a on a.id=b.athlete_id left join commerce_orders o on o.id=b.order_id where b.status='confirmed' and b.starts_at>now() and b.checked_in_at is null order by (b.coach_id is not null),b.starts_at,b.id limit 200`;
    const file = await assignmentRoster(tx);
    return rows.map((b) => ({
      id: b.id,
      serviceName: b.service_name,
      playerName: b.player_name,
      customerEmail: b.customer_email,
      coachId: b.coach_id,
      coachName:
        file.coaches.find((c) => c.id === b.coach_id)?.name ||
        (b.coach_id ? "Assigned instructor" : ""),
      startsAt: new Date(b.starts_at).toISOString(),
      endsAt: new Date(b.ends_at).toISOString(),
    }));
  });
}
export async function lessonInstructorChoices(userId: string, id: string) {
  const sql = await getSql();
  return secured(sql, userId, "organization.lessons.instructors", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const [b] =
      await tx<Lesson>`select b.id,b.product_id,b.coach_id,b.starts_at,b.ends_at,b.resources,b.status,b.checked_in_at from booking_records b join club_services s on s.id=b.product_id and s.kind='lesson' where b.id=${id} and b.status='confirmed' and b.starts_at>now() and b.checked_in_at is null`;
    if (!b)
      throw new Error(
        "This lesson is no longer available for assignment. Refresh the bookings list.",
      );
    return {
      coachId: b.coach_id,
      startsAt: new Date(b.starts_at).toISOString(),
      endsAt: new Date(b.ends_at).toISOString(),
      instructors: await candidates(tx, b),
    };
  });
}
export async function assignLessonInstructor(userId: string, raw: z.infer<typeof assignmentInput>) {
  const sql = await getSql();
  return secured(sql, userId, "organization.lessons.assign", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const input = assignmentInput.parse(raw);
    const [b] =
      await tx<Lesson>`select b.id,b.product_id,b.coach_id,b.starts_at,b.ends_at,b.resources,b.status,b.checked_in_at from booking_records b join club_services s on s.id=b.product_id and s.kind='lesson' where b.id=${input.id} for update of b`;
    if (!b || b.status !== "confirmed" || b.checked_in_at || new Date(b.starts_at) <= new Date())
      throw new Error("Only upcoming confirmed lessons can be assigned.");
    if (
      b.coach_id !== input.expectedCoachId ||
      new Date(b.starts_at).toISOString() !== input.startsAt ||
      new Date(b.ends_at).toISOString() !== input.endsAt
    )
      throw new Error(
        "This booking changed. Refresh and review it before assigning an instructor.",
      );
    if (await financiallyRestricted(tx, userId)) {
      // Completion derives the compensation recipient and split from coach_id.
      // Even null -> coach changes future pay. Until compensation identity is
      // independently preserved, restricted users may only acknowledge a no-op.
      if (b.coach_id !== input.coachId) {
        const denied = new CoordinatorDenied();
        denied.message =
          "An owner must change this instructor because the assignment affects compensation.";
        throw denied;
      }
      await audit(tx, userId, "organization.lessons.assign", b.id, "allowed", { unchanged: true });
      return { ok: true };
    }
    if (!(await candidates(tx, b)).some((c) => c.id === input.coachId))
      throw new Error(
        "This instructor no longer offers this lesson or is unavailable for the full session. Refresh available instructors.",
      );
    const resource = "coach:" + input.coachId;
    // Acquire the new instructor first. A unique occupancy conflict rolls back
    // the entire transaction, preserving the old assignment and paid booking.
    for (let ms = +new Date(b.starts_at); ms < +new Date(b.ends_at); ms += 300000) {
      const inserted =
        await tx`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${resource},${new Date(ms).toISOString()},${b.id}) on conflict(resource_id,slot_at) do update set booking_id=excluded.booking_id where booking_occupancy.booking_id=excluded.booking_id returning booking_id`;
      if (!inserted.length)
        throw new Error(
          "This instructor was just booked. Refresh available instructors and choose another.",
        );
    }
    await tx`delete from booking_occupancy where booking_id=${b.id} and resource_id like 'coach:%' and resource_id<>${resource}`;
    const resources = [
      ...new Set([...b.resources.filter((r) => !r.startsWith("coach:")), resource]),
    ];
    await tx`update booking_records set coach_id=${input.coachId},resources=${JSON.stringify(resources)}::jsonb where id=${b.id}`;
    // Never touch commerce_orders, payment snapshots, credits, participants,
    // lesson times, or facility/athlete occupancy during instructor assignment.
    await audit(tx, userId, "organization.lessons.assign", b.id, "allowed");
    return { ok: true };
  });
}
