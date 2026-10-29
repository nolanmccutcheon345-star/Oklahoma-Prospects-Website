import {
  noticeReleaseAllowed,
  releaseUnsubmittedNoticeClaim,
} from "./notifications/release-control.server";
import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { authEmailAllowed } from "./auth/email.server";
import { authorizedTeamInvitation } from "./teams/invitations.server";
type Env = Record<string, string | undefined>;
type Invite = {
  id: string;
  email: string;
  role: string;
  family_id: string | null;
  team_id: string | null;
  invited_by: string;
  expires_at: Date;
  status: string;
};
type Body = { from: string; to: string[]; subject: string; text: string };
async function currentOwner(tx: Sql, actor: string) {
  return (
    (
      await tx`select g.user_id from owner_grants g join "user" u on u.id=g.user_id and lower(trim(u.email))=g.email join profiles p on p.user_id=u.id
    where u.id=${actor} and u."emailVerified" and u."disabledAt" is null and p.role='admin' and g.revoked_at is null
    and not exists(select 1 from organization_operational_access a where a.user_id=u.id and a.financial_restricted)`
    ).length > 0
  );
}
export async function invitationIssuerAuthorized(
  tx: Sql,
  invite: Pick<Invite, "role" | "family_id" | "invited_by"> &
    Partial<Pick<Invite, "team_id" | "email">>,
) {
  if (invite.role.endsWith("_coordinator")) {
    try {
      await (
        await import("./coordinator/access.server")
      ).authority(tx, invite.invited_by, "staff_roles.manage");
      return true;
    } catch {
      return false;
    }
  }
  if (invite.team_id) return authorizedTeamInvitation(tx, invite.invited_by, invite);
  if (await currentOwner(tx, invite.invited_by)) return true;
  if (invite.role !== "parent" || !invite.family_id) return false;
  return (
    (
      await tx`select u.id from "user" u join profiles p on p.user_id=u.id join household_members m on m.user_id=u.id
    where u.id=${invite.invited_by} and u."emailVerified" and u."disabledAt" is null and p.role='parent' and m.household_id=${invite.family_id}
    and not exists(select 1 from organization_operational_access a where a.user_id=u.id and a.financial_restricted)`
    ).length > 0
  );
}
async function managedInvitation(tx: Sql, actor: string, id: string) {
  const [invite] = await tx<Invite>`select * from club_invites where id=${id} for update`;
  if (
    !invite ||
    !(await invitationIssuerAuthorized(tx, invite)) ||
    !(
      (await currentOwner(tx, actor)) ||
      actor === invite.invited_by ||
      (await authorizedTeamInvitation(tx, actor, invite))
    )
  )
    throw new Error("Invitation management is unavailable for this account.");
  return invite;
}
/** Explicit send action; creation alone never sends an invitation. */
export async function queueInvitationEmail(sql: Sql, actor: string, id: string) {
  return sql.transaction(async (tx) => {
    const invite = await managedInvitation(tx, actor, id);
    if (invite.status !== "pending" || +new Date(invite.expires_at) <= Date.now())
      throw new Error("This invitation is no longer pending. Create a new invitation if needed.");
    await tx`insert into invitation_delivery(invitation_id,requested_by) values(${id},${actor}) on conflict do nothing`;
    const [row] = await tx<{
      status: string;
    }>`select status from invitation_delivery where invitation_id=${id}`;
    return { status: row.status };
  });
}
export function invitationEmailBody(invite: Invite, env: Env): Body {
  const origin =
    env.SQUARE_DEPLOY_CONTEXT === "production" && (!env.CONTEXT || env.CONTEXT === "production")
      ? "https://prospectssports.club"
      : env.DEPLOY_PRIME_URL || env.APP_BASE_URL;
  if (!origin || new URL(origin).protocol !== "https:")
    throw new Error("Invitation origin unavailable.");
  return {
    from: (env.RESEND_FROM_EMAIL || env.EMAIL_FROM)!,
    to: [invite.email],
    subject: "Prospects Sports Academy — account invitation",
    text: `You have been invited to the Prospects Sports Academy ${invite.family_id ? "household guardian" : invite.role.replaceAll("_", " ")} workspace.\n\nSign in or create your account using this exact email address, verify your email, then open:\n${new URL("/invitations", origin).href}\n\nThis invitation expires ${new Date(invite.expires_at).toISOString()}. It does not accept a team fee, sign an agreement or make a payment. Any team offer must be reviewed separately in your family account.${invite.role === "parent" && invite.team_id ? `\n\nAfter accepting your invitation, open your Team Hub for announcements, schedules, attendance replies and family conversations with your coaches:\n${new URL("/team-hub", origin).href}\nUse the same verified email each time. Save this link on your phone. Team Hub access does not complete enrollment, accept fees or authorize payments.` : ""}\n\nIf this invitation was unexpected, contact the academy through ${new URL("/contact", origin).href}.`,
  };
}
export async function deliverInvitationEmails(
  sql: Sql,
  env: Env,
  send: typeof fetch = fetch,
  onlyId?: string,
) {
  if (
    !env.RESEND_API_KEY ||
    !(env.RESEND_FROM_EMAIL || env.EMAIL_FROM) ||
    env.INVITATION_EMAIL_PAUSED === "true"
  )
    return { accepted: 0, failed: 0, skipped: true };
  const candidates = await sql<{
    invitation_id: string;
  }>`select invitation_id from invitation_delivery where exists(select 1 from notice_release_approvals a where a.queue='invitation' and a.source_id=invitation_id and a.approved) and (${onlyId || null}::text is null or invitation_id=${onlyId || null}) and
    ((status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<now())) order by requested_at limit 2`;
  let accepted = 0,
    failed = 0;
  for (const candidate of candidates) {
    if (!(await noticeReleaseAllowed(sql, "invitation", candidate.invitation_id, env))) continue;
    const lease = randomUUID();
    const claimed = await sql.transaction(async (tx) => {
      const [row] = await tx<{
        first_attempt_at: Date | null;
        attempts: number;
        request_body: Body | null;
      }>`select * from invitation_delivery where invitation_id=${candidate.invitation_id}
        and ((status='pending' and next_attempt_at<=now()) or (status='processing' and lease_until<now())) for update skip locked`;
      if (!row) return null;
      const [invite] =
        await tx<Invite>`select * from club_invites where id=${candidate.invitation_id}`;
      if (
        !invite ||
        invite.status !== "pending" ||
        +new Date(invite.expires_at) <= Date.now() ||
        !(await invitationIssuerAuthorized(tx, invite))
      ) {
        await tx`update invitation_delivery set status='superseded',lease_token=null,lease_until=null where invitation_id=${candidate.invitation_id}`;
        return null;
      }
      if (!authEmailAllowed(invite.email, env)) return null;
      if (
        row.first_attempt_at &&
        (Date.now() - +new Date(row.first_attempt_at) > 23 * 3600000 || row.attempts >= 8)
      ) {
        await tx`update invitation_delivery set status='review',lease_token=null,lease_until=null where invitation_id=${invite.id}`;
        return null;
      }
      const body = row.request_body || invitationEmailBody(invite, env);
      await tx`update invitation_delivery set status='processing',lease_token=${lease},lease_until=now()+interval '2 minutes',attempts=attempts+1,
        first_attempt_at=coalesce(first_attempt_at,now()),request_body=${JSON.stringify(body)}::jsonb where invitation_id=${invite.id}`;
      return { invite, body };
    });
    if (!claimed) continue;
    // Recheck immediately before delivery; acceptance still requires current invitation authority.
    const [current] =
      await sql<Invite>`select * from club_invites where id=${claimed.invite.id} and status='pending' and expires_at>now()`;
    if (!current || !(await invitationIssuerAuthorized(sql, current))) {
      await sql`update invitation_delivery set status='superseded',lease_token=null,lease_until=null where invitation_id=${claimed.invite.id} and lease_token=${lease}`;
      continue;
    }
    try {
      if (!(await noticeReleaseAllowed(sql, "invitation", claimed.invite.id, env, claimed.body))) {
        await releaseUnsubmittedNoticeClaim(sql, "invitation", claimed.invite.id, lease);
        continue;
      }
      const response = await send("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `invitation-${claimed.invite.id}`,
        },
        body: JSON.stringify({
          from: claimed.body.from,
          to: claimed.body.to,
          subject: claimed.body.subject,
          text: claimed.body.text,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Provider did not accept invitation.");
      const result = (await response.json()) as { id?: string };
      if (!result.id || typeof result.id !== "string")
        throw new Error("Provider acceptance reference missing.");
      await sql`update invitation_delivery set status='accepted',provider_message_id=${result.id},accepted_at=now(),lease_token=null,lease_until=null where invitation_id=${claimed.invite.id} and lease_token=${lease}`;
      accepted++;
    } catch {
      await sql`update invitation_delivery set status='pending',next_attempt_at=now()+least(3600,power(2,attempts)*60)::int*interval '1 second',lease_token=null,lease_until=null where invitation_id=${claimed.invite.id} and lease_token=${lease}`;
      failed++;
    }
  }
  return { accepted, failed, skipped: false };
}
export async function invitationDeliveryStatus(
  sql: Sql,
  actor: string,
  id: string,
  env: Env,
  send: typeof fetch = fetch,
) {
  const result = await sql.transaction(async (tx) => {
    const invite = await managedInvitation(tx, actor, id);
    const [row] = await tx<{
      status: string;
      provider_message_id: string | null;
      delivery_event: string | null;
    }>`select status,provider_message_id,delivery_event from invitation_delivery where invitation_id=${id}`;
    return { invite, row };
  });
  let event = result.row?.delivery_event || "";
  if (
    result.row?.provider_message_id &&
    env.RESEND_API_KEY &&
    authEmailAllowed(result.invite.email, env)
  ) {
    const response = await send(
      `https://api.resend.com/emails/${encodeURIComponent(result.row.provider_message_id)}`,
      {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      throw new Error(
        "Provider delivery status unavailable; acceptance is not proof of inbox delivery.",
      );
    const message = (await response.json()) as { to?: string[]; last_event?: string };
    if (
      message.to?.length !== 1 ||
      message.to[0].toLowerCase() !== result.invite.email.toLowerCase()
    )
      throw new Error("Invitation receipt recipient mismatch.");
    const allowed = [
      "sent",
      "delivered",
      "delivery_delayed",
      "bounced",
      "complained",
      "failed",
      "suppressed",
      "opened",
      "clicked",
    ];
    event = allowed.includes(message.last_event || "") ? message.last_event! : "unknown";
    await sql`update invitation_delivery set delivery_event=${event},delivery_checked_at=now() where invitation_id=${id}`;
  }
  return {
    status: result.row?.status || "not requested",
    delivery: event || "not confirmed",
    invitation: result.invite.status,
  };
}
