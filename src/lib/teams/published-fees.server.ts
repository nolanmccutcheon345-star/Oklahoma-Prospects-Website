import type { Sql } from "../db";
import {
  secured,
  grants,
  permits,
  teamScope,
  financiallyRestricted,
  audit,
} from "../coordinator/access.server";
import {
  lockFinancialExecution,
  loadFinancialContextInTransaction,
  publishedTeamPriceInTransaction,
  isFinancialCoach,
  isFinancialGuardian,
} from "../finance/context.server";

/** Only the published team quote may cross this boundary. Never return a plan or ledger. */
export async function publishedTeamFees(sql: Sql, userId: string, teamId: string) {
  return secured(
    sql,
    userId,
    "teams.published-fees.read",
    async (tx) => {
      const team = await teamScope(tx, teamId);
      const current = await grants(tx, userId, true);
      if (permits(current, "rosters.read", team.sport, teamId)) {
        const quote = await publishedTeamPriceInTransaction(tx, teamId);
        await audit(
          tx,
          userId,
          "teams.published-fees.read",
          teamId,
          "allowed",
          { published: Boolean(quote) },
          team.sport,
          teamId,
        );
        return quote;
      }
      if (await financiallyRestricted(tx, userId)) return null;
      const context = await loadFinancialContextInTransaction(tx, userId, "read");
      const saved = context.club.teams.find((t) => t.id === teamId);
      if (!saved) return null;
      const me = context.principal;
      const allowed =
        me.owner ||
        isFinancialCoach(context, saved) ||
        saved.roster.some(
          (p) =>
            isFinancialGuardian(context, teamId, p.id) ||
            (me.role === "player" && me.playerIds.includes(p.id)),
        );
      return allowed ? publishedTeamPriceInTransaction(tx, teamId) : null;
    },
    lockFinancialExecution,
  );
}
