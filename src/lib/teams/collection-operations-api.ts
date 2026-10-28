import { collectionLaunchReadiness } from "./launch-readiness";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
export const getCollectionOperations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const { withFinancialContext } = await import("../finance/context.server");
    const { teamCollectionsEnabled } = await import("./collections.server");
    return withFinancialContext(await getSql(), context.userId, "owner", async (tx, c) => {
      const rows = await tx<{
        id: string;
        team_id: string;
        player_id: string;
        environment: string;
        status: string;
        runs: { index: number; amount: number; status: string }[];
      }>`select a.id,a.team_id,a.player_id,a.environment,a.status,coalesce((select jsonb_agg(jsonb_build_object('index',r.installment_index,'amount',r.amount_cents,'status',r.status) order by r.installment_index) from team_collection_runs r where r.authorization_id=a.id),'[]'::jsonb) as runs from team_collection_authorizations a order by a.created_at desc limit 500`;
      const readiness = collectionLaunchReadiness({
        ...process.env,
        SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT,
      });
      return {
        blockers: readiness.blockers,
        enabled: teamCollectionsEnabled(
          { ...process.env, SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT },
          "production",
        ),
        sandboxConfigured: readiness.sandboxSettingsLocal,
        sandboxVerified: process.env.TEAM_AUTOPAY_SANDBOX_VERIFIED === "true",
        rows: rows.map((r) => ({
          ...r,
          team: c.club.teams.find((t) => t.id === r.team_id)?.name || "Historical team",
          player:
            c.club.teams.find((t) => t.id === r.team_id)?.roster.find((p) => p.id === r.player_id)
              ?.name || "Historical agreement",
        })),
      };
    });
  });
export const pauseCollectionAuthorization = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(10).max(1000),
        confirmed: z.literal(true),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { withFinancialContext } = await import("../finance/context.server");
    return withFinancialContext(await getSql(), context.userId, "owner", async (tx) => {
      const rows =
        await tx`update team_collection_authorizations set status='paused',updated_at=now() where id=${data.id} and status='active' returning id`;
      if (!rows.length)
        throw Error("This authorization is no longer active. Refresh the collection status.");
      await tx`insert into finance_audit(actor_id,record_id,action,reason) values(${context.userId},${data.id},'Team collection paused',${data.reason})`;
      return { ok: true };
    });
  });
