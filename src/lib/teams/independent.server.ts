import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { Sql } from "../db";
import {
  withFinancialContext,
  isFinancialGuardian,
  loadFinancialContextInTransaction,
  type FinancialContext,
} from "../finance/context.server";
import type { ClubRecord, Team } from "./types";
import {
  independentActionSchema,
  independentCapabilities,
  independentLedger,
  independentSettingsSchema,
  entryCapability,
  type IndependentSettings,
  type IndependentCapability,
  type IndependentEntry,
  type LedgerRow,
  type CarryEntry,
} from "./independent-ledger";
import { defaultBudget, organizationDay } from "./fee-model";
import { independentAcceptancePreview } from "./independent-prospects.server";

type Space = { id: string; team_id: string; revision: number; payload: IndependentSettings };
type Grant = {
  user_id: string;
  capabilities: IndependentCapability[];
  granted_by: string;
  revoked_at: string | null;
};
const norm = (s: string) => s.trim().toLowerCase();
async function access(tx: Sql, context: FinancialContext, space: Space) {
  const [live] = await tx<{
    payload: ClubRecord;
  }>`select payload from club_state where id='oklahoma-prospects' for share`;
  const team = context.club.teams.find((t) => t.id === space.team_id);
  if (!team) throw Error("Team season not found.");
  const current = live?.payload.teams.find((t) => t.id === team.id);
  const me = context.principal;
  // The explicitly assigned head coach has financial authority. Assistant or
  // operational titles alone do not grant write or delegation capabilities.
  const coach = Boolean(current && norm(current.coachEmail) === me.currentEmail);
  const statusCoach =
    coach ||
    Boolean(current?.staff.some((s) => norm(s.email) === me.currentEmail && /coach/i.test(s.role)));
  const [grant] =
    await tx<Grant>`select user_id,capabilities,granted_by,revoked_at from independent_team_grants where season_id=${space.id} and user_id=${me.userId} and revoked_at is null`;
  const capabilities = coach ? [...independentCapabilities] : grant?.capabilities || [];
  const players =
    me.role === "player"
      ? []
      : team.roster.filter((p) => isFinancialGuardian(context, team.id, p.id));
  const full = me.owner || coach || capabilities.includes("view");
  if (!full && !players.length && !statusCoach)
    throw Error("Independent team financial access is unavailable.");
  const canGrant =
    coach ||
    (me.owner &&
      ["stevemccutcheon89@gmail.com", "nolanmccutcheon@icloud.com"].includes(me.currentEmail));
  return {
    team,
    full,
    players,
    capabilities,
    canGrant,
    statusCoach,
    coach,
    role: coach
      ? "assigned-coach"
      : grant
        ? "financial-manager"
        : me.owner
          ? "owner-read-only"
          : statusCoach
            ? "coach-status-only"
            : "billing-party",
  };
}
function requireCapability(
  a: Awaited<ReturnType<typeof access>>,
  capability: IndependentCapability,
) {
  if (!a.capabilities.includes(capability))
    throw Error(
      `Your team assignment does not grant ${capability} permission. Owner status grants read-only access to independent funds.`,
    );
}
async function spaceFor(tx: Sql, id: string) {
  const [space] =
    await tx<Space>`select id,team_id,revision,payload from independent_team_spaces where id=${id} for update`;
  if (!space) throw Error("Independent team season not found.");
  independentSettingsSchema.parse(space.payload);
  return space;
}
async function ledgerFor(tx: Sql, id: string) {
  return tx<LedgerRow>`select id,payload,actor_id,actor_role,created_at::text from independent_team_entries where season_id=${id} order by created_at,id`;
}
async function audit(
  tx: Sql,
  context: FinancialContext,
  seasonId: string,
  role: string,
  action: string,
  detail: unknown,
) {
  await tx`insert into independent_team_audit(season_id,actor_id,actor_role,action,detail) values(${seasonId},${context.principal.userId},${role},${action},${JSON.stringify(detail)}::jsonb)`;
}
async function assertPayer(tx: Sql, userId: string, team: Team, playerIds: string[]) {
  const payer = await loadFinancialContextInTransaction(tx, userId);
  if (
    payer.principal.role === "player" ||
    !playerIds.length ||
    playerIds.some((id) => !isFinancialGuardian(payer, team.id, id))
  )
    throw Error("The payer must be a verified billing party for every allocated player.");
}
async function payerOptions(tx: Sql, context: FinancialContext, team: Team) {
  const emails = team.roster.flatMap((p) => p.parents.map((g) => norm(g.email)));
  const homes = team.roster.map((p) => p.familyId);
  const captured = context.basis?.inputs.billing;
  const historical = captured
    ? [...captured.guardians, ...captured.members]
        .filter((r) => homes.includes(r.household_id))
        .map((r) => r.user_id)
    : [];
  const users = await tx<{
    id: string;
    name: string;
  }>`select distinct u.id,u.name from "user" u where u."emailVerified"=true and u."disabledAt" is null and (lower(u.email)=any(${emails}::text[]) or u.id=any(${historical}::text[]) or u.id in (select user_id from person_guardian_links where household_id=any(${homes}::text[])))`;
  const result: { id: string; name: string; playerIds: string[] }[] = [];
  for (const u of users) {
    // Restricted/disabled accounts are omitted, never promoted by an email match.
    try {
      const c = await loadFinancialContextInTransaction(tx, u.id);
      const playerIds =
        c.principal.role === "player"
          ? []
          : team.roster.filter((p) => isFinancialGuardian(c, team.id, p.id)).map((p) => p.id);
      if (playerIds.length) result.push({ ...u, playerIds });
    } catch {
      /* No financial eligibility. */
    }
  }
  return result;
}
function familyRows(rows: LedgerRow[], ownIds: Set<string>, userId: string) {
  const payments = new Set(
    rows
      .filter((r) => r.payload.kind === "payment" && r.payload.payerUserId === userId)
      .map((r) => r.id),
  );
  const obligations = new Set(
    rows
      .filter((r) => r.payload.kind === "obligation" && ownIds.has(r.payload.playerId))
      .map((r) => r.id),
  );
  const visible = new Set(
    rows
      .filter((r) => {
        const e = r.payload;
        return (
          payments.has(r.id) ||
          obligations.has(r.id) ||
          (e.kind === "allocation" &&
            payments.has(e.paymentId) &&
            obligations.has(e.obligationId)) ||
          ((e.kind === "refund" || e.kind === "plannedRefund") && payments.has(e.paymentId)) ||
          (e.kind === "credit" && obligations.has(e.targetId)) ||
          (e.kind === "reminder" && e.recipientId === userId && ownIds.has(e.playerId))
        );
      })
      .map((r) => r.id),
  );
  return rows
    .filter(
      (r) =>
        visible.has(r.id) ||
        ((r.payload.kind === "reversal" || r.payload.kind === "unallocate") &&
          visible.has(r.payload.targetId)),
    )
    .map((r) => ({ id: r.id, payload: r.payload, created_at: r.created_at }));
}

export async function independentWorkspace(sql: Sql, userId: string, teamId?: string) {
  return withFinancialContext(sql, userId, "read", (tx, context) =>
    independentWorkspaceInTransaction(tx, context, teamId),
  );
}
async function independentWorkspaceInTransaction(
  tx: Sql,
  context: FinancialContext,
  teamId?: string,
) {
  const userId = context.principal.userId;
  const spaces =
    await tx<Space>`select id,team_id,revision,payload from independent_team_spaces order by created_at desc`;
  const results = [];
  for (const space of spaces.filter((s) => !teamId || s.team_id === teamId)) {
    let a: Awaited<ReturnType<typeof access>>;
    try {
      a = await access(tx, context, space);
    } catch {
      continue;
    }
    const rows = await ledgerFor(tx, space.id),
      ledger = independentLedger(rows, space.payload);
    const ownIds = new Set(a.players.map((p) => p.id)),
      plan = context.feePlans.find((p) => p.team_id === space.team_id);
    const authorizations = await tx<{
      player_id: string;
      status: string;
      version: number;
    }>`select player_id,status,(terms->>'agreementVersion')::int as version from team_collection_authorizations where team_id=${space.team_id} and environment=${process.env.SQUARE_ENVIRONMENT === "sandbox" ? "sandbox" : "production"} and terms->>'fundingModel'='independent'`;
    const paymentStates = await tx<{
      player_id: string;
      pending: boolean;
      after_cutoff: boolean;
    }>`select o.snapshot->'teamFee'->>'playerId' as player_id,
      (o.status='payment_review' or exists(select 1 from square_payment_attempts a where a.order_id=o.id and a.status in ('pending','unknown'))) as pending,
      exists(select 1 from payment_notifications n where n.order_id=o.id and n.id='independent-cutoff:' || o.id) as after_cutoff
      from commerce_orders o where o.kind='team-fee' and o.snapshot->'teamFee'->>'teamId'=${space.team_id}
      and o.snapshot->'teamFee'->'independent'->>'seasonKey'=${space.id}
      and o.payment_environment=${process.env.SQUARE_ENVIRONMENT === "sandbox" ? "sandbox" : "production"}`;
    const prospects = a.team.roster
      .filter((p) => context.principal.owner || a.statusCoach || ownIds.has(p.id))
      .map((p) => {
        const record = plan?.payload.players[p.id],
          accepted = Boolean(record?.independent?.agreements.length);
        const received = Math.round(
          (p.payments.reduce((s, r) => s + r.amount, 0) +
            p.credits.reduce((s, r) => s + r.amount, 0)) *
            100,
        );
        let available = received;
        const rows = (record?.independent?.installments || []).map((r) => {
          const paid = Math.min(r.amount, Math.max(0, available));
          available -= paid;
          return { ...r, paid, outstanding: r.amount - paid };
        });
        return {
          id: p.id,
          name: p.name,
          accepted,
          pendingPayments: paymentStates.filter((r) => r.player_id === p.id && r.pending).length,
          paymentsAfterCutoff: paymentStates.filter((r) => r.player_id === p.id && r.after_cutoff)
            .length,
          acceptancePreview:
            ownIds.has(p.id) && plan
              ? independentAcceptancePreview(
                  { ...plan.payload, revision: plan.revision },
                  p,
                  organizationDay(new Date().toISOString()),
                )
              : null,
          authorizationStatus:
            authorizations.find(
              (a) => a.player_id === p.id && a.version === record?.independent?.version,
            )?.status || "missing authorization",
          canPay: ownIds.has(p.id),
          canAccept:
            ownIds.has(p.id) &&
            Boolean(plan?.payload.published) &&
            !plan?.payload.independentCancellation &&
            !record?.independent?.cancellation &&
            (!accepted || record?.independent?.offer?.payerUserId === userId),
          canAuthorize:
            ownIds.has(p.id) &&
            record?.independent?.payerUserId === userId &&
            !record?.independent?.cancellation,
          outstanding: Math.max(0, Math.round((p.feeLock?.amount || 0) * 100) - received),
          credit: Math.max(0, received - Math.round((p.feeLock?.amount || 0) * 100)),
          overdue: rows
            .filter((r) => r.due <= organizationDay(new Date().toISOString()))
            .reduce((s, r) => s + r.outstanding, 0),
          rows,
          cancellation: record?.independent?.cancellation || null,
          uniformCommitted: Boolean(record?.independent?.uniformCommitted),
          policy: record?.acceptedPolicy || plan?.payload.published?.policy || "",
          offer:
            ownIds.has(p.id) || context.principal.owner ? record?.independent?.offer || null : null,
          agreementVersion: record?.independent?.version || 0,
        };
      });
    const grants = a.canGrant
      ? await tx<
          Grant & { name: string }
        >`select g.user_id,g.capabilities,g.granted_by,g.revoked_at::text,u.name from independent_team_grants g join "user" u on u.id=g.user_id where season_id=${space.id} order by u.name`
      : [];
    const visibleRows = a.full ? rows : familyRows(rows, ownIds, userId);
    const otherPlayers = a.team.roster.filter((p) => !ownIds.has(p.id));
    const overdueOtherPlayers = new Set(
      ledger.obligations
        .filter(
          (o) =>
            !ownIds.has(o.playerId) &&
            o.due < organizationDay(new Date().toISOString()) &&
            o.outstanding > 0,
        )
        .map((o) => o.playerId),
    );
    const documents = await tx<{
      id: string;
      entry_id: string;
      filename: string;
      mime_type: string;
    }>`select id,entry_id,filename,mime_type from independent_team_documents where season_id=${space.id}`;
    const visibleDocumentIds = new Set(
      visibleRows
        .filter((r) => r.payload.kind === "payment" && r.payload.payerUserId === userId)
        .map((r) => r.id),
    );
    results.push({
      id: space.id,
      teamId: space.team_id,
      teamName: a.team.name,
      revision: space.revision,
      role: a.role,
      full: a.full,
      capabilities: a.capabilities,
      canGrant: a.canGrant,
      grants,
      settings: {
        ...space.payload,
        categories: a.full || space.payload.shared ? space.payload.categories : [],
      },
      roster: (a.full ? a.team.roster : a.players).map((p) => ({ id: p.id, name: p.name })),
      payers: a.full || context.principal.owner ? await payerOptions(tx, context, a.team) : [],
      entries: visibleRows,
      documents: documents.filter((d) => a.full || visibleDocumentIds.has(d.entry_id)),
      summary: a.full
        ? {
            funds: ledger.funds,
            committed: ledger.committed,
            available: ledger.available,
            spendable: ledger.spendable,
            outstanding: ledger.outstanding,
            unapplied: ledger.unapplied,
            received: ledger.received,
            spent: ledger.spent,
            refunded: ledger.refunded,
          }
        : null,
      categories: a.full
        ? ledger.categories
        : space.payload.shared
          ? ledger.categories.map(({ key, name, budget, spent, committed, budgetRemaining }) => ({
              key,
              name,
              budget,
              spent,
              committed,
              budgetRemaining,
            }))
          : [],
      teamPaymentRisk:
        !a.full &&
        ownIds.size > 0 &&
        otherPlayers.length >= 3 &&
        overdueOtherPlayers.size > 0 &&
        overdueOtherPlayers.size < otherPlayers.length,
      obligations: ledger.obligations.filter((o) => a.full || ownIds.has(o.playerId)),
      payments: ledger.payments.filter((p) => a.full || p.payerUserId === userId),
      plannedRefunds: ledger.plannedRefunds.filter(
        (r) =>
          a.full ||
          (r.payload.kind === "plannedRefund" &&
            ledger.payments
              .filter((p) => p.payerUserId === userId)
              .map((p) => p.id)
              .includes(r.payload.paymentId)),
      ),
      prospects,
      plan: context.principal.owner ? plan?.payload || null : null,
      published: plan?.payload.published || null,
      planRevision: plan?.revision || 0,
      basisVersion: context.version || undefined,
    });
  }
  const availableTeams = context.principal.owner
    ? context.club.teams
        .filter((t) => (!teamId || t.id === teamId) && !spaces.some((s) => s.team_id === t.id))
        .map((t) => {
          const p = context.feePlans.find((p) => p.team_id === t.id);
          return {
            id: t.id,
            name: t.name,
            canConfigure: !p?.payload.published && !t.roster.some((p) => p.feeLock),
            revision: p?.revision || 0,
            basisVersion: context.version || undefined,
            budget: p?.payload.budget || defaultBudget(),
            uniforms: p?.payload.uniforms || [],
            expenses: p?.payload.expenses || [],
          };
        })
    : [];
  return { spaces: results, availableTeams, admin: context.principal.owner };
}

export async function mutateIndependentTeam(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof independentActionSchema>,
) {
  const input = independentActionSchema.parse(raw);
  return withFinancialContext(sql, userId, "read", async (tx, context) => {
    const space = await spaceFor(tx, input.seasonId),
      a = await access(tx, context, space);
    const rows = await ledgerFor(tx, space.id),
      ledger = independentLedger(rows, space.payload);
    if (input.action === "grant") {
      if (!a.canGrant)
        throw Error(
          "Only Nolan, Steve or this team's assigned head coach can appoint financial managers.",
        );
      if (input.userId === userId)
        throw Error("You cannot appoint yourself or expand your own financial permissions.");
      const target = await loadFinancialContextInTransaction(tx, input.userId);
      if (target.principal.role === "player")
        throw Error("A player account cannot be a team financial manager.");
      if (!input.revoke && !input.capabilities.includes("view"))
        throw Error("A manager requires explicit view permission.");
      await tx`insert into independent_team_grants(season_id,user_id,capabilities,granted_by,revoked_at) values(${space.id},${input.userId},${JSON.stringify([...new Set(input.capabilities)])}::jsonb,${userId},${input.revoke ? new Date().toISOString() : null}) on conflict(season_id,user_id) do update set capabilities=excluded.capabilities,granted_by=excluded.granted_by,revoked_at=excluded.revoked_at,updated_at=now()`;
      await audit(
        tx,
        context,
        space.id,
        a.role,
        input.revoke ? "Manager revoked" : "Manager appointed",
        { userId: input.userId, capabilities: input.capabilities },
      );
    } else if (input.action === "settings") {
      if (!a.capabilities.some((c) => ["budget", "share", "closeout"].includes(c)))
        throw Error("Independent financial settings are read-only for your role.");
      if (input.revision !== space.revision)
        throw Error("Team finances changed. Reload before saving.");
      if (
        !isDeepStrictEqual(input.settings.categories, space.payload.categories) ||
        input.settings.policy !== space.payload.policy ||
        input.settings.instructions !== space.payload.instructions
      )
        requireCapability(a, "budget");
      if (input.settings.shared !== space.payload.shared) requireCapability(a, "share");
      if (input.settings.closed && input.settings.closing)
        throw Error("Choose one season state: open, closing or closed.");
      if (
        space.payload.closed &&
        input.settings.closed &&
        (!isDeepStrictEqual(input.settings.categories, space.payload.categories) ||
          input.settings.policy !== space.payload.policy ||
          input.settings.instructions !== space.payload.instructions)
      )
        throw Error(
          "Reopen this season with an audited reason before changing its budget or terms.",
        );
      if (
        input.settings.closed !== space.payload.closed ||
        Boolean(input.settings.closing) !== Boolean(space.payload.closing)
      ) {
        requireCapability(a, "closeout");
        if (!input.settings.policy.trim())
          throw Error("Publish the team's disposition/refund policy before closeout.");
      }
      await tx`update independent_team_spaces set payload=${JSON.stringify(input.settings)}::jsonb,revision=revision+1,updated_at=now() where id=${space.id}`;
      await audit(tx, context, space.id, a.role, "Settings changed", {
        before: space.payload,
        after: input.settings,
        reason: input.reason,
        closeout: input.settings.closed
          ? {
              recordedFunds: ledger.funds,
              receivables: ledger.outstanding,
              commitments: ledger.committed,
              unapplied: ledger.unapplied,
            }
          : null,
      });
    } else if (input.action === "document") {
      const entry = rows.find((r) => r.id === input.entryId);
      if (!entry || entry.payload.kind === "carryIn" || entry.payload.kind === "carryOut")
        throw Error("Choose a transaction in this team season.");
      requireCapability(a, entryCapability(entry.payload.kind));
      const buffer = Buffer.from(input.body, "base64");
      const signature = buffer.subarray(0, 8).toString("hex");
      if (
        !buffer.length ||
        buffer.length > 2_000_000 ||
        !(input.mimeType === "application/pdf"
          ? buffer.subarray(0, 5).toString() === "%PDF-"
          : input.mimeType === "image/png"
            ? signature === "89504e470d0a1a0a"
            : signature.startsWith("ffd8ff"))
      )
        throw Error("Choose a valid PDF, PNG or JPEG under 2 MB.");
      const [existing] = await tx<{
        season_id: string;
        entry_id: string;
        mime_type: string;
        body: string;
      }>`select season_id,entry_id,mime_type,body from independent_team_documents where id=${input.requestId}`;
      if (
        existing &&
        (existing.season_id !== space.id ||
          existing.entry_id !== input.entryId ||
          existing.mime_type !== input.mimeType ||
          existing.body !== input.body)
      )
        throw Error("Receipt request changed.");
      if (existing) return { ok: true };
      await tx`insert into independent_team_documents(id,season_id,entry_id,filename,mime_type,body,actor_id) values(${input.requestId},${space.id},${input.entryId},${input.filename.replace(/[^a-zA-Z0-9._ -]/g, "_")},${input.mimeType},${input.body},${userId}) on conflict(id) do nothing`;
      await audit(tx, context, space.id, a.role, "Receipt attached", {
        entryId: input.entryId,
        documentId: input.requestId,
      });
    } else if (input.action === "carry") {
      requireCapability(a, "closeout");
      if (input.date > organizationDay(new Date().toISOString()))
        throw Error("Record a carryforward only after it is completed.");
      const destination = await spaceFor(tx, input.destinationId),
        target = await access(tx, context, destination);
      requireCapability(target, "closeout");
      if (destination.payload.closed)
        throw Error("Reopen the destination season before recording a carryforward.");
      if (destination.id === space.id)
        throw Error(
          "Carryforward requires a different season. Both team assignments must explicitly authorize closeout.",
        );
      if (!space.payload.policy.trim() || !destination.payload.policy.trim())
        throw Error("Both seasons require explicit disposition terms before a carryforward.");
      const old = rows.find(
        (r) => r.payload.kind === "carryOut" && r.payload.transferId === input.requestId,
      );
      if (old) {
        if (
          old.payload.kind !== "carryOut" ||
          old.payload.amount !== input.amount ||
          old.payload.peerSeasonId !== destination.id ||
          old.payload.date !== input.date ||
          old.payload.category !== input.category ||
          old.payload.note !== input.note ||
          old.payload.method !== input.method ||
          old.payload.reference !== input.reference ||
          old.payload.mode !== input.mode
        )
          throw Error("Transfer request changed.");
        return { ok: true };
      }
      if (input.amount > ledger.available - ledger.unapplied)
        throw Error(
          "Carryforward exceeds recorded funds after commitments and reserved unapplied payer credits.",
        );
      for (const [s, role, kind, peer] of [
        [space, a.role, "carryOut", destination.id],
        [destination, target.role, "carryIn", space.id],
      ] as const) {
        const entry: CarryEntry = {
          kind,
          peerSeasonId: peer,
          transferId: input.requestId,
          amount: input.amount,
          date: input.date,
          category: input.category,
          note: input.note,
          method: input.method,
          reference: input.reference,
          mode: input.mode,
        };
        await tx`insert into independent_team_entries(id,season_id,request_id,actor_id,actor_role,payload) values(${randomUUID()},${s.id},${input.requestId},${userId},${role},${JSON.stringify(entry)}::jsonb)`;
        await audit(tx, context, s.id, role, "Recorded season carryforward", entry);
      }
    } else {
      const e = input.entry;
      const today = organizationDay(new Date().toISOString());
      if (!["obligation", "commitment", "plannedRefund"].includes(e.kind) && e.date > today)
        throw Error(
          "Completed external activity cannot have a future date; record a commitment or planned refund instead.",
        );
      if (e.kind === "reminder" && e.date !== today)
        throw Error("Create the reminder with today's date and current balance.");
      requireCapability(a, entryCapability(e.kind));
      if (
        space.payload.closed &&
        !["credit", "unallocate", "refund", "plannedRefund", "reversal", "reminder"].includes(
          e.kind,
        )
      )
        throw Error(
          "This season is closed. Reopen it through authorized closeout controls before adding activity.",
        );
      const duplicate = rows.find((r) => r.id === input.requestId);
      if (duplicate) {
        if (!isDeepStrictEqual(duplicate.payload, e)) throw Error("Transaction request changed.");
        return { ok: true };
      }
      if (
        (e.kind === "payment" || e.kind === "income" || e.kind === "refund") &&
        ledger.active.some(
          (r) =>
            r.payload.kind === e.kind &&
            "reference" in r.payload &&
            r.payload.reference === e.reference &&
            r.payload.method === e.method &&
            r.payload.date === e.date &&
            r.payload.amount === e.amount &&
            (e.kind !== "payment" ||
              (r.payload.kind === "payment" && r.payload.payerUserId === e.payerUserId)) &&
            (e.kind !== "refund" ||
              (r.payload.kind === "refund" && r.payload.paymentId === e.paymentId)),
        )
      )
        throw Error(
          "This external transaction is already recorded. Review its original entry before adding another.",
        );
      const target = "targetId" in e ? ledger.active.find((r) => r.id === e.targetId) : undefined;
      if (e.kind === "obligation" && !a.team.roster.some((p) => p.id === e.playerId))
        throw Error("Player is not in this financial team season.");
      if (e.kind === "payment") {
        const payer = await loadFinancialContextInTransaction(tx, e.payerUserId);
        await assertPayer(
          tx,
          e.payerUserId,
          a.team,
          a.team.roster.filter((p) => isFinancialGuardian(payer, a.team.id, p.id)).map((p) => p.id),
        );
      }
      if (e.kind === "allocation") {
        const payment = ledger.payments.find((p) => p.id === e.paymentId),
          obligation = ledger.obligations.find((o) => o.id === e.obligationId);
        if (
          !payment ||
          !obligation ||
          e.amount > payment.unapplied ||
          e.amount > obligation.outstanding
        )
          throw Error(
            "Allocation exceeds the unallocated payment or outstanding obligation, or crosses team/season scope.",
          );
        await assertPayer(tx, payment.payerUserId, a.team, [obligation.playerId]);
      }
      if (
        e.kind === "credit" &&
        (!target ||
          target.payload.kind !== "obligation" ||
          e.amount > (ledger.obligations.find((o) => o.id === target.id)?.outstanding || 0))
      )
        throw Error("Credit exceeds this obligation's outstanding balance.");
      if (
        e.kind === "unallocate" &&
        (!target ||
          target.payload.kind !== "allocation" ||
          e.amount > (ledger.allocations.find((p) => p.id === target.id)?.amount || 0))
      )
        throw Error("Correction exceeds the remaining allocation.");
      if (e.kind === "refund" || e.kind === "plannedRefund") {
        const payment = ledger.payments.find((p) => p.id === e.paymentId);
        if (!payment || e.amount > payment.unapplied)
          throw Error(
            "Refund exceeds unallocated funds from the original payment. Correct linked allocations first.",
          );
        if (
          e.kind === "refund" &&
          e.plannedId &&
          !ledger.plannedRefunds.some(
            (r) =>
              r.id === e.plannedId &&
              r.payload.kind === "plannedRefund" &&
              r.payload.paymentId === e.paymentId &&
              r.remaining >= e.amount,
          )
        )
          throw Error("Planned refund identity or amount changed.");
      }
      if (
        e.kind === "allocation" &&
        ledger.obligations.find((o) => o.id === e.obligationId)?.category !== e.category
      )
        throw Error("Use the obligation's category for its allocation.");
      if (
        (e.kind === "credit" || e.kind === "unallocate" || e.kind === "reversal") &&
        target &&
        target.payload.category !== e.category
      )
        throw Error("A correction must retain the original category.");
      if (
        (e.kind === "refund" || e.kind === "plannedRefund") &&
        ledger.active.find((r) => r.id === e.paymentId)?.payload.category !== e.category
      )
        throw Error("Use the original payment's category for the refund.");
      if (
        e.kind === "expense" &&
        e.commitmentId &&
        ledger.commitments.find((c) => c.id === e.commitmentId)?.category !== e.category
      )
        throw Error("The expense and commitment must use the same category.");
      if (
        e.kind === "expense" &&
        e.commitmentId &&
        e.amount > (ledger.commitments.find((c) => c.id === e.commitmentId)?.remaining || 0)
      )
        throw Error("Expense exceeds the linked open commitment.");
      if (e.kind === "reversal") {
        if (
          !target ||
          ["reversal", "carryIn", "carryOut", "reminder"].includes(target.payload.kind) ||
          target.payload.amount !== e.amount
        )
          throw Error(
            "Reverse one complete original entry in this season; use partial allocation corrections or credits where appropriate.",
          );
        if (
          ledger.active.some(
            (r) =>
              r.id !== target.id &&
              (("targetId" in r.payload && r.payload.targetId === target.id) ||
                ("paymentId" in r.payload && r.payload.paymentId === target.id) ||
                ("obligationId" in r.payload && r.payload.obligationId === target.id) ||
                ("commitmentId" in r.payload && r.payload.commitmentId === target.id)),
          )
        )
          throw Error("Correct linked entries before reversing their source record.");
      }
      if (e.kind === "reminder") {
        await assertPayer(tx, e.recipientId, a.team, [e.playerId]);
        const due = ledger.obligations
          .filter(
            (o) => o.playerId === e.playerId && o.due <= organizationDay(new Date().toISOString()),
          )
          .reduce((s, o) => s + o.outstanding, 0);
        if (!due || e.amount !== due)
          throw Error("Refresh the player's overdue balance before creating a reminder.");
        if (
          rows.some(
            (r) =>
              r.payload.kind === "reminder" &&
              r.payload.playerId === e.playerId &&
              r.payload.recipientId === e.recipientId &&
              r.payload.date === e.date &&
              r.payload.amount === e.amount,
          )
        )
          return { ok: true };
      }
      const proposed = [
        ...rows,
        {
          id: input.requestId,
          payload: e,
          actor_id: userId,
          actor_role: a.role,
          created_at: new Date().toISOString(),
        },
      ];
      const after = independentLedger(proposed, space.payload);
      if (
        after.obligations.some((o) => o.outstanding < 0) ||
        after.payments.some((p) => p.unapplied < 0) ||
        after.commitments.some((c) => c.remaining < 0) ||
        after.allocations.some((a) => a.amount < 0)
      )
        throw Error("The entry would over-allocate or over-refund a recorded balance.");
      await tx`insert into independent_team_entries(id,season_id,request_id,actor_id,actor_role,payload) values(${input.requestId},${space.id},${input.requestId},${userId},${a.role},${JSON.stringify(e)}::jsonb)`;
      await audit(tx, context, space.id, a.role, "Recorded " + e.kind, {
        entryId: input.requestId,
      });
    }
    return { ok: true };
  });
}

export async function independentDocument(
  sql: Sql,
  userId: string,
  seasonId: string,
  documentId: string,
) {
  return withFinancialContext(sql, userId, "read", async (tx, context) => {
    const space = await spaceFor(tx, seasonId),
      a = await access(tx, context, space);
    const [d] = await tx<{
      filename: string;
      mime_type: string;
      body: string;
      payload: IndependentEntry;
    }>`select d.filename,d.mime_type,d.body,e.payload from independent_team_documents d join independent_team_entries e on e.id=d.entry_id where d.id=${documentId} and d.season_id=${seasonId}`;
    if (
      !d ||
      (!a.full &&
        !(d.payload.kind === "payment" && d.payload.payerUserId === userId && a.players.length))
    )
      throw Error("Receipt access is unavailable.");
    await audit(tx, context, seasonId, a.role, "Receipt downloaded", { documentId });
    return { filename: d.filename, mimeType: d.mime_type, body: d.body };
  });
}

export async function independentManager(
  sql: Sql,
  userId: string,
  seasonId: string,
  email: string,
) {
  return withFinancialContext(sql, userId, "read", async (tx, context) => {
    const space = await spaceFor(tx, seasonId),
      a = await access(tx, context, space);
    if (!a.canGrant) throw Error("Team financial appointment authority required.");
    const [user] = await tx<{
      id: string;
      name: string;
    }>`select id,name from "user" where lower(email)=${norm(email)} and "emailVerified"=true and "disabledAt" is null`;
    if (!user) throw Error("Ask this manager to create and verify their account first.");
    const target = await loadFinancialContextInTransaction(tx, user.id);
    if (target.principal.role === "player")
      throw Error("A player cannot be appointed financial manager.");
    return user;
  });
}

export async function independentExport(sql: Sql, userId: string, seasonId: string) {
  return withFinancialContext(sql, userId, "read", async (tx, context) => {
    const current = await spaceFor(tx, seasonId),
      a = await access(tx, context, current);
    const view = await independentWorkspaceInTransaction(tx, context, current.team_id),
      space = view.spaces.find((s) => s.id === seasonId);
    if (!space) throw Error("Statement access is unavailable.");
    if (a.full && !context.principal.owner) requireCapability(a, "export");
    await audit(tx, context, seasonId, a.role, "Statement exported", {
      scope: a.full ? "team" : "own billing parties",
    });
    return {
      filename: `team-managed-expenses-${seasonId}.json`,
      text: JSON.stringify(
        {
          collectingParty: space.teamName,
          scope: "Independent team funds",
          balanceBasis: "Based on recorded transactions",
          seasonId,
          settings: space.settings,
          categories: space.categories,
          summary: space.summary,
          obligations: space.obligations,
          payments: space.payments,
          transactions: space.entries,
        },
        null,
        2,
      ),
    };
  });
}
