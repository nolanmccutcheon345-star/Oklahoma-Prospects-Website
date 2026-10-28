import type { Sql } from "./db";
import { newCoachId } from "./coach-id.server";
import {
  audit,
  financiallyRestricted,
  requireOrganizationOperations,
  secured,
  verifiedAccount,
} from "./coordinator/access.server";
import { financialSourceModeInTransaction, lockFinancialExecution } from "./finance/context.server";
import {
  operationalInstructionInput,
  type OperationalInstructionInput,
} from "./operational-instruction-contracts";

type Grant = {
  user_id: string;
  identity_email: string;
  coach_id: string;
  status: string;
  revision: number;
};
type Operation = "navigation" | "schedule" | "lesson-draft" | "attendance";
const operations = new Set<Operation>(["navigation", "schedule", "lesson-draft", "attendance"]);
async function target(tx: Sql, userId: string) {
  await tx`select user_id from profiles where user_id=${userId} for share`;
  const [user] = await tx<{
    id: string;
    email: string;
    verified: boolean;
    disabled: boolean;
    role: string;
  }>`select u.id,lower(trim(u.email)) as email,u."emailVerified" as verified,(u."disabledAt" is not null) as disabled,coalesce(p.role,'') as role from "user" u left join profiles p on p.user_id=u.id where u.id=${userId}`;
  if (!user) throw new Error("Choose an existing account.");
  const [owner] =
    await tx`select email from owner_grants where user_id=${userId} or email=${user.email}`;
  const [grant] =
    await tx<Grant>`select user_id,identity_email,coach_id,status,revision from operational_instruction_access where user_id=${userId}`;
  const [settings] = await tx<{
    coach_id: string;
  }>`select coach_id from operational_person_settings where user_id=${userId} for share`;
  const [file] = await tx<{
    coaches: { id: string; email: string; active?: boolean }[];
  }>`select coalesce(payload::jsonb->'coaches','[]'::jsonb) as coaches from pd_working_file where id='club' for share`;
  const coaches = (file?.coaches || []).filter((c) => c.email.trim().toLowerCase() === user.email);
  const coachId = settings?.coach_id || coaches[0]?.id || newCoachId(user.email);
  const identityRows = (file?.coaches || []).filter((c) => c.id === coachId);
  const conflictingSettings =
    await tx`select user_id from operational_person_settings where coach_id=${coachId} and user_id<>${userId}`;
  const blockers: string[] = [];
  if (
    identityRows.length > 1 ||
    identityRows.some((c) => c.email.trim().toLowerCase() !== user.email) ||
    conflictingSettings.length
  )
    blockers.push("Instructor identity belongs to another account or needs owner reconciliation.");
  if (!user.verified || user.disabled || !user.role)
    blockers.push("A verified, enabled and provisioned account is required.");
  if (owner || user.role === "admin")
    blockers.push("Owner and administrator accounts are protected.");
  if (user.role === "player")
    blockers.push("Player accounts require owner-managed instructor review.");
  if (await financiallyRestricted(tx, userId))
    blockers.push("Organization operations accounts use their existing organization workspace.");
  if (
    coaches.length > 1 ||
    (settings?.coach_id && coaches[0] && settings.coach_id !== coaches[0].id)
  )
    blockers.push("Instructor identity needs owner reconciliation.");
  if (grant && (grant.coach_id !== coachId || grant.identity_email !== user.email))
    blockers.push("Instructor identity changed and needs owner reconciliation.");
  return {
    user,
    grant,
    coachId,
    protectedAccount: Boolean(owner) || user.role === "admin",
    blockers,
    coachActive: !coaches.some((c) => c.active === false),
  };
}
/** Caller holds the execution gate before account/domain locks. This DTO contains
 * operational eligibility only, never financial context or a financial grant. */
export async function organizationInstructionState(tx: Sql, actorId: string, userId: string) {
  const current = await target(tx, userId);
  const blockers = [...current.blockers];
  if (actorId === userId) blockers.push("You cannot change your own instructor access.");
  const activeBasis = (await financialSourceModeInTransaction(tx)) === "basis";
  if (!activeBasis)
    blockers.push("Reviewed financial cutover must be active before instructor onboarding.");
  return {
    revision: current.grant?.revision || 0,
    active: current.grant?.status === "active",
    canManage: blockers.length === 0,
    canSuspend:
      Boolean(current.grant) && !current.protectedAccount && actorId !== userId && activeBasis,
    blockers,
  };
}
export async function saveOrganizationInstruction(
  sql: Sql,
  actorId: string,
  raw: OperationalInstructionInput,
) {
  const input = operationalInstructionInput.parse(raw);
  return secured(
    sql,
    actorId,
    "organization.instruction.save",
    async (tx) => {
      await requireOrganizationOperations(tx, actorId);
      await tx`lock table owner_grants,profiles,pd_working_file,operational_person_settings in share mode`;
      await tx`select id from "user" where id=${input.userId} for update`;
      await tx`select user_id from operational_instruction_access where user_id=${input.userId} for update`;
      const current = await organizationInstructionState(tx, actorId, input.userId);
      if (!current.canManage && (input.active || !current.canSuspend))
        throw new Error(current.blockers.join(" "));
      if (current.revision !== input.revision)
        throw new Error("Instructor access changed. Refresh before saving.");
      const { user, coachId } = await target(tx, input.userId);
      const status = input.active ? "active" : "suspended";
      // Suspension preserves the original binding even if current identity has
      // drifted. Never try to insert or reconcile a different identity to revoke.
      const [saved] =
        current.revision > 0
          ? await tx<{
              revision: number;
            }>`update operational_instruction_access set status=${status},revision=revision+1,updated_by=${actorId},updated_at=now() where user_id=${input.userId} returning revision`
          : await tx<{
              revision: number;
            }>`insert into operational_instruction_access(user_id,identity_email,coach_id,status,revision,updated_by) values(${input.userId},${user.email},${coachId},${status},1,${actorId}) returning revision`;
      await audit(tx, actorId, "organization.instruction.save", input.userId, "allowed", {
        revision: saved.revision,
        active: input.active,
        reason: input.reason,
      });
      return { ok: true, revision: saved.revision };
    },
    lockFinancialExecution,
  );
}
/** Explicit allow-list. Never use this helper for resolveIdentity, finance,
 * commerce fulfillment, assessment eligibility, recruiting or global PD scope.
 * Call inside a transaction, with the execution gate acquired first. */
export async function operationalInstructionFor(tx: Sql, userId: string, operation: Operation) {
  if (!operations.has(operation)) throw new Error("Unsupported instructor operation.");
  await lockFinancialExecution(tx);
  await verifiedAccount(tx, userId, true);
  const [grant] =
    await tx<Grant>`select user_id,identity_email,coach_id,status,revision from operational_instruction_access where user_id=${userId} for share`;
  if (!grant || grant.status !== "active") return null;
  if ((await financialSourceModeInTransaction(tx)) !== "basis") return null;
  const current = await target(tx, userId);
  if (current.blockers.length || !current.coachActive) return null;
  return { userId, coachId: grant.coach_id };
}
export async function hasOperationalInstruction(sql: Sql, userId: string) {
  return sql.transaction(async (tx) =>
    Boolean(await operationalInstructionFor(tx, userId, "navigation")),
  );
}
export async function operationalInstructionBookings(sql: Sql, userId: string) {
  return sql.transaction(async (tx) => {
    const grant = await operationalInstructionFor(tx, userId, "schedule");
    if (!grant) throw new Error("An active operational instructor assignment is required.");
    return tx<{
      id: string;
      athlete_name: string;
      service: string;
      starts_at: Date;
      ends_at: Date;
      status: string;
      recorded: boolean;
      has_draft: boolean;
    }>`select b.id,a.name as athlete_name,s.name as service,b.starts_at,b.ends_at,b.status,exists(select 1 from operational_lesson_completions c where c.booking_id=b.id) as recorded,exists(select 1 from guided_lesson_sessions g where g.booking_id=b.id and g.status<>'published') as has_draft from operational_booking_schedule b join club_athletes a on a.id=b.athlete_id join club_services s on s.id=b.product_id and s.kind='lesson' where b.coach_id=${grant.coachId} and b.status in ('confirmed','completed') order by b.starts_at desc,b.id limit 200`;
  });
}
/** Passive legacy-authority probe for choosing the existing workspace. It does
 * not claim owner grants, provision households or promote an operational grant. */
async function hasLegacyInstruction(tx: Sql, userId: string, email: string) {
  const [row] = await tx<{ allowed: boolean }>`select (
    exists(select 1 from profiles where user_id=${userId} and role='coach')
    or exists(select 1 from owner_grants where email=${email} and (user_id=${userId} or user_id is null) and revoked_at is null)
    or exists(select 1 from person_profiles where user_id=${userId} and instructor=true)
    or exists(select 1 from club_staff s join club_staff_services a on a.staff_id=s.id where s.active=true and (s.user_id=${userId} or (s.user_id='' and lower(trim(s.email))=${email})))
  ) as allowed`;
  return row.allowed;
}
export async function operationalInstructionEntry(sql: Sql, userId: string) {
  return sql.transaction(async (tx) => {
    const grant = await operationalInstructionFor(tx, userId, "navigation");
    const user = await verifiedAccount(tx, userId, true);
    return {
      operationalOnly: Boolean(grant) && !(await hasLegacyInstruction(tx, userId, user.email)),
    };
  });
}
export type OperationalLessonViewer = {
  userId: string;
  email: string;
  name: string;
  role: "operational-instructor";
  canInstruct: false;
};
/** Only the lesson entry uses this viewer. Its distinct role cannot satisfy any
 * existing financial, recruiting, or aggregate-PD instructor role check. */
export async function operationalLessonViewer(
  sql: Sql,
  userId: string,
): Promise<OperationalLessonViewer | null> {
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const user = await verifiedAccount(tx, userId, true);
    if (await hasLegacyInstruction(tx, userId, user.email)) return null;
    const grant = await operationalInstructionFor(tx, userId, "lesson-draft");
    if (!grant) throw new Error("Instructor access required.");
    return {
      userId,
      email: user.email,
      name: user.name,
      role: "operational-instructor",
      canInstruct: false,
    };
  });
}
