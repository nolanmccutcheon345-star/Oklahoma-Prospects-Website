import { financialBasisActivationInput } from "./activation-contracts";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
import { financialCaptureInput, financialRefreshInput } from "./cutover-contracts";
export const getFinancialCapturePreview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./basis.server")).previewFinancialBasisInitialization(
      await getSql(),
      context.userId,
    );
  });
export const captureFinancialBasis = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(financialCaptureInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./basis.server")).initializeFinancialBasisForOwner(
      await getSql(),
      context.userId,
      data,
    );
  });
export const getFinancialRefreshPreview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const review = await (
      await import("./basis.server")
    ).previewFinancialBasisRefresh(await getSql(), context.userId);
    return {
      ...review,
      sourceChanges: review.sourceChanges.map((change) => ({
        ...change,
        before: undefined,
        after: undefined,
        beforeJson: JSON.stringify(change.before),
        afterJson: JSON.stringify(change.after),
      })),
    };
  });
export const refreshFinancialBasis = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(financialRefreshInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./basis.server")).refreshFinancialBasisForOwner(
      await getSql(),
      context.userId,
      data,
    );
  });

export const getFinancialActivationPreview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./basis.server")).previewFinancialBasisActivationForOwner(
      await getSql(),
      context.userId,
    );
  });
export const activateFinancialBasis = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(financialBasisActivationInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./basis.server")).activateFinancialBasisForOwner(
      await getSql(),
      context.userId,
      data,
    );
  });
