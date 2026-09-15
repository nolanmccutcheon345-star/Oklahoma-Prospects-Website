import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { checkoutInput } from "./contracts";
export const getCheckoutContext = createServerFn({ method: "GET" }).handler(async () => {
  const { checkoutContext } = await import("./checkout.server"); return checkoutContext();
});
export const getCheckoutQuote = createServerFn({ method: "POST" }).validator(checkoutInput).handler(async ({ data }) => {
  const { availableSlots } = await import("./checkout.server"); return availableSlots(data);
});
export const startCheckout = createServerFn({ method: "POST" }).validator(checkoutInput).handler(async ({ data }) => {
  const { beginCheckout } = await import("./checkout.server"); return beginCheckout(data);
});
export const getOrderStatus = createServerFn({ method: "POST" }).validator(z.object({ sessionId: z.string().regex(/^cs_(test_|live_)?[a-zA-Z0-9_]+$/).max(300) })).handler(async ({ data }) => {
  const { orderStatus } = await import("./checkout.server"); return orderStatus(data.sessionId);
});
export const getCageAvailability = createServerFn({method:'POST'}).validator(z.object({date:z.string().max(10),duration:z.number().int().min(30).max(180).multipleOf(30),laneIds:z.array(z.enum(['1','2','3-4','5','6','7'])).min(1).max(6)}).strict()).handler(async({data})=>{
 const {cageAvailability}=await import('./checkout.server');return cageAvailability(data);
});
