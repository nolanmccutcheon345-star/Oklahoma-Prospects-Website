import type { Sql } from "../db";
import type { z } from "zod";
import { secured, requireTeam, grants, permits, audit, CoordinatorDenied } from "./access.server";
import { lockFinancialExecution } from "../finance/execution.server";
import { holdWindow } from "../commerce/store.server";
import {
  operationalEvent,
  allSessions,
  eventCoachChoices,
  createOperationalEventInTransaction,
  saveOperationalEventSettingsInTransaction,
  addOperationalEventSessionInTransaction,
  saveOperationalEventEnrollmentInTransaction,
} from "./organization-events.server";
import { publicOperationalSession } from "../commerce/operational-schedule.server";
import {
  programEventsInput,
  programEventCreateInput,
  programEventSettingsInput,
  programEventSessionInput,
  programEventEnrollmentInput,
  programEventMoveInput,
} from "./program-events-contracts";
import { saveEventSessionInTransaction } from "./organization-bookings.server";
import type { Capability } from "./contracts";
const updatePermission = (kind: string): Capability =>
  kind === "camp" ? "camps.update" : "clinics.update";
async function eventFor(
  tx: Sql,
  userId: string,
  eventId: string,
  permission: Capability | "update",
) {
  const [scope] = await tx<{
    team_id: string;
  }>`select s.team_id from coordinator_event_scopes s join operational_event_records e on e.id=s.event_id where s.event_id=${eventId} for update of s,e`;
  if (!scope) throw new CoordinatorDenied();
  const e = await operationalEvent(tx, eventId);
  if (!e || !["camp", "clinic"].includes(e.type)) throw new CoordinatorDenied();
  const team = await requireTeam(
    tx,
    userId,
    permission === "update" ? updatePermission(e.type) : permission,
    scope.team_id,
  );
  if (e.sport.toLowerCase() !== team.sport) throw new CoordinatorDenied();
  return { event: e, team };
}
async function eligibleAthletes(tx: Sql, teamId: string) {
  // Reuse owner-reviewed roster identity links; never match children by names or caller-supplied sport.
  return tx<{
    id: string;
    name: string;
  }>`select distinct a.id,a.name from recruiting_roster_links l join club_athletes a on a.id=l.athlete_id join club_state c on c.id='oklahoma-prospects' and not c.demo cross join lateral jsonb_array_elements(c.payload->'teams') t cross join lateral jsonb_array_elements(t->'roster') p where l.team_id=${teamId} and t->>'id'=l.team_id and p->>'id'=l.roster_id and coalesce(p->>'withdrawn','false')<>'true' order by a.name,a.id`;
}
export async function programEvents(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof programEventsInput>,
) {
  const v = programEventsInput.parse(raw);
  return secured(sql, userId, "events.program.read", async (tx) => {
    const current = await grants(tx, userId, true);
    const permission = (["events.read", "camps.create", "clinics.create"] as const).find((p) =>
      current.some(
        (g) =>
          g.status === "active" &&
          g.permissions.includes(p) &&
          (g.coverage === "sport" || g.team_ids.includes(v.teamId)),
      ),
    );
    if (!permission) throw new CoordinatorDenied();
    const team = await requireTeam(tx, userId, permission, v.teamId),
      can = (p: Capability) => permits(current, p, team.sport, team.id);
    const ids = can("events.read")
      ? await tx<{
          id: string;
          updated_at: string;
        }>`select e.id,to_char(e.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at from operational_event_records e join coordinator_event_scopes s on s.event_id=e.id where s.team_id=${team.id} and (${v.before?.at || null}::timestamptz is null or (e.updated_at,e.id)<(${v.before?.at || null}::timestamptz,${v.before?.id || ""})) order by e.updated_at desc,e.id desc limit 101`
      : [];
    const items = [];
    const eligible =
      can("events.assign") || can("events.attendance") ? await eligibleAthletes(tx, team.id) : [];
    for (const { id } of ids.slice(0, 100)) {
      const e = await operationalEvent(tx, id);
      if (!e || !["camp", "clinic"].includes(e.type) || e.sport.toLowerCase() !== team.sport)
        continue;
      const sessions = [];
      for (const s of await allSessions(tx, e)) {
        const cages = await tx<{
          lane: string;
        }>`select replace(lane,'lane:','') as lane from coordinator_event_cages c join operational_booking_schedule b on b.id=c.booking_id cross join lateral jsonb_array_elements_text(b.resources) lane where c.event_id=${id} and c.session_key=${s.sessionKey} and b.status='confirmed' and lane like 'lane:%'`;
        const participants =
          can("events.assign") || can("events.attendance")
            ? await tx<{
                athleteId: string;
                name: string;
                revision: number;
                status: string;
                checkedIn: boolean;
              }>`select n.athlete_id as "athleteId",a.name,n.revision,n.status,b.checked_in_at is not null as "checkedIn" from operational_event_enrollments n join club_athletes a on a.id=n.athlete_id join operational_booking_schedule b on b.id=n.booking_id where n.event_id=${id} and n.session_key=${s.sessionKey} and n.athlete_id=any(${eligible.map((a) => a.id)}::text[]) order by a.name,a.id`
            : [];
        sessions.push({
          ...publicOperationalSession(s),
          laneIds: cages.map((c) => c.lane),
          participants,
        });
      }
      items.push({
        id: e.id,
        revision: e.revision,
        name: e.name,
        description: e.description,
        type: e.type,
        location: e.location,
        capacity: e.capacity,
        coachIds: e.coachIds,
        publication: e.publication,
        editable: e.trainingEventId === null && e.publication === "draft",
        sessions,
      });
    }
    await audit(
      tx,
      userId,
      "events.program.read",
      team.id,
      "allowed",
      { count: items.length },
      team.sport,
      team.id,
    );
    const last = ids.slice(0, 100).at(-1);
    return {
      items,
      nextCursor: ids.length > 100 && last ? { at: last.updated_at, id: last.id } : null,
      coaches: await eventCoachChoices(tx),
      athletes: can("events.assign") ? eligible : [],
    };
  });
}
export async function createProgramEvent(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof programEventCreateInput>,
) {
  const v = programEventCreateInput.parse(raw);
  return secured(
    sql,
    userId,
    "events.program.create",
    async (tx) => {
      const team = await requireTeam(
        tx,
        userId,
        v.type === "camp" ? "camps.create" : "clinics.create",
        v.teamId,
      );
      const [prior] = await tx<{
        team_id: string;
      }>`select team_id from coordinator_event_scopes where event_id=${v.requestId}`;
      if (prior && prior.team_id !== team.id) throw new CoordinatorDenied();
      if (
        !prior &&
        (await tx`select id from operational_event_records where id=${v.requestId}`).length
      )
        throw new CoordinatorDenied();
      const { teamId: _, ...input } = v;
      const result = await createOperationalEventInTransaction(tx, userId, {
        ...input,
        sport: team.sport === "baseball" ? "Baseball" : "Softball",
      });
      await tx`insert into coordinator_event_scopes(event_id,team_id,created_by) values(${v.requestId},${team.id},${userId}) on conflict(event_id) do nothing`;
      await audit(
        tx,
        userId,
        "events.program.create",
        v.requestId,
        "allowed",
        { kind: v.type },
        team.sport,
        team.id,
      );
      return result;
    },
    lockFinancialExecution,
  );
}
export async function saveProgramEvent(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof programEventSettingsInput>,
) {
  const v = programEventSettingsInput.parse(raw);
  return secured(
    sql,
    userId,
    "events.program.update",
    async (tx) => {
      const { event: e, team } = await eventFor(tx, userId, v.eventId, "update");
      if (
        e.trainingEventId ||
        e.publication !== "draft" ||
        (await tx`select id from commerce_orders where product_id=${e.id} limit 1`).length
      )
        throw Error(
          "Published or protected event details require owner review. Existing reservations remain unchanged.",
        );
      const result = await saveOperationalEventSettingsInTransaction(tx, userId, {
        ...v,
        publication: "draft",
      });
      await audit(
        tx,
        userId,
        "events.program.update",
        e.id,
        "allowed",
        { revision: result.revision },
        team.sport,
        team.id,
      );
      return result;
    },
    lockFinancialExecution,
  );
}
export async function addProgramSession(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof programEventSessionInput>,
) {
  const v = programEventSessionInput.parse(raw);
  return secured(
    sql,
    userId,
    "events.program.session",
    async (tx) => {
      const { event: e, team } = await eventFor(tx, userId, v.eventId, "update");
      if (
        e.trainingEventId ||
        e.publication !== "draft" ||
        (await tx`select id from commerce_orders where product_id=${e.id} limit 1`).length
      )
        throw Error("Add sessions before publication or ask an owner to review the change.");
      if (v.laneIds.length) await requireTeam(tx, userId, "cages.reserve", team.id);
      const { laneIds, ...input } = v;
      const result = await addOperationalEventSessionInTransaction(tx, userId, input);
      const session = (await allSessions(tx, e)).find((s) => s.sessionKey === result.sessionKey)!;
      if (laneIds.length) {
        const booking = await holdWindow(tx, {
          orderId: null,
          userId,
          athleteId: null,
          productId: "training-event:" + e.id,
          start: new Date(session.startsAt),
          end: new Date(session.endsAt),
          resources: [...new Set(laneIds)].map((id) => "lane:" + id),
        });
        await tx`update booking_records set status='confirmed' where id=${booking}`;
        await tx`insert into coordinator_event_cages(event_id,session_key,booking_id) values(${e.id},${session.sessionKey},${booking})`;
      }
      await audit(
        tx,
        userId,
        "events.program.session",
        e.id,
        "allowed",
        { sessionKey: session.sessionKey, laneIds },
        team.sport,
        team.id,
      );
      return result;
    },
    lockFinancialExecution,
  );
}
export async function saveProgramEnrollment(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof programEventEnrollmentInput>,
) {
  const v = programEventEnrollmentInput.parse(raw);
  return secured(
    sql,
    userId,
    "events.program." + v.action,
    async (tx) => {
      const { event: e, team } = await eventFor(
        tx,
        userId,
        v.eventId,
        v.action === "check-in" ? "events.attendance" : "events.assign",
      );
      if (!(await eligibleAthletes(tx, team.id)).some((a) => a.id === v.athleteId))
        throw new CoordinatorDenied();
      if (e.trainingEventId) throw Error("This protected enrollment requires owner review.");
      const result = await saveOperationalEventEnrollmentInTransaction(tx, userId, v);
      await audit(
        tx,
        userId,
        "events.program." + v.action,
        e.id,
        "allowed",
        { athleteId: v.athleteId, sessionKey: v.sessionKey },
        team.sport,
        team.id,
      );
      return result;
    },
    lockFinancialExecution,
  );
}

export async function moveProgramSession(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof programEventMoveInput>,
) {
  const v = programEventMoveInput.parse(raw);
  return secured(
    sql,
    userId,
    "events.program.reschedule",
    async (tx) => {
      const { event: e, team } = await eventFor(tx, userId, v.eventId, "update");
      if (
        e.trainingEventId ||
        e.publication !== "draft" ||
        (await tx`select id from commerce_orders where product_id=${e.id} limit 1`).length
      )
        throw Error("Published or protected session changes require owner review.");
      const current = (await allSessions(tx, e)).find((s) => s.sessionKey === v.sessionKey);
      if (!current || current.revision !== v.revision || current.status !== "confirmed")
        throw Error("Session changed. Reload before saving.");
      const [cage] = await tx<{
        booking_id: string;
        order_id: string | null;
      }>`select c.booking_id,b.order_id from coordinator_event_cages c join booking_records b on b.id=c.booking_id where c.event_id=${e.id} and c.session_key=${v.sessionKey} for update of c,b`;
      if (cage?.order_id) throw new CoordinatorDenied();
      if (cage)
        await requireTeam(tx, userId, v.laneIds.length ? "cages.update" : "cages.release", team.id);
      else if (v.laneIds.length) await requireTeam(tx, userId, "cages.reserve", team.id);
      if (cage) {
        await tx`delete from booking_occupancy where booking_id=${cage.booking_id}`;
        await tx`update booking_records set status='cancelled' where id=${cage.booking_id} and order_id is null`;
        await tx`delete from coordinator_event_cages where event_id=${e.id} and session_key=${v.sessionKey}`;
      }
      const { laneIds, ...input } = v;
      const result = await saveEventSessionInTransaction(tx, userId, input);
      const next = (await allSessions(tx, e)).find((s) => s.sessionKey === v.sessionKey)!;
      if (laneIds.length) {
        const booking = await holdWindow(tx, {
          orderId: null,
          userId,
          athleteId: null,
          productId: "training-event:" + e.id,
          start: new Date(next.startsAt),
          end: new Date(next.endsAt),
          resources: [...new Set(laneIds)].map((id) => "lane:" + id),
        });
        await tx`update booking_records set status='confirmed' where id=${booking}`;
        await tx`insert into coordinator_event_cages(event_id,session_key,booking_id) values(${e.id},${v.sessionKey},${booking})`;
      }
      await audit(
        tx,
        userId,
        "events.program.reschedule",
        e.id,
        "allowed",
        {
          sessionKey: v.sessionKey,
          before: { start: current.startsAt, end: current.endsAt },
          after: { start: next.startsAt, end: next.endsAt },
          laneIds,
        },
        team.sport,
        team.id,
      );
      return result;
    },
    lockFinancialExecution,
  );
}

/** Internal approval executor. The queue checks reviewer authority; requester scope is rechecked here. */
export async function cancelProgramEventInTransaction(
  tx: Sql,
  reviewerId: string,
  requesterId: string,
  eventId: string,
  expectedTeamId: string,
  version: number,
  snapshot: { key: string; revision: number }[],
) {
  const { event: e, team } = await eventFor(tx, requesterId, eventId, "events.cancel.request");
  if (team.id !== expectedTeamId) throw new CoordinatorDenied();
  if (e.revision !== version)
    throw Error("The event changed. Request a fresh cancellation review.");
  const sessions = await allSessions(tx, e),
    current = sessions
      .map((s) => ({ key: s.sessionKey, revision: s.revision }))
      .sort((a, b) => a.key.localeCompare(b.key));
  if (
    JSON.stringify(current) !==
    JSON.stringify([...snapshot].sort((a, b) => a.key.localeCompare(b.key)))
  )
    throw Error("The event sessions changed. Request a fresh cancellation review.");
  if (
    e.trainingEventId ||
    (await tx`select id from commerce_orders where product_id=${e.id} limit 1`).length
  )
    throw new CoordinatorDenied();
  for (const session of sessions.filter(
    (s) => s.status === "confirmed" && new Date(s.endsAt) > new Date(),
  )) {
    const [paid] =
      await tx`select id from booking_records where order_id is not null and product_id=any(${[e.id, "training-event:" + e.id]}) and status='confirmed' limit 1`;
    if (paid) throw new CoordinatorDenied();
    await saveEventSessionInTransaction(tx, reviewerId, {
      eventId: e.id,
      sessionKey: session.sessionKey,
      revision: session.revision,
      action: "cancel",
      reason: "Owner approved coordinator cancellation request",
    });
  }
  await tx`update operational_event_records set publication='archived',revision=revision+1,updated_by=${reviewerId},updated_at=now() where id=${e.id}`;
  await audit(
    tx,
    reviewerId,
    "events.program.cancel-approved",
    e.id,
    "allowed",
    { requestedBy: requesterId },
    team.sport,
    team.id,
  );
}
