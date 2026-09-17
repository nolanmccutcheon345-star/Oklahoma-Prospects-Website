import { createMiddleware } from "@tanstack/react-start";
/** Real sessions only, including the existing Grok preview bearer transport. */
export const optionalPaymentAuth = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("../auth/client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { assertSameSiteRequest } = await import("../auth/isolation.server");
    assertSameSiteRequest();
    const { getSessionUser } = await import("../auth/verify.server");
    const session = await getSessionUser(context.bearerToken);
    const { withAuditActor } = await import("../audit-context.server");
    return withAuditActor(session?.id || "public", () =>
      next({ context: { verifiedUserId: session?.id || null } }),
    );
  });
export const paymentAuth = createMiddleware({ type: "function" })
  .middleware([optionalPaymentAuth])
  .server(async ({ next, context }) => {
    if (!context.verifiedUserId)
      throw new Error("Sign in to your verified account before payment.");
    return next({ context: { paymentUserId: context.verifiedUserId } });
  });
