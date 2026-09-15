import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { PayLine, PaySearch } from "@/lib/pay";

export type SquareCheckoutInput = PaySearch & {
  returnUrl?: string;
  hasAssessment?: boolean;
};

export type SquareCheckoutResult = {
  mode: "square" | "club";
  url?: string;
  amount: number;
  title: string;
  lines: PayLine[];
  connected: boolean;
  error?: string;
};

export const createSquareCheckout = createServerFn({ method: "POST" })
  .validator((input: SquareCheckoutInput) => input)
  .handler(async ({ data }) => {
    const { startSquareCheckout } = await import("./square-impl.server");
    return startSquareCheckout(data);
  });

export const getSquareStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { readSquareStatus } = await import("./square-impl.server");
  return readSquareStatus();
});

export const saveSquareSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { locationId?: string; accessToken?: string; environment?: string }) => input)
  .handler(async ({ context, data }) => {
    const { writeSquareSettings } = await import("./square-impl.server");
    return writeSquareSettings(data, context.userId);
  });
