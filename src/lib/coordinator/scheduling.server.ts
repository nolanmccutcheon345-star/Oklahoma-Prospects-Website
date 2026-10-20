import type { Sql } from "../db";
import { lockFinancialExecution } from "../finance/execution.server";
import type { z } from "zod";
import { practiceInput, scopeInput } from "./contracts";
import { requireTeam, checkScope, secured, audit, CoordinatorDenied } from "./access.server";
import { validateWindow } from "../scheduling";
import { holdWindow } from "../commerce/store.server";
export async function schedules(sql: Sql, userId: string, teamId: string) {
  return secured(sql, userId, "events.read", async (tx) => {
    await requireTeam(tx, userId, "events.read", teamId);
    return tx<{
      id: string;
      revision: number;
      kind: string;
      title: string;
      date: string;
      time: string;
      end_time: string;
      location: string;
      status: string;
      lane_ids: string[];
    }>`select a.id,a.revision,a.payload->>'kind' as kind,a.payload->>'title' as title,a.payload->>'date' as date,a.payload->>'startTime' as time,a.payload->>'endTime' as end_time,a.payload->>'location' as location,a.payload->>'status' as status,coalesce((select array_agg(replace(resource,'lane:','')) from booking_records b cross join lateral jsonb_array_elements_text(b.resources) resource where b.id=cp.booking_id and b.status='confirmed' and resource like 'lane:%'),'{}') as lane_ids from team_activities a left join coordinator_practice_bookings cp on cp.activity_id=a.id where a.team_id=${teamId} order by a.payload->>'date' desc limit 200`;
  });
}
export async function savePractice(sql: Sql, userId: string, raw: z.infer<typeof practiceInput>) {
  const input = practiceInput.parse(raw);
  return secured(sql, userId, "practices.save", async (tx) => {
    const team = await requireTeam(
      tx,
      userId,
      input.revision ? "practices.update" : "practices.create",
      input.teamId,
    );
    await tx`select id from club_state where id='oklahoma-prospects' for update`;
    const window = validateWindow(input.date, input.time, input.duration);
    const [old] = await tx<{
      revision: number;
      kind: string;
      status: string;
      team_id: string;
    }>`select revision,payload->>'kind' as kind,payload->>'status' as status,team_id from team_activities where id=${input.id} for update`;
    if ((old?.revision || 0) !== input.revision)
      throw new Error("Practice changed. Reload before saving.");
    if (old && (old.team_id !== team.id || old.kind !== "practice" || old.status === "cancelled"))
      throw new CoordinatorDenied();
    const [reserved] = await tx<{
      booking_id: string;
      order_id: string | null;
      status: string;
    }>`select cp.booking_id,b.order_id,b.status from coordinator_practice_bookings cp join booking_records b on b.id=cp.booking_id where cp.activity_id=${input.id} for update of cp,b`;
    if (reserved?.order_id) throw new CoordinatorDenied();
    if (reserved) {
      await requireTeam(
        tx,
        userId,
        input.laneIds.length ? "cages.update" : "cages.release",
        team.id,
      );
      await tx`delete from booking_occupancy where booking_id=${reserved.booking_id}`;
      await tx`update booking_records set status='cancelled' where id=${reserved.booking_id} and order_id is null`;
    } else if (input.laneIds.length) await requireTeam(tx, userId, "cages.reserve", team.id);
    const minutes =
      Number(input.time.slice(0, 2)) * 60 + Number(input.time.slice(3)) + input.duration;
    const endTime =
      String(Math.floor(minutes / 60)).padStart(2, "0") +
      ":" +
      String(minutes % 60).padStart(2, "0");
    const payload = {
      id: input.id,
      teamId: team.id,
      revision: input.revision + 1,
      kind: "practice",
      title: input.title,
      date: input.date,
      startTime: input.time,
      endTime,
      location: input.location,
      status: "scheduled",
      ourRuns: 0,
      oppRuns: 0,
      stats: [],
    };
    if (old)
      await tx`update team_activities set payload=payload||${JSON.stringify(payload)}::jsonb,revision=revision+1,updated_by=${userId},updated_at=now() where id=${input.id}`;
    else
      await tx`insert into team_activities(id,team_id,payload,updated_by) values(${input.id},${team.id},${JSON.stringify(payload)}::jsonb,${userId})`;
    if (input.laneIds.length) {
      // The SAME occupancy table and unique cells used by paid checkout. A conflict rolls everything back.
      const bookingId = await holdWindow(tx, {
        orderId: null,
        userId,
        athleteId: null,
        productId: "coordinator-practice:" + input.id,
        start: window.start,
        end: window.end,
        resources: [...new Set(input.laneIds)].map((id) => "lane:" + id),
      });
      await tx`update booking_records set status='confirmed' where id=${bookingId}`;
      await tx`insert into coordinator_practice_bookings(activity_id,booking_id) values(${input.id},${bookingId}) on conflict(activity_id) do update set booking_id=excluded.booking_id`;
    } else if (reserved)
      await tx`delete from coordinator_practice_bookings where activity_id=${input.id}`;
    await syncPractice(tx, team.id, {
      id: input.id,
      date: input.date,
      time: input.time,
      where: input.location,
      cageHours: input.laneIds.length ? input.duration / 60 : 0,
      status: "on",
    });
    await audit(
      tx,
      userId,
      "practices.save",
      input.id,
      "allowed",
      { revision: input.revision + 1, date: input.date, time: input.time, laneIds: input.laneIds },
      team.sport,
      team.id,
    );
    return { ok: true };
  }, lockFinancialExecution);
}
export async function cageOccupancy(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof scopeInput> & { date: string },
) {
  const input = scopeInput.parse({ sport: raw.sport, teamId: raw.teamId });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) throw new Error("Choose a date.");
  return secured(sql, userId, "cages.read", async (tx) => {
    await checkScope(tx, userId, "cages.read", input.sport, input.teamId);
    return tx<{
      resource_id: string;
      slot_at: Date;
    }>`select resource_id,slot_at from booking_occupancy where resource_id like 'lane:%' and (slot_at at time zone 'America/Chicago')::date=${raw.date}::date order by slot_at,resource_id`;
  });
}

export async function syncPractice(
  tx: Sql,
  teamId: string,
  practice: {
    id: string;
    date: string;
    time: string;
    where: string;
    cageHours: number;
    status: string;
  },
) {
  const [row] = await tx<{
    idx: number;
  }>`select (t.ordinality-1)::int as idx from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') with ordinality t(value,ordinality) where c.id='oklahoma-prospects' and t.value->>'id'=${teamId}`;
  if (!row) throw new CoordinatorDenied();
  const path = ["teams", String(row.idx), "practices"];
  await tx`update club_state set payload=jsonb_set(payload,${path}::text[],coalesce((select jsonb_agg(p) from jsonb_array_elements(coalesce(payload#>${path}::text[],'[]'::jsonb)) p where p->>'id'<>${practice.id}),'[]'::jsonb)||${JSON.stringify([practice])}::jsonb),rev=rev+1,updated_at=now() where id='oklahoma-prospects'`;
}
