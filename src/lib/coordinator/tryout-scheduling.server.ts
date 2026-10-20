import { createHash } from "node:crypto";
import type { Sql } from "../db";
import type { z } from "zod";
import { secured, requireTeam, grants, permits, audit, CoordinatorDenied } from "./access.server";
import { lockFinancialExecution } from "../finance/execution.server";
import { holdWindow } from "../commerce/store.server";
import { centerStaff } from "../tryout-center.server";
import { chicagoInstant, validateWindow, timeMinutes } from "../scheduling";
import { saveTryoutEventInTransaction } from "../tryout-events.server";
import type { TryoutEvent } from "../tryout-events-contracts";
import {
  scopedTryoutListInput,
  scopedTryoutSaveInput,
  scopedTryoutReviewInput,
} from "./tryout-scheduling-contracts";
const fields = `e.id,e.sport,e.season,e.age_groups as "ageGroups",e.event_date::text as date,e.start_time as "startTime",e.end_time as "endTime",e.location,e.capacity,e.status,e.revision`;
async function currentEvent(tx: Sql, id: string) {
  const [row] = await tx.query<TryoutEvent & { teamId: string }>(
    `select ${fields},s.team_id as "teamId" from tryout_events e join coordinator_tryout_scopes s on s.event_id=e.id where e.id=$1 for update of e,s`,
    [id],
  );
  return row;
}
export async function scopedTryouts(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof scopedTryoutListInput>,
) {
  const v = scopedTryoutListInput.parse(raw);
  return secured(sql, userId, "tryouts.schedule.read", async (tx) => {
    const gs = await grants(tx, userId, true);
    const permission = (["events.read", "tryouts.create"] as const).find((p) =>
      gs.some(
        (g) =>
          g.status === "active" &&
          g.permissions.includes(p) &&
          (g.coverage === "sport" || g.team_ids.includes(v.teamId)),
      ),
    );
    if (!permission) throw new CoordinatorDenied();
    const team = await requireTeam(tx, userId, permission, v.teamId);
    const rows = permits(gs, "events.read", team.sport, team.id)
      ? await tx.query<TryoutEvent & { updatedAt: string; coachId: string; laneIds: string[] }>(
          `select ${fields},to_char(e.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "updatedAt",coalesce(r.coach_id,'') as "coachId",coalesce(r.lane_ids,'{}'::text[]) as "laneIds" from tryout_events e join coordinator_tryout_scopes s on s.event_id=e.id left join tryout_event_reservations r on r.event_id=e.id where s.team_id=$1 and lower(e.sport)=$2 and ($3::timestamptz is null or (e.updated_at,e.id)<($3::timestamptz,$4::text)) order by e.updated_at desc,e.id desc limit 101`,
          [team.id, team.sport, v.before?.at ?? null, v.before?.id ?? null],
        )
      : [];
    const coaches = (await centerStaff(tx))
      .filter((c) => c.staffId)
      .map((c) => ({ id: c.staffId, name: c.name }));
    await audit(
      tx,
      userId,
      "tryouts.schedule.read",
      team.id,
      "allowed",
      { count: Math.min(rows.length, 100) },
      team.sport,
      team.id,
    );
    const last = rows.slice(0, 100).at(-1);
    return {
      items: rows.slice(0, 100),
      nextCursor: rows.length > 100 && last ? { at: last.updatedAt, id: last.id } : null,
      coaches,
    };
  });
}
async function applyChange(
  tx: Sql,
  actorId: string,
  requesterId: string,
  v: z.infer<typeof scopedTryoutSaveInput>,
  status: "draft" | "published" | "cancelled",
  reviewed: boolean,
) {
  // All event editors lock in the same order before inspecting a scoped event.
  await tx`select id from tryout_events order by event_date,start_time,id for update`;
  const old = await currentEvent(tx, v.id);
  const team = await requireTeam(
    tx,
    requesterId,
    v.revision === 0 ? "tryouts.create" : "tryouts.update",
    v.teamId,
  );
  if (old && (old.teamId !== team.id || old.sport.toLowerCase() !== team.sport))
    throw new CoordinatorDenied();
  const digest = createHash("sha256").update(JSON.stringify(v)).digest("hex");
  if (old && v.revision === 0) {
    const [same] =
      await tx`select event_id from coordinator_tryout_scopes where event_id=${v.id} and team_id=${team.id} and created_by=${requesterId} and creation_digest=${digest}`;
    if (same && old.revision === 1) return { ok: true };
  }
  if ((old?.revision ?? 0) !== v.revision)
    throw Error("The tryout changed. Refresh before saving.");
  if (!old && (await tx`select id from tryout_events where id=${v.id}`).length)
    throw new CoordinatorDenied();
  if (
    !reviewed &&
    (status !== "draft" || old?.status === "published" || old?.status === "cancelled")
  )
    throw Error("Published or cancelled tryouts require owner review.");
  if (reviewed) await requireTeam(tx, requesterId, "events.review.request", team.id);
  if (status === "cancelled") await requireTeam(tx, requesterId, "events.cancel.request", team.id);
  if (!reviewed && v.revision === 0 && status !== "draft") throw new CoordinatorDenied();
  const coaches = await centerStaff(tx);
  if (!coaches.some((c) => c.staffId === v.coachId))
    throw Error("Choose an active coach with a verified account.");
  const [reserved] = await tx<{
    booking_id: string;
    coach_id: string;
    lane_ids: string[];
    order_id: string | null;
    checked_in_at: Date | null;
  }>`select r.booking_id,r.coach_id,r.lane_ids,b.order_id,b.checked_in_at from tryout_event_reservations r join booking_records b on b.id=r.booking_id where r.event_id=${v.id} for update of r,b`;
  if (reserved?.order_id || reserved?.checked_in_at) throw new CoordinatorDenied();
  if (reserved?.lane_ids.length)
    await requireTeam(
      tx,
      requesterId,
      v.laneIds.length && status !== "cancelled" ? "cages.update" : "cages.release",
      team.id,
    );
  if (v.laneIds.length && status !== "cancelled" && !reserved?.lane_ids.length)
    await requireTeam(tx, requesterId, "cages.reserve", team.id);
  if (/facility|3804|elm/i.test(v.location) && !v.laneIds.length && status !== "cancelled")
    throw Error("Select the facility lanes needed for this tryout.");
  const start = chicagoInstant(v.date, v.startTime),
    end = chicagoInstant(v.date, v.endTime);
  if (status !== "cancelled") {
    if (start <= new Date() || timeMinutes(v.startTime) % 5 || timeMinutes(v.endTime) % 5)
      throw Error("Choose a future tryout on five-minute boundaries.");
    if (v.laneIds.length)
      validateWindow(v.date, v.startTime, (end.getTime() - start.getTime()) / 60000);
  }
  if (reserved) {
    await tx`delete from booking_occupancy where booking_id=${reserved.booking_id}`;
    await tx`update booking_records set status='cancelled' where id=${reserved.booking_id}`;
    await tx`delete from tryout_event_reservations where event_id=${v.id}`;
  }
  const { teamId: _, coachId: __, laneIds: ___, reason: ____, ...input } = v;
  // The shared executor validates capacity, enrolled-player classification and exact revisions,
  // and records family notices in the existing transactional outbox.
  await saveTryoutEventInTransaction(tx, actorId, {
    ...input,
    sport: team.sport === "baseball" ? "Baseball" : "Softball",
    status,
  });
  if (!old)
    await tx`insert into coordinator_tryout_scopes(event_id,team_id,creation_digest,created_by) values(${v.id},${team.id},${digest},${requesterId})`;
  if (status !== "cancelled") {
    const resources = [...new Set(["coach:" + v.coachId, ...v.laneIds.map((x) => "lane:" + x)])];
    const booking = await holdWindow(tx, {
      orderId: null,
      userId: actorId,
      athleteId: null,
      productId: "tryout-evaluation",
      start,
      end,
      resources,
    });
    await tx`update booking_records set status='confirmed',coach_id=${v.coachId} where id=${booking}`;
    await tx`insert into tryout_event_reservations(event_id,booking_id,coach_id,lane_ids) values(${v.id},${booking},${v.coachId},${v.laneIds})`;
  }
  await tx`update tryout_appointments set starts_at=${start.toISOString()},ends_at=${end.toISOString()},location=${v.location},coach_id=${v.coachId},lane_ids=${v.laneIds},status=case when ${status}='cancelled' then 'cancelled' else status end,revision=revision+1,updated_by=${actorId},updated_at=now() where event_id=${v.id} and status in ('proposed','confirmed')`;
  await audit(
    tx,
    actorId,
    reviewed ? "tryouts.schedule.approved" : "tryouts.schedule.save",
    v.id,
    "allowed",
    {
      requestedBy: requesterId,
      before: old
        ? {
            revision: old.revision,
            date: old.date,
            startTime: old.startTime,
            endTime: old.endTime,
            status: old.status,
          }
        : null,
      after: {
        revision: v.revision + 1,
        date: v.date,
        startTime: v.startTime,
        endTime: v.endTime,
        status,
      },
    },
    team.sport,
    team.id,
  );
  return { ok: true };
}
export async function saveScopedTryout(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof scopedTryoutSaveInput>,
) {
  const v = scopedTryoutSaveInput.parse(raw);
  return secured(
    sql,
    userId,
    "tryouts.schedule.save",
    (tx) => applyChange(tx, userId, userId, v, "draft", false),
    lockFinancialExecution,
  );
}
export async function requestTryoutReview(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof scopedTryoutReviewInput>,
) {
  const v = scopedTryoutReviewInput.parse(raw);
  return secured(sql, userId, "tryouts.schedule.request", async (tx) => {
    const team = await requireTeam(tx, userId, "events.review.request", v.change.teamId);
    await requireTeam(tx, userId, "tryouts.update", team.id);
    if (v.status === "cancelled") await requireTeam(tx, userId, "events.cancel.request", team.id);
    const old = await currentEvent(tx, v.change.id);
    if (!old || old.teamId !== team.id || old.sport.toLowerCase() !== team.sport)
      throw new CoordinatorDenied();
    if (old.revision !== v.change.revision)
      throw Error("The tryout changed. Refresh before requesting review.");
    const proposal = { change: v.change, status: v.status };
    const [prior] = await tx<{
      same: boolean;
    }>`select requester_id=${userId} and team_id=${team.id} and target_id=${old.id} and proposal=${JSON.stringify(proposal)}::jsonb as same from coordinator_approvals where id=${v.id}`;
    if (prior) {
      if (!prior.same) throw Error("This review reference was already used.");
      return { ok: true };
    }
    await tx`insert into coordinator_approvals(id,requester_id,sport,team_id,kind,target_id,proposal,reason) values(${v.id},${userId},${team.sport},${team.id},'tryout-change',${old.id},${JSON.stringify(proposal)}::jsonb,${v.change.reason})`;
    await audit(
      tx,
      userId,
      "tryouts.schedule.request",
      old.id,
      "allowed",
      { approvalId: v.id, status: v.status, revision: old.revision },
      team.sport,
      team.id,
    );
    return { ok: true };
  });
}
/** Internal executor called only after dedicated reviewer authorization and queue revision lock. */
export async function approveTryoutChange(
  tx: Sql,
  reviewerId: string,
  requesterId: string,
  teamId: string,
  eventId: string,
  proposal: unknown,
) {
  const value = proposal as { change: unknown; status: unknown };
  const v = scopedTryoutReviewInput.parse({
    id: eventId,
    change: value?.change,
    status: value?.status,
    confirm: true,
  });
  if (v.change.teamId !== teamId || v.change.id !== eventId || v.change.revision === 0)
    throw new CoordinatorDenied();
  return applyChange(tx, reviewerId, requesterId, v.change, v.status, true);
}
