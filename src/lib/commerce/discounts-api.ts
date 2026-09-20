import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "../auth/middleware";
import { discountInput } from "./discounts";

export const getDiscountCodes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listDiscounts } = await import("./discounts.server");
    return listDiscounts(context.userId);
  });
export const saveDiscountCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(discountInput)
  .handler(async ({ context, data }) => {
    const { saveDiscount } = await import("./discounts.server");
    return saveDiscount(context.userId, data);
  });
