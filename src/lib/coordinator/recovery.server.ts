import { createHash } from "node:crypto";
import type { z } from "zod";
import type { Sql } from "../db";
import { secured, authority, audit, teamScope, CoordinatorDenied } from "./access.server";
import { lockFinancialExecution } from "../finance/execution.server";
import { savePlayerInTransaction } from "./organization.server";
import { savePracticeInTransaction } from "./scheduling.server";
import { practiceInput, rosterEditInput } from "./contracts";
import { rosterInformationInput } from "./roster-contracts";
import { recoveryPreviewInput, recoveryApplyInput } from "./recovery-contracts";
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const hash = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
type Snapshot = Record<string, string | string[] | number>;
type Change = {
  id: number;
  action: string;
  target_id: string;
  team_id: string;
  details: {
    before: Snapshot | string | string[];
    after: Snapshot | string | string[];
    field?: "number" | "positions";
  };
};
const eligible = `a.result='allowed' and a.action in ('rosters.number','rosters.positions','rosters.information','practices.save') and a.details->'before' is not null and a.details->'before'<>'null'::jsonb and not exists(select 1 from coordinator_recoveries r where r.audit_id=a.id)`;
export async function recoveryHistory(sql: Sql, actor: string, beforeId?: number) {
  return secured(sql, actor, "staff.recovery.read", async (tx) => {
    await authority(tx, actor, "staff_approvals.review");
    const items = await tx.query<{
      id: number;
      action: string;
      targetId: string;
      teamId: string;
      createdAt: string;
    }>(
      `select a.id::integer,a.action,a.target_id "targetId",a.team_id "teamId",a.created_at::text "createdAt" from coordinator_audit a where ${eligible} and ($1::bigint is null or a.id<$1) order by a.id desc limit 51`,
      [beforeId || null],
    );
    await audit(tx, actor, "staff.recovery.read", "history", "allowed", {
      count: Math.min(50, items.length),
    });
    return { items: items.slice(0, 50), nextId: items.length > 50 ? items[49].id : null };
  });
}
async function preview(tx: Sql, actor: string, auditId: number) {
  await authority(tx, actor, "staff_approvals.review");
  const [a] = await tx.query<Change>(
    `select a.id::integer,a.action,a.target_id,a.team_id,a.details from coordinator_audit a where a.id=$1 and ${eligible}`,
    [auditId],
  );
  if (!a) throw Error("This change is not available for recovery.");
  await teamScope(tx, a.team_id);
  let revision: number,
    current: Snapshot | string | string[],
    restore: Snapshot | string | string[] = a.details.before;
  if (a.action === "practices.save") {
    const [p] = await tx<{
      revision: number;
      title: string;
      date: string;
      time: string;
      end: string;
      location: string;
      status: string;
      kind: string;
      lane_ids: string[];
      paid: boolean;
    }>`select a.revision,a.payload->>'title' title,a.payload->>'date' date,a.payload->>'startTime' time,a.payload->>'endTime' "end",a.payload->>'location' location,a.payload->>'status' status,a.payload->>'kind' kind,coalesce((select array_agg(replace(r,'lane:','') order by r) from booking_records b cross join lateral jsonb_array_elements_text(b.resources) r where b.id=cp.booking_id and b.status='confirmed' and r like 'lane:%'),'{}') lane_ids,exists(select 1 from booking_records b where b.id=cp.booking_id and b.order_id is not null) paid from team_activities a left join coordinator_practice_bookings cp on cp.activity_id=a.id where a.id=${a.target_id} and a.team_id=${a.team_id} for share of a`;
    if (!p || p.paid || p.kind !== "practice" || p.status === "cancelled")
      throw new CoordinatorDenied();
    revision = p.revision;
    const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    current = {
      id: a.target_id,
      teamId: a.team_id,
      title: p.title,
      date: p.date,
      time: p.time,
      duration: minutes(p.end) - minutes(p.time),
      location: p.location,
      laneIds: p.lane_ids,
    };
    const after = {
      ...(a.details.after as Snapshot),
      laneIds: [...((a.details.after as Snapshot).laneIds as string[])].sort(),
    };
    if (hash(current) !== hash(after))
      throw Error("Practice has newer changes. Review its current schedule instead.");
    restore = practiceInput.omit({ revision: true }).parse(restore);
  } else {
    const [p] = await tx<{
      revision: number;
      player: Record<string, string | string[]>;
    }>`select c.rev revision,p player from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t cross join lateral jsonb_array_elements(t->'roster') p where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${a.team_id} and p->>'id'=${a.target_id} and coalesce(p->>'withdrawn','false')<>'true' for share of c`;
    if (!p) throw new CoordinatorDenied();
    revision = p.revision;
    if (a.action === "rosters.information") {
      current = Object.fromEntries(
        ["bats", "throws", "gradYear", "school"].map((k) => [k, p.player[k] || ""]),
      );
      restore = Object.fromEntries(
        ["bats", "throws", "gradYear", "school"].map((k) => [
          k,
          (a.details.before as Snapshot)[k] || "",
        ]),
      );
      rosterInformationInput.parse({
        teamId: a.team_id,
        playerId: a.target_id,
        revision,
        ...restore,
      });
    } else {
      const field = a.action === "rosters.number" ? "number" : "positions";
      current = p.player[field] || (field === "number" ? "" : []);
      rosterEditInput.parse({
        teamId: a.team_id,
        playerId: a.target_id,
        revision,
        field,
        value: restore,
      });
    }
    if (hash(current) !== hash(a.details.after))
      throw Error("Player has newer changes. Review the current roster instead.");
  }
  return {
    auditId,
    action: a.action,
    teamId: a.team_id,
    targetId: a.target_id,
    revision,
    current,
    restore,
    sourceDigest: hash({ a, revision, current, restore }),
  };
}
export async function recoveryPreview(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof recoveryPreviewInput>,
) {
  const v = recoveryPreviewInput.parse(raw);
  return secured(sql, actor, "staff.recovery.preview", async (tx) => {
    const p = await preview(tx, actor, v.auditId);
    await audit(tx, actor, "staff.recovery.preview", String(v.auditId), "allowed");
    return p;
  });
}
export async function applyRecovery(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof recoveryApplyInput>,
) {
  const v = recoveryApplyInput.parse(raw);
  return secured(
    sql,
    actor,
    "staff.recovery.apply",
    async (tx) => {
      await tx`select id from club_state where id='oklahoma-prospects' for update`;
      const p = await preview(tx, actor, v.auditId);
      if (v.revision !== p.revision || v.sourceDigest !== p.sourceDigest)
        throw Error("The recovery preview changed. Refresh and review again.");
      if (p.action === "practices.save")
        await savePracticeInTransaction(
          tx,
          actor,
          practiceInput.parse({ ...(p.restore as Snapshot), revision: p.revision }),
          true,
        );
      else {
        const changes =
          p.action === "rosters.information"
            ? (p.restore as Snapshot)
            : { [p.action === "rosters.number" ? "number" : "positions"]: p.restore };
        await savePlayerInTransaction(tx, actor, {
          teamId: p.teamId,
          playerId: p.targetId,
          revision: p.revision,
          changes,
        });
      }
      await tx`insert into coordinator_recoveries(audit_id,actor_id,source_digest,reason) values(${v.auditId},${actor},${v.sourceDigest},${v.reason})`;
      await audit(tx, actor, "staff.recovery.applied", p.targetId, "allowed", {
        sourceAuditId: v.auditId,
        reason: v.reason,
        fields: p.action,
      });
      return { ok: true };
    },
    lockFinancialExecution,
  );
}
