import type { Sql } from "./db";
import { requireUnrestrictedLegacyAccess } from "./coordinator/access.server";
import { deactivateAccountInput } from "./ops-contracts";

export async function deactivateAccountFor(sql: Sql, actor: string, raw: unknown) {
  const input = deactivateAccountInput.parse(raw);
  return sql.transaction(async (tx) => {
    // Retired organization access retains its isolation even for a still-granted owner.
    await tx`select user_id from organization_operational_access where user_id=${actor} for share`;
    await requireUnrestrictedLegacyAccess(tx, actor);
    const [me] =
      await tx`select u.id from "user" u join profiles p on p.user_id=u.id join owner_grants g on g.user_id=u.id and g.email=lower(trim(u.email)) where u.id=${actor} and u."disabledAt" is null and u."emailVerified"=true and p.role='admin' and g.revoked_at is null for share of u,p,g`;
    if (!me) throw new Error("Front office only.");
    if (input.userId === actor) throw new Error("You cannot deactivate your own account.");
    const [target] = await tx<{
      id: string;
      name: string;
      email: string;
      disabled_at: Date | null;
    }>`select id,name,email,"disabledAt" as disabled_at from "user" where id=${input.userId} for update`;
    if (!target) throw new Error("Account not found. Reload before continuing.");
    const [owner] =
      await tx`select email from owner_grants where email=lower(trim(${target.email})) and revoked_at is null for share`;
    if (owner) throw new Error("Owner accounts stay locked.");
    if (input.confirmedName !== target.name || input.confirmedEmail !== target.email)
      throw new Error("Account identity changed. Reload and confirm the exact name and email.");
    if (target.disabled_at) return { ok: true as const, alreadyInactive: true };
    await tx.query("select set_config('app.actor_id',$1,true)", [actor]);
    await tx`update "user" set "disabledAt"=now(),"updatedAt"=now() where id=${target.id}`;
    await tx`update club_staff set active=false where user_id=${target.id}`;
    await tx`delete from "session" where "userId"=${target.id}`;
    await tx`insert into audit_events(actor_id,action,target_table,target_id,before_state,after_state)
      values(${actor},'account.deactivate','user',${target.id},${JSON.stringify({ status: "active" })}::jsonb,${JSON.stringify({ status: "inactive", reason: input.reason, target: { id: target.id, name: target.name, email: target.email } })}::jsonb)`;
    return { ok: true as const, alreadyInactive: false };
  });
}
