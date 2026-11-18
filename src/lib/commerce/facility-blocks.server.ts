import type { Sql } from "../db";
import { secured, requireOrganizationOperations, audit } from "../coordinator/access.server";
import { lockFinancialExecution } from "../finance/execution.server";
import { validateWindow, chicagoInstant } from "../scheduling";
import { holdWindow } from "./store.server";
import {
  facilityBlockInput,
  cancelFacilityBlockInput,
  type FacilityBlockInput,
} from "./facility-block-contracts";
export async function facilityBlocks(sql: Sql, userId: string) {
  return secured(sql, userId, "facility.blocks.read", async (tx) => {
    await requireOrganizationOperations(tx, userId);
    const rows = await tx<{
      id: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      resources: string[];
      status: string;
    }>`select f.id,f.title,b.starts_at,b.ends_at,b.resources,b.status from facility_blocks f join booking_records b on b.id=f.booking_id where b.ends_at>now()-interval '7 days' order by b.starts_at limit 300`;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      startsAt: new Date(r.starts_at).toISOString(),
      endsAt: new Date(r.ends_at).toISOString(),
      laneIds: r.resources.map((x) => x.replace("lane:", "")),
      status: r.status,
    }));
  });
}
export async function createFacilityBlock(sql: Sql, userId: string, raw: FacilityBlockInput) {
  const v = facilityBlockInput.parse(raw);
  return secured(
    sql,
    userId,
    "facility.blocks.create",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      const resources = v.laneIds.map((id) => `lane:${id}`).sort();
      const start = chicagoInstant(v.date, v.time),
        end = new Date(+start + v.duration * 60000);
      const [old] = await tx<{
        title: string;
        starts_at: Date;
        ends_at: Date;
        resources: string[];
        status: string;
      }>`select f.title,b.starts_at,b.ends_at,b.resources,b.status from facility_blocks f join booking_records b on b.id=f.booking_id where f.id=${v.id} for update of f,b`;
      if (old) {
        if (
          old.title !== v.title ||
          +new Date(old.starts_at) !== +start ||
          +new Date(old.ends_at) !== +end ||
          JSON.stringify([...old.resources].sort()) !== JSON.stringify(resources) ||
          old.status !== "confirmed"
        )
          throw Error("This request has already been used. Reload the block list.");
        return { ok: true };
      }
      validateWindow(v.date, v.time, v.duration);
      const conflicts =
        await tx`select booking_id from booking_occupancy where resource_id=any(${resources}::text[]) and slot_at>=${start.toISOString()} and slot_at<${end.toISOString()} limit 1`;
      if (conflicts.length) throw Error("A selected space is already reserved. Nothing was saved.");
      const bookingId = await holdWindow(tx, {
        orderId: null,
        userId,
        athleteId: null,
        productId: "facility-block:" + v.id,
        start,
        end,
        resources,
      });
      await tx`update booking_records set status='confirmed' where id=${bookingId}`;
      await tx`insert into facility_blocks(id,booking_id,title,created_by) values(${v.id},${bookingId},${v.title},${userId})`;
      await audit(tx, userId, "facility.blocks.create", v.id, "allowed", {
        title: v.title,
        date: v.date,
        time: v.time,
        duration: v.duration,
        laneIds: v.laneIds,
      });
      return { ok: true };
    },
    lockFinancialExecution,
  );
}
export async function cancelFacilityBlock(sql: Sql, userId: string, raw: { id: string }) {
  const v = cancelFacilityBlockInput.parse(raw);
  return secured(
    sql,
    userId,
    "facility.blocks.cancel",
    async (tx) => {
      await requireOrganizationOperations(tx, userId);
      const [b] = await tx<{
        booking_id: string;
        order_id: string | null;
        status: string;
      }>`select f.booking_id,b.order_id,b.status from facility_blocks f join booking_records b on b.id=f.booking_id where f.id=${v.id} for update of f,b`;
      if (!b || b.order_id) throw Error("Choose a facility block, not a customer booking.");
      if (b.status === "cancelled") return { ok: true };
      if (b.status !== "confirmed") throw Error("This block changed. Reload before cancelling.");
      await tx`delete from booking_occupancy where booking_id=${b.booking_id}`;
      await tx`update booking_records set status='cancelled' where id=${b.booking_id}`;
      await tx`update facility_blocks set cancelled_by=${userId},cancelled_at=now() where id=${v.id}`;
      await audit(tx, userId, "facility.blocks.cancel", v.id, "allowed");
      return { ok: true };
    },
    lockFinancialExecution,
  );
}
