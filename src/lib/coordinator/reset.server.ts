import type { z } from "zod";
import type { Sql } from "../db";
import { authority, audit, secured, CoordinatorDenied } from "./access.server";
import { resetCoordinatorInput } from "./reset-contracts";
/** Owner-reviewed withdrawal only. Never removes financial restrictions or activates a role. */
export async function resetCoordinatorAccess(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof resetCoordinatorInput>,
) {
  const input = resetCoordinatorInput.parse(raw);
  return secured(sql, actor, "staff.access-reset", async (tx) => {
    await authority(tx, actor, "staff_roles.manage");
    if (actor === input.userId) throw new CoordinatorDenied();
    const [target] = await tx`select id from "user" where id=${input.userId} for update`;
    if (!target) throw new CoordinatorDenied();
    const [owner] =
      await tx`select email from owner_grants where user_id=${input.userId} and revoked_at is null for share`;
    if (owner) throw new Error("Owner access cannot be reset through coordinator management.");
    const assignments = await tx<{
      sport: string;
      revision: number;
      permissions: string[];
      status: string;
      team_ids: string[];
    }>`select sport,revision,permissions,status,team_ids from coordinator_assignments where user_id=${input.userId} order by sport for update`;
    const [legacy] = await tx<{
      revision: number;
      status: string;
      financial_restricted: boolean;
    }>`select revision,status,financial_restricted from organization_operational_access where user_id=${input.userId} for update`;
    if (
      (legacy?.revision || 0) !== input.legacyRevision ||
      assignments.length !== input.assignments.length ||
      new Set(input.assignments.map((r) => r.sport)).size !== input.assignments.length ||
      assignments.some(
        (row) =>
          !input.assignments.some((r) => r.sport === row.sport && r.revision === row.revision),
      )
    )
      throw new Error("Access changed. Reload and review the current assignments.");
    if (!assignments.length && !legacy) throw new Error("There is no coordinator access to reset.");
    await tx`update coordinator_assignments set permissions='{}',team_ids='{}',coverage='teams',status='suspended',revision=revision+1,updated_by=${actor},updated_at=now() where user_id=${input.userId}`;
    await tx`update organization_operational_access set status='removed',revision=revision+1,updated_by=${actor},updated_at=now() where user_id=${input.userId}`;
    const notices =
      await tx`update tryout_center_notices set status='superseded',lease_token=null,lease_until=null where coordinator_actor_id=${input.userId} and status in ('pending','processing','review') returning id`;
    const approvals =
      await tx`update coordinator_approvals set status='rejected',revision=revision+1,reviewer_id=${actor},decision_reason=${input.reason},decided_at=now() where requester_id=${input.userId} and status='pending' returning id`;
    await audit(tx, actor, "staff.access-reset", input.userId, "allowed", {
      reason: input.reason,
      before: { assignments, legacy: legacy || null },
      cancelledNotices: notices.length,
      rejectedApprovals: approvals.length,
    });
    return { ok: true };
  });
}
