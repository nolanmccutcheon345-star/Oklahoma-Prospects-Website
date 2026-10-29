import {
  noticeReleaseAllowed,
  releaseUnsubmittedNoticeClaim,
} from "../notifications/release-control.server";
import { feeEmailReadiness } from "./launch-readiness";
import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db";
import {
  loadFinancialContextInTransaction,
  withFinancialContext,
  lockFinancialExecution,
  isFinancialGuardian,
} from "../finance/context.server";
import { invitationIssuerAuthorized } from "../invitation-delivery.server";
import { authEmailAllowed } from "../auth/email.server";
import { independentAcceptancePreview } from "./independent-prospects.server";
import { playerView } from "./fee.server";
import { organizationDay } from "./fee-model";
import { isIndependent } from "./independent-model";
import type { ClubRecord } from "./types";

type Env = Record<string, string | undefined>;
type Filter = { teamId?: string; playerId?: string; familyId?: string; recipient?: string };
type Snapshot = {
  teamId: string;
  playerId: string;
  season: string;
  seasonKey: string;
  recipient: string;
  player: string;
  team: string;
  publication: number;
  rows: { amount: number; due: string; label: string }[];
  policy: string;
};
type Candidate = { id: string; snapshot: Snapshot };
type Body = { from: string; to: string[]; subject: string; text: string };
type Delivery = {
  id: string;
  requested_by: string;
  snapshot: Snapshot;
  status: string;
  attempts: number;
  first_attempt_at: Date | null;
  request_body: Body | null;
  provider_message_id: string | null;
  delivery_event: string | null;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);

/** Internal event adapter. Call after the event commits its data, inside its transaction.
 * Reads only published offers; never substitutes an operational roster for a frozen financial identity. */
async function candidates(tx: Sql, actor: string, filter: Filter = {}): Promise<Candidate[]> {
  const c = await loadFinancialContextInTransaction(tx, actor);
  const [live] = await tx<{
    payload: ClubRecord;
  }>`select payload from club_state where id='oklahoma-prospects' and not demo`;
  if (!live) return [];
  const result: Candidate[] = [];
  for (const t of c.club.teams) {
    if (filter.teamId && t.id !== filter.teamId) continue;
    const operational = live.payload.teams.find((v) => v.id === t.id && !v.closed);
    const plan = c.feePlans.find((v) => v.team_id === t.id)?.payload;
    if (
      !operational ||
      !plan?.published ||
      plan.independentCancellation ||
      plan.status === "closed"
    )
      continue;
    for (const p of t.roster) {
      if (
        (filter.playerId && p.id !== filter.playerId) ||
        (filter.familyId && p.familyId !== filter.familyId)
      )
        continue;
      if (
        p.withdrawn ||
        !operational.roster.some((v) => v.id === p.id && !v.withdrawn && v.familyId === p.familyId)
      )
        continue;
      const record = plan.players[p.id];
      if (
        record?.status === "Removed" ||
        record?.independent?.cancellation ||
        (p.feeLock && !record?.independent?.offer)
      )
        continue;
      const independent = isIndependent(plan.publishedBudget || {});
      const offer = independent
        ? independentAcceptancePreview(plan, p, organizationDay(new Date().toISOString()))
        : null;
      const ordinary = independent ? null : playerView(t, p, plan);
      const rows = (offer?.rows || ordinary?.rows || []).map((r, i) => ({
        amount: r.amount,
        due: r.due,
        label: i === 0 ? "Initial deposit" : r.label,
      }));
      if (!rows.length) continue;
      const invites = await tx<{
        email: string;
        team_id: string | null;
        role: string;
        family_id: string;
        invited_by: string;
        accepted_by: string | null;
        status: string;
      }>`select distinct email,team_id,role,family_id,invited_by,accepted_by,status from club_invites where family_id=${p.familyId} and role='parent' and ((status='pending' and expires_at>now() and (team_id is null or team_id='' or team_id=${t.id})) or status='accepted')`;
      const emails = new Set<string>();
      for (const invite of invites) {
        const email = invite.email.trim().toLowerCase();
        if ((filter.recipient && email !== filter.recipient) || emails.has(email)) continue;
        if (invite.status === "pending" && !(await invitationIssuerAuthorized(tx, invite)))
          continue;
        const [account] = await tx<{
          id: string;
          disabled: boolean;
          role: string;
          restricted: boolean;
        }>`select u.id,u."disabledAt" is not null as disabled,p.role,exists(select 1 from organization_operational_access a where a.user_id=u.id and a.financial_restricted) as restricted from "user" u left join profiles p on p.user_id=u.id where lower(trim(u.email))=${email}`;
        if (account?.disabled || account?.restricted || account?.role === "player") continue;
        if (invite.status === "accepted") {
          if (!account || invite.accepted_by !== account.id) continue;
          const [member] =
            await tx`select user_id from household_members where household_id=${p.familyId} and user_id=${account.id} union select user_id from person_guardian_links where household_id=${p.familyId} and user_id=${account.id}`;
          if (!member) continue;
        }
        // Frozen financial access must already be explicitly admitted, even for a new invitation.
        if (c.basis) {
          if (!account) continue;
          let allowed = false;
          try {
            allowed = isFinancialGuardian(
              await loadFinancialContextInTransaction(tx, account.id),
              t.id,
              p.id,
            );
          } catch {
            /* Waiting for authorized admission. */
          }
          if (!allowed) continue;
        }
        if (record?.independent?.offer && account?.id !== record.independent.offer.payerUserId)
          continue;
        emails.add(email);
        const snapshot: Snapshot = {
          teamId: t.id,
          playerId: p.id,
          season: t.seasonLabel || "Current season",
          seasonKey:
            (record?.independent?.offer?.budget || plan.publishedBudget)?.independent?.seasonKey ||
            t.seasonLabel,
          recipient: email,
          player: p.name,
          team: t.name,
          publication: offer?.publicationRevision || plan.published.revision,
          rows,
          policy: offer?.policy || plan.published.policy,
        };
        // A draft save or unchanged republication cannot manufacture a new email.
        const id = createHash("sha256")
          .update(
            JSON.stringify({
              teamId: snapshot.teamId,
              playerId: snapshot.playerId,
              seasonKey: snapshot.seasonKey,
              recipient: snapshot.recipient,
              rows: snapshot.rows,
              policy: snapshot.policy,
            }),
          )
          .digest("hex");
        result.push({ id, snapshot });
      }
    }
  }
  return result;
}
export async function feeReadyCandidateIds(tx: Sql, actor: string, filter: Filter) {
  return (await candidates(tx, actor, filter)).map((c) => c.id);
}
export async function queueFeeReadyInTransaction(
  tx: Sql,
  actor: string,
  filter: Filter,
  unchanged: string[] = [],
) {
  const eligible = (await candidates(tx, actor, filter)).filter((c) => !unchanged.includes(c.id));
  let queued = 0;
  for (const item of eligible) {
    const s = item.snapshot;
    const added =
      await tx`insert into fee_ready_notifications(id,team_id,player_id,season_key,recipient,requested_by,snapshot) values(${item.id},${s.teamId},${s.playerId},${s.seasonKey},${s.recipient},${actor},${JSON.stringify(s)}::jsonb) on conflict do nothing returning id`;
    if (added.length) {
      queued++;
      await tx`insert into club_audit(user_id,action,detail) values(${actor},'fee-ready.queued',${item.id})`;
    }
  }
  return queued;
}
export function feeReadyBody(s: Snapshot, origin: string, from: string): Body {
  const link = new URL("/enrollment", origin);
  link.searchParams.set("teamId", s.teamId);
  link.searchParams.set("playerId", s.playerId);
  const schedule = s.rows.map((r) => `${r.label}: ${money(r.amount)} — due ${r.due}`).join("\n");
  return {
    from,
    to: [s.recipient],
    subject: `Prospects fees ready — ${s.player} · ${s.team}`,
    text: `${s.player} · ${s.team} · Season ${s.season}\n\nPayments to Prospects\n${schedule}\nBilling ends: ${s.rows.at(-1)?.due || "See agreement"}\n\nPublished agreement, coverage and processing terms:\n${s.policy}\n\nTeam-Managed Expenses\nIndependent team expenses are arranged by the coach/team and are separate from Prospects billing. Listing them does not authorize a charge against your Prospects payment method.\n\nComplete your player's enrollment:\n${link.href}\n\nSign in or create an account using ${s.recipient} and verify your email. If you have not accepted household access, open ${new URL("/invitations", origin).href} first. Then confirm your assigned player/team, complete and sign required enrollment documents, review and accept the player fee agreement, pay the initial deposit, and separately authorize monthly autopay with a primary and different backup card when collection is available.\n\nAccepting an invitation or agreement does not make a payment or activate autopay. Your secure account shows the current offer and next step. Already accepted agreements remain unchanged unless you review and accept an individual amendment.\n\nNeed help or received this unexpectedly? ${new URL("/contact", origin).href}`,
  };
}
function origin(env: Env) {
  const value =
    env.SQUARE_DEPLOY_CONTEXT === "production" && (!env.CONTEXT || env.CONTEXT === "production")
      ? "https://prospectssports.club"
      : env.DEPLOY_PRIME_URL || env.APP_BASE_URL;
  if (!value || new URL(value).protocol !== "https:") throw Error("Email origin unavailable.");
  return value;
}
async function stillEligible(tx: Sql, row: Delivery) {
  return (
    await candidates(tx, row.requested_by, {
      teamId: row.snapshot.teamId,
      playerId: row.snapshot.playerId,
      recipient: row.snapshot.recipient,
    })
  ).some((c) => c.id === row.id);
}
export async function deliverFeeReadyEmails(
  sql: Sql,
  env: Env,
  send: typeof fetch = fetch,
  onlyIds?: string[],
) {
  if (
    !env.RESEND_API_KEY ||
    !(env.RESEND_FROM_EMAIL || env.EMAIL_FROM) ||
    env.INVITATION_EMAIL_PAUSED === "true"
  )
    return { accepted: 0, failed: 0, skipped: true };
  const rows = await sql<{
    id: string;
  }>`select id from fee_ready_notifications where exists(select 1 from notice_release_approvals a where a.queue='fee' and a.source_id=id and a.approved) and (${onlyIds || null}::text[] is null or id=any(${onlyIds || null}::text[])) and ((status='queued' and next_attempt_at<=now()) or (status='processing' and lease_until<now())) order by requested_at limit 2`;
  let accepted = 0,
    failed = 0;
  for (const item of rows) {
    if (!(await noticeReleaseAllowed(sql, "fee", item.id, env))) continue;
    const lease = randomUUID();
    const claimed = await sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      const [r] =
        await tx<Delivery>`select * from fee_ready_notifications where id=${item.id} and ((status='queued' and next_attempt_at<=now()) or (status='processing' and lease_until<now())) for update skip locked`;
      if (!r) return null;
      let eligible = false;
      try {
        eligible = await stillEligible(tx, r);
      } catch {
        /* Revoked publisher/account cannot dispatch. */
      }
      if (!eligible) {
        await tx`update fee_ready_notifications set status='superseded',lease_token=null,lease_until=null where id=${r.id}`;
        return null;
      }
      if (!authEmailAllowed(r.snapshot.recipient, env)) return null;
      if (
        r.first_attempt_at &&
        (Date.now() - +new Date(r.first_attempt_at) > 23 * 3600000 || r.attempts >= 8)
      ) {
        await tx`update fee_ready_notifications set status='review',lease_token=null,lease_until=null where id=${r.id}`;
        return null;
      }
      const body =
        r.request_body ||
        feeReadyBody(r.snapshot, origin(env), (env.RESEND_FROM_EMAIL || env.EMAIL_FROM)!);
      await tx`update fee_ready_notifications set status='processing',lease_token=${lease},lease_until=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),request_body=${JSON.stringify(body)}::jsonb where id=${r.id}`;
      return { ...r, body };
    });
    if (!claimed) continue;
    const eligible = await sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      try {
        return await stillEligible(tx, claimed);
      } catch {
        return false;
      }
    });
    if (!eligible) {
      await sql`update fee_ready_notifications set status='superseded',lease_token=null,lease_until=null where id=${claimed.id} and lease_token=${lease}`;
      continue;
    }
    try {
      if (!(await noticeReleaseAllowed(sql, "fee", claimed.id, env, claimed.body))) {
        await releaseUnsubmittedNoticeClaim(sql, "fee", claimed.id, lease);
        continue;
      }
      const response = await send("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `fee-ready-${claimed.id}`,
        },
        body: JSON.stringify({
          from: claimed.body.from,
          to: claimed.body.to,
          subject: claimed.body.subject,
          text: claimed.body.text,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error("Provider did not accept notice.");
      const data = (await response.json()) as { id?: string };
      if (!data.id || typeof data.id !== "string") throw Error("Missing provider reference.");
      await sql`update fee_ready_notifications set status='accepted',provider_message_id=${data.id},accepted_at=now(),lease_token=null,lease_until=null where id=${claimed.id} and lease_token=${lease}`;
      accepted++;
    } catch {
      await sql`update fee_ready_notifications set status='queued',next_attempt_at=now()+least(3600,power(2,attempts)*60)::int*interval '1 second',lease_token=null,lease_until=null where id=${claimed.id} and lease_token=${lease}`;
      failed++;
    }
  }
  return { accepted, failed, skipped: false };
}
export async function feeNotificationWorkspace(sql: Sql, actor: string, env: Env) {
  return withFinancialContext(sql, actor, "owner", async (tx) => {
    const rows = await tx<{
      id: string;
      snapshot: Snapshot;
      status: string;
      attempts: number;
      delivery_event: string | null;
      requested_at: string;
    }>`select id,snapshot,status,attempts,delivery_event,requested_at::text from fee_ready_notifications order by requested_at desc limit 100`;
    const all = await candidates(tx, actor);
    const known = await tx<{ id: string }>`select id from fee_ready_notifications`;
    return {
      ...feeEmailReadiness(env),
      rows,
      preview: all
        .filter((c) => !known.some((k) => k.id === c.id))
        .map((c) => ({
          ...c,
          text: feeReadyBody(c.snapshot, "https://prospectssports.club", "").text,
        })),
    };
  });
}
export async function queueFeeCatchup(sql: Sql, actor: string, ids: string[]) {
  return withFinancialContext(sql, actor, "owner", async (tx) => {
    const current = await candidates(tx, actor);
    if (ids.some((id) => !current.some((c) => c.id === id)))
      throw Error("An offer or recipient changed. Refresh the preview before sending.");
    for (const c of current.filter((c) => ids.includes(c.id)))
      await queueFeeReadyInTransaction(tx, actor, {
        teamId: c.snapshot.teamId,
        playerId: c.snapshot.playerId,
        recipient: c.snapshot.recipient,
      });
    return { ok: true };
  });
}
export async function checkFeeDelivery(
  sql: Sql,
  actor: string,
  id: string,
  env: Env,
  send: typeof fetch = fetch,
) {
  const r = await withFinancialContext(
    sql,
    actor,
    "owner",
    async (tx) => (await tx<Delivery>`select * from fee_ready_notifications where id=${id}`)[0],
  );
  if (
    !r?.provider_message_id ||
    !env.RESEND_API_KEY ||
    !authEmailAllowed(r.snapshot.recipient, env)
  )
    return { delivery: r?.delivery_event || "not confirmed" };
  const response = await send(
    `https://api.resend.com/emails/${encodeURIComponent(r.provider_message_id)}`,
    {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw Error("Provider delivery status unavailable. Acceptance is not proof of delivery.");
  const data = (await response.json()) as { to?: string[]; last_event?: string };
  if (data.to?.length !== 1 || data.to[0].toLowerCase() !== r.snapshot.recipient)
    throw Error("Delivery recipient mismatch.");
  const event = [
    "sent",
    "delivered",
    "delivery_delayed",
    "bounced",
    "complained",
    "failed",
    "suppressed",
    "opened",
    "clicked",
  ].includes(data.last_event || "")
    ? data.last_event!
    : "unknown";
  return withFinancialContext(sql, actor, "owner", async (tx) => {
    await tx`update fee_ready_notifications set delivery_event=${event},delivery_checked_at=now() where id=${id} and provider_message_id=${r.provider_message_id}`;
    await tx`insert into club_audit(user_id,action,detail) values(${actor},'fee-ready.delivery-checked',${id})`;
    return { delivery: event };
  });
}
