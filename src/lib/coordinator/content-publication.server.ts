import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import type { z } from "zod";
import {
  secured,
  authority,
  checkScope,
  financiallyRestricted,
  CoordinatorDenied,
  audit,
} from "./access.server";
import {
  publishDraftInput,
  unpublishPostInput,
  contentVersionsInput,
  draftCreatePermission,
} from "./content-contracts";
import type { Sport } from "./contracts";
export async function publishCoordinatorDraft(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof publishDraftInput>,
) {
  const v = publishDraftInput.parse(raw);
  return secured(sql, userId, "staff.content.publish", async (tx) => {
    await authority(tx, userId, "staff_approvals.review");
    const [approval] = await tx<{
      revision: number;
      status: string;
      requester_id: string;
      proposal: { revision: number };
    }>`select revision,status,requester_id,proposal from coordinator_approvals where kind='content' and target_id=${v.draftId} for update`;
    const [d] = await tx<{
      id: string;
      user_id: string;
      sport: Sport;
      team_id: string;
      title: string;
      body: string;
      content_kind: "announcement" | "recruiting" | "tryout" | "team";
      revision: number;
      status: string;
      after_reset: boolean;
    }>`select d.*,d.scoped_reset_at=coordinator_scoped_reset_at(d.user_id) after_reset from coordinator_drafts d where id=${v.draftId} for update`;
    if (!d || !approval || d.user_id === userId || approval.requester_id !== d.user_id)
      throw new CoordinatorDenied();
    if (
      d.revision !== v.revision ||
      approval.revision !== v.approvalRevision ||
      d.status !== "approved" ||
      approval.status !== "approved" ||
      approval.proposal.revision + 1 !== d.revision
    )
      throw Error("The approved content changed. Review the current exact version.");
    if ((await financiallyRestricted(tx, d.user_id)) && !d.after_reset)
      throw new CoordinatorDenied();
    await checkScope(tx, d.user_id, "content.submit", d.sport, d.team_id);
    if (d.content_kind !== "announcement")
      await checkScope(tx, d.user_id, draftCreatePermission(d.content_kind), d.sport, d.team_id);
    const [prior] = await tx<{
      id: string;
      visible: boolean;
    }>`select id,visible from coordinator_public_posts where draft_id=${d.id} and source_revision=${d.revision}`;
    if (prior) {
      if (!prior.visible)
        throw Error("This publication was withdrawn. Submit a new review before publishing again.");
      return { ok: true, id: prior.id };
    }
    // General program announcements are plain text only. Minor identities/photos use their separate consent-controlled workflows.
    const id = randomUUID();
    await tx`insert into coordinator_public_posts(id,draft_id,source_revision,sport,team_id,title,body,content_kind,published_by) values(${id},${d.id},${d.revision},${d.sport},${d.team_id},${d.title},${d.body},${d.content_kind},${userId})`;
    await audit(
      tx,
      userId,
      "staff.content.publish",
      id,
      "allowed",
      {
        draftId: d.id,
        sourceRevision: d.revision,
        approvalRevision: approval.revision,
        reason: v.reason,
        generalProgramContentOnly: true,
      },
      d.sport,
      d.team_id,
    );
    return { ok: true, id };
  });
}
export async function withdrawCoordinatorPost(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof unpublishPostInput>,
) {
  const v = unpublishPostInput.parse(raw);
  return secured(sql, userId, "staff.content.withdraw", async (tx) => {
    await authority(tx, userId, "staff_approvals.review");
    const [p] = await tx<{
      sport: Sport;
      team_id: string;
    }>`update coordinator_public_posts set visible=false,revision=revision+1 where id=${v.id} and revision=${v.revision} and visible returning sport,team_id`;
    if (!p) throw Error("This publication changed. Refresh before withdrawing.");
    await audit(
      tx,
      userId,
      "staff.content.withdraw",
      v.id,
      "allowed",
      { reason: v.reason },
      p.sport,
      p.team_id,
    );
    return { ok: true };
  });
}
export async function ownerPublishedContent(sql: Sql, userId: string) {
  return secured(sql, userId, "staff.content.read", async (tx) => {
    await authority(tx, userId, "staff_approvals.review");
    return tx<{
      id: string;
      title: string;
      body: string;
      sport: Sport;
      team_id: string;
      visible: boolean;
      revision: number;
      published_at: string;
    }>`select id,title,body,sport,team_id,visible,revision,published_at::text from coordinator_public_posts order by published_at desc limit 200`;
  });
}
export async function publicProgramContent(sql: Sql, sport: Sport) {
  // No account-derived or draft fields. No HTML, image or contact payload is rendered.
  return sql<{
    id: string;
    title: string;
    body: string;
    kind: string;
    publishedAt: string;
  }>`select p.id,p.title,p.body,p.content_kind kind,p.published_at::text "publishedAt" from coordinator_public_posts p where p.sport=${sport} and p.visible and (p.team_id='' or exists(select 1 from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and t->>'id'=p.team_id and t->>'sport'=p.sport and coalesce(t->>'closed','false')<>'true')) order by p.published_at desc limit 50`;
}
export async function draftVersions(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof contentVersionsInput>,
) {
  const v = contentVersionsInput.parse(raw);
  return secured(sql, userId, "content.versions.read", async (tx) => {
    const [d] = await tx<{
      user_id: string;
      sport: Sport;
      team_id: string;
      after_reset: boolean;
    }>`select user_id,sport,team_id,scoped_reset_at=coordinator_scoped_reset_at(${userId}) after_reset from coordinator_drafts where id=${v.id}`;
    if (!d || d.user_id !== userId) throw new CoordinatorDenied();
    await checkScope(tx, userId, "content.read", d.sport, d.team_id);
    if ((await financiallyRestricted(tx, userId)) && !d.after_reset) throw new CoordinatorDenied();
    await audit(tx, userId, "content.versions.read", v.id, "allowed", {}, d.sport, d.team_id);
    return tx<{
      revision: number;
      title: string;
      body: string;
      content_kind: string;
      status: string;
      created_at: string;
    }>`select revision,title,body,content_kind,status,created_at::text from coordinator_draft_versions where draft_id=${v.id} order by revision desc limit 100`;
  });
}
