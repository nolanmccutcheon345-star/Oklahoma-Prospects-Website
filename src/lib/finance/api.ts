import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
import { financeAction, day, safeText } from "./contracts";
import { z } from "zod";
export const getFinance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const { financeWorkspace } = await import("./store.server");
    return financeWorkspace(await getSql(), context.userId);
  });
export const changeFinance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(financeAction)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { mutateFinance } = await import("./store.server");
    return mutateFinance(await getSql(), context.userId, data);
  });
export const syncFinanceSquare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ from: day, to: day }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { syncSettlements } = await import("./square.server");
    return syncSettlements(await getSql(), context.userId, data.from, data.to);
  });
export const getMyFinance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    const { myFinance } = await import("./self.server");
    return myFinance(await getSql(), context.userId);
  });
export const setMyPaymentPreference = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        method: z.enum(["bank transfer", "check", "business debit", "other"]),
        reference: safeText,
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    const { myPreference } = await import("./self.server");
    return myPreference(await getSql(), context.userId, data);
  });
