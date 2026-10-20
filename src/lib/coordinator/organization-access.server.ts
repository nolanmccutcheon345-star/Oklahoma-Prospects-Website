import type { Sql } from "../db";
import { withFinancialContext, type FinancialContext } from "../finance/context.server";
import { financialBasisDigest } from "../finance/basis.server";
import { audit } from "./access.server";
import {
  organizationAccessTarget,
  organizationAccessApply,
  organizationAccessScope,
  organizationAccessExclusions,
  type OrganizationAccessPreview,
} from "./organization-access-contracts";
import type { z } from "zod";
function releaseIdentity() {
  const release = process.env.APP_BUILD_SOURCE_COMMIT || "";
  return {
    release,
    clean: /^[a-f0-9]{40}$/.test(release) && process.env.APP_BUILD_SOURCE_DIRTY === "false",
  };
}
async function preview(
  tx: Sql,
  actorId: string,
  context: FinancialContext,
  userId: string,
): Promise<OrganizationAccessPreview> {
  if (actorId === userId) throw Error("Owners cannot change their own operational access.");
  await tx.query("lock table owner_grants in share mode");
  const [target] = await tx<{
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    disabledAt: Date | null;
  }>`select id,name,email,"emailVerified","disabledAt" from "user" where id=${userId} for share`;
  if (!target) throw Error("Choose an existing account.");
  const [profile] = await tx<{
    role: string;
  }>`select role from profiles where user_id=${userId} for share`;
  const owner =
    await tx`select email from owner_grants where user_id=${userId} or email=lower(trim(${target.email}))`;
  if (profile?.role === "admin" || owner.length)
    throw Error("Owner and administrator accounts are protected.");
  const [grant] = await tx<{
    revision: number;
    status: string;
  }>`select revision,status from organization_operational_access where user_id=${userId} for update`;
  const build = releaseIdentity(),
    blockers: string[] = [
      "Organization-wide access has been retired. Assign sport-scoped coordinator permissions in Roles & Permissions.",
    ];
  if (!target.emailVerified || target.disabledAt || !profile)
    blockers.push("The existing account must be verified, enabled and provisioned.");
  if (!build.clean) blockers.push("A clean, identified release is required.");
  if (context.mode !== "basis" || !context.basis || !context.version)
    blockers.push("Reviewed financial cutover must be active before expanding operational access.");
  const identity = {
    userId: target.id,
    name: target.name,
    email: target.email,
    revision: grant?.revision || 0,
    currentStatus: grant?.status || "not granted",
    release: build.release,
    basisVersion: context.version,
  };
  const reviewDigest = financialBasisDigest({
    actorId,
    ...identity,
    verified: target.emailVerified,
    disabledAt: target.disabledAt?.toISOString() || null,
    role: profile?.role || "",
    basisDigest: context.basis ? financialBasisDigest(context.basis) : "",
    scope: organizationAccessScope,
    exclusions: organizationAccessExclusions,
    blockers,
  });
  return {
    ...identity,
    reviewDigest,
    ready: !blockers.length,
    blockers,
    scope: organizationAccessScope,
    exclusions: organizationAccessExclusions,
  };
}
export async function previewOrganizationAccess(
  sql: Sql,
  actorId: string,
  raw: z.infer<typeof organizationAccessTarget>,
) {
  const input = organizationAccessTarget.parse(raw);
  return withFinancialContext(sql, actorId, "owner", (tx, context) =>
    preview(tx, actorId, context, input.userId),
  );
}
export async function applyOrganizationAccess(
  sql: Sql,
  actorId: string,
  raw: z.infer<typeof organizationAccessApply>,
) {
  const input = organizationAccessApply.parse(raw);
  return withFinancialContext(sql, actorId, "owner", async (tx, context) => {
    const current = await preview(tx, actorId, context, input.userId);
    if (!current.ready) throw Error(current.blockers.join(" "));
    if (
      current.reviewDigest !== input.reviewDigest ||
      current.release !== input.expectedRelease ||
      current.basisVersion !== input.expectedBasisVersion ||
      current.revision !== input.expectedRevision
    )
      throw Error("Account, release, financial basis or access changed. Review again.");
    const [saved] = await tx<{
      revision: number;
    }>`insert into organization_operational_access(user_id,status,financial_restricted,revision,updated_by) values(${input.userId},'active',true,1,${actorId}) on conflict(user_id) do update set status='active',revision=organization_operational_access.revision+1,updated_by=excluded.updated_by,updated_at=now() returning revision`;
    await audit(tx, actorId, "organization.access.grant", input.userId, "allowed", {
      reason: input.reason,
      reviewDigest: input.reviewDigest,
      release: current.release,
      basisVersion: current.basisVersion,
      scope: organizationAccessScope,
      exclusions: organizationAccessExclusions,
      previousRevision: current.revision,
      revision: saved.revision,
    });
    return { ok: true, userId: input.userId, revision: saved.revision };
  });
}
