import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { lockFinancialExecution } from "./finance/execution.server";
import { centerAccessFor } from "./tryout-center-access.server";
import {
  centerWorkInput,
  centerMessageInput,
  centerAppointmentInput,
  centerPreferencesInput,
  type CenterWorkInput,
  type CenterMessageInput,
  type CenterAppointmentInput,
} from "./tryout-center-contracts";
import { chicagoInstant, validateWindow, timeMinutes } from "./scheduling";
import { coachHoldsTeam } from "./teams/privacy";
import type { ClubRecord } from "./teams/types";
import { publicTryoutEventsFor } from "./tryout-events.server";

type Intake = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: Date;
  status: string;
};
const fields = [
  "player",
  "parent",
  "name",
  "age",
  "sport",
  "season",
  "session",
  "email",
  "phone",
  "positions",
  "notes",
  "usssaStatus",
  "usssaAthleteId",
  "preferredTeamId",
  "preferredCoachId",
  "requestType",
  "requestedEventId",
  "sourceForm",
  "teamId",
  "stage",
  "rosterPlayerId",
  "rosterRole",
];
const pick = (p: Record<string, unknown>) =>
  Object.fromEntries(
    fields.flatMap((k) => (typeof p[k] === "string" ? [[k, p[k] as string]] : [])),
  );
export async function centerStaff(sql: Sql) {
  return sql<{
    id: string;
    staffId: string;
    name: string;
    email: string;
  }>`select distinct u.id,coalesce(s.id,'') as "staffId",u.name,lower(trim(u.email)) as email from "user" u
 left join club_staff s on s.active=true and is_tryout_staff(u.id,u.email) and lower(trim(s.email))=lower(trim(u.email)) and (s.user_id='' or s.user_id=u.id)
 where u."disabledAt" is null and u."emailVerified"=true
 and (s.id is not null or exists(select 1 from owner_grants g where g.user_id=u.id and g.email=lower(trim(u.email)) and g.revoked_at is null)
 or exists(select 1 from registration_readers r where r.user_id=u.id and r.email=lower(trim(u.email)) and r.active and r.can_manage_tryouts)) order by u.name`;
}
async function requestFor(tx: Sql, id: string) {
  const [r] =
    await tx<Intake>`select id,kind,payload,created_at,status from club_requests where id=${id} and kind in ('tryout','team-inquiry') for update`;
  if (!r) throw new Error("Tryout registration not found.");
  return r;
}
export async function queueCenterNotice(
  tx: Sql,
  requestId: string,
  recipient: { id: string; email: string },
  key: string,
  subject: string,
  body: string,
) {
  const [pref] = await tx<{
    email_enabled: boolean;
  }>`select email_enabled from tryout_center_preferences where user_id=${recipient.id}`;
  await tx`insert into tryout_center_notices(id,request_id,recipient_id,email,subject,body,dedupe_key,status) values(${randomUUID()},${requestId},${recipient.id},${recipient.email},${subject},${body},${key},${pref?.email_enabled === false ? "skipped" : "pending"}) on conflict(dedupe_key) do nothing`;
}
export async function centerWorkspaceFor(sql: Sql, userId: string) {
  const me = await centerAccessFor(sql, userId);
  const [state] = await sql<{
    payload: ClubRecord;
  }>`select payload from club_state where id='oklahoma-prospects'`;
  const club = state?.payload;
  const teams = (club?.teams ?? [])
    .filter((t) => !t.closed)
    .map((t) => ({
      id: t.id,
      name: t.name,
      age: t.age,
      sport: t.sport,
      closed: t.closed,
      seasonEnd: t.seasonEnd,
      mine: Boolean(club && coachHoldsTeam(club, me.email, t.id)),
    }));
  const requests =
    await sql<Intake>`select id,kind,payload,created_at,status from club_requests where kind in ('tryout','team-inquiry') order by created_at desc,id`;
  const work = await sql<{
    request_id: string;
    assignee_id: string | null;
    follow_up: string;
    team_id: string;
    follow_up_date: string | null;
    revision: number;
  }>`select w.* from office_request_work w join club_requests r on r.id=w.request_id where r.kind in ('tryout','team-inquiry')`;
  const notices = await sql<{
    id: string;
    request_id: string;
    subject: string;
    read_at: Date | null;
    created_at: Date;
  }>`select id,request_id,subject,read_at,created_at from tryout_center_notices where recipient_id=${userId} order by created_at desc limit 300`;
  const appointments = await sql<{
    id: string;
    request_id: string;
    coach_id: string;
    event_id: string | null;
    starts_at: Date;
    ends_at: Date;
    location: string;
    lane_ids: string[];
    status: "proposed" | "confirmed" | "cancelled";
    revision: number;
  }>`select a.* from tryout_appointments a join club_requests r on r.id=a.request_id where r.kind in ('tryout','team-inquiry') order by a.starts_at`;
  const [preferences] = await sql<{
    email_enabled: boolean;
    sports: string[];
    ages: string[];
    team_ids: string[];
  }>`select * from tryout_center_preferences where user_id=${userId}`;
  const failures = await sql<{
    request_id: string;
    status: string;
    count: number;
  }>`select request_id,status,count(*)::int as count from tryout_center_notices where status in ('pending','processing','review') group by request_id,status`;
  return {
    userId,
    owner: me.role === "admin",
    teams,
    staff: await centerStaff(sql),
    registrations: requests.map((r) => ({ ...r, payload: pick(r.payload) })),
    work,
    notices,
    appointments,
    preferences: preferences ?? { email_enabled: true, sports: [], ages: [], team_ids: [] },
    failures,
    events: await publicTryoutEventsFor(sql),
    publicTeams: await (await import("./tryout-preferences.server")).publicTryoutTeamsFor(sql),
    emailConfigured: Boolean(
      process.env.RESEND_API_KEY &&
      (process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM) &&
      process.env.TRYOUT_NOTIFICATIONS_ENABLED === "true",
    ),
  };
}
export async function centerDetailFor(sql: Sql, userId: string, id: string) {
  await centerAccessFor(sql, userId);
  const [r] =
    await sql<Intake>`select id,kind,payload,created_at,status from club_requests where id=${id} and kind in ('tryout','team-inquiry')`;
  if (!r) throw new Error("Tryout registration not found.");
  const activity = await sql<{
    id: string;
    kind: string;
    subject: string;
    body: string;
    name: string;
    created_at: Date;
  }>`select a.id,a.kind,a.subject,a.body,u.name,a.created_at from tryout_center_activity a left join "user" u on u.id=a.actor_id where a.request_id=${id} union all select n.id,'note','Office note',n.note,u.name,n.created_at from office_request_notes n join "user" u on u.id=n.actor_id where n.request_id=${id} order by created_at desc`;
  const delivery = await sql<{
    id: string;
    subject: string;
    status: string;
    accepted_at: Date | null;
    created_at: Date;
  }>`select id,subject,status,accepted_at,created_at from tryout_center_notices where request_id=${id} and recipient_id is null order by created_at desc`;
  return { activity, delivery };
}
export async function saveCenterWorkFor(sql: Sql, userId: string, raw: CenterWorkInput) {
  const input = centerWorkInput.parse(raw);
  await centerAccessFor(sql, userId);
  const staff = await centerStaff(sql);
  if (input.assignee && !staff.some((s) => s.id === input.assignee))
    throw new Error("Choose an active approved staff account.");
  const [state] = await sql<{
    payload: ClubRecord;
  }>`select payload from club_state where id='oklahoma-prospects'`;
  if (input.teamId && !state?.payload.teams.some((t) => t.id === input.teamId && !t.closed))
    throw new Error("Choose an active team.");
  return sql.transaction(async (tx) => {
    await tx.query("select set_config('app.actor_id',$1,true)", [userId]);
    const request = await requestFor(tx, input.id);
    if (request.status === "accepted" && input.status !== "accepted" && input.status !== "closed")
      throw new Error("This player is already on a roster. Manage placement in Teams.");
    const [done] = await tx<{
      same: boolean;
    }>`select action_payload=${JSON.stringify(input)}::jsonb as same from tryout_center_activity where id=${input.actionId} and request_id=${input.id} and actor_id=${userId}`;
    if (done) {
      if (!done.same)
        throw new Error(
          "This action was already used with different details. Reload before making another change.",
        );
      return { ok: true };
    }
    const [work] = await tx<{
      revision: number;
    }>`select revision from office_request_work where request_id=${input.id} for update`;
    if ((work?.revision ?? 0) !== input.revision)
      throw new Error("Another coach updated this registration. Refresh before saving.");
    await tx`insert into office_request_work(request_id,assignee_id,follow_up,team_id,follow_up_date) values(${input.id},${input.assignee || null},${input.status},${input.teamId},${input.followUpDate || null}::date) on conflict(request_id) do update set assignee_id=excluded.assignee_id,follow_up=excluded.follow_up,team_id=excluded.team_id,follow_up_date=excluded.follow_up_date,revision=office_request_work.revision+1,updated_at=now()`;
    await tx`insert into tryout_center_activity(id,request_id,actor_id,kind,action_payload,body) values(${input.actionId},${input.id},${userId},'workflow',${JSON.stringify(input)}::jsonb,${"Status: " + input.status + "; assigned: " + (staff.find((s) => s.id === input.assignee)?.name || "Unassigned") + (input.note ? "\n" + input.note : "")})`;
    const recipient = staff.find((s) => s.id === input.assignee);
    if (recipient)
      await queueCenterNotice(
        tx,
        input.id,
        recipient,
        input.actionId + ":assigned",
        "Tryout follow-up updated",
        "Open your assigned registration in https://prospectssports.club/registrations",
      );
    return { ok: true };
  });
}
export async function saveCenterMessageFor(sql: Sql, userId: string, raw: CenterMessageInput) {
  const input = centerMessageInput.parse(raw),
    me = await centerAccessFor(sql, userId);
  const staff = await centerStaff(sql);
  return sql.transaction(async (tx) => {
    await tx.query("select set_config('app.actor_id',$1,true)", [userId]);
    const r = await requestFor(tx, input.id);
    const [done] = await tx<{
      same: boolean;
    }>`select action_payload=${JSON.stringify(input)}::jsonb as same from tryout_center_activity where id=${input.actionId} and request_id=${input.id} and actor_id=${userId}`;
    if (done) {
      if (!done.same)
        throw new Error(
          "This action was already used with different details. Reload before making another change.",
        );
      return { ok: true };
    }
    if (input.kind === "email") {
      const email = typeof r.payload.email === "string" ? r.payload.email.trim() : "";
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))
        throw new Error("This registration needs a valid guardian email.");
      if (!input.subject) throw new Error("Enter an email subject.");
      const [recent] =
        await tx`select id from tryout_center_notices where request_id=${input.id} and recipient_id is null and subject=${input.subject} and body=${input.body} and created_at>now()-interval '5 minutes'`;
      if (recent)
        throw new Error("This message was already queued recently. Check the shared history.");
      await tx`insert into tryout_center_notices(id,request_id,email,subject,body,reply_to,dedupe_key) values(${input.actionId},${input.id},${email},${input.subject},${input.body},${me.email},${"message:" + input.actionId})`;
    }
    await tx`insert into tryout_center_activity(id,request_id,actor_id,kind,action_payload,subject,body) values(${input.actionId},${input.id},${userId},${input.kind},${JSON.stringify(input)}::jsonb,${input.subject},${input.body})`;
    if (input.kind === "family-reply") {
      const [work] = await tx<{
        assignee_id: string;
      }>`select assignee_id from office_request_work where request_id=${input.id}`;
      const recipient = staff.find((s) => s.id === work?.assignee_id);
      if (recipient)
        await queueCenterNotice(
          tx,
          input.id,
          recipient,
          input.actionId + ":reply",
          "Family reply recorded",
          "A coach recorded a family reply. Open https://prospectssports.club/registrations",
        );
    }
    return { ok: true };
  });
}
export async function saveCenterPreferencesFor(sql: Sql, userId: string, raw: unknown) {
  await centerAccessFor(sql, userId);
  const p = centerPreferencesInput.parse(raw);
  await sql`insert into tryout_center_preferences(user_id,email_enabled,sports,ages,team_ids) values(${userId},${p.emailEnabled},${p.sports},${p.ages},${p.teamIds}) on conflict(user_id) do update set email_enabled=excluded.email_enabled,sports=excluded.sports,ages=excluded.ages,team_ids=excluded.team_ids`;
  return { ok: true };
}
export async function readCenterNoticeFor(sql: Sql, userId: string, id: string) {
  await centerAccessFor(sql, userId);
  await sql`update tryout_center_notices set read_at=coalesce(read_at,now()) where id=${id} and recipient_id=${userId}`;
  return { ok: true };
}

export async function saveCenterAppointmentFor(
  sql: Sql,
  userId: string,
  raw: CenterAppointmentInput,
) {
  const input = centerAppointmentInput.parse(raw);
  await centerAccessFor(sql, userId);
  const staff = await centerStaff(sql),
    coach = staff.find((s) => s.staffId === input.coachId);
  if (!coach) throw new Error("Choose an active coach with a verified account.");
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await tx.query("select set_config('app.actor_id',$1,true)", [userId]);
    const request = await requestFor(tx, input.requestId);
    const [done] = await tx<{
      same: boolean;
    }>`select action_payload=${JSON.stringify(input)}::jsonb as same from tryout_center_activity where id=${input.actionId} and request_id=${input.requestId} and actor_id=${userId}`;
    if (done) {
      if (!done.same)
        throw new Error(
          "This action was already used with different details. Reload before making another change.",
        );
      return { ok: true };
    }
    const [old] = await tx<{
      revision: number;
      request_id: string;
      booking_id: string | null;
      event_id: string | null;
      status: string;
    }>`select * from tryout_appointments where id=${input.id} for update`;
    if (old && old.request_id !== input.requestId)
      throw new Error("Appointment belongs to another registration.");
    if ((old?.revision ?? 0) !== input.revision)
      throw new Error("Appointment changed. Refresh before saving.");
    // Group confirmations join the existing event/enrollment system. Individual appointments reserve the same occupancy cells as rentals and lessons.
    let start = chicagoInstant(input.date, input.time),
      end = new Date(start.getTime() + input.duration * 60000),
      location = input.location;
    if (input.eventId) {
      const [event] = await tx<{
        id: string;
        sport: string;
        season: string;
        age_groups: string[];
        event_date: string;
        start_time: string;
        end_time: string;
        location: string;
        capacity: number;
        status: string;
      }>`select *,event_date::text as event_date from tryout_events where id=${input.eventId} for update`;
      if (!event) throw new Error("Event not found.");
      if (input.status !== "cancelled") {
        if (
          event.status !== "published" ||
          event.sport !== request.payload.sport ||
          event.season !== request.payload.season ||
          !event.age_groups.some(
            (a) => a.replace(/\s|U/gi, "") === String(request.payload.age).replace(/\s|U/gi, ""),
          )
        )
          throw new Error("Choose a matching published group event.");
        start = chicagoInstant(String(event.event_date).slice(0, 10), event.start_time);
        end = chicagoInstant(String(event.event_date).slice(0, 10), event.end_time);
        location = event.location;
        if (start <= new Date()) throw new Error("Choose a future event.");
        if (timeMinutes(event.start_time) % 5 || timeMinutes(event.end_time) % 5)
          throw new Error(
            "The group event must use five-minute time boundaries. Ask an owner to update it.",
          );
        if (input.laneIds.length)
          validateWindow(
            String(event.event_date).slice(0, 10),
            event.start_time,
            (end.getTime() - start.getTime()) / 60000,
          );
        if (input.status === "confirmed") {
          const [count] = await tx<{
            count: number;
          }>`select count(*)::int as count from tryout_enrollments where event_id=${input.eventId} and status='enrolled' and request_id<>${input.requestId}`;
          if (count.count >= event.capacity) throw new Error("This group event is full.");
        }
      }
    } else if (input.status !== "cancelled") {
      const window = validateWindow(input.date, input.time, input.duration);
      start = window.start;
      end = window.end;
      if (timeMinutes(input.time) % 5) throw new Error("Choose a five-minute time boundary.");
    }
    if (old?.booking_id && !old.event_id) {
      await tx`delete from booking_occupancy where booking_id=${old.booking_id}`;
      await tx`update booking_records set status='cancelled' where id=${old.booking_id}`;
    }
    let bookingId: string | null = null;
    if (input.status === "confirmed") {
      const [shared] = input.eventId
        ? await tx<{
            booking_id: string;
            coach_id: string;
            lane_ids: string[];
          }>`select * from tryout_event_reservations where event_id=${input.eventId} for update`
        : [];
      if (shared) {
        if (
          shared.coach_id !== input.coachId ||
          JSON.stringify([...shared.lane_ids].sort()) !== JSON.stringify([...input.laneIds].sort())
        )
          throw new Error(
            "This group already has a reserved coach and lanes. Use the same coach and space, or cancel its appointments before changing them.",
          );
      } else {
        const resources = [
          ...new Set(["coach:" + input.coachId, ...input.laneIds.map((l) => "lane:" + l)]),
        ].sort();
        if (/facility|3804|elm/i.test(location) && !input.laneIds.length)
          throw new Error("Select the facility lanes needed for this appointment.");
        const [conflict] =
          await tx`select booking_id from booking_occupancy where resource_id=any(${resources}::text[]) and slot_at>=${start.toISOString()} and slot_at<${end.toISOString()} limit 1`;
        if (conflict) throw new Error("The coach or facility space is already booked.");
        bookingId = randomUUID();
        await tx`insert into booking_records(id,user_id,coach_id,product_id,starts_at,ends_at,resources,status) values(${bookingId},${userId},${input.coachId},'tryout-evaluation',${start.toISOString()},${end.toISOString()},${JSON.stringify(resources)}::jsonb,'confirmed')`;
        for (const resource of resources)
          for (let ms = start.getTime(); ms < end.getTime(); ms += 300000) {
            const occupied =
              await tx`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${resource},${new Date(ms).toISOString()},${bookingId}) on conflict do nothing returning booking_id`;
            if (!occupied.length)
              throw new Error("The coach or facility space was just booked. Choose another time.");
          }
        if (input.eventId)
          await tx`insert into tryout_event_reservations(event_id,booking_id,coach_id,lane_ids) values(${input.eventId},${bookingId},${input.coachId},${input.laneIds})`;
      }
      if (input.eventId) bookingId = null; // Shared event occupancy is owned by the event, not one registrant.
    }
    // Release this request's previous group enrollment only; never another player's record.
    const enrollments = await tx<{
      id: string;
      event_id: string;
    }>`select id,event_id from tryout_enrollments where request_id=${input.requestId} and status='enrolled' for update`;
    for (const n of enrollments)
      if (input.status !== "confirmed" || n.event_id !== input.eventId) {
        await tx`update tryout_enrollments set status='cancelled' where id=${n.id}`;
        await (
          await import("./tryout-enrollment.server")
        ).queueTryoutNotice(tx, n.id, n.event_id, "cancelled");
      }
    if (
      input.eventId &&
      input.status === "confirmed" &&
      !enrollments.some((n) => n.event_id === input.eventId)
    ) {
      const { applicantKey, queueTryoutNotice } = await import("./tryout-enrollment.server");
      const key = applicantKey({
        player: String(request.payload.player),
        email: String(request.payload.email),
        sport: String(request.payload.sport),
        age: String(request.payload.age),
        season: String(request.payload.season),
      });
      const enrollmentId = randomUUID();
      await tx`insert into tryout_enrollments(id,event_id,request_id,applicant_key,status) values(${enrollmentId},${input.eventId},${input.requestId},${key},'enrolled')`;
      await queueTryoutNotice(tx, enrollmentId, input.eventId, "enrolled");
    }
    await tx`insert into tryout_appointments(id,request_id,coach_id,event_id,booking_id,starts_at,ends_at,location,lane_ids,status,updated_by) values(${input.id},${input.requestId},${input.coachId},${input.eventId || null},${bookingId},${start.toISOString()},${end.toISOString()},${location},${input.laneIds},${input.status},${userId}) on conflict(id) do update set coach_id=excluded.coach_id,event_id=excluded.event_id,booking_id=excluded.booking_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,location=excluded.location,lane_ids=excluded.lane_ids,status=excluded.status,revision=tryout_appointments.revision+1,updated_by=excluded.updated_by,updated_at=now()`;
    if (old?.event_id && (input.status !== "confirmed" || old.event_id !== input.eventId)) {
      const [remaining] =
        await tx`select id from tryout_appointments where event_id=${old.event_id} and status='confirmed' limit 1`;
      if (!remaining) {
        const [reservation] = await tx<{
          booking_id: string;
        }>`delete from tryout_event_reservations where event_id=${old.event_id} returning booking_id`;
        if (reservation) {
          await tx`delete from booking_occupancy where booking_id=${reservation.booking_id}`;
          await tx`update booking_records set status='cancelled' where id=${reservation.booking_id}`;
        }
      }
    }
    await tx`insert into office_request_work(request_id,assignee_id,follow_up) values(${input.requestId},${coach.id},${input.status === "cancelled" ? "follow-up-needed" : input.status === "confirmed" ? "confirmed" : "scheduled"}) on conflict(request_id) do update set follow_up=case when office_request_work.follow_up in ('accepted','closed') then office_request_work.follow_up else excluded.follow_up end,assignee_id=coalesce(office_request_work.assignee_id,excluded.assignee_id),revision=office_request_work.revision+1,updated_at=now()`;
    const body = `Appointment ${input.status}: ${start.toLocaleString("en-US", { timeZone: "America/Chicago" })} Central. ${location}. ${input.eventId ? "Group tryout" : "Individual evaluation"}.`;
    await tx`insert into tryout_center_activity(id,request_id,actor_id,kind,action_payload,body) values(${input.actionId},${input.requestId},${userId},'appointment',${JSON.stringify(input)}::jsonb,${body})`;
    await queueCenterNotice(
      tx,
      input.requestId,
      coach,
      input.actionId + ":appointment",
      "Tryout appointment " + input.status,
      body + "\nhttps://prospectssports.club/registrations",
    );
    const [assigned] = await tx<{
      assignee_id: string;
    }>`select assignee_id from office_request_work where request_id=${input.requestId}`;
    const primary = staff.find((s) => s.id === assigned?.assignee_id && s.id !== coach.id);
    if (primary)
      await queueCenterNotice(
        tx,
        input.requestId,
        primary,
        input.actionId + ":primary",
        "Tryout appointment " + input.status,
        body + "\nhttps://prospectssports.club/registrations",
      );
    await tx`update tryout_center_notices set status='superseded',lease_token=null,lease_until=null where request_id=${input.requestId} and category='appointment' and status in ('pending','processing')`;
    if (!input.eventId || input.status === "proposed") {
      const email = typeof request.payload.email === "string" ? request.payload.email.trim() : "";
      if (/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))
        await tx`insert into tryout_center_notices(id,request_id,email,category,subject,body,reply_to,dedupe_key) values(${randomUUID()},${input.requestId},${email},'appointment',${"Oklahoma Prospects — appointment " + input.status},${String(request.payload.player || "Player") + "\n" + body + "\nCoach: " + coach.name + "\n" + (input.status === "proposed" ? "This is a proposal only; space is not reserved. Reply to your coach to agree on a time." : input.status === "cancelled" ? "Do not attend this cancelled appointment. Reply to your coach to arrange another time." : "Reply to your coach with questions or changes.")},${coach.email},${input.actionId + ":family"}) on conflict(dedupe_key) do nothing`;
    }
    return { ok: true };
  });
}
