import type { ClubRecord } from "./types";
import type { FeeExplanation } from "./fee-explanation";
import type { Sql } from "../db";
import {
  withFinancialContext,
  isFinancialGuardian,
  isFinancialCoach,
} from "../finance/context.server";

export async function acceptedFeeAgreement(
  sql: Sql,
  userId: string,
  input: { teamId: string; playerId: string; seasonId?: string; version?: number },
) {
  return withFinancialContext(sql, userId, "read", async (tx, context) => {
    const team = context.club.teams.find((t) => t.id === input.teamId);
    const player = team?.roster.find((p) => p.id === input.playerId);
    const [live] = await tx<{
      payload: ClubRecord;
    }>`select payload from club_state where id='oklahoma-prospects' for share`;
    const currentTeam = live?.payload.teams.find((t) => t.id === input.teamId);
    const email = context.principal.currentEmail;
    const currentCoach =
      currentTeam &&
      (currentTeam.coachEmail.trim().toLowerCase() === email ||
        currentTeam.staff.some(
          (staff) => staff.email.trim().toLowerCase() === email && /coach/i.test(staff.role),
        ));
    if (
      !team ||
      !player ||
      !(
        context.principal.owner ||
        (currentCoach && isFinancialCoach(context, team)) ||
        (context.principal.role !== "player" && isFinancialGuardian(context, team.id, player.id))
      )
    )
      throw Error("Agreement access is unavailable.");
    const plan = context.feePlans.find((p) => p.team_id === team.id)?.payload;
    const record = plan?.players[player.id];
    const independent = record?.independent;
    if (independent && input.seasonId !== independent.seasonKey)
      throw Error("Agreement season changed. Reload before downloading.");
    const agreement = independent?.agreements.find(
      (a) => a.version === (input.version ?? independent.version),
    );
    if ((independent && !agreement) || (!independent && input.version !== undefined))
      throw Error("Accepted agreement version not found.");
    const policy = agreement?.policy ?? record?.acceptedPolicy;
    if (!policy || !player.agreement.signedAt) throw Error("No accepted agreement is available.");
    const version = agreement
      ? `independent-${independent!.seasonKey}-${agreement.version}`
      : player.agreement.version;
    await tx`insert into finance_audit(actor_id,record_id,action,reason) values(${userId},${team.id},'Accepted fee agreement downloaded',${version})`;
    return {
      filename: `prospects-agreement-${player.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${version.replace(/[^a-zA-Z0-9_-]/g, "-")}.txt`,
      text: [
        "Prospects Sports Academy — accepted player fee agreement",
        `Team: ${team.name}`,
        `Season: ${team.seasonLabel}`,
        `Season ID: ${independent?.seasonKey || team.id}`,
        `Player: ${player.name}`,
        `Version: ${version}`,
        `Publication revision: ${agreement?.publicationRevision ?? player.agreement.version}`,
        `Accepted by: ${agreement?.name ?? player.agreement.signedBy}`,
        `Accepted at: ${agreement?.at ?? player.agreement.signedAt}`,
        "",
        policy,
      ].join("\n"),
    };
  });
}

export async function auditFeeExplanation(
  sql: Sql,
  actorId: string,
  teamId: string,
  action: string,
  before: FeeExplanation | undefined,
  after: FeeExplanation | undefined,
  revision: number,
  playerId?: string,
) {
  if (!["save", "publish", "publishIndependent", "independentOffer"].includes(action)) return;
  if (action === "save" && JSON.stringify(before) === JSON.stringify(after)) return;
  await sql`insert into finance_audit(actor_id,record_id,action,reason,before_state,after_state)
    values(${actorId},${teamId},'Parent fee explanation',${action},${JSON.stringify({ explanation: before || null })}::jsonb,${JSON.stringify({ explanation: after || null, revision, playerId: playerId || null })}::jsonb)`;
}
