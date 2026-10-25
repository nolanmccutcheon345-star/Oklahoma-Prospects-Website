import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { paymentAuth } from "../commerce/payment-auth";
const ids = z.object({ teamId: z.string().min(1).max(150), playerId: z.string().min(1).max(150) });
export const getTeamCollection = createServerFn({ method: "GET" })
  .middleware([paymentAuth])
  .validator(ids.strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { squareConfig, squarePublicConfig } = await import("../commerce/square.server");
    const { collectionStatus } = await import("./collection-authorization.server");
    const { teamCollectionsEnabled } = await import("./collections.server");
    const { resolveIdentity } = await import("../identity.server");
    const sql = await getSql(),
      c = squareConfig(),
      me = await resolveIdentity(sql, context.paymentUserId);
    return {
      ...(await collectionStatus(sql, context.paymentUserId, data, c.environment)),
      square: squarePublicConfig()!,
      enabled: teamCollectionsEnabled(
        { ...process.env, SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT },
        c.environment,
      ),
      name: me.name,
      email: me.email,
    };
  });
export const saveTeamCollectionCard = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(
    ids
      .extend({
        purpose: z.enum(["primary", "backup"]),
        sourceId: z.string().min(1).max(500),
        requestId: z.string().uuid(),
        consent: z.literal(true),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { assertPaymentRequest } = await import("../commerce/square-payments.server");
    assertPaymentRequest();
    const { rateLimit } = await import("../commerce/checkout.server");
    await rateLimit("team-collection-card", 10);
    const { getSql } = await import("../db");
    const { squareClient, squareConfig } = await import("../commerce/square.server");
    const { saveCollectionCard } = await import("./collection-authorization.server");
    return saveCollectionCard(
      await getSql(),
      squareClient(),
      squareConfig(),
      context.paymentUserId,
      data,
    );
  });
export const changeTeamCollection = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(
    ids.extend({ action: z.enum(["activate", "revoke"]), consent: z.literal(true) }).strict(),
  )
  .handler(async ({ context, data }) => {
    const { assertPaymentRequest } = await import("../commerce/square-payments.server");
    assertPaymentRequest();
    const { rateLimit } = await import("../commerce/checkout.server");
    await rateLimit("team-collection-consent", 15);
    const { getSql } = await import("../db");
    const { squareConfig } = await import("../commerce/square.server");
    const { authorizeTeamCollection } = await import("./collection-authorization.server");
    const c = squareConfig();
    const { teamCollectionsEnabled } = await import("./collections.server");
    if (
      data.action === "activate" &&
      !teamCollectionsEnabled(
        { ...process.env, SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT },
        c.environment,
      )
    )
      throw Error("Automatic collection is paused pending launch verification.");
    return authorizeTeamCollection(
      await getSql(),
      context.paymentUserId,
      data,
      c.environment,
      data.action,
    );
  });
