import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { audit, authority, secured, verifiedAccount, CoordinatorDenied } from "./access.server";
import { saveAssignmentInTransaction } from "./admin.server";
import { coordinatorInvitationInput } from "./invitation-contracts";
import type { z } from "zod";

export async function inviteCoordinator(
  sql: Sql,
  actor: string,
  raw: z.input<typeof coordinatorInvitationInput>,
) {
  const input = coordinatorInvitationInput.parse(raw);
  return secured(sql, actor, "staff.invitation.create", async (tx) => {
    const owner = await authority(tx, actor, "staff_roles.manage");
    if (owner.email === input.email) throw new CoordinatorDenied();
    const role = `${input.sport}_coordinator`;
    // Serialize replacement invitations for the exact recipient and sport.
    await tx.query("select pg_advisory_xact_lock(hashtext($1))", [
      `coordinator-invite:${input.email}:${role}`,
    ]);
    await tx`update club_invites set status='revoked' where lower(email)=${input.email} and role=${role} and status='pending'`;
    const id = randomUUID();
    const tokenHash = createHash("sha256").update(randomUUID()).digest("hex");
    await tx`insert into club_invites(id,token_hash,email,invited_by,role,expires_at) values(${id},${tokenHash},${input.email},${actor},${role},now()+interval '7 days')`;
    await audit(
      tx,
      actor,
      "staff.invitation.create",
      id,
      "allowed",
      { permissions: [], replacesPending: true },
      input.sport,
    );
    return { id, path: "/invitations" };
  });
}

export async function coordinatorInvitations(sql: Sql, actor: string) {
  return secured(sql, actor, "staff.invitation.list", async (tx) => {
    await authority(tx, actor, "staff_roles.manage");
    return tx<{
      id: string;
      email: string;
      role: string;
      expires_at: Date;
    }>`select id,email,role,expires_at from club_invites where role in ('baseball_coordinator','softball_coordinator') and status='pending' and expires_at>now() order by created_at desc limit 200`;
  });
}

export async function revokeCoordinatorInvitation(sql: Sql, actor: string, id: string) {
  return secured(sql, actor, "staff.invitation.revoke", async (tx) => {
    await authority(tx, actor, "staff_roles.manage");
    const rows =
      await tx`update club_invites set status='revoked' where id=${id} and role in ('baseball_coordinator','softball_coordinator') and status='pending' returning id`;
    if (!rows.length) throw new Error("This invitation is no longer pending. Refresh the list.");
    await audit(tx, actor, "staff.invitation.revoke", id, "allowed");
    return { ok: true };
  });
}

export async function acceptCoordinatorInvitation(sql: Sql, recipient: string, id: string) {
  return secured(sql, recipient, "staff.invitation.accept", async (tx) => {
    const user = await verifiedAccount(tx, recipient, true);
    const [invite] = await tx<{
      role: string;
      invited_by: string;
    }>`select role,invited_by from club_invites where id=${id} and lower(email)=${user.email} and role in ('baseball_coordinator','softball_coordinator') and status='pending' and expires_at>now() for update`;
    if (!invite) throw new Error("This invitation is unavailable. Use the invited verified email.");
    // Re-check the inviter's CURRENT dedicated authority, not their role at issue time.
    await authority(tx, invite.invited_by, "staff_roles.manage");
    const sport = invite.role === "baseball_coordinator" ? "baseball" : "softball";
    const [existing] =
      await tx`select user_id from coordinator_assignments where user_id=${recipient} and sport=${sport}`;
    if (existing)
      throw new Error("This role already exists. An owner must review it in Roles & Permissions.");
    // The shared assignment guard also blocks player accounts, legacy readers,
    // and independent roles that need explicit owner review. No base role changes.
    await saveAssignmentInTransaction(tx, invite.invited_by, {
      userId: recipient,
      sport,
      revision: 0,
      status: "active",
      coverage: "teams",
      teamIds: [],
      permissions: [],
      confirm: true,
      independentRolesReviewed: false,
    });
    await tx`update club_invites set status='accepted',accepted_by=${recipient} where id=${id}`;
    await audit(
      tx,
      recipient,
      "staff.invitation.accept",
      id,
      "allowed",
      { permissions: [] },
      sport,
    );
    return { ok: true };
  });
}
