/** Reviewed operational communications. Never expose historical unclassified text. */
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { Sql } from "../db";
import { capabilities, draftInput, emailInput, scopeInput, type Sport } from "./contracts";
import {
  audit,
  CoordinatorDenied,
  requireOrganizationOperations,
  secured,
  teamScope,
} from "./access.server";

async function operate<T>(sql: Sql, userId: string, action: string, work: (tx: Sql) => Promise<T>) {
  return secured(sql, userId, action, async (tx) => {
    await requireOrganizationOperations(tx, userId);
    return work(tx);
  });
}
async function validateScope(tx: Sql, sport: Sport, teamId: string) {
  if (teamId && (await teamScope(tx, teamId)).sport !== sport) throw new CoordinatorDenied();
}

export async function sendOrganizationRecruitingEmail(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof emailInput>,
) {
  const input = emailInput.parse(raw);
  return operate(sql, userId, "organization.recruiting.send", async (tx) => {
    // Lock the exact registration while binding the confirmation to its current email.
    const [request] = await tx<{
      sport: Sport;
      team_id: string;
      email: string;
    }>`select lower(payload->>'sport') as sport,coalesce(payload->>'preferredTeamId','') as team_id,lower(trim(payload->>'email')) as email from club_requests where id=${input.requestId} and kind in ('tryout','team-inquiry') for update`;
    if (!request || !["baseball", "softball"].includes(request.sport))
      throw new CoordinatorDenied();
    await validateScope(tx, request.sport, request.team_id);
    if (!request.email || request.email !== input.confirmedEmail.trim().toLowerCase())
      throw new Error("The guardian recipient changed. Review it again.");
    const [allowed] = await tx<{
      allowed: boolean;
    }>`select coordinator_notice_allowed(${userId},${input.requestId},${request.email}) as allowed`;
    if (!allowed?.allowed) throw new CoordinatorDenied();
    const inserted =
      await tx`insert into tryout_center_notices(id,request_id,email,subject,body,dedupe_key,category,coordinator_actor_id) values(${input.id},${input.requestId},${request.email},${input.subject},${input.body},${"organization:" + input.id},'coordinator-recruiting',${userId}) on conflict(id) do nothing returning id`;
    if (!inserted.length) {
      // A retry is idempotent only for the same actor, recipient, registration AND content.
      const [existing] = await tx<{
        status: string;
      }>`select status from tryout_center_notices where id=${input.id} and request_id=${input.requestId} and email=${request.email} and subject=${input.subject} and body=${input.body} and dedupe_key=${"organization:" + input.id} and category='coordinator-recruiting' and coordinator_actor_id=${userId}`;
      if (!existing)
        throw new Error(
          "This message identifier was already used. Review and create a new message.",
        );
      return {
        ok: true,
        delivery:
          existing.status === "pending" || existing.status === "processing"
            ? "queued"
            : existing.status,
      };
    }
    await tx`insert into tryout_center_activity(id,request_id,actor_id,kind,subject,body) values(${randomUUID()},${input.requestId},${userId},'email',${input.subject},${input.body})`;
    await audit(
      tx,
      userId,
      "organization.recruiting.send",
      input.id,
      "allowed",
      {},
      request.sport,
      request.team_id,
    );
    return { ok: true, delivery: "queued" };
  });
}

export async function organizationDrafts(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof scopeInput>,
) {
  const input = scopeInput.parse(raw);
  return operate(sql, userId, "organization.content.list", async (tx) => {
    await validateScope(tx, input.sport, input.teamId);
    const items = await tx<{
      id: string;
      sport: Sport;
      teamId: string;
      title: string;
      body: string;
      status: "draft" | "submitted" | "approved" | "rejected";
      revision: number;
      updatedAt: string;
    }>`select id,sport,team_id as "teamId",title,body,status,revision,to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt" from coordinator_drafts where user_id=${userId} and sport=${input.sport} and team_id=${input.teamId} and content_classification='operational' and classified_revision=revision order by updated_at desc,id desc limit 100`;
    const [hidden] = await tx<{
      count: number;
    }>`select count(*)::int as count from coordinator_drafts where user_id=${userId} and sport=${input.sport} and team_id=${input.teamId} and (content_classification<>'operational' or classified_revision is distinct from revision)`;
    return { items, withheldCount: hidden.count };
  });
}

export async function saveOrganizationDraft(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof draftInput>,
) {
  const input = draftInput.parse(raw);
  return operate(sql, userId, "organization.content.save", async (tx) => {
    await validateScope(tx, input.sport, input.teamId);
    const [old] = await tx<{
      revision: number;
      user_id: string;
      sport: Sport;
      team_id: string;
      status: string;
      content_classification: string;
      classified_revision: number | null;
    }>`select revision,user_id,sport,team_id,status,content_classification,classified_revision from coordinator_drafts where id=${input.id} for update`;
    if (
      old &&
      (old.user_id !== userId ||
        old.sport !== input.sport ||
        old.team_id !== input.teamId ||
        old.status !== "draft" ||
        old.content_classification !== "operational" ||
        old.classified_revision !== old.revision)
    )
      throw new CoordinatorDenied();
    if ((old?.revision || 0) !== input.revision)
      throw new Error("Draft changed. Reload before saving.");
    const status = input.submit ? "submitted" : "draft";
    const revision = input.revision + 1;
    if (old) {
      await tx`update coordinator_drafts set title=${input.title},body=${input.body},status=${status},revision=${revision},classified_revision=${revision},updated_at=now() where id=${input.id}`;
    } else {
      await tx`insert into coordinator_drafts(id,user_id,sport,team_id,title,body,status,content_classification,classified_revision) values(${input.id},${userId},${input.sport},${input.teamId},${input.title},${input.body},${status},'operational',1)`;
    }
    if (input.submit)
      await tx`insert into coordinator_approvals(id,requester_id,sport,team_id,kind,target_id,proposal,reason) values(${input.id},${userId},${input.sport},${input.teamId},'content',${input.id},${JSON.stringify({ revision })}::jsonb,'Review operational announcement and publication permissions')`;
    await audit(
      tx,
      userId,
      input.submit ? "organization.content.submit" : "organization.content.save",
      input.id,
      "allowed",
      { revision },
      input.sport,
      input.teamId,
    );
    return { ok: true, id: input.id, revision, status };
  });
}

// Exact action names are allowlisted. Future audit fields/actions stay private by default.
const ownActions = [
  ...Object.keys(capabilities),
  "coordinator.entry",
  "coordinator.home",
  "rosters.edit",
  "content.save",
  "content.list",
  "approval.request",
  "protected.request-rejected",
  "account.sign-in",
  "organization.read",
  "organization.team.save",
  "organization.player.save",
  "organization.player.move",
  "organization.staff.save",
  "organization.registration.save",
  "organization.evaluation.save",
  "organization.evaluation.review",
  "organization.activity.save",
  "organization.facility.read",
  "organization.message.send",
  "organization.report.export",
  "organization.recruiting.send",
  "organization.content.list",
  "organization.content.save",
  "organization.content.submit",
  "organization.activity.read",
];
export async function organizationOwnActivity(sql: Sql, userId: string) {
  return operate(sql, userId, "organization.activity.read", async (tx) => {
    // No raw audit details, state snapshots, other actors, provider metadata, or content.
    return tx<{
      action: string;
      targetId: string;
      result: "allowed" | "denied" | "conflict";
      sport: string | null;
      teamId: string | null;
      createdAt: string;
    }>`select action,coalesce(target_id,'') as "targetId",result,sport,team_id as "teamId",to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt" from coordinator_audit where actor_id=${userId} and action=any(${ownActions}::text[]) order by id desc limit 100`;
  });
}
