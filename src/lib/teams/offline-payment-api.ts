import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
const ids = z.object({ teamId: z.string().min(1).max(150), playerId: z.string().min(1).max(150) });
export const getOfflineTeamPayments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(ids.strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { withFinancialContext } = await import("../finance/context.server");
    const { resolveFinancialAgreement } = await import("../finance/basis.server");
    const { offlinePaymentEvidence, isOfflineMethod } = await import("./offline-payments.server");
    return withFinancialContext(await getSql(), context.userId, "owner", async (tx, c) => {
      const resolved = c.basis ? resolveFinancialAgreement(c.basis, data) : null;
      const teamId = resolved?.team.id || data.teamId;
      const p =
        resolved?.player ||
        c.club.teams.find((t) => t.id === teamId)?.roster.find((p) => p.id === data.playerId);
      if (!p) throw new Error("Player agreement unavailable.");
      const evidence = await offlinePaymentEvidence(tx, c, teamId, p);
      return {
        basisVersion: c.version ?? undefined,
        payments: p.payments
          .filter((p) => isOfflineMethod(p.method))
          .map((p) => ({ ...p, verified: evidence.receipts.has(p.receipt) })),
      };
    });
  });
export const reviewOfflineTeamPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    ids
      .extend({
        receipt: z.string().min(1).max(150),
        action: z.enum(["verify", "revoke", "reverse"]),
        reason: z.string().trim().min(10).max(1000),
        remainingAmount: z.number().finite().nonnegative().max(100000).optional(),
        confirmed: z.literal(true),
        expectedBasisVersion: z.number().int().positive().optional(),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { withFinancialContext, reviewFinancialOfflinePaymentInTransaction } =
      await import("../finance/context.server");
    return withFinancialContext(await getSql(), context.userId, "owner", (tx, c) =>
      reviewFinancialOfflinePaymentInTransaction(tx, c, data),
    );
  });
