import { noticeReleaseAllowed } from "../notifications/release-control.server";
import { createHash, randomUUID } from "node:crypto";
import type { z } from "zod";
import type { Sql } from "../db";
import type { ClubRecord } from "../teams/types";
import {
  secured,
  authority,
  audit,
  checkScope,
  teamScope,
  CoordinatorDenied,
  grants,
  permits,
} from "./access.server";
import {
  noticeProposalInput,
  noticeSendInput,
  noticeHistoryInput,
  noticeCancelInput,
  messageReviewListInput,
  messageReviewInput,
  noticePermission,
} from "./communication-contracts";
import type { Sport } from "./contracts";
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, value]) => [k, canonical(value)]),
        )
      : v;
const digest = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
type Proposal = z.infer<typeof noticeProposalInput>;
type Notice = {
  id: string;
  actor_id: string;
  sport: Sport;
  team_ids: string[];
  kind: Proposal["kind"];
  proposal: Proposal;
  preview_digest: string;
  recipients: Record<string, string[]>;
  status: string;
  revision: number;
  reviewer_id: string | null;
};
/** Uses verified existing relationships, never name matching or recipient addresses supplied by callers. */
async function prepare(tx: Sql, actor: string, v: Proposal) {
  const ids = [...new Set(v.teamIds)].sort();
  if (ids.length !== v.teamIds.length) throw Error("Choose each team once.");
  if (v.kind !== "program" && ids.length !== 1)
    throw Error("Multiple teams require program-wide owner review.");
  if (v.kind === "program") await checkScope(tx, actor, noticePermission(v.kind), v.sport, "");
  const teams = [];
  const recipients: Record<string, string[]> = {};
  const [record] = await tx<{
    payload: ClubRecord;
  }>`select payload from club_state where id='oklahoma-prospects' and not demo for share`;
  for (const id of ids) {
    const team = await teamScope(tx, id);
    if (team.sport !== v.sport) throw new CoordinatorDenied();
    await checkScope(tx, actor, noticePermission(v.kind), team.sport, id);
    const t = record?.payload.teams.find((t) => t.id === id);
    if (!t) throw new CoordinatorDenied();
    const roster = t.roster.filter((p) => !p.withdrawn),
      families = roster.map((p) => p.familyId).filter(Boolean),
      players = roster.map((p) => p.id);
    const emails = [
      t.coachEmail,
      ...t.staff.map((s) => s.email),
      ...roster.flatMap((p) => [p.email, ...p.parents.map((g) => g.email)]),
    ]
      .filter(Boolean)
      .map((e) => e.trim().toLowerCase());
    const rows = await tx<{
      id: string;
    }>`select distinct u.id from "user" u left join profiles p on p.user_id=u.id where u."emailVerified" and u."disabledAt" is null and not exists(select 1 from organization_operational_access o where o.user_id=u.id and o.financial_restricted) and (lower(trim(u.email))=any(${emails}::text[]) or exists(select 1 from person_player_links l where l.user_id=u.id and l.player_id=any(${players}::text[])) or exists(select 1 from club_households h where (h.id=any(${families}::text[]) or lower(trim(h.primary_email))=any(${emails}::text[])) and (exists(select 1 from person_guardian_links g where g.user_id=u.id and g.household_id=h.id) or (coalesce(p.role,'parent')<>'player' and exists(select 1 from household_members m where m.user_id=u.id and m.household_id=h.id)))) or exists(select 1 from owner_grants o where o.user_id=u.id and o.email=lower(trim(u.email)) and o.revoked_at is null)) order by u.id`;
    recipients[id] = rows.map((r) => r.id);
    teams.push({ id, name: team.name, recipientCount: rows.length });
  }
  let target: unknown = null;
  if (v.kind === "practice") {
    const [r] = await tx<{
      revision: number;
      title: string;
    }>`select revision,payload->>'title' title from team_activities where id::text=${v.targetId} and team_id=${ids[0]} and payload->>'kind'='practice' and payload->>'status'='scheduled' for share`;
    if (!r) throw new CoordinatorDenied();
    target = r;
  } else if (v.kind === "event") {
    const [r] = await tx<{
      revision: number;
      title: string;
    }>`select e.revision,e.name title from operational_event_records e join coordinator_event_scopes s on s.event_id=e.id where e.id=${v.targetId} and s.team_id=${ids[0]} and e.publication in ('open','closed') for share of e,s`;
    if (!r) throw new CoordinatorDenied();
    target = r;
  } else if (v.targetId) throw Error("This message type does not accept an event target.");
  return {
    teams,
    recipients,
    target,
    previewDigest: digest({ actor, proposal: v, recipients, target }),
  };
}
export async function previewTeamNotice(sql: Sql, actor: string, raw: Proposal) {
  const v = noticeProposalInput.parse(raw);
  return secured(sql, actor, "communications.preview", async (tx) => {
    const p = await prepare(tx, actor, v);
    await audit(
      tx,
      actor,
      "communications.preview",
      v.id,
      "allowed",
      { kind: v.kind, teamCount: p.teams.length },
      v.sport,
    );
    return {
      teams: p.teams,
      previewDigest: p.previewDigest,
      requiresApproval: v.kind === "program",
      channel: "Authenticated team conversations",
    };
  });
}
export async function queueTeamNotice(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof noticeSendInput>,
) {
  const input = noticeSendInput.parse(raw),
    v = noticeProposalInput.parse(
      Object.fromEntries(
        Object.entries(input).filter(([k]) => !["confirm", "previewDigest"].includes(k)),
      ),
    );
  return secured(sql, actor, "communications.queue", async (tx) => {
    const p = await prepare(tx, actor, v);
    if (p.previewDigest !== input.previewDigest)
      throw Error("Recipients or event changed. Preview again.");
    const [old] =
      await tx<Notice>`select * from coordinator_team_notices where id=${v.id} for update`;
    if (old) {
      if (old.actor_id !== actor || old.preview_digest !== p.previewDigest)
        throw new CoordinatorDenied();
      return { ok: true, status: old.status };
    }
    if (
      Date.parse(v.sendAt) < Date.now() - 60000 ||
      Date.parse(v.sendAt) > Date.now() + 90 * 86400000
    )
      throw Error("Schedule within the next 90 days.");
    if (
      Date.parse(v.sendAt) > Date.now() + 60000 &&
      v.kind !== "announcement" &&
      v.kind !== "program"
    )
      await checkScope(tx, actor, "communications.announcement.schedule", v.sport, v.teamIds[0]);
    const status = v.kind === "program" ? "pending-review" : "queued";
    await tx`insert into coordinator_team_notices(id,actor_id,sport,team_ids,kind,proposal,preview_digest,recipients,send_at,status) values(${v.id},${actor},${v.sport},${v.teamIds},${v.kind},${JSON.stringify(v)}::jsonb,${p.previewDigest},${JSON.stringify(p.recipients)}::jsonb,${v.sendAt}::timestamptz,${status})`;
    if (v.kind === "program")
      await tx`insert into coordinator_approvals(id,requester_id,sport,team_id,kind,target_id,proposal,reason) values(${v.id},${actor},${v.sport},'','communication',${v.id},${JSON.stringify({ revision: 1, body: v.body, teamIds: v.teamIds, sendAt: v.sendAt, previewDigest: p.previewDigest })}::jsonb,${v.reason})`;
    await audit(
      tx,
      actor,
      "communications.queue",
      v.id,
      "allowed",
      { kind: v.kind, status, teamCount: v.teamIds.length },
      v.sport,
    );
    return { ok: true, status };
  });
}
export async function decideTeamNotice(
  tx: Sql,
  reviewer: string,
  actor: string,
  id: string,
  approved: boolean,
  proposal: unknown,
) {
  const [n] = await tx<Notice>`select * from coordinator_team_notices where id=${id} for update`;
  if (
    !n ||
    n.actor_id !== actor ||
    n.status !== "pending-review" ||
    n.kind !== "program" ||
    (proposal as { revision?: number })?.revision !== n.revision
  )
    throw Error("Message changed. Refresh the approval queue.");
  if (approved) {
    const p = await prepare(tx, actor, n.proposal);
    if (p.previewDigest !== n.preview_digest)
      throw Error("Recipients or event changed. Submit a new preview.");
  }
  await tx`update coordinator_team_notices set status=${approved ? "queued" : "cancelled"},reviewer_id=${reviewer},revision=revision+1 where id=${id}`;
}
/** Internal scheduled executor. No network operation; publishing and archive/audit commit together. */
export async function deliverTeamNotices(
  sql: Sql,
  onlyId?: string,
  immediate?: { actorId: string; previewDigest: string },
) {
  const due = await sql<{
    id: string;
    actor_id: string;
  }>`select id,actor_id from coordinator_team_notices where (exists(select 1 from notice_release_approvals a where a.queue='team' and a.source_id=id::text and a.approved) or (${Boolean(immediate && onlyId)} and actor_id=${immediate?.actorId || null} and preview_digest=${immediate?.previewDigest || null})) and status='queued' and send_at<=now() and (${onlyId || null}::uuid is null or id=${onlyId || null}::uuid) order by send_at,id limit 30`;
  let sent = 0,
    blocked = 0;
  for (const d of due) {
    try {
      const completed = await secured(sql, d.actor_id, "communications.dispatch", async (tx) => {
        const [n] =
          await tx<Notice>`select * from coordinator_team_notices where id=${d.id} and status='queued' and send_at<=now() for update skip locked`;
        if (!n) return false;
        const explicitlyConfirmed = Boolean(
          onlyId &&
          immediate &&
          n.id === onlyId &&
          n.actor_id === immediate.actorId &&
          n.kind === "team" &&
          n.preview_digest === immediate.previewDigest,
        );
        if (!explicitlyConfirmed && !(await noticeReleaseAllowed(tx, "team", n.id, {})))
          return false;
        const p = await prepare(tx, n.actor_id, n.proposal);
        if (p.previewDigest !== n.preview_digest)
          throw Error("Current recipients or event no longer match confirmation.");
        if (n.kind === "program") {
          if (!n.reviewer_id) throw new CoordinatorDenied();
          await authority(tx, n.reviewer_id, "staff_approvals.review");
          const [a] =
            await tx`select id from coordinator_approvals where id=${n.id} and kind='communication' and status='approved' and requester_id=${n.actor_id} and reviewer_id=${n.reviewer_id} for share`;
          if (!a) throw new CoordinatorDenied();
        }
        if (
          Date.parse(n.proposal.sendAt) >
            Date.parse(
              (
                await tx<{
                  created_at: string;
                }>`select created_at::text from coordinator_team_notices where id=${n.id}`
              )[0].created_at,
            ) +
              60000 &&
          !["program", "announcement"].includes(n.kind)
        )
          await checkScope(
            tx,
            n.actor_id,
            "communications.announcement.schedule",
            n.sport,
            n.team_ids[0],
          );
        const [user] = await tx<{ name: string }>`select name from "user" where id=${n.actor_id}`;
        for (const team of p.teams) {
          const id = randomUUID();
          await tx`insert into team_chat_messages(id,team_id,user_id,author,body) values(${id},${team.id},${n.actor_id},${user.name},${n.proposal.body})`;
          await tx`insert into coordinator_notice_messages(message_id,notice_id,recipient_ids,source_digest) select id,${n.id},${n.recipients[team.id]},coordinator_message_digest(m) from team_chat_messages m where id=${id}`;
        }
        await tx`update coordinator_team_notices set status='sent',revision=revision+1,sent_at=now() where id=${n.id}`;
        await audit(
          tx,
          n.actor_id,
          "communications.dispatch",
          n.id,
          "allowed",
          { teamCount: p.teams.length },
          n.sport,
        );
        return true;
      });
      if (completed) sent++;
    } catch {
      // Do not retry content against changed authority or recipients. Preserve the proposal for review.
      await sql.transaction(async (tx) => {
        const rows =
          await tx`update coordinator_team_notices set status='blocked',revision=revision+1 where id=${d.id} and status='queued' returning id`;
        if (rows.length) {
          await audit(tx, d.actor_id, "communications.dispatch.blocked", d.id, "denied", {});
          blocked++;
        }
      });
    }
  }
  return { sent, blocked };
}
export async function teamNoticeHistory(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof noticeHistoryInput>,
) {
  const v = noticeHistoryInput.parse(raw);
  return secured(sql, actor, "communications.archive.read", async (tx) => {
    const current = await grants(tx, actor, true);
    const canRead = permits(current, "communications.read", v.sport, v.teamId),
      canDelivery = permits(current, "communications.delivery.read", v.sport, v.teamId);
    if (!canRead && !canDelivery) throw new CoordinatorDenied();
    if ((await teamScope(tx, v.teamId)).sport !== v.sport) throw new CoordinatorDenied();
    const rows = await tx.query<{
      id: string;
      kind: string;
      body: string;
      status: string;
      revision: number;
      send_at: string;
      created_at: string;
    }>(
      `select id,kind,proposal->>'body' body,status,revision,send_at::text,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_at from coordinator_team_notices where actor_id=$1 and sport=$2 and $3=any(team_ids) and ($4::timestamptz is null or (created_at,id::text)<($4::timestamptz,$5::text)) order by created_at desc,id desc limit 101`,
      [actor, v.sport, v.teamId, v.before?.at || null, v.before?.id || ""],
    );
    const items = rows
      .slice(0, 100)
      .map((r) => ({ ...r, body: canRead ? r.body : null, status: canDelivery ? r.status : null }));
    const last = items.at(-1);
    await audit(
      tx,
      actor,
      "communications.archive.read",
      v.teamId,
      "allowed",
      { count: items.length },
      v.sport,
      v.teamId,
    );
    return {
      items,
      nextCursor: rows.length > 100 && last ? { at: last.created_at, id: last.id } : null,
    };
  });
}
export async function cancelTeamNotice(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof noticeCancelInput>,
) {
  const v = noticeCancelInput.parse(raw);
  return secured(sql, actor, "communications.cancel", async (tx) => {
    const [n] =
      await tx<Notice>`select * from coordinator_team_notices where id=${v.id} for update`;
    if (!n || n.actor_id !== actor) throw new CoordinatorDenied();
    for (const teamId of n.team_ids)
      await checkScope(tx, actor, noticePermission(n.kind), n.sport, teamId);
    if (n.revision !== v.revision || !["pending-review", "queued", "blocked"].includes(n.status))
      throw Error("Message already changed or dispatched. Refresh.");
    await tx`update coordinator_team_notices set status='cancelled',revision=revision+1 where id=${v.id}`;
    await audit(tx, actor, "communications.cancel", n.id, "allowed", { reason: v.reason }, n.sport);
    return { ok: true };
  });
}
export async function reviewableTeamMessages(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof messageReviewListInput>,
) {
  const v = messageReviewListInput.parse(raw);
  return secured(sql, actor, "staff.communications.review", async (tx) => {
    await authority(tx, actor, "staff_approvals.review");
    await teamScope(tx, v.teamId);
    const rows = await tx.query<{
      id: string;
      author: string;
      body: string;
      sourceDigest: string;
      operational: boolean;
      created_at: string;
    }>(
      `select m.id,m.author,m.body,coordinator_message_digest(m) "sourceDigest",coalesce(r.operational and r.source_digest=coordinator_message_digest(m),false) operational,to_char(m.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_at from team_chat_messages m left join coordinator_message_reviews r on r.message_id=m.id where m.team_id=$1 and ($2::timestamptz is null or (m.created_at,m.id::text)<($2::timestamptz,$3::text)) order by m.created_at desc,m.id desc limit 101`,
      [v.teamId, v.before?.at || null, v.before?.id || ""],
    );
    const items = rows.slice(0, 100),
      last = items.at(-1);
    await audit(tx, actor, "staff.communications.review", v.teamId, "allowed", {
      count: items.length,
    });
    return {
      items,
      nextCursor: rows.length > 100 && last ? { at: last.created_at, id: last.id } : null,
    };
  });
}
export async function reviewTeamMessage(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof messageReviewInput>,
) {
  const v = messageReviewInput.parse(raw);
  return secured(sql, actor, "staff.communications.classify", async (tx) => {
    await authority(tx, actor, "staff_approvals.review");
    const [m] = await tx<{
      team_id: string;
      digest: string;
    }>`select team_id,coordinator_message_digest(m) digest from team_chat_messages m where id=${v.id} for update`;
    if (!m || m.digest !== v.sourceDigest) throw Error("Message changed. Review the current text.");
    const team = await teamScope(tx, m.team_id);
    await tx`insert into coordinator_message_reviews(message_id,source_digest,operational,reviewer_id) values(${v.id},${m.digest},${v.operational},${actor}) on conflict(message_id) do update set source_digest=excluded.source_digest,operational=excluded.operational,reviewer_id=excluded.reviewer_id,reviewed_at=now()`;
    await audit(
      tx,
      actor,
      "staff.communications.classify",
      v.id,
      "allowed",
      { sourceDigest: m.digest, operational: v.operational, reason: v.reason },
      team.sport,
      team.id,
    );
    return { ok: true };
  });
}

export async function sendImmediateTeamMessage(
  sql: Sql,
  actor: string,
  input: { id: string; teamId: string; confirmedTeamId: string; body: string },
) {
  if (input.teamId !== input.confirmedTeamId) throw new CoordinatorDenied();
  const proposal = await secured(sql, actor, "communications.team.send", async (tx) => {
    const team = await teamScope(tx, input.teamId);
    await checkScope(tx, actor, "communications.team.send", team.sport, team.id);
    const [prior] = await tx<Notice>`select * from coordinator_team_notices where id=${input.id}`;
    if (prior) {
      if (
        prior.actor_id !== actor ||
        prior.kind !== "team" ||
        prior.proposal.reason !== "Sender confirmed the team conversation recipients" ||
        prior.proposal.body !== input.body ||
        prior.team_ids.length !== 1 ||
        prior.team_ids[0] !== team.id
      )
        throw new CoordinatorDenied();
      return prior.proposal;
    }
    return {
      id: input.id,
      sport: team.sport,
      teamIds: [team.id],
      kind: "team" as const,
      targetId: "",
      body: input.body,
      sendAt: new Date().toISOString(),
      reason: "Sender confirmed the team conversation recipients",
    };
  });
  const preview = await previewTeamNotice(sql, actor, proposal);
  await queueTeamNotice(sql, actor, {
    ...proposal,
    previewDigest: preview.previewDigest,
    confirm: true,
  });
  await deliverTeamNotices(sql, input.id, { actorId: actor, previewDigest: preview.previewDigest });
  const [n] = await sql<{
    status: string;
  }>`select status from coordinator_team_notices where id=${input.id}`;
  if (n.status !== "sent")
    throw Error("Message was not posted. Review its current delivery status.");
  return { ok: true };
}
export async function noticeTargets(
  sql: Sql,
  actor: string,
  raw: { teamId: string; kind: "practice" | "event" },
) {
  return secured(sql, actor, "communications.targets", async (tx) => {
    const team = await teamScope(tx, raw.teamId);
    await checkScope(tx, actor, noticePermission(raw.kind), team.sport, team.id);
    return raw.kind === "practice"
      ? tx<{
          id: string;
          title: string;
        }>`select id::text,payload->>'title' title from team_activities where team_id=${team.id} and payload->>'kind'='practice' and payload->>'status'='scheduled' order by payload->>'date' desc limit 200`
      : tx<{
          id: string;
          title: string;
        }>`select e.id,e.name title from operational_event_records e join coordinator_event_scopes s on s.event_id=e.id where s.team_id=${team.id} and e.publication in ('open','closed') order by e.updated_at desc limit 200`;
  });
}

export async function ownerCommunicationArchive(
  sql: Sql,
  actor: string,
  input: { beforeId?: number },
) {
  return secured(sql, actor, "staff.communications.archive", async (tx) => {
    await authority(tx, actor, "staff_approvals.review");
    const rows = await tx<{
      id: number;
      source: string;
      source_id: string;
      actor_id: string;
      sport: Sport;
      team_ids: string[];
      body: string;
      subject: string;
      recipients: Record<string, string | string[]>;
      status: string;
      recorded_at: string;
    }>`select id::int,source,source_id,actor_id,sport,team_ids,body,subject,recipients,status,recorded_at::text from coordinator_communication_versions where (${input.beforeId || null}::bigint is null or id<${input.beforeId || null}::bigint) order by id desc limit 101`;
    const items = rows.slice(0, 100);
    await audit(tx, actor, "staff.communications.archive", "communications", "allowed", {
      count: items.length,
    });
    return { items, nextId: rows.length > 100 ? items.at(-1)!.id : null };
  });
}
