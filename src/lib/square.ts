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
  .handler(async (): Promise<SquareCheckoutResult> => {
    throw new Error("Square checkout has been retired. Use /pay for secure Stripe checkout.");
  });

export const getSquareStatus = createServerFn({ method: "GET" }).handler(async () => ({
  connected: false, environment: "retired", locationId: "", hasToken: false,
}));

export const saveSquareSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { locationId?: string; accessToken?: string; environment?: string }) => input)
  .handler(async () => {
    throw new Error("Configure Stripe secrets in Netlify environment settings. Processor secrets are never stored in the club database.");
  });
