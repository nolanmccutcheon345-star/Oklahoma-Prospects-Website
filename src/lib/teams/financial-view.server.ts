import {
  isFinancialCoach,
  isFinancialGuardian,
  type FinancialContext,
} from "../finance/context.server";
import { balance } from "./pricing";
import type { TeamFinancialView } from "./financial-view";

/** The context already rechecked current verification, disablement, restriction
 * and owner revocation under the execution gate. No live roster/contact lookup. */
export function teamFinancialView(
  context: FinancialContext,
  audience: "all" | "office" | "family" | "coach" = "all",
): TeamFinancialView | null {
  if (!context.basis) return null;
  const { basis, club, principal } = context;
  const view: TeamFinancialView = {
    mode: "basis",
    version: basis.version,
    owner: principal.owner,
    obligations: [],
    coachTeams: [],
    staff: [],
    catalog:
      principal.owner && audience !== "family" && audience !== "coach"
        ? club.catalog.map(({ id, name, fee }) => ({ id, name, fee }))
        : [],
  };
  for (const team of club.teams) {
    const teamSeason = basis.teams.find((t) => t.originalTeamId === team.id);
    if (!teamSeason) throw new Error("Financial team identity is unavailable.");
    for (const player of team.roster) {
      if (audience === "coach") continue;
      if (!principal.owner && !isFinancialGuardian(context, team.id, player.id)) continue;
      const agreement = basis.agreements.find(
        (a) => a.teamSeasonId === teamSeason.id && a.originalPlayerId === player.id,
      );
      if (!agreement) throw new Error("Financial player identity is unavailable.");
      view.obligations.push({
        agreementId: agreement.id,
        teamSeasonId: teamSeason.id,
        teamId: team.id,
        teamName: team.name,
        playerId: player.id,
        playerName: player.name,
        familyId: player.familyId,
        signed: player.feeLock?.amount ?? 0,
        due: balance(player, player.feeLock?.amount ?? 0),
        agreement: structuredClone(player.agreement),
        feeLock: structuredClone(player.feeLock),
        planLock: structuredClone(player.planLock),
        payments: structuredClone(player.payments || []),
        credits: structuredClone(player.credits || []),
        depositPaid: player.depositPaid,
      });
    }
    if (audience !== "family" && (principal.owner || isFinancialCoach(context, team))) {
      view.coachTeams.push({
        teamId: team.id,
        teamName: team.name,
        eventBudget: principal.owner ? team.eventBudget : 0,
        spent: team.tournamentIds.reduce(
          (sum, id) => sum + (club.catalog.find((e) => e.id === id)?.fee || 0),
          0,
        ),
        readiness: team.roster.map((p) => ({
          playerId: p.id,
          signed: Boolean(p.agreement.signedAt),
          depositPaid: p.depositPaid,
        })),
      });
      for (const staff of team.staff) {
        if (!principal.owner && staff.email.trim().toLowerCase() !== principal.email) continue;
        view.staff.push({
          teamId: team.id,
          teamName: team.name,
          id: staff.id,
          name: staff.name,
          monthly: staff.monthly,
          applyAmount: staff.applyAmount,
          w9: staff.w9,
          safeSport: staff.safeSport,
        });
      }
    }
  }
  return view;
}
