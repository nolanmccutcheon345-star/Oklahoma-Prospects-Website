import { approveTryoutChange } from "./tryout-scheduling.server";
import { operationalEvent, allSessions } from "./organization-events.server";
import { cancelProgramEventInTransaction } from "./program-events.server";
import type { Sport } from "./contracts";
import { lockFinancialExecution } from "../finance/execution.server";
import { moveOwnerPlayerInTransaction } from "./organization.server";
import { syncPractice } from "./scheduling.server";
import type { Sql } from "../db";
import type { z } from "zod";
import { approvalInput, decisionInput, draftInput, scopeInput } from "./contracts";
import {
  secured,
  requireTeam,
  teamScope,
  checkScope,
  authority,
  audit,
  CoordinatorDenied,
  financiallyRestricted,
} from "./access.server";
export async function saveDraft(sql: Sql, userId: string, raw: z.infer<typeof draftInput>) {
  const input = draftInput.parse(raw);
  return secured(sql, userId, "content.save", async (tx) => {
    await checkScope(
      tx,
      userId,
      input.revision ? "content.update" : "content.draft",
      input.sport,
      input.teamId,
    );
    if (input.submit) await checkScope(tx, userId, "content.submit", input.sport, input.teamId);
    const restricted = await financiallyRestricted(tx, userId);
    const [old] = await tx<{
      revision: number;
      user_id: string;
      sport: string;
      team_id: string;
      status: string;
      after_reset: boolean;
    }>`select revision,user_id,sport,team_id,status,scoped_reset_at=coordinator_scoped_reset_at(${userId}) as after_reset from coordinator_drafts where id=${input.id} for update`;
    if ((old?.revision || 0) !== input.revision) throw new Error("Draft changed. Reload.");
    if (
      old &&
      (old.user_id !== userId ||
        old.sport !== input.sport ||
        old.team_id !== input.teamId ||
        old.status !== "draft" ||
        (restricted && !old.after_reset))
    )
      throw new CoordinatorDenied();
    const status = input.submit ? "submitted" : "draft";
    await tx`insert into coordinator_drafts(id,user_id,sport,team_id,title,body,status) values(${input.id},${userId},${input.sport},${input.teamId},${input.title},${input.body},${status}) on conflict(id) do update set title=excluded.title,body=excluded.body,status=excluded.status,revision=coordinator_drafts.revision+1,updated_at=now()`;
    if (restricted)
      await tx`update coordinator_drafts set content_classification='operational',classified_revision=revision,scoped_reset_at=coordinator_scoped_reset_at(${userId}) where id=${input.id}`;
    if (input.submit)
      await tx`insert into coordinator_approvals(id,requester_id,sport,team_id,kind,target_id,proposal,reason) values(${input.id},${userId},${input.sport},${input.teamId},'content',${input.id},${JSON.stringify({ revision: input.revision + 1 })}::jsonb,'Review announcement and publication permissions')`;
    await audit(
      tx,
      userId,
      input.submit ? "content.submit" : "content.draft",
      input.id,
      "allowed",
      { revision: input.revision + 1 },
      input.sport,
      input.teamId,
    );
    return { ok: true };
  });
}
export async function drafts(sql: Sql, userId: string, raw: z.infer<typeof scopeInput>) {
  const input = scopeInput.parse(raw);
  return secured(sql, userId, "content.list", async (tx) => {
    await checkScope(tx, userId, "content.draft", input.sport, input.teamId);
    const restricted = await financiallyRestricted(tx, userId);
    return tx<{
      id: string;
      title: string;
      body: string;
      status: string;
      revision: number;
    }>`select id,title,body,status,revision from coordinator_drafts where user_id=${userId} and sport=${input.sport} and team_id=${input.teamId} and (not ${restricted} or scoped_reset_at=coordinator_scoped_reset_at(${userId})) order by updated_at desc limit 100`;
  });
}
export async function requestApproval(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof approvalInput>,
) {
  const input = approvalInput.parse(raw);
  return secured(sql, userId, "approval.request", async (tx) => {
    const team = await requireTeam(
      tx,
      userId,
      input.kind === "transfer" ? "rosters.transfer.request" : "events.cancel.request",
      input.teamId,
    );
    let version = 0;
    let programSessions: { key: string; revision: number }[] | undefined;
    if (input.kind === "transfer") {
      if (input.destinationTeamId === team.id)
        throw new Error("Choose a different destination team.");
      const destination = await teamScope(tx, input.destinationTeamId);
      if (destination.sport !== team.sport) throw new CoordinatorDenied();
      await requireTeam(tx, userId, "rosters.transfer.request", destination.id);
      const [row] = await tx<{
        rev: number;
      }>`select c.rev from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t cross join lateral jsonb_array_elements(t->'roster') p where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${team.id} and p->>'id'=${input.targetId} and coalesce(p->>'withdrawn','false')<>'true'`;
      if (!row) throw new CoordinatorDenied();
      version = row.rev;
    } else {
      const [row] = await tx<{
        revision: number;
      }>`select revision from team_activities where id::text=${input.targetId} and team_id=${team.id} and payload->>'kind'='practice' and payload->>'status'='scheduled'`;
      if (row) version = row.revision;
      else {
        const [binding] =
          await tx`select s.event_id from coordinator_event_scopes s where s.event_id=${input.targetId} and s.team_id=${team.id}`;
        const event = binding ? await operationalEvent(tx, input.targetId) : null;
        if (!event || event.sport.toLowerCase() !== team.sport || event.publication === "archived")
          throw new CoordinatorDenied();
        version = event.revision;
        programSessions = (await allSessions(tx, event)).map((s) => ({
          key: s.sessionKey,
          revision: s.revision,
        }));
      }
    }
    await tx`insert into coordinator_approvals(id,requester_id,sport,team_id,kind,target_id,proposal,reason) values(${input.id},${userId},${team.sport},${team.id},${input.kind},${input.targetId},${JSON.stringify({ version, destinationTeamId: input.destinationTeamId, ...(programSessions ? { system: "program", sessions: programSessions } : {}) })}::jsonb,${input.reason})`;
    await audit(
      tx,
      userId,
      "approval.request",
      input.id,
      "allowed",
      { kind: input.kind },
      team.sport,
      team.id,
    );
    return { ok: true };
  });
}
export async function approvals(sql: Sql, userId: string) {
  return secured(sql, userId, "staff_approvals.review", async (tx) => {
    await authority(tx, userId, "staff_approvals.review");
    return tx<{
      id: string;
      requester_id: string;
      name: string;
      sport: string;
      team_id: string;
      kind: string;
      target_id: string;
      proposal: {
        system?: "program";
        sessions?: { key: string; revision: number }[];
        version?: number;
        revision?: number;
        destinationTeamId?: string;
        recovered?: boolean;
      };
      reason: string;
      status: string;
      revision: number;
      created_at: Date;
      title: string | null;
      body: string | null;
    }>`select a.id,a.requester_id,u.name,a.sport,a.team_id,a.kind,a.target_id,a.proposal,a.reason,a.status,a.revision,a.created_at,d.title,d.body from coordinator_approvals a join "user" u on u.id=a.requester_id left join coordinator_drafts d on d.id::text=a.target_id and a.kind='content' order by a.created_at desc limit 200`;
  });
}
export async function decideApproval(sql: Sql, userId: string, raw: z.infer<typeof decisionInput>) {
  const input = decisionInput.parse(raw);
  return secured(
    sql,
    userId,
    "approval.decide",
    async (tx) => {
      await authority(tx, userId, "staff_approvals.review");
      const [row] = await tx<{
        requester_id: string;
        kind: string;
        status: string;
        revision: number;
        sport: "baseball" | "softball";
        team_id: string;
        target_id: string;
        proposal: {
          system?: "program";
          sessions?: { key: string; revision: number }[];
          version?: number;
          revision?: number;
          destinationTeamId?: string;
          recovered?: boolean;
        };
      }>`select requester_id,kind,status,revision,sport,team_id,target_id,proposal from coordinator_approvals where id=${input.id} for update`;
      if (!row || row.requester_id === userId) throw new CoordinatorDenied();
      if (row.status !== "pending" || row.revision !== input.revision)
        throw new Error("This request has already changed. Reload.");
      if (input.decision === "approved") {
        if (row.kind === "tryout-change") {
          await approveTryoutChange(
            tx,
            userId,
            row.requester_id,
            row.team_id,
            row.target_id,
            row.proposal,
          );
        } else if (row.kind === "cancel-event") {
          await requireTeam(tx, row.requester_id, "events.cancel.request", row.team_id);
          if (row.proposal.system === "program") {
            await cancelProgramEventInTransaction(
              tx,
              userId,
              row.requester_id,
              row.target_id,
              row.team_id,
              row.proposal.version || 0,
              row.proposal.sessions || [],
            );
          } else {
            await tx`select id from club_state where id='oklahoma-prospects' for update`;
            const [event] = await tx<{
              revision: number;
              payload: { date: string; startTime: string; location: string };
            }>`select revision,payload from team_activities where id::text=${row.target_id} and team_id=${row.team_id} and payload->>'kind'='practice' for update`;
            if (!event || event.revision !== row.proposal.version)
              throw new Error("The event changed. Request a new review.");
            const [booking] = await tx<{
              booking_id: string;
              order_id: string | null;
            }>`select cp.booking_id,b.order_id from coordinator_practice_bookings cp join booking_records b on b.id=cp.booking_id where cp.activity_id::text=${row.target_id} for update of b`;
            if (booking?.order_id) throw new CoordinatorDenied();
            if (booking) {
              await tx`delete from booking_occupancy where booking_id=${booking.booking_id}`;
              await tx`update booking_records set status='cancelled' where id=${booking.booking_id}`;
            }
            await tx`update team_activities set payload=jsonb_set(payload,'{status}','"cancelled"'::jsonb),revision=revision+1,updated_by=${userId},updated_at=now() where id::text=${row.target_id}`;
            await syncPractice(tx, row.team_id, {
              id: row.target_id,
              date: event.payload.date,
              time: event.payload.startTime,
              where: event.payload.location,
              cageHours: 0,
              status: "cancelled",
            });
          }
        } else if (row.kind === "content") {
          const restricted = await financiallyRestricted(tx, row.requester_id);
          await checkScope(tx, row.requester_id, "content.submit", row.sport, row.team_id);
          const [d] = await tx<{
            revision: number;
            content_classification: string;
            classified_revision: number | null;
          }>`select revision,content_classification,classified_revision from coordinator_drafts where id::text=${row.target_id} and user_id=${row.requester_id} and sport=${row.sport} and team_id=${row.team_id} and status='submitted' and (not ${restricted} or scoped_reset_at=coordinator_scoped_reset_at(${row.requester_id})) for update`;
          if (!d || d.revision !== row.proposal.revision)
            throw new Error("The draft changed. Request a new review.");
          if (
            restricted &&
            (d.content_classification !== "operational" || d.classified_revision !== d.revision)
          )
            throw new CoordinatorDenied();
          // Approval is editorial review only. Publication remains in the owner-controlled website workflow.
        } else {
          await requireTeam(tx, row.requester_id, "rosters.transfer.request", row.team_id);
          await requireTeam(
            tx,
            row.requester_id,
            "rosters.transfer.request",
            row.proposal.destinationTeamId || "",
          );
          const [c] = await tx<{
            rev: number;
          }>`select rev from club_state where id='oklahoma-prospects' for update`;
          if (c?.rev !== row.proposal.version)
            throw new Error("Roster changed. Request a fresh transfer review.");
          await moveOwnerPlayerInTransaction(tx, userId, {
            revision: c.rev,
            teamId: row.team_id,
            playerId: row.target_id,
            destinationTeamId: row.proposal.destinationTeamId || "",
          });
        }
      }
      await tx`update coordinator_approvals set status=${input.decision},reviewer_id=${userId},decision_reason=${input.reason},decided_at=now(),revision=revision+1 where id=${input.id}`;
      if (row.kind === "content")
        // A status-only decision does not change the classified title/body. Preserve
        // its binding only when the previous binding was still valid.
        await tx`update coordinator_drafts set status=${input.decision},classified_revision=case when content_classification='operational' and classified_revision=revision then revision+1 else null end,revision=revision+1 where id::text=${row.target_id}`;
      await audit(
        tx,
        userId,
        "approval." + input.decision,
        input.id,
        "allowed",
        { kind: row.kind },
        row.sport,
        row.team_id,
      );
      return { ok: true };
    },
    lockFinancialExecution,
  );
}

export async function transferRecovery(sql: Sql, userId: string, approvalId: string) {
  return secured(sql, userId, "approval.transfer.recovery-preview", async (tx) => {
    await authority(tx, userId, "staff_approvals.review");
    const [a] = await tx<{
      revision: number;
      team_id: string;
      target_id: string;
      proposal: { destinationTeamId?: string; recovered?: boolean };
    }>`select revision,team_id,target_id,proposal from coordinator_approvals where id::text=${approvalId} and kind='transfer' and status='approved'`;
    if (!a || a.proposal.recovered) throw Error("This transfer is not available for recovery.");
    const [c] = await tx<{
      rev: number;
    }>`select rev from club_state where id='oklahoma-prospects' and not demo`;
    if (!c) throw new CoordinatorDenied();
    return {
      approvalId,
      approvalRevision: a.revision,
      rosterRevision: c.rev,
      playerId: a.target_id,
      fromTeamId: a.proposal.destinationTeamId || "",
      toTeamId: a.team_id,
    };
  });
}
export async function recoverTransfer(
  sql: Sql,
  userId: string,
  raw: import("zod").z.infer<typeof import("./contracts").transferRecoveryInput>,
) {
  const { transferRecoveryInput } = await import("./contracts");
  const v = transferRecoveryInput.parse(raw);
  return secured(
    sql,
    userId,
    "approval.transfer.recover",
    async (tx) => {
      await authority(tx, userId, "staff_approvals.review");
      const [a] = await tx<{
        revision: number;
        team_id: string;
        target_id: string;
        sport: Sport;
        proposal: { destinationTeamId?: string; recovered?: boolean };
      }>`select revision,team_id,target_id,sport,proposal from coordinator_approvals where id=${v.approvalId} and kind='transfer' and status='approved' for update`;
      if (!a || a.proposal.recovered || a.revision !== v.approvalRevision)
        throw Error("Transfer changed or was already recovered. Reload.");
      await moveOwnerPlayerInTransaction(tx, userId, {
        revision: v.rosterRevision,
        teamId: a.proposal.destinationTeamId || "",
        playerId: a.target_id,
        destinationTeamId: a.team_id,
      });
      await tx`update coordinator_approvals set proposal=proposal||'{"recovered":true}'::jsonb,revision=revision+1 where id=${v.approvalId}`;
      await audit(
        tx,
        userId,
        "approval.transfer.recovered",
        v.approvalId,
        "allowed",
        {
          playerId: a.target_id,
          fromTeamId: a.proposal.destinationTeamId,
          toTeamId: a.team_id,
          reason: v.reason,
        },
        a.sport,
        a.team_id,
      );
      return { ok: true };
    },
    lockFinancialExecution,
  );
}
